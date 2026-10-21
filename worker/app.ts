import { Hono, type Context } from 'hono';
import { createInitialState, type GameState } from '../src/engine/state';
import { parseState, serialize } from '../src/engine/save';
import { comboKey, synthesize } from '../src/engine/synthesis';
import { validateUpload } from '../src/engine/validate';
import type { Rng } from '../src/engine/rng';
import type { GameData } from '../src/engine/types';
import { hashToken, newToken } from './auth';
import type { PlayerRow, Store } from './store';

export interface AppDeps {
  store: Store;
  now: () => number;
  rng: () => Rng;
  data: GameData;
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

type Env = { Variables: { player: PlayerRow } };
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
  const { store, now, data } = deps;
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
    const token = newToken();
    const t = now();
    const player: PlayerRow = {
      id: crypto.randomUUID(),
      displayName: name,
      tokenHash: await hashToken(token),
      createdAt: t,
      suspicious: false,
    };
    const state = createInitialState(data);
    await store.createPlayer(player, serialize(state), t);
    return c.json({ token, playerId: player.id, state, revision: 0 }, 201);
  });

  async function auth(c: Ctx, next: () => Promise<void>) {
    const m = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '');
    const player = m ? await store.findPlayerByTokenHash(await hashToken(m[1]!)) : null;
    if (!player) return c.json({ error: 'unauthorized' }, 401);
    c.set('player', player);
    await next();
  }
  app.use('/api/save', auth);
  app.use('/api/synthesize', auth);

  app.get('/api/save', async (c) => {
    const player = c.get('player');
    const save = await store.getSave(player.id);
    if (!save) return c.json({ error: 'not found' }, 404);
    return c.json({ state: JSON.parse(save.state), revision: save.revision });
  });

  type Checked =
    | { ok: true; state: GameState; revision: number; t: number; playerId: string; advanceAnchor: boolean }
    | { ok: false; res: Response };

  /** Shared by PUT /api/save and POST /api/synthesize: 400 / 409 / 422 handling. */
  async function checkUpload(c: Ctx, body: Record<string, unknown>): Promise<Checked> {
    const player = c.get('player');
    const base = body.baseRevision;
    if (typeof base !== 'number' || !Number.isInteger(base) || base < 0) throw new HttpError(400, 'invalid baseRevision');
    const next = parseState(body.state, data);
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
    const baseline: GameState = { ...anchor, learned: current.learned, synthesisLog: current.synthesisLog };
    const elapsed = Math.min(Math.max(0, t - save.anchorAt), MAX_WINDOW_MS);
    const verdict = validateUpload(baseline, next, elapsed, data);
    const reasons = verdict.ok ? [] : [...verdict.reasons];
    // learned / synthesisLog equality vs current is covered by the overlay above
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
      revision: save.revision,
      t,
      playerId: player.id,
      advanceAnchor: t - save.anchorAt >= ANCHOR_ADVANCE_MS,
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
    const done = await store.commitSave(
      checked.playerId,
      checked.revision,
      serialize(checked.state),
      checked.t,
      checked.advanceAnchor,
    );
    if (!done) return conflict(c, checked.playerId);
    return c.json({ revision: checked.revision + 1 });
  });

  app.post('/api/synthesize', async (c) => {
    const body = await readJson(c);
    const inputs = body.inputs;
    if (!Array.isArray(inputs) || inputs.length > 8 || !inputs.every((i) => typeof i === 'string')) {
      throw new HttpError(400, 'invalid inputs');
    }
    const checked = await checkUpload(c, body);
    if (!checked.ok) return checked.res;
    const { state, result } = synthesize(checked.state, inputs as string[], data, deps.rng());
    // the synthesis result is the new current state; the anchor still only advances by time
    const done = await store.commitSave(checked.playerId, checked.revision, serialize(state), checked.t, checked.advanceAnchor);
    if (!done) return conflict(c, checked.playerId);
    const resultKey = 'spellId' in result ? `${result.kind}:${result.spellId}` : result.kind;
    await store.recordSynthesis(checked.playerId, checked.t, comboKey(inputs as string[]), resultKey);
    return c.json({ result, state, revision: checked.revision + 1 });
  });

  return app;
}
