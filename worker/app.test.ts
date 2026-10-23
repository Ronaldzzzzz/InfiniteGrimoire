import { beforeEach, describe, expect, it } from 'vitest';
import { GAIN_SLACK, GAIN_TOLERANCE, maxGain } from '../src/engine/audit';
import { createBattle, stepBattle, STEP_MS, type BattleState } from '../src/engine/combat';
import { content } from '../src/engine/content';
import { elementEquivalent } from '../src/engine/inventory';
import type { Content, GameState } from '../src/engine/model';
import { createInitialState } from '../src/engine/persist';
import { createRng } from '../src/engine/rng';
import { craftedId } from '../src/engine/spells';
import { ELEMENT_ORDER } from '../src/engine/types';
import { ANCHOR_ADVANCE_MS, createApp, excludedFromRecords, FEED_LIMIT, GM_ITEM_MAX, GM_TOKEN_TTL_MS, MAX_BODY_BYTES, MAX_WINDOW_MS, SUSPICIOUS_REJECTIONS_24H } from './app';
import { hashToken, toBase64Url } from './auth';
import { MemoryStore, type SaveRow } from './store';

/** Stand-in for the browser's PBKDF2 hash: any 43-char base64url value is a valid client hash. */
const ph = async (pw: string) => toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))));

let store: MemoryStore;
let clock: number;
let app: ReturnType<typeof createApp>;

const makeApp = (c: Content = content, pepper = 'test-pepper') =>
  createApp({ store, now: () => clock, rng: () => createRng(1), content: c, pepper });

beforeEach(() => {
  store = new MemoryStore();
  clock = 1_000_000;
  app = makeApp();
});

