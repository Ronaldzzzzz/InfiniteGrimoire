import { Hono, type Context } from 'hono';
import { validateUpload } from '../src/engine/audit';
import { comboKey, synthesize, SYNTH_SLOTS } from '../src/engine/crafting';
import { empower } from '../src/engine/empower';
import type { Content, GameState } from '../src/engine/model';
import { createInitialState, parseState, serialize } from '../src/engine/persist';
import type { Rng } from '../src/engine/rng';
import { CRAFTED_MAX_LEN } from '../src/engine/spells';
import { depthCap, revealRegion, unlockPassive } from '../src/engine/tree';
import { hashToken, newToken } from './auth';
import type { PlayerRow, Store } from './store';
import { normalizeUsername, usernameKey, usernameProblem } from '../src/engine/account-rules';
import { CLIENT_HASH_RE, hashPassword, verifyPassword } from './password';

export interface AppDeps {
  store: Store;
  now: () => number;
  rng: () => Rng;
  content: Content;
  /** Secret HMAC key for password hashes (Cloudflare secret PASSWORD_PEPPER). Empty means accounts return 500. */
  pepper: string;
}

export const SUSPICIOUS_REJECTIONS_24H = 5;
export const MAX_BODY_BYTES = 64 * 1024;
/**
 * Anti-cheat anchor window. Every upload is validated against the anchor state with the time
 * since the anchor (capped: no offline income in the MVP), so the per-upload allowances
 * (burst, boss drop, slack) are granted once per anchor rather than once per request.
 */
export const MAX_WINDOW_MS = 180_000;
/** An accepted save becomes the new anchor once the anchor is at least this old. */
export const ANCHOR_ADVANCE_MS = 60_000;

/** A session's last_seen_at is written at most this often. */
export const SESSION_TOUCH_MS = 60 * 60 * 1000;

/** Most rows GET /api/discoveries returns. */
export const FEED_LIMIT = 20;
export const GUEST_LIMIT_PER_HOUR = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const USER_FAIL_LIMIT = 5;
export const IP_FAIL_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;
const ACTION_PATHS = ['/api/synthesize', '/api/empower', '/api/reveal', '/api/passive', '/api/discoveries'] as const;

/** Client IP for rate limits: Cloudflare's header, or 'local' in tests and `wrangler dev` without it. */
function clientIp(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}

function rateLimited(c: Ctx, retryAfterSec: number): Response {
  return c.json({ error: 'rate_limited', retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) }, 429);
}

/**
 * Applies the inventory change of a server action (before -> after, exactly as the engine applied it:
 * inputs out, refunds back in, empower costs, spent key items) to the anchor. Counts may go negative:
 * a negative count is the debt for inputs gained after the anchor, so re-acquiring them still has to
 * fit the window's gain bound.
 * The anchor is never parsed by parseState; validateUpload only does arithmetic on its inventory.
 */
export function chargeAnchor(anchor: GameState, before: GameState, after: GameState): GameState {
  const inventory: Record<string, number> = { ...anchor.inventory };
  const keys = new Set([...Object.keys(before.inventory), ...Object.keys(after.inventory)]);
  for (const k of keys) {
    const delta = (Object.hasOwn(after.inventory, k) ? after.inventory[k]! : 0) - (Object.hasOwn(before.inventory, k) ? before.inventory[k]! : 0);
    if (delta === 0) continue;
    const next = (Object.hasOwn(inventory, k) ? inventory[k]! : 0) + delta;
    if (next === 0) delete inventory[k];
    else inventory[k] = next;
  }
  return { ...anchor, inventory };
}

type Env = { Variables: { player: PlayerRow; sessionHash: string } };
type Ctx = Context<Env>;

class HttpError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(c: Ctx): Promise<Record<string, unknown>> {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, 'payload too large');
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) throw new HttpError(413, 'payload too large');
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(buf));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'invalid body');
}