const json = (body: unknown, token?: string, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

async function guest(name = 'Mage') {
  const res = await app.request('/api/guest', json({ displayName: name }));
  return { res, body: (await res.json()) as { token: string; playerId: string; state: GameState; revision: number } };
}

const initial = () => createInitialState(content);
const withInv = (inventory: Record<string, number>): GameState => ({ ...initial(), inventory });
const saved = (playerId: string) => JSON.parse(store.saves.get(playerId)!.state) as GameState;

type ActionOut = { result: { kind: string; reason?: string; spellId?: string }; state: GameState; revision: number; reason?: string; reasons?: string[] };
async function action(path: string, body: Record<string, unknown>, token: string) {
  const res = await app.request(path, json(body, token));
  return { status: res.status, out: (await res.json()) as ActionOut };
}

describe('createApp', () => {
  it('GET /api/health returns { ok: true }', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/guest', () => {
  it('allows 10 guests per ip per hour', async () => {
    const make = (ip: string) =>
      app.request('/api/guest', { ...json({ displayName: 'Mage' }), headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip } });
    for (let i = 0; i < 10; i++) expect((await make('1.2.3.4')).status).toBe(201);
    const blocked = await make('1.2.3.4');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBe(3600);
    expect((await make('5.6.7.8')).status).toBe(201);
    clock += 60 * 60 * 1000;
    expect((await make('1.2.3.4')).status).toBe(201);
  });

  it('creates player and returns initial state', async () => {
    const { res, body } = await guest('  Mage  ');
    expect(res.status).toBe(201);
    expect(body.revision).toBe(0);
    expect(body.state).toEqual(initial());
    expect(body.token.length).toBeGreaterThanOrEqual(43);
    expect(store.players.get(body.playerId)?.displayName).toBe('Mage');
    expect(store.sessions.get(await hashToken(body.token))?.playerId).toBe(body.playerId);
    expect([...store.sessions.keys()]).not.toContain(body.token);
    expect(store.saves.get(body.playerId)?.savedAt).toBe(clock);
    expect(store.saves.get(body.playerId)?.anchorAt).toBe(clock);
    expect(JSON.parse(store.saves.get(body.playerId)!.anchorState)).toEqual(body.state);
  });

  it('rejects empty or 17-char name', async () => {
    expect((await guest('   ')).res.status).toBe(400);
    expect((await guest('a'.repeat(17))).res.status).toBe(400);
    expect((await guest('a'.repeat(16))).res.status).toBe(201);
  });

  it('rejects bad json with 400 and oversized body with 413', async () => {
    const bad = await app.request('/api/guest', { method: 'POST', body: '{nope' });
    expect(bad.status).toBe(400);
    const big = await app.request('/api/guest', json({ displayName: 'x'.repeat(MAX_BODY_BYTES + 1) }));
    expect(big.status).toBe(413);
  });
});

describe('auth', () => {
  it('requests without token get 401', async () => {
    expect((await app.request('/api/save')).status).toBe(401);
    expect((await app.request('/api/save', { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect((await app.request('/api/save', json({}, undefined, 'PUT'))).status).toBe(401);
    for (const path of ['/api/synthesize', '/api/empower', '/api/reveal', '/api/passive']) {
      expect((await app.request(path, json({}))).status, path).toBe(401);
    }
  });

  it('touches last_seen_at at most once an hour', async () => {
    const { body } = await guest();
    const hash = await hashToken(body.token);
    clock += 10 * 60 * 1000;
    await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(store.sessions.get(hash)?.lastSeenAt).toBe(1_000_000);
    clock += 60 * 60 * 1000;
    await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(store.sessions.get(hash)?.lastSeenAt).toBe(clock);
  });
});

describe('save', () => {
  it('GET save returns the state and leaves the anchor alone', async () => {
    const { body } = await guest();
    const before = store.saves.get(body.playerId)!;
    clock += 5000;
    const res = await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: body.state, revision: 0 });
    expect(store.saves.get(body.playerId)).toEqual(before);
  });

  it('valid upload advances revision and keeps the old file', async () => {
    const { body } = await guest();
    clock += 60_000;
    const next = { ...body.state, zoneKills: { [body.state.currentZone]: 1 } };
    const res = await app.request('/api/save', json({ state: next, baseRevision: 0 }, body.token, 'PUT'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 1 });
    const row = store.saves.get(body.playerId)!;
    expect(row.revision).toBe(1);
    expect(JSON.parse(row.state)).toEqual(next);
    expect(JSON.parse(row.prevState!)).toEqual(body.state);
    expect(row.prevSavedAt).toBe(1_000_000);
  });

  it('stale baseRevision returns 409 with current state', async () => {
    const { body } = await guest();
    clock += 60_000;
    const res = await app.request('/api/save', json({ state: body.state, baseRevision: 3 }, body.token, 'PUT'));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ reason: 'conflict', state: body.state, revision: 0 });
  });

  it('malformed state or baseRevision returns 400', async () => {
    const { body } = await guest();
    const a = await app.request('/api/save', json({ state: { version: 1 }, baseRevision: 0 }, body.token, 'PUT'));
    expect(a.status).toBe(400);
    const b = await app.request('/api/save', json({ state: body.state }, body.token, 'PUT'));
    expect(b.status).toBe(400);
    // an unparseable server field (equipped spell not learned) is malformed, not a 422
    const c = await app.request('/api/save', json({ state: { ...body.state, equipped: 'fireball' }, baseRevision: 0 }, body.token, 'PUT'));
    expect(c.status).toBe(400);
  });

  it('tampered upload returns 422 and keeps old save', async () => {
    const { body } = await guest();
    clock += 1000;
    const tampered = withInv({ 'el:fire:1': 999_999 });
    const res = await app.request('/api/save', json({ state: tampered, baseRevision: 0 }, body.token, 'PUT'));
    expect(res.status).toBe(422);
    const out = (await res.json()) as { reason: string; reasons: string[]; state: GameState; revision: number };
    expect(out.reason).toBe('rejected');
    expect(out.reasons.length).toBeGreaterThan(0);
    expect(out.state).toEqual(body.state);
    expect(out.revision).toBe(0);
    expect(store.saves.get(body.playerId)?.revision).toBe(0);
    expect(saved(body.playerId)).toEqual(body.state);
  });

  it('rejects forged crafted spells, levels, reveals and passives', async () => {
    const { body } = await guest();
    clock += 60_000;
    const forged = craftedId('fireball', 'mat:ember_core');
    const cases: [Partial<GameState>, string][] = [
      [{ learned: ['mana_bolt', forged], equipped: forged }, 'learned spells changed'],
      [{ learned: ['mana_bolt', 'fireball'] }, 'learned spells changed'],
      [{ levels: { mana_bolt: 9 } }, 'levels changed'],
      [{ revealed: ['outer'] }, 'revealed changed'],
      [{ passives: ['ember_affinity'] }, 'passives changed'],
      [{ synthesisLog: { 'el:fire:1+el:fire:1': { attempts: 1, results: { fireball: 1 }, noReaction: false } } }, 'synthesisLog changed'],
    ];
    for (const [change, reason] of cases) {
      const res = await app.request('/api/save', json({ state: { ...body.state, ...change }, baseRevision: 0 }, body.token, 'PUT'));
      expect(res.status, reason).toBe(422);
      const out = (await res.json()) as { reason: string; reasons: string[] };
      expect(out.reason).toBe('rejected');
      expect(out.reasons).toContain(reason);
    }
    // key items are bounded by what bosses can drop: no slack
    const keys = await app.request('/api/save', json({ state: withInv({ 'key:storm_heart': 100 }), baseRevision: 0 }, body.token, 'PUT'));
    expect(keys.status).toBe(422);
    expect(saved(body.playerId)).toEqual(body.state);
  });

  it('five rejections in 24h marks suspicious', async () => {
    const { body } = await guest();
    clock += 1000;
    for (let i = 0; i < SUSPICIOUS_REJECTIONS_24H; i++) {
      expect(store.players.get(body.playerId)?.suspicious).toBe(false);
      const res = await app.request(
        '/api/save',
        json({ state: withInv({ 'el:fire:1': 999_999 }), baseRevision: 0 }, body.token, 'PUT'),
      );
      expect(res.status).toBe(422);
    }
    expect(store.players.get(body.playerId)?.suspicious).toBe(true);
  });
});

describe('synthesize', () => {
  const thunder2 = () => withInv({ 'el:thunder:1': 2 });
  const inputs = ['el:thunder:1', 'el:thunder:1'];

  it('learns spell server-side', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    const { status, out } = await action('/api/synthesize', { state: thunder2(), baseRevision: 0, inputs }, body.token);
    expect(status).toBe(200);
    expect(out.result.kind).toBe('learned');
    expect(out.state.learned).toContain('lightning');
    expect(out.revision).toBe(1);
    expect(store.synthEvents).toEqual([
      { playerId: body.playerId, at: clock, combo: 'el:thunder:1+el:thunder:1', result: 'learned:lightning' },
    ]);
    expect(saved(body.playerId).learned).toContain('lightning');
  });

  it('synthesize crafts a spell and the next upload keeps it', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    const start = withInv({ 'el:fire:1': 3, 'mat:ember_core': 1 });
    const first = await action('/api/synthesize', { state: start, baseRevision: 0, inputs: ['el:fire:1', 'el:fire:1'] }, body.token);
    expect(first.out.result.kind).toBe('learned');
    clock += 1000;
    const second = await action('/api/synthesize', { state: first.out.state, baseRevision: 1, inputs: ['fireball', 'mat:ember_core'] }, body.token);
    expect(second.status).toBe(200);
    const id = craftedId('fireball', 'mat:ember_core');
    expect(second.out.result).toEqual({ kind: 'learned', spellId: id, crafted: true });
    expect(second.out.state.learned).toEqual(['mana_bolt', 'fireball', id]);
    // the fusion cost (one grade-1 fire for a depth-1 spell) and the material are spent
    expect(second.out.state.inventory).toEqual({});
    clock += 1000;
    const next = { ...second.out.state, equipped: id };
    expect((await app.request('/api/save', json({ state: next, baseRevision: 2 }, body.token, 'PUT'))).status).toBe(200);
    expect(saved(body.playerId).equipped).toBe(id);
  });

  it('ignores client-claimed learned spells', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    const claimed = { ...thunder2(), learned: ['mana_bolt', 'fireball'] };
    const { status, out } = await action('/api/synthesize', { state: claimed, baseRevision: 0, inputs }, body.token);
    expect(status).toBe(422);
    expect(out.reasons).toContain('learned spells changed');
    expect(store.synthEvents).toHaveLength(0);
  });

  it('a rejected action returns 422 with the result and does not write', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    for (const bad of [['el:thunder:1'], ['constructor', 'el:thunder:1'], ['el:dark:1', 'el:thunder:1'], ['__proto__', 'lightning']]) {
      const { status, out } = await action('/api/synthesize', { state: thunder2(), baseRevision: 0, inputs: bad }, body.token);
      expect(status, bad.join('+')).toBe(422);
      expect(out.reason).toBe('rejected');
      expect(out.result.kind).toBe('rejected');
      expect(out.state).toEqual(body.state);
      expect(out.revision).toBe(0);
    }
    const one = await action('/api/synthesize', { state: thunder2(), baseRevision: 0, inputs: ['el:thunder:1'] }, body.token);
    expect(one.out.result).toEqual({ kind: 'rejected', reason: 'slots' });
    expect(store.saves.get(body.playerId)?.revision).toBe(0);
    expect(store.synthEvents).toHaveLength(0);
    // an engine rejection is not a cheating attempt
    expect(store.rejections).toHaveLength(0);
  });

  it('an over-long input is 400', async () => {
    const { body } = await guest();
    clock += 30_000;
    const long = `c(${'x'.repeat(600)}|fireball)`;
    for (const bad of [[long, 'el:thunder:1'], ['el:thunder:1', 'el:thunder:1', 'el:thunder:1'], ['el:thunder:1', 7], 'el:thunder:1']) {
      const res = await app.request('/api/synthesize', json({ state: thunder2(), baseRevision: 0, inputs: bad }, body.token));
      expect(res.status, JSON.stringify(bad).slice(0, 40)).toBe(400);
    }
    for (const [path, field] of [['/api/empower', 'spellId'], ['/api/reveal', 'keyItem'], ['/api/passive', 'passiveId']] as const) {
      for (const bad of [long, '', 3, undefined]) {
        const res = await app.request(path, json({ state: thunder2(), baseRevision: 0, [field]: bad }, body.token));
        expect(res.status, `${path} ${String(bad).slice(0, 10)}`).toBe(400);
      }
    }
    expect(store.saves.get(body.playerId)?.revision).toBe(0);
    expect(store.synthEvents).toHaveLength(0);
  });

  it('a synthesis result that fails parseState is a 500 and is not committed', async () => {
    // a named spell whose id is too long to resolve cannot come from real data; it stands in for any engine bug
    const ghost = 'g'.repeat(600);
    const broken: Content = {
      ...content,
      spells: { ...content.spells, [ghost]: { ...content.spells.fireball!, id: ghost, prerequisites: [] } },
      recipes: [...content.recipes, { id: 'ghost', inputs: ['mat:ember_core', 'mat:ember_core'], outcomes: [{ spellId: ghost, weight: 1 }] }],
    };
    app = makeApp(broken);
    const { body } = await guest();
    clock += 30_000;
    const res = await app.request(
      '/api/synthesize',
      json({ state: withInv({ 'mat:ember_core': 2, 'el:fire:1': 1 }), baseRevision: 0, inputs: ['mat:ember_core', 'mat:ember_core'] }, body.token),
    );
    expect(res.status).toBe(500);
    expect(store.saves.get(body.playerId)?.revision).toBe(0);
    expect(store.synthEvents).toHaveLength(0);
  });

  it('concurrent synthesize with same baseRevision', async () => {
    // Both requests pass the revision precheck before either commits, so only the store's CAS can stop the second.
    class GatedStore extends MemoryStore {
      private waiting = 0;
      private release!: () => void;
      private readonly gate = new Promise<void>((r) => (this.release = r));
      override async getSave(playerId: string): Promise<SaveRow | null> {
        const row = await super.getSave(playerId);
        if (++this.waiting <= 2) {
          if (this.waiting === 2) this.release();
          await this.gate;
        }
        return row;
      }
    }
    store = new GatedStore();
    app = makeApp();
    const { body } = await guest();
    clock += 3_600_000;
    const send = () => app.request('/api/synthesize', json({ state: thunder2(), baseRevision: 0, inputs }, body.token));
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const lost = (await loser.json()) as { reason: string; state: GameState; revision: number };
    expect(lost.reason).toBe('conflict');
    expect(lost.revision).toBe(1);
    expect(saved(body.playerId).inventory['el:thunder:1'] ?? 0).toBe(0);
    expect(store.saves.get(body.playerId)?.revision).toBe(1);
    expect(store.synthEvents).toHaveLength(1);
  });
});

describe('empower, reveal and passive', () => {
  /** A guest who learned fireball through the API (revision 1), with `extra` items on top. */
  async function withFireball(extra: Record<string, number>) {
    const { body } = await guest();
    clock += 3_600_000;
    const start = withInv({ ...extra, 'el:fire:1': 2 + (extra['el:fire:1'] ?? 0) });
    const r = await action('/api/synthesize', { state: start, baseRevision: 0, inputs: ['el:fire:1', 'el:fire:1'] }, body.token);
    expect(r.out.state.learned).toContain('fireball');
    clock += 1000;
    return { token: body.token, playerId: body.playerId, state: r.out.state, revision: r.out.revision };
  }

  it('empower spends elements and raises the level', async () => {
    const g = await withFireball({ 'el:fire:1': 5 });
    const { status, out } = await action('/api/empower', { state: g.state, baseRevision: 1, spellId: 'fireball' }, g.token);
    expect(status, JSON.stringify(out)).toBe(200);
    expect(out.result).toEqual({ kind: 'empowered', level: 2 });
    expect(out.state.levels).toEqual({ fireball: 2 });
    expect(out.state.inventory).toEqual({ 'el:fire:1': 1 });
    expect(saved(g.playerId).levels).toEqual({ fireball: 2 });
    // the spent elements are charged to the anchor (the synthesis result, 5 fire): restoring them is a gain to explain
    expect(JSON.parse(store.saves.get(g.playerId)!.anchorState).inventory['el:fire:1']).toBe(1);
    // mana_bolt has no element to empower with
    const none = await action('/api/empower', { state: out.state, baseRevision: 2, spellId: 'mana_bolt' }, g.token);
    expect(none.status).toBe(422);
    expect(none.out.result).toEqual({ kind: 'rejected', reason: 'noElements' });
    // and the level is server-owned: the next upload must keep it
    clock += 1000;
    const dropped = await app.request('/api/save', json({ state: { ...out.state, levels: {} }, baseRevision: 2 }, g.token, 'PUT'));
    expect(dropped.status).toBe(422);
  });

  it('reveal consumes the key item', async () => {
    const g = await withFireball({ 'key:storm_heart': 1 });
    const { status, out } = await action('/api/reveal', { state: g.state, baseRevision: 1, keyItem: 'key:storm_heart' }, g.token);
    expect(status).toBe(200);
    expect(out.result).toEqual({ kind: 'revealed', region: 'outer' });
    expect(out.state.revealed).toEqual(['outer']);
    expect(out.state.inventory['key:storm_heart']).toBeUndefined();
    const again = await action('/api/reveal', { state: out.state, baseRevision: 2, keyItem: 'key:storm_heart' }, g.token);
    expect(again.status).toBe(422);
    expect(again.out.result.kind).toBe('rejected');
    expect(saved(g.playerId).revealed).toEqual(['outer']);
  });

  it('passive unlock respects the fog', async () => {
    const g = await withFireball({ 'mat:ember_core': 5, 'key:storm_heart': 1 });
    const hidden = await action('/api/passive', { state: g.state, baseRevision: 1, passiveId: 'ember_affinity' }, g.token);
    expect(hidden.status).toBe(422);
    expect(hidden.out.result).toEqual({ kind: 'rejected', reason: 'hidden' });
    const shown = await action('/api/reveal', { state: g.state, baseRevision: 1, keyItem: 'key:storm_heart' }, g.token);
    const { status, out } = await action('/api/passive', { state: shown.out.state, baseRevision: 2, passiveId: 'ember_affinity' }, g.token);
    expect(status).toBe(200);
    expect(out.result).toEqual({ kind: 'unlocked' });
    expect(out.state.passives).toEqual(['ember_affinity']);
    expect(out.state.inventory['mat:ember_core']).toBeUndefined();
    const unknown = await action('/api/passive', { state: out.state, baseRevision: 3, passiveId: 'constructor' }, g.token);
    expect(unknown.out.result).toEqual({ kind: 'rejected', reason: 'unknown' });
  });
});

describe('MemoryStore.commitSave', () => {
  const player = { id: 'p', displayName: 'x', createdAt: 0, suspicious: false, gmUsed: false };
  it('stale baseRevision returns false and leaves the save unchanged', async () => {
    const s = new MemoryStore();
    await s.createPlayer(player, 'h', 'A', 0);
    expect(await s.commitSave('p', 0, 'B', 10, null)).toBe(true);
    expect(await s.commitSave('p', 0, 'C', 20, { state: 'C', at: 20 })).toBe(false);
    expect(await s.getSave('p')).toMatchObject({
      state: 'B', revision: 1, savedAt: 10, prevState: 'A', prevSavedAt: 0, anchorState: 'A', anchorAt: 0,
    });
  });
  it('writes the anchor only when given one, in the same commit', async () => {
    const s = new MemoryStore();
    await s.createPlayer(player, 'h', 'A', 0);
    expect(await s.getSave('p')).toMatchObject({ anchorState: 'A', anchorAt: 0 });
    await s.commitSave('p', 0, 'B', 10, null);
    expect(await s.getSave('p')).toMatchObject({ state: 'B', anchorState: 'A', anchorAt: 0 });
    await s.commitSave('p', 1, 'C', 70, { state: 'C', at: 70 });
    expect(await s.getSave('p')).toMatchObject({ state: 'C', revision: 2, anchorState: 'C', anchorAt: 70 });
    await s.commitSave('p', 2, 'D', 80, { state: 'A2', at: 70 });
    expect(await s.getSave('p')).toMatchObject({ state: 'D', revision: 3, anchorState: 'A2', anchorAt: 70 });
  });
});