export function createApp(deps: AppDeps): Hono<Env> {
  const { store, now, content, pepper } = deps;
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    return c.json({ error: 'internal error' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/guest', async (c) => {
    const body = await readJson(c);
    const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (name.length < 1 || [...name].length > 16) throw new HttpError(400, 'invalid displayName');
    const ip = clientIp(c);
    const t0 = now();
    // a record exactly an hour old has expired, matching retryAfterSec
    const recent = await store.guestCreations(ip, t0 - HOUR_MS + 1);
    if (recent.count >= GUEST_LIMIT_PER_HOUR && recent.oldest !== null) {
      return rateLimited(c, (recent.oldest + HOUR_MS - t0) / 1000);
    }

    const token = newToken();
    const t = now();
    const player: PlayerRow = { id: crypto.randomUUID(), displayName: name, createdAt: t, suspicious: false, gmUsed: false };
    const state = createInitialState(content);
    await store.createPlayer(player, await hashToken(token), serialize(state), t);
    await store.recordGuestCreation(ip, t);
    return c.json({ token, playerId: player.id, state, revision: 0 }, 201);
  });

  async function auth(c: Ctx, next: () => Promise<void>) {
    const m = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '');
    if (!m) return c.json({ error: 'unauthorized' }, 401);
    const hash = await hashToken(m[1]!);
    const found = await store.findPlayerBySession(hash);
    if (!found) return c.json({ error: 'unauthorized' }, 401);
    const t = now();
    if (t - found.lastSeenAt >= SESSION_TOUCH_MS) await store.touchSession(hash, t);
    c.set('player', found.player);
    c.set('sessionHash', hash);
    await next();
  }
  app.use('/api/account/*', auth);
  app.use('/api/logout', auth);

  function readCredentials(body: Record<string, unknown>): { username: string; password: string } {
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (usernameProblem(username)) throw new HttpError(400, 'invalid_username');
    // the browser sends its PBKDF2 hash, never the password; length rules are checked there
    if (!CLIENT_HASH_RE.test(password)) throw new HttpError(400, 'invalid_password');
    return { username, password };
  }

  /** Seconds until the oldest counted failure leaves the window, or null when no limit is hit. */
  async function loginBlocked(limits: [key: string, limit: number][], t: number): Promise<number | null> {
    let retry: number | null = null;
    for (const [key, limit] of limits) {
      const w = await store.loginFailures(key, t - LOGIN_WINDOW_MS + 1); // see guest limit
      if (w.count >= limit && w.oldest !== null) retry = Math.max(retry ?? 0, (w.oldest + LOGIN_WINDOW_MS - t) / 1000);
    }
    return retry;
  }

  app.post('/api/account/bind', async (c) => {
    const { username, password } = readCredentials(await readJson(c));
    const player = c.get('player');
    const t = now();
    const result = await store.createCredentials({
      playerId: player.id,
      username: normalizeUsername(username),
      usernameKey: usernameKey(username),
      passwordHash: await hashPassword(password, pepper),
      createdAt: t,
      updatedAt: t,
    });
    if (result !== 'ok') return c.json({ error: result }, 409);
    return c.json({ username: normalizeUsername(username) });
  });

  app.post('/api/login', async (c) => {
    const { username, password } = readCredentials(await readJson(c));
    const key = usernameKey(username);
    const ip = clientIp(c);
    const t = now();
    const retry = await loginBlocked([[`u:${key}`, USER_FAIL_LIMIT], [`ip:${ip}`, IP_FAIL_LIMIT]], t);
    if (retry !== null) return rateLimited(c, retry);
    const cred = await store.findCredentialsByKey(key);
    if (!cred || !(await verifyPassword(password, cred.passwordHash, pepper))) {
      await store.recordLoginFailure([`u:${key}`, `ip:${ip}`], t);
      return c.json({ error: 'invalid_credentials' }, 403);
    }
    const player = await store.getPlayer(cred.playerId);
    const save = await store.getSave(cred.playerId);
    if (!player || !save) return c.json({ error: 'internal error' }, 500);
    const token = newToken();
    await store.createSession(await hashToken(token), player.id, t);
    return c.json({ token, playerId: player.id, state: JSON.parse(save.state), revision: save.revision });
  });

  app.get('/api/account', async (c) => {
    const player = c.get('player');
    const cred = await store.findCredentialsByPlayer(player.id);
    return c.json({ displayName: player.displayName, username: cred?.username ?? null, sessions: await store.countSessions(player.id) });
  });

  app.post('/api/account/password', async (c) => {
    const body = await readJson(c);
    const current = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.next === 'string' ? body.next : '';
    if (!CLIENT_HASH_RE.test(next)) throw new HttpError(400, 'invalid_password');
    const player = c.get('player');
    const cred = await store.findCredentialsByPlayer(player.id);
    if (!cred) return c.json({ error: 'not_bound' }, 409);
    const ip = clientIp(c);
    const t = now();
    const retry = await loginBlocked([[`u:${cred.usernameKey}`, USER_FAIL_LIMIT], [`ip:${ip}`, IP_FAIL_LIMIT]], t);
    if (retry !== null) return rateLimited(c, retry);
    if (!(await verifyPassword(current, cred.passwordHash, pepper))) {
      await store.recordLoginFailure([`u:${cred.usernameKey}`, `ip:${ip}`], t);
      return c.json({ error: 'invalid_credentials' }, 403);
    }
    await store.updatePasswordHash(player.id, await hashPassword(next, pepper), t);
    await store.deleteOtherSessions(player.id, c.get('sessionHash'));
    return c.json({});
  });

  app.post('/api/account/logout-others', async (c) => {
    const player = c.get('player');
    await store.deleteOtherSessions(player.id, c.get('sessionHash'));
    return c.json({ sessions: await store.countSessions(player.id) });
  });

  app.post('/api/logout', async (c) => {
    const player = c.get('player');
    // a guest without credentials could never get this progress back
    if (!(await store.findCredentialsByPlayer(player.id))) return c.json({ error: 'not_bound' }, 409);
    await store.deleteSession(c.get('sessionHash'));
    return c.json({});
  });

  app.use('/api/save', auth);
  for (const path of ACTION_PATHS) app.use(path, auth);

  app.get('/api/discoveries', async (c) => {
    const raw = c.req.query('after');
    if (raw !== undefined && !/^\d{1,15}$/.test(raw)) throw new HttpError(400, 'invalid after');
    const discoveries = await store.recentDiscoveries(raw === undefined ? null : Number(raw), FEED_LIMIT);
    return c.json({ discoveries });
  });

  app.get('/api/save', async (c) => {
    const player = c.get('player');
    const save = await store.getSave(player.id);
    if (!save) return c.json({ error: 'not found' }, 404);
    return c.json({ state: JSON.parse(save.state), revision: save.revision });
  });

  type Checked =
    | {
        ok: true;
        state: GameState;
        current: GameState;
        revision: number;
        t: number;
        playerId: string;
        advanceAnchor: boolean;
        anchor: GameState;
        anchorAt: number;
      }
    | { ok: false; res: Response };

  /** Shared by PUT /api/save and the server actions: 400 / 409 / 422 handling. */
  async function checkUpload(c: Ctx, body: Record<string, unknown>): Promise<Checked> {
    const player = c.get('player');
    const base = body.baseRevision;
    if (typeof base !== 'number' || !Number.isInteger(base) || base < 0) throw new HttpError(400, 'invalid baseRevision');
    const next = parseState(body.state, content);
    if (!next) throw new HttpError(400, 'invalid state');
    const save = await store.getSave(player.id);
    if (!save) return { ok: false, res: c.json({ error: 'not found' }, 404) };
    const current = JSON.parse(save.state) as GameState;
    if (base !== save.revision) {
      return { ok: false, res: c.json({ reason: 'conflict', state: current, revision: save.revision }, 409) };
    }
    const t = now();
    const anchor = JSON.parse(save.anchorState) as GameState;
    // server-owned fields come from the current save; everything client-owned is measured from the anchor
    const baseline: GameState = {
      ...anchor,
      learned: current.learned,
      levels: current.levels,
      revealed: current.revealed,
      passives: current.passives,
      synthesisLog: current.synthesisLog,
    };
    const elapsed = Math.min(Math.max(0, t - save.anchorAt), MAX_WINDOW_MS);
    const verdict = validateUpload(baseline, next, elapsed, content);
    const reasons = verdict.ok ? [] : [...verdict.reasons];
    // server-owned field equality vs current is covered by the overlay above
    for (const b of current.defeatedBosses) {
      const r = `defeatedBosses lost boss ${b}`;
      if (!next.defeatedBosses.includes(b) && !reasons.includes(r)) reasons.push(r);
    }
    if (reasons.length) {
      const count = await store.recordRejection(player.id, t, reasons);
      if (count >= SUSPICIOUS_REJECTIONS_24H) await store.markSuspicious(player.id);
      return {
        ok: false,
        res: c.json({ reason: 'rejected', reasons, state: current, revision: save.revision }, 422),
      };
    }
    return {
      ok: true,
      state: next,
      current,
      revision: save.revision,
      t,
      playerId: player.id,
      advanceAnchor: t - save.anchorAt >= ANCHOR_ADVANCE_MS,
      anchor,
      anchorAt: save.anchorAt,
    };
  }

  async function conflict(c: Ctx, playerId: string): Promise<Response> {
    const latest = await store.getSave(playerId);
    return c.json(
      { reason: 'conflict', state: latest ? JSON.parse(latest.state) : null, revision: latest?.revision ?? 0 },
      409,
    );
  }

  app.put('/api/save', async (c) => {
    const checked = await checkUpload(c, await readJson(c));
    if (!checked.ok) return checked.res;
    const committed = serialize(checked.state);
    const anchor = checked.advanceAnchor ? { state: committed, at: checked.t } : null;
    const done = await store.commitSave(checked.playerId, checked.revision, committed, checked.t, anchor);
    if (!done) return conflict(c, checked.playerId);
    return c.json({ revision: checked.revision + 1 });
  });

  /**
   * A server-side change to the uploaded state (synthesis, empower, reveal, passive). The upload is
   * audited first; an action the engine rejects is a 422 with its result and writes nothing (it is
   * not counted as a cheating attempt). onCommit runs after a successful commit.
   */
  async function serverAction<R extends { kind: string }>(
    c: Ctx,
    body: Record<string, unknown>,
    apply: (state: GameState) => { state: GameState; result: R },
    onCommit?: (playerId: string, t: number, result: R) => Promise<R | void>,
  ): Promise<Response> {
    const checked = await checkUpload(c, body);
    if (!checked.ok) return checked.res;
    const { state, result } = apply(checked.state);
    if (result.kind === 'rejected') {
      return c.json({ reason: 'rejected', result, state: checked.current, revision: checked.revision }, 422);
    }
    // never persist a state the next request could not parse
    if (!parseState(JSON.parse(serialize(state)), content)) return c.json({ error: 'internal error' }, 500);
    // The action result is the new current state. The anchor advances only by time; otherwise
    // what the action spent is also taken out of the anchor (same CAS), so a later upload
    // cannot "restore" the inputs for free and repeat the action.
    const committed = serialize(state);
    const anchor = checked.advanceAnchor
      ? { state: committed, at: checked.t }
      : { state: serialize(chargeAnchor(checked.anchor, checked.state, state)), at: checked.anchorAt };
    const done = await store.commitSave(checked.playerId, checked.revision, committed, checked.t, anchor);
    if (!done) return conflict(c, checked.playerId);
    const final = (onCommit && (await onCommit(checked.playerId, checked.t, result))) || result;
    return c.json({ result: final, state, revision: checked.revision + 1 });
  }

  /** A string id field of an action body (spell ids may be crafted, so up to CRAFTED_MAX_LEN). */
  const idField = (body: Record<string, unknown>, field: string): string => {
    const v = body[field];
    if (typeof v !== 'string' || v.length === 0 || v.length > CRAFTED_MAX_LEN) throw new HttpError(400, `invalid ${field}`);
    return v;
  };

  app.post('/api/synthesize', async (c) => {
    const body = await readJson(c);
    const inputs = body.inputs;
    if (
      !Array.isArray(inputs) ||
      inputs.length > SYNTH_SLOTS ||
      !inputs.every((i) => typeof i === 'string' && i.length <= CRAFTED_MAX_LEN)
    ) {
      throw new HttpError(400, 'invalid inputs');
    }
    const list = inputs as string[];
    return serverAction(
      c,
      body,
      (state) => synthesize(state, list, content, deps.rng(), { depthCap: depthCap(state, content) }),
      async (playerId, t, result) => {
        const resultKey = 'spellId' in result ? `${result.kind}:${result.spellId}` : result.kind;
        await store.recordSynthesis(playerId, t, comboKey(list), resultKey);
        if (result.kind !== 'learned' || !content.spells[result.spellId]?.rare) return;
        // decided by the DB insert, and only after the save committed; suspicious players learn but are not recorded
        // the learn is already committed: a failing discovery write must not turn it into a 500
        try {
          const player = await store.getPlayer(playerId);
          if (!player || player.suspicious) return { ...result, rare: { first: false } };
          const { first } = await store.recordDiscovery({ spellId: result.spellId, playerId, displayName: player.displayName, at: t });
          return { ...result, rare: { first } };
        } catch {
          console.error('discovery write failed');
          return { ...result, rare: { first: false } };
        }
      },
    );
  });

  app.post('/api/empower', async (c) => {
    const body = await readJson(c);
    const spellId = idField(body, 'spellId');
    return serverAction(c, body, (state) => empower(state, spellId, content));
  });

  app.post('/api/reveal', async (c) => {
    const body = await readJson(c);
    const keyItem = idField(body, 'keyItem');
    return serverAction(c, body, (state) => revealRegion(state, keyItem, content));
  });

  app.post('/api/passive', async (c) => {
    const body = await readJson(c);
    const passiveId = idField(body, 'passiveId');
    return serverAction(c, body, (state) => unlockPassive(state, passiveId, content));
  });

  return app;
}