describe('window cap', () => {
  it('caps credited time at MAX_WINDOW_MS even after 8h', async () => {
    expect(MAX_WINDOW_MS).toBe(180_000);
    const { body } = await guest();
    clock += 8 * 3_600_000;
    const res = await app.request('/api/save', json({ state: withInv({ 'el:fire:1': 5000 }), baseRevision: 0 }, body.token, 'PUT'));
    expect(res.status).toBe(422);
  });
  it('synthesize is capped by the same window', async () => {
    const { body } = await guest();
    clock += 8 * 3_600_000;
    const res = await app.request(
      '/api/synthesize',
      json({ state: withInv({ 'el:fire:1': 5000, 'el:thunder:1': 2 }), baseRevision: 0, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token),
    );
    expect(res.status).toBe(422);
    expect(store.synthEvents).toHaveLength(0);
  });
});

describe('anchor window', () => {
  /** The honest bound for `ms` of play from the initial state, per element. */
  const honestLimit = (ms: number) => {
    const b = maxGain(initial(), ms, content);
    return Object.fromEntries(ELEMENT_ORDER.map((e) => [e, b.elements[e] * GAIN_TOLERANCE + GAIN_SLACK]));
  };
  /** Adds the full per-upload 100 ms allowance (tolerance + slack) on top of `prev`. */
  const inflate = (prev: GameState): GameState => {
    const b = maxGain(prev, 100, content);
    const inventory = { ...prev.inventory };
    for (const e of ELEMENT_ORDER) {
      const extra = Math.floor(b.elements[e] * GAIN_TOLERANCE + GAIN_SLACK);
      inventory[`el:${e}:1`] = (inventory[`el:${e}:1`] ?? 0) + extra;
    }
    return { ...prev, inventory };
  };
  const gainOf = (s: GameState, e: (typeof ELEMENT_ORDER)[number]) => elementEquivalent(s.inventory, e);

  it('300 PUTs at 100 ms each claiming the 100 ms bound stay under 2x the honest 30 s bound', async () => {
    const { body } = await guest();
    let accepted = body.state;
    let revision = 0;
    let rejected = 0;
    for (let i = 0; i < 300; i++) {
      clock += 100;
      const claim = inflate(accepted);
      const res = await app.request('/api/save', json({ state: claim, baseRevision: revision }, body.token, 'PUT'));
      const out = (await res.json()) as { revision: number; state?: GameState };
      revision = out.revision;
      if (res.status === 200) accepted = claim;
      else {
        expect(res.status).toBe(422);
        rejected++;
        accepted = out.state!;
      }
    }
    expect(rejected).toBeGreaterThan(0);
    const limit = honestLimit(30_000);
    for (const e of ELEMENT_ORDER) expect(gainOf(saved(body.playerId), e), e).toBeLessThan(2 * limit[e]!);
  });

  it('high-frequency synthesize calls cannot accumulate per-call allowances either', async () => {
    const { body } = await guest();
    let accepted = body.state;
    let revision = 0;
    let rejected = 0;
    for (let i = 0; i < 300; i++) {
      clock += 100;
      const claim = inflate(accepted);
      // no recipe for fire + water: a logged no-reaction that consumes nothing but commits the claim
      const { status, out } = await action('/api/synthesize', { state: claim, baseRevision: revision, inputs: ['el:fire:1', 'el:water:1'] }, body.token);
      revision = out.revision;
      if (status !== 200) rejected++;
      else expect(out.result.kind).toBe('noReaction');
      accepted = out.state;
    }
    expect(rejected).toBeGreaterThan(0);
    const limit = honestLimit(30_000);
    for (const e of ELEMENT_ORDER) expect(gainOf(saved(body.playerId), e), e).toBeLessThan(2 * limit[e]!);
  });

  it('an honest client uploading every 30 s for 10 minutes is never rejected', async () => {
    const { body } = await guest();
    const r = await playHonestly(body.token, body, { uploadEveryMs: 30_000, until: (_g, ms) => ms >= 600_000 });
    expect(r.statuses).toHaveLength(20);
    expect(r.statuses.every((s) => s === 200), r.statuses.join(',')).toBe(true);
    expect(store.rejections).toHaveLength(0);
  });

  it('advances the anchor to the accepted state once ANCHOR_ADVANCE_MS has passed', async () => {
    expect(ANCHOR_ADVANCE_MS).toBe(60_000);
    const { body } = await guest();
    const t0 = clock;
    clock += 30_000;
    const s1 = { ...body.state, zoneKills: { [body.state.currentZone]: 3 } };
    expect((await app.request('/api/save', json({ state: s1, baseRevision: 0 }, body.token, 'PUT'))).status).toBe(200);
    expect(store.saves.get(body.playerId)).toMatchObject({ anchorAt: t0 });
    expect(JSON.parse(store.saves.get(body.playerId)!.anchorState)).toEqual(body.state);
    clock += 30_000;
    const s2 = { ...body.state, zoneKills: { [body.state.currentZone]: 6 } };
    expect((await app.request('/api/save', json({ state: s2, baseRevision: 1 }, body.token, 'PUT'))).status).toBe(200);
    expect(store.saves.get(body.playerId)).toMatchObject({ anchorAt: clock });
    expect(JSON.parse(store.saves.get(body.playerId)!.anchorState)).toEqual(s2);
  });

  it('synthesize 1 s after an accepted upload is accepted', async () => {
    const { body } = await guest();
    clock += 30_000;
    const s1 = withInv({ 'el:thunder:1': 2 });
    expect((await app.request('/api/save', json({ state: s1, baseRevision: 0 }, body.token, 'PUT'))).status).toBe(200);
    clock += 1000;
    const { status, out } = await action('/api/synthesize', { state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token);
    expect(status).toBe(200);
    expect(out.result.kind).toBe('learned');
    // and the next regular upload keeps the server-learned spell
    clock += 1000;
    expect((await app.request('/api/save', json({ state: saved(body.playerId), baseRevision: 2 }, body.token, 'PUT'))).status).toBe(200);
  });

  it('restoring synthesis inputs inside one window is rejected: no free re-rolls', async () => {
    // Restore the two inputs, synthesize again, repeat. Every restore counts as gain against the anchor,
    // so re-rolls are paid for by the window's farming allowance and the restores are rejected once
    // they exceed it (here: 200 cycles at 10 ms within ~4 s).
    const { body } = await guest();
    const inputs = ['el:thunder:1', 'el:thunder:1'];
    const two = { 'el:thunder:1': 2 };
    let revision = 0;
    const statuses: string[] = [];
    let paid = 0;
    const t0 = clock;
    for (let i = 0; i < 200; i++) {
      clock += 10;
      const restored = { ...saved(body.playerId), inventory: two };
      const put = await app.request('/api/save', json({ state: restored, baseRevision: revision }, body.token, 'PUT'));
      revision = ((await put.json()) as { revision: number }).revision;
      statuses.push(`put${put.status}`);
      if (put.status !== 200) continue;
      clock += 10;
      const syn = await action('/api/synthesize', { state: restored, baseRevision: revision, inputs }, body.token);
      revision = syn.out.revision;
      statuses.push(`syn${syn.status}:${syn.out.result?.kind ?? ''}`);
      if (syn.status === 200) paid += 2 - (syn.out.state.inventory['el:thunder:1'] ?? 0);
    }
    expect(statuses).toContain('put422');
    // every element spent by synthesis fits what the window could have produced
    const limit = maxGain(initial(), clock - t0, content).elements.thunder * GAIN_TOLERANCE + GAIN_SLACK;
    expect(paid, statuses.join(' ')).toBeLessThanOrEqual(limit);
    // and the synth events are exactly the paid ones: 2 for the learn, 1 net per duplicate
    expect(paid).toBe(2 + (store.synthEvents.length - 1));
  });

  it('the anchor is charged with what a synthesis spent', async () => {
    const { body } = await guest();
    clock += 30_000;
    const s1 = withInv({ 'el:thunder:1': 3, 'el:fire:1': 1 });
    await app.request('/api/save', json({ state: s1, baseRevision: 0 }, body.token, 'PUT'));
    clock += 1000;
    await app.request('/api/synthesize', json({ state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token));
    // anchor (initial, empty inventory) minus the two spent inputs: the debt is carried as -2
    expect(JSON.parse(store.saves.get(body.playerId)!.anchorState).inventory).toEqual({ 'el:thunder:1': -2 });
  });

  it('synthesis then honest farming in the same window is accepted', async () => {
    const { body } = await guest();
    clock += 30_000;
    const s1 = withInv({ 'el:thunder:1': 2 });
    expect((await app.request('/api/save', json({ state: s1, baseRevision: 0 }, body.token, 'PUT'))).status).toBe(200);
    clock += 1000;
    const syn = await action('/api/synthesize', { state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token);
    expect(syn.status).toBe(200);
    expect(store.saves.get(body.playerId)!.anchorAt).toBe(clock - 31_000);
    const r = await playHonestly(body.token, syn.out, { uploadEveryMs: 20_000, until: (_g, ms) => ms >= 60_000 });
    expect(r.statuses.every((st) => st === 200), r.statuses.join(',')).toBe(true);
    expect(r.statuses.length).toBe(3);
  });

  it('server-owned fields are checked against the current save, not just the anchor', async () => {
    const { body } = await guest();
    clock += 30_000;
    const s1 = withInv({ 'el:thunder:1': 2 });
    await app.request('/api/save', json({ state: s1, baseRevision: 0 }, body.token, 'PUT'));
    await app.request('/api/synthesize', json({ state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token));
    clock += 1000;
    // dropping the spell learned after the anchor
    const res = await app.request('/api/save', json({ state: body.state, baseRevision: 2 }, body.token, 'PUT'));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { reasons: string[] }).reasons).toContain('learned spells changed');
  });

  it('defeatedBosses may not shrink relative to the current save', async () => {
    const { body } = await guest();
    const boss = content.zones[0]!.bossId;
    const row = store.saves.get(body.playerId)!;
    const current: GameState = {
      ...body.state,
      defeatedBosses: [boss],
      unlockedZones: [content.zones[0]!.id, content.zones[1]!.id],
    };
    store.saves.set(body.playerId, { ...row, state: JSON.stringify(current) });
    clock += 30_000;
    const res = await app.request('/api/save', json({ state: body.state, baseRevision: 0 }, body.token, 'PUT'));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { reasons: string[] }).reasons).toContain(`defeatedBosses lost boss ${boss}`);
  });
});

/**
 * An honest client: runs the real battle engine with the advancing fake clock and PUTs
 * `{ state, baseRevision }` every `uploadEveryMs`. Returns the HTTP status of every upload.
 */
async function playHonestly(
  token: string,
  start: { state: GameState; revision: number },
  opts: { uploadEveryMs: number; until: (game: GameState, elapsedMs: number) => boolean },
) {
  const rng = createRng(7);
  let game = start.state;
  let revision = start.revision;
  let battle: BattleState = createBattle(game.currentZone);
  const statuses: number[] = [];
  let sinceUpload = 0;
  let elapsed = 0;
  for (;;) {
    const r = stepBattle(game, battle, content, rng);
    game = r.game;
    battle = r.battle;
    clock += STEP_MS;
    elapsed += STEP_MS;
    sinceUpload += STEP_MS;
    if (sinceUpload >= opts.uploadEveryMs) {
      sinceUpload = 0;
      const res = await app.request('/api/save', json({ state: game, baseRevision: revision }, token, 'PUT'));
      statuses.push(res.status);
      const out = (await res.json()) as { revision: number; state?: GameState };
      revision = out.revision;
      if (res.status !== 200 && out.state) {
        game = out.state;
        battle = createBattle(game.currentZone);
      }
      if (opts.until(game, elapsed)) return { statuses, game, revision };
    }
  }
}

describe('honest play through the real engine', () => {
  it('uploads after the first boss falls are accepted (defeatedBosses holds boss ids)', async () => {
    const { body } = await guest();
    const firstBoss = content.zones[0]!.bossId;
    // a server-made state with a strong spell (as if learned and empowered earlier), so the boss falls quickly
    const strong: GameState = {
      ...body.state, learned: ['mana_bolt', 'lightning', 'thunder_hammer'], equipped: 'thunder_hammer', levels: { thunder_hammer: 10 },
    };
    const row = store.saves.get(body.playerId)!;
    store.saves.set(body.playerId, { ...row, state: JSON.stringify(strong), anchorState: JSON.stringify(strong) });
    const r = await playHonestly(body.token, { state: strong, revision: 0 }, {
      uploadEveryMs: 30_000,
      until: (g, ms) => g.defeatedBosses.includes(firstBoss) || ms > 3_600_000,
    });
    expect(r.game.defeatedBosses).toEqual([firstBoss]);
    expect(r.statuses.every((s) => s === 200), r.statuses.join(',')).toBe(true);
    // and one more upload on top of the boss save
    clock += 30_000;
    const res = await app.request('/api/save', json({ state: r.game, baseRevision: r.revision }, body.token, 'PUT'));
    expect(res.status).toBe(200);
    const load = await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(((await load.json()) as { state: GameState }).state.defeatedBosses).toEqual([firstBoss]);
  });
});

describe('v2 states', () => {
  it('guest and login return a v2 state', async () => {
    const { body: g } = await guest('Aria');
    expect(g.state.version).toBe(2);
    expect(g.state).toEqual(initial());
    await app.request('/api/account/bind', json({ username: 'aria_v2', password: await ph('password1') }, g.token));
    const lr = await app.request('/api/login', json({ username: 'aria_v2', password: await ph('password1') }));
    const lb = (await lr.json()) as { state: GameState };
    expect(lb.state.version).toBe(2);
    expect(lb.state).toEqual(initial());
  });
});
describe('accounts: bind and login', () => {
  const authed = (token: string): RequestInit => ({ headers: { authorization: `Bearer ${token}` } });
  const bindRaw = (token: string, username: string, password: string) =>
    app.request('/api/account/bind', json({ username, password }, token));
  const loginRaw = (username: string, password: string, ip = '1.1.1.1') =>
    app.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ username, password }),
    });
  const bind = async (token: string, username: string, password: string) => bindRaw(token, username, await ph(password));
  const login = async (username: string, password: string, ip = '1.1.1.1') => loginRaw(username, await ph(password), ip);

  it('binds a guest and logs in from another device, keeping both sessions', async () => {
    const { body: g } = await guest('Aria');
    const res = await bind(g.token, ' Ａｒｉａ_1 ', 'correct horse');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: 'Aria_1' });
    const cred = store.credentials.get(g.playerId)!;
    expect(cred.usernameKey).toBe('aria_1');
    expect(cred.passwordHash).not.toContain('correct horse');

    const lr = await login('ARIA_1', 'correct horse');
    expect(lr.status).toBe(200);
    const lb = (await lr.json()) as { token: string; playerId: string; state: GameState; revision: number };
    expect(lb.playerId).toBe(g.playerId);
    expect(lb.token).not.toBe(g.token);
    expect(lb.revision).toBe(0);
    expect(lb.state).toEqual(initial());
    expect((await app.request('/api/save', authed(g.token))).status).toBe(200);
    expect((await app.request('/api/save', authed(lb.token))).status).toBe(200);
  });

  it('rejects taken names (case and width insensitive), double binds and bad input', async () => {
    const { body: a } = await guest('A');
    const { body: b } = await guest('B');
    expect((await bind(a.token, 'mage_1', 'password1')).status).toBe(200);
    const taken = await bind(b.token, 'ＭＡＧＥ_1', 'password1');
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'taken' });
    const again = await bind(a.token, 'other', 'password1');
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_bound' });
    expect((await bind(b.token, 'ab', 'password1')).status).toBe(400);
    expect((await bind(b.token, 'a-b-c', 'password1')).status).toBe(400);
    const plain = await bindRaw(b.token, 'mage_2', 'password1');
    expect(plain.status).toBe(400);
    expect(await plain.json()).toEqual({ error: 'invalid_password' });
    expect((await app.request('/api/account/bind', json({ username: 'x_y_z', password: 'password1' }))).status).toBe(401);
  });

  it('answers a wrong password and an unknown name the same way (403)', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    const wrong = await login('mage_1', 'password2');
    const unknown = await login('nobody', 'password2');
    expect(wrong.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(await unknown.json()).toEqual({ error: 'invalid_credentials' });
    expect((await login('ab', 'password1')).status).toBe(400);
  });

  it('locks a name after 5 failures in 15 minutes, even for the right password', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    for (let i = 0; i < 5; i++) expect((await login('mage_1', 'nope-nope', `9.9.9.${i}`)).status).toBe(403);
    const blocked = await login('mage_1', 'password1', '8.8.8.8');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBeGreaterThan(0);
    expect(body.retryAfterSec).toBeLessThanOrEqual(900);
    clock += 15 * 60 * 1000 + 1;
    expect((await login('mage_1', 'password1', '8.8.8.8')).status).toBe(200);
  });

  it('a success does not reset the failure count', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    for (let i = 0; i < 4; i++) await login('mage_1', 'nope-nope');
    expect((await login('mage_1', 'password1')).status).toBe(200);
    expect((await login('mage_1', 'nope-nope')).status).toBe(403);
    expect((await login('mage_1', 'password1')).status).toBe(429);
  });

  it('locks an ip after 20 failures across names', async () => {
    for (let i = 0; i < 20; i++) expect((await login(`name_${i}`, 'nope-nope', '7.7.7.7')).status).toBe(403);
    expect((await login('name_x', 'nope-nope', '7.7.7.7')).status).toBe(429);
    expect((await login('name_x', 'nope-nope', '6.6.6.6')).status).toBe(403);
  });

  it('accepts only a client hash as the password, never the password itself', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    const plain = await loginRaw('mage_1', 'password1');
    expect(plain.status).toBe(400);
    expect(await plain.json()).toEqual({ error: 'invalid_password' });
    expect(store.credentials.get(g.playerId)!.passwordHash).toMatch(/^hmac-sha256\$v1\$/);
  });

  it('refuses to store a hash without a pepper (500)', async () => {
    app = makeApp(content, '');
    const { body: g } = await guest();
    expect((await bind(g.token, 'mage_1', 'password1')).status).toBe(500);
    expect(store.credentials.size).toBe(0);
  });
});
describe('accounts: info, password and logout', () => {
  const get = (path: string, token: string) => app.request(path, { headers: { authorization: `Bearer ${token}` } });
  const post = (path: string, token: string, body: unknown = {}) => app.request(path, json(body, token));
  async function boundGuest() {
    const { body: g } = await guest('Aria');
    await post('/api/account/bind', g.token, { username: 'aria_1', password: await ph('password1') });
    const lr = await app.request('/api/login', json({ username: 'aria_1', password: await ph('password1') }));
    const second = ((await lr.json()) as { token: string }).token;
    return { g, second };
  }

  it('reports display name, username and session count', async () => {
    const { body: g } = await guest('Aria');
    expect(await (await get('/api/account', g.token)).json()).toEqual({ displayName: 'Aria', username: null, sessions: 1 });
    const { g: b, second } = await boundGuest();
    expect(await (await get('/api/account', second)).json()).toEqual({ displayName: 'Aria', username: 'aria_1', sessions: 2 });
    expect(b.token).not.toBe(second);
  });

  it('changes the password and logs out the other devices only', async () => {
    const { g, second } = await boundGuest();
    const res = await post('/api/account/password', second, { current: await ph('password1'), next: await ph('password2') });
    expect(res.status).toBe(200);
    expect((await get('/api/save', g.token)).status).toBe(401);
    expect((await get('/api/save', second)).status).toBe(200);
    expect((await app.request('/api/login', json({ username: 'aria_1', password: await ph('password2') }))).status).toBe(200);
    const plain = await post('/api/account/password', second, { current: await ph('password2'), next: 'password3' });
    expect(plain.status).toBe(400);
    expect((await app.request('/api/login', json({ username: 'aria_1', password: await ph('password1') }))).status).toBe(403);
  });

  it('a wrong current password is 403 (not 401) and counts as a failure', async () => {
    const { second } = await boundGuest();
    for (let i = 0; i < 5; i++) {
      expect((await post('/api/account/password', second, { current: await ph('nope-nope'), next: await ph('password2') })).status).toBe(403);
    }
    expect((await post('/api/account/password', second, { current: await ph('password1'), next: await ph('password2') })).status).toBe(429);
    expect((await get('/api/save', second)).status).toBe(200);
  });

  it('refuses password change and logout for guests', async () => {
    const { body: g } = await guest();
    const pw = await post('/api/account/password', g.token, { current: await ph('password1'), next: await ph('password2') });
    expect(pw.status).toBe(409);
    expect(await pw.json()).toEqual({ error: 'not_bound' });
    const out = await post('/api/logout', g.token);
    expect(out.status).toBe(409);
    expect(await out.json()).toEqual({ error: 'not_bound' });
    expect((await get('/api/save', g.token)).status).toBe(200);
  });

  it('logs out this device, or all the others', async () => {
    const { g, second } = await boundGuest();
    const others = await post('/api/account/logout-others', second);
    expect(await others.json()).toEqual({ sessions: 1 });
    expect((await get('/api/save', g.token)).status).toBe(401);
    expect((await post('/api/logout', second)).status).toBe(200);
    expect((await get('/api/save', second)).status).toBe(401);
  });
});

describe('rare discoveries', () => {
  const rolling = (value: number) => ({ next: () => value, int: (min: number) => min });
  const rareApp = (value: number) =>
    createApp({ store, now: () => clock, rng: () => rolling(value), content, pepper: 'test-pepper' });

  /** A player who knows inferno and holds high-grade fire, in both the save and its anchor. */
  async function rarePlayer(name: string, grades = [3, 4, 5]) {
    const { body } = await guest(name);
    const inventory: Record<string, number> = {};
    for (const g of grades) inventory[`el:fire:${g}`] = 5;
    const seeded: GameState = { ...body.state, learned: [...body.state.learned, 'inferno'], inventory };
    const row = store.saves.get(body.playerId)!;
    store.saves.set(body.playerId, { ...row, state: JSON.stringify(seeded), anchorState: JSON.stringify(seeded) });
    return { ...body, state: seeded };
  }
  const roll = async (p: { token: string; state: GameState }, value: number, revision = 0) => {
    const res = await rareApp(value).request(
      '/api/synthesize',
      json({ inputs: ['inferno', 'el:fire:3'], state: p.state, baseRevision: revision }, p.token),
    );
    return { status: res.status, out: (await res.json()) as ActionOut & { result: { rare?: unknown; crafted?: boolean } } };
  };
  const feed = async (token: string, query = '') => {
    const res = await app.request(`/api/discoveries${query}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: res.status, body: (await res.json()) as { discoveries: Record<string, unknown>[] } };
  };

  it('records the rare roll, first for the first player only, and serves the feed newest first', async () => {
    const a = await rarePlayer('Ann');
    const b = await rarePlayer('Bob');
    const ra = await roll(a, 0.001);
    expect(ra.status).toBe(200);
    expect(ra.out.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: true } });
    clock += 1000;
    const rb = await roll(b, 0.001);
    expect(rb.out.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: false } });
    const { status, body } = await feed(a.token);
    expect(status).toBe(200);
    expect(body.discoveries.map((d) => d.first)).toEqual([false, true]);
    expect(body.discoveries.map((d) => d.displayName)).toEqual(['Bob', 'Ann']);
    for (const d of body.discoveries) expect(Object.keys(d).sort()).toEqual(['at', 'displayName', 'first', 'id', 'spellId']);
    const afterFirst = await feed(a.token, `?after=${body.discoveries[1]!.id}`);
    expect(afterFirst.body.discoveries.map((d) => d.displayName)).toEqual(['Bob']);
  });

  it('a missed roll learns the crafted spell with no rare field and no discovery', async () => {
    const a = await rarePlayer('Ann');
    const r = await roll(a, 0.99);
    expect(r.status).toBe(200);
    expect(r.out.result.kind).toBe('learned');
    expect(r.out.result.crafted).toBe(true);
    expect('rare' in r.out.result).toBe(false);
    expect(store.discoveryLog).toEqual([]);
  });

  it('a second missed roll is a duplicate that still spends the 高階 element', async () => {
    const a = await rarePlayer('Ann', [3]);
    const r1 = await roll(a, 0.99);
    expect(r1.status).toBe(200);
    expect(saved(a.playerId).inventory['el:fire:3']).toBe(4);
    const r2 = await roll({ token: a.token, state: r1.out.state }, 0.99, r1.out.revision);
    expect(r2.status).toBe(200);
    expect(r2.out.result).toMatchObject({ kind: 'duplicate', refunded: [] });
    expect(r2.out.state.inventory['el:fire:3']).toBe(3);
    expect(saved(a.playerId).inventory['el:fire:3']).toBe(3);
  });

  it('a committed rare learn survives a failing discovery write', async () => {
    const a = await rarePlayer('Ann');
    store.recordDiscovery = async () => { throw new Error('db down'); };
    const r = await roll(a, 0.001);
    expect(r.status).toBe(200);
    expect(r.out.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: false } });
    expect(saved(a.playerId).learned).toContain('worldfire');
  });

  it('a rejected action writes no discovery', async () => {
    const a = await rarePlayer('Ann', [1]);
    const seeded = { ...a.state, inventory: {} };
    const r = await roll({ token: a.token, state: seeded }, 0.001);
    expect(r.status).toBe(422);
    expect(store.discoveryLog).toEqual([]);
  });

  it('a conflict writes no discovery', async () => {
    const a = await rarePlayer('Ann');
    const r = await roll(a, 0.001, 7);
    expect(r.status).toBe(409);
    expect(store.discoveryLog).toEqual([]);
  });

  it('a suspicious player learns the spell but is not recorded', async () => {
    const a = await rarePlayer('Ann');
    await store.markSuspicious(a.playerId);
    const r = await roll(a, 0.001);
    expect(r.status).toBe(200);
    expect(r.out.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: false } });
    expect(saved(a.playerId).learned).toContain('worldfire');
    expect(store.discoveryLog).toEqual([]);
  });

  it('a GM-used player learns the spell but is not recorded', async () => {
    const a = await rarePlayer('Ann');
    await store.markGmUsed(a.playerId);
    const r = await roll(a, 0.001);
    expect(r.status).toBe(200);
    expect(r.out.result).toEqual({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: false } });
    expect(saved(a.playerId).learned).toContain('worldfire');
    expect(store.discoveryLog).toEqual([]);
  });

  it('GET /api/discoveries needs a session and a valid after', async () => {
    expect((await app.request('/api/discoveries')).status).toBe(401);
    const a = await rarePlayer('Ann');
    expect((await feed(a.token, '?after=abc')).status).toBe(400);
    expect((await feed(a.token, '?after=-1')).status).toBe(400);
    expect((await feed(a.token, '?after=1.5')).status).toBe(400);
    expect((await feed(a.token)).body).toEqual({ discoveries: [] });
  });

  it('limits the feed to FEED_LIMIT rows', async () => {
    const a = await guest('Ann');
    for (let i = 0; i < FEED_LIMIT + 5; i++) await store.recordDiscovery({ spellId: 'worldfire', playerId: a.body.playerId, displayName: 'Ann', at: i });
    expect((await feed(a.body.token)).body.discoveries).toHaveLength(FEED_LIMIT);
  });
});

describe('GM login and tokens', () => {
  const gmApp = (gmUsernames?: string) =>
    createApp({ store, now: () => clock, rng: () => createRng(1), content, pepper: 'test-pepper', gmUsernames });
  const req = (a: ReturnType<typeof createApp>, path: string, body: unknown, token?: string, gmToken?: string) =>
    a.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(gmToken ? { 'x-gm-token': gmToken } : {}),
      },
      body: JSON.stringify(body),
    });
  /** A guest bound to `username` with password 'password1'. */
  async function bound(username: string) {
    const { body: g } = await guest(username);
    const res = await app.request('/api/account/bind', json({ username, password: await ph('password1') }, g.token));
    expect(res.status).toBe(200);
    return g;
  }
  const PROBE = '/api/gm/__probe'; // passes the guard, then no route: 404
  const login = async (a: ReturnType<typeof createApp>, token: string | undefined, username: string, pw = 'password1') =>
    req(a, '/api/gm/login', { username, password: await ph(pw) }, token);
  const gmTokenOf = async (res: Response) => ((await res.json()) as { gmToken: string }).gmToken;

  it('every GM path is 404 when GM_USERNAMES is unset or blank, even without a session', async () => {
    const g = await bound('gm_one');
    for (const a of [gmApp(), gmApp(''), gmApp(' , ')]) {
      expect((await login(a, undefined, 'gm_one')).status).toBe(404);
      expect((await login(a, g.token, 'gm_one')).status).toBe(404);
      expect((await req(a, '/api/gm/inventory', {})).status).toBe(404);
      expect((await req(a, '/api/gm/inventory', {}, g.token)).status).toBe(404);
    }
    expect(store.gmTokens.size).toBe(0);
  });

  it('with GM_USERNAMES set, a missing session is 401', async () => {
    const a = gmApp('gm_one');
    expect((await login(a, undefined, 'gm_one')).status).toBe(401);
    expect((await req(a, '/api/gm/inventory', {})).status).toBe(401);
  });

  it('a non-GM account with the right password gets the same 403 as a wrong password', async () => {
    const a = gmApp('gm_one');
    const p = await bound('plain_1');
    const res = await login(a, p.token, 'plain_1');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    expect(store.gmTokens.size).toBe(0);
    expect(store.gmActions).toEqual([]);
  });

  it('a wrong GM password is 403 and counts toward the login limits', async () => {
    const a = gmApp('gm_one');
    const g = await bound('gm_one');
    for (let i = 0; i < 5; i++) {
      const res = await login(a, g.token, 'gm_one', 'nope-nope');
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    }
    expect((await login(a, g.token, 'gm_one')).status).toBe(429);
    expect((await app.request('/api/login', json({ username: 'gm_one', password: await ph('password1') }))).status).toBe(429);
  });

  it('a non-GM or wrong-session attempt also counts toward the login limits', async () => {
    const a = gmApp('gm_one');
    const p = await bound('plain_1');
    for (let i = 0; i < 5; i++) expect((await login(a, p.token, 'plain_1')).status).toBe(403);
    expect((await login(a, p.token, 'plain_1')).status).toBe(429);
  });

  it('a GM account logged in from another player session is 403', async () => {
    const a = gmApp('gm_one');
    await bound('gm_one');
    const other = await bound('plain_1');
    const res = await login(a, other.token, 'gm_one');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invalid_credentials' });
    expect(store.gmTokens.size).toBe(0);
  });

  it('logs in a GM (name compared like logins), storing only the token hash and a login action', async () => {
    const a = gmApp(' Other , ＧＭ_One ');
    const g = await bound('gm_one');
    const res = await login(a, g.token, 'GM_ONE');
    expect(res.status).toBe(200);
    const out = (await res.json()) as { gmToken: string; expiresAt: number };
    expect(out.expiresAt).toBe(clock + GM_TOKEN_TTL_MS);
    expect(GM_TOKEN_TTL_MS).toBe(30 * 60_000);
    expect(out.gmToken.length).toBeGreaterThanOrEqual(43);
    expect([...store.gmTokens.keys()]).toEqual([await hashToken(out.gmToken)]);
    expect(store.gmActions).toEqual([{ gmPlayerId: g.playerId, at: clock, action: 'login', target: null, detail: null }]);
    expect(store.players.get(g.playerId)?.gmUsed).toBe(false);
  });

  it('guarded GM paths need a valid X-GM-Token for the session player', async () => {
    const a = gmApp('gm_one,gm_two');
    const g = await bound('gm_one');
    const g2 = await bound('gm_two');
    const gmToken = await gmTokenOf(await login(a, g.token, 'gm_one'));
    const expired = async (res: Response) => {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'gm_expired' });
    };
    await expired(await req(a, PROBE, {}, g.token));
    await expired(await req(a, PROBE, {}, g.token, 'wrong-token'));
    await expired(await req(a, PROBE, {}, g2.token, gmToken)); // another player's session
    expect((await req(a, PROBE, {}, g.token, gmToken)).status).toBe(404);
    expect((await req(a, PROBE, {}, undefined, gmToken)).status).toBe(401);
  });

  it('a GM token expires after 30 minutes without touching the session', async () => {
    const a = gmApp('gm_one');
    const g = await bound('gm_one');
    const gmToken = await gmTokenOf(await login(a, g.token, 'gm_one'));
    clock += GM_TOKEN_TTL_MS - 1;
    expect((await req(a, PROBE, {}, g.token, gmToken)).status).toBe(404);
    clock += 2;
    const res = await req(a, PROBE, {}, g.token, gmToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'gm_expired' });
    expect((await a.request('/api/save', { headers: { authorization: `Bearer ${g.token}` } })).status).toBe(200);
  });

  it('changing the password or logging out revokes GM tokens', async () => {
    const a = gmApp('gm_one');
    const g = await bound('gm_one');
    const t1 = await gmTokenOf(await login(a, g.token, 'gm_one'));
    const pw = await req(a, '/api/account/password', { current: await ph('password1'), next: await ph('password2') }, g.token);
    expect(pw.status).toBe(200);
    expect((await req(a, PROBE, {}, g.token, t1)).status).toBe(403);
    const t2 = await gmTokenOf(await login(a, g.token, 'gm_one', 'password2'));
    expect((await req(a, PROBE, {}, g.token, t2)).status).toBe(404);
    const lr = await a.request('/api/login', json({ username: 'gm_one', password: await ph('password2') }));
    const second = ((await lr.json()) as { token: string }).token;
    expect((await req(a, '/api/logout', {}, g.token)).status).toBe(200);
    expect((await req(a, PROBE, {}, second, t2)).status).toBe(403);
  });

  it('removing a GM from GM_USERNAMES revokes their GM token at once', async () => {
    const g = await bound('gm_one');
    const gmToken = await gmTokenOf(await login(gmApp('gm_one'), g.token, 'gm_one'));
    expect((await req(gmApp('gm_one'), PROBE, {}, g.token, gmToken)).status).toBe(404);
    const res = await req(gmApp('someone_else'), PROBE, {}, g.token, gmToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'gm_expired' });
  });

  it('logging out other devices revokes GM tokens', async () => {
    const a = gmApp('gm_one');
    const g = await bound('gm_one');
    const gmToken = await gmTokenOf(await login(a, g.token, 'gm_one'));
    expect((await req(a, '/api/account/logout-others', {}, g.token)).status).toBe(200);
    expect((await req(a, PROBE, {}, g.token, gmToken)).status).toBe(403);
    expect(store.gmTokens.size).toBe(0);
  });

  describe('GM save edits', () => {
    let a: ReturnType<typeof createApp>;
    let g: Awaited<ReturnType<typeof bound>>;
    let gmToken: string;
    beforeEach(async () => {
      a = gmApp('gm_one');
      g = await bound('gm_one');
      gmToken = await gmTokenOf(await login(a, g.token, 'gm_one'));
      store.gmActions.length = 0;
    });
    const gm = async (path: string, body: Record<string, unknown>, token = gmToken) => {
      const res = await req(a, path, body, g.token, token);
      return { status: res.status, out: (await res.json()) as ActionOut & { error?: string } };
    };

    it('sets inventory counts, marks gmUsed, logs the action and resets the anchor', async () => {
      expect(GM_ITEM_MAX).toBe(999_999);
      clock += 5000;
      const { status, out } = await gm('/api/gm/inventory', { state: g.state, baseRevision: 0, items: { 'el:fire:3': 50, 'key:storm_heart': 1 } });
      expect(status).toBe(200);
      expect(out.result).toEqual({ kind: 'gm' });
      expect(out.revision).toBe(1);
      expect(out.state.inventory).toEqual({ 'el:fire:3': 50, 'key:storm_heart': 1 });
      expect(saved(g.playerId).inventory).toEqual({ 'el:fire:3': 50, 'key:storm_heart': 1 });
      expect(store.players.get(g.playerId)?.gmUsed).toBe(true);
      expect(store.gmActions).toEqual([
        { gmPlayerId: g.playerId, at: clock, action: 'inventory', target: null, detail: JSON.stringify({ 'el:fire:3': 50, 'key:storm_heart': 1 }) },
      ]);
      const row = store.saves.get(g.playerId)!;
      expect(row.anchorAt).toBe(clock);
      expect(JSON.parse(row.anchorState)).toEqual(out.state);
    });

    it('a 0 count removes the item', async () => {
      const first = await gm('/api/gm/inventory', { state: g.state, baseRevision: 0, items: { 'mat:ember_core': 7, 'el:wind:1': 3 } });
      expect(first.status).toBe(200);
      const { status, out } = await gm('/api/gm/inventory', { state: first.out.state, baseRevision: 1, items: { 'mat:ember_core': 0 } });
      expect(status).toBe(200);
      expect(out.state.inventory).toEqual({ 'el:wind:1': 3 });
    });

    it('a later upload builds on the GM-edited state without audit rejections', async () => {
      const { out } = await gm('/api/gm/inventory', { state: g.state, baseRevision: 0, items: { 'el:fire:3': 50, 'key:storm_heart': 1 } });
      clock += 30_000;
      const next: GameState = {
        ...out.state,
        inventory: { ...out.state.inventory, 'el:wind:1': 2, 'el:water:1': 1 },
        zoneKills: { [out.state.currentZone]: 3 },
      };
      const res = await a.request('/api/save', json({ state: next, baseRevision: 1 }, g.token, 'PUT'));
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
      expect(store.rejections).toHaveLength(0);
    });

    it('keeps legal unsynced drops from the request state and applies the GM change on top', async () => {
      clock += 30_000;
      const client: GameState = { ...g.state, inventory: { 'el:wind:1': 2 }, zoneKills: { [g.state.currentZone]: 3 } };
      const { status, out } = await gm('/api/gm/inventory', { state: client, baseRevision: 0, items: { 'el:fire:3': 50 } });
      expect(status).toBe(200);
      expect(out.state.inventory).toEqual({ 'el:wind:1': 2, 'el:fire:3': 50 });
      expect(out.state.zoneKills).toEqual({ [g.state.currentZone]: 3 });
    });

    it('rejects unknown ids and bad counts with 400 and writes nothing', async () => {
      const bad: unknown[] = [
        { 'el:fire:9': 1 },
        { 'mat:nope': 1 },
        { 'key:nope': 1 },
        { foo: 1 },
        { 'el:fire:1': -1 },
        { 'el:fire:1': 1.5 },
        { 'el:fire:1': GM_ITEM_MAX + 1 },
        { 'el:fire:1': '5' },
        [],
        null,
        'x',
      ];
      for (const items of bad) {
        const { status } = await gm('/api/gm/inventory', { state: g.state, baseRevision: 0, items });
        expect(status, JSON.stringify(items)).toBe(400);
      }
      expect(store.saves.get(g.playerId)!.revision).toBe(0);
      expect(store.gmActions).toEqual([]);
      expect(store.players.get(g.playerId)?.gmUsed).toBe(false);
      expect((await gm('/api/gm/inventory', { state: g.state, baseRevision: 0, items: { 'el:fire:1': GM_ITEM_MAX } })).status).toBe(200);
      expect(store.gmActions).toHaveLength(1);
    });

    it('a revision conflict is 409 and does not write or mark gmUsed', async () => {
      const { status } = await gm('/api/gm/inventory', { state: g.state, baseRevision: 5, items: { 'el:fire:1': 1 } });
      expect(status).toBe(409);
      expect(store.saves.get(g.playerId)!.revision).toBe(0);
      expect(store.players.get(g.playerId)?.gmUsed).toBe(false);
      expect(store.gmActions).toEqual([]);
      const z = await gm('/api/gm/zones', { state: g.state, baseRevision: 5, op: 'unlock_all' });
      expect(z.status).toBe(409);
      expect(store.players.get(g.playerId)?.gmUsed).toBe(false);
    });

    it('unlock_all opens every zone', async () => {
      const { status, out } = await gm('/api/gm/zones', { state: g.state, baseRevision: 0, op: 'unlock_all' });
      expect(status).toBe(200);
      expect(out.result).toEqual({ kind: 'gm' });
      expect(out.state.unlockedZones).toEqual(content.zones.map((z) => z.id));
      expect(saved(g.playerId).unlockedZones).toEqual(content.zones.map((z) => z.id));
      expect(store.players.get(g.playerId)?.gmUsed).toBe(true);
      expect(store.gmActions).toEqual([{ gmPlayerId: g.playerId, at: clock, action: 'unlock_zones', target: null, detail: null }]);
      // and moving to a newly opened zone uploads fine
      clock += 30_000;
      const moved = { ...out.state, currentZone: content.zones[2]!.id };
      expect((await a.request('/api/save', json({ state: moved, baseRevision: 1 }, g.token, 'PUT'))).status).toBe(200);
    });

    it('reveal_all lifts every fog region', async () => {
      const { status, out } = await gm('/api/gm/zones', { state: g.state, baseRevision: 0, op: 'reveal_all' });
      expect(status).toBe(200);
      const hidden = content.regions.filter((r) => !r.initiallyVisible).map((r) => r.id);
      expect(hidden.length).toBeGreaterThan(0);
      expect(out.state.revealed).toEqual(hidden);
      expect(saved(g.playerId).revealed).toEqual(hidden);
      expect(store.gmActions.map((x) => [x.action, x.detail])).toEqual([['reveal_all', null]]);
      clock += 30_000;
      expect((await a.request('/api/save', json({ state: out.state, baseRevision: 1 }, g.token, 'PUT'))).status).toBe(200);
    });

    it('boss_ready puts the current zone one kill short of its boss', async () => {
      const zone = content.zones[0]!;
      const { status, out } = await gm('/api/gm/zones', { state: g.state, baseRevision: 0, op: 'boss_ready' });
      expect(status).toBe(200);
      expect(out.state.zoneKills[zone.id]).toBe(zone.killsForBoss - 1);
      expect(saved(g.playerId).zoneKills[zone.id]).toBe(zone.killsForBoss - 1);
      expect(store.gmActions.map((x) => [x.action, x.detail])).toEqual([['boss_ready', null]]);
    });

    it('rejects an unknown zones op with 400', async () => {
      for (const op of ['nope', undefined, 1]) {
        expect((await gm('/api/gm/zones', { state: g.state, baseRevision: 0, op })).status).toBe(400);
      }
      expect(store.saves.get(g.playerId)!.revision).toBe(0);
    });

    it('without a GM token both edits are 403 gm_expired', async () => {
      for (const path of ['/api/gm/inventory', '/api/gm/zones']) {
        const res = await req(a, path, { state: g.state, baseRevision: 0, items: { 'el:fire:1': 1 }, op: 'unlock_all' }, g.token);
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: 'gm_expired' });
      }
      expect(store.saves.get(g.playerId)!.revision).toBe(0);
    });
  });

  it('excludedFromRecords covers suspicious and GM-used players', () => {
    const p = { id: 'p', displayName: 'x', createdAt: 0, suspicious: false, gmUsed: false };
    expect(excludedFromRecords(p)).toBe(false);
    expect(excludedFromRecords({ ...p, suspicious: true })).toBe(true);
    expect(excludedFromRecords({ ...p, gmUsed: true })).toBe(true);
  });
});
