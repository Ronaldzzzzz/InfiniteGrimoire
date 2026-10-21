import { beforeEach, describe, expect, it } from 'vitest';
import { createBattle, stepBattle, STEP_MS, type BattleState } from '../src/engine/battle';
import { gameData } from '../src/engine/data';
import { createRng } from '../src/engine/rng';
import { createInitialState, type GameState } from '../src/engine/state';
import { ELEMENT_ORDER } from '../src/engine/types';
import { elementEquivalent } from '../src/engine/inventory';
import { GAIN_SLACK, GAIN_TOLERANCE, maxGain } from '../src/engine/validate';
import { ANCHOR_ADVANCE_MS, createApp, MAX_BODY_BYTES, MAX_WINDOW_MS, SUSPICIOUS_REJECTIONS_24H } from './app';
import { MemoryStore, type SaveRow } from './store';

let store: MemoryStore;
let clock: number;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = new MemoryStore();
  clock = 1_000_000;
  app = createApp({ store, now: () => clock, rng: () => createRng(1), data: gameData });
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

const withInv = (inventory: Record<string, number>): GameState => ({ ...createInitialState(gameData), inventory });

describe('createApp', () => {
  it('GET /api/health returns { ok: true }', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/guest', () => {
  it('creates player and returns initial state', async () => {
    const { res, body } = await guest('  Mage  ');
    expect(res.status).toBe(201);
    expect(body.revision).toBe(0);
    expect(body.state).toEqual(createInitialState(gameData));
    expect(body.token.length).toBeGreaterThanOrEqual(43);
    expect(store.players.get(body.playerId)?.displayName).toBe('Mage');
    expect(store.players.get(body.playerId)?.tokenHash).not.toBe(body.token);
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
    expect((await app.request('/api/synthesize', json({}))).status).toBe(401);
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
    expect(JSON.parse(store.saves.get(body.playerId)!.state)).toEqual(body.state);
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
    const res = await app.request('/api/synthesize', json({ state: thunder2(), baseRevision: 0, inputs }, body.token));
    expect(res.status).toBe(200);
    const out = (await res.json()) as { result: { kind: string }; state: GameState; revision: number };
    expect(out.result.kind).toBe('learned');
    expect(out.state.learned).toContain('thunder_bolt');
    expect(out.revision).toBe(1);
    expect(store.synthEvents).toEqual([
      { playerId: body.playerId, at: clock, combo: 'el:thunder:1+el:thunder:1', result: 'learned:thunder_bolt' },
    ]);
    expect(JSON.parse(store.saves.get(body.playerId)!.state).learned).toContain('thunder_bolt');
  });

  it('ignores client-claimed learned spells', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    const claimed = { ...thunder2(), learned: [...createInitialState(gameData).learned, 'lightning'] };
    const res = await app.request('/api/synthesize', json({ state: claimed, baseRevision: 0, inputs }, body.token));
    expect(res.status).toBe(422);
    const out = (await res.json()) as { reasons: string[] };
    expect(out.reasons).toContain('learned spells changed');
    expect(store.synthEvents).toHaveLength(0);
  });

  it('engine rejection is 200 and consumes nothing', async () => {
    const { body } = await guest();
    clock += 3_600_000;
    const res = await app.request(
      '/api/synthesize',
      json({ state: thunder2(), baseRevision: 0, inputs: ['el:thunder:1'] }, body.token),
    );
    expect(res.status).toBe(200);
    const out = (await res.json()) as { result: unknown; state: GameState };
    expect(out.result).toEqual({ kind: 'rejected', reason: 'slots' });
    expect(out.state.inventory).toEqual({ 'el:thunder:1': 2 });
  });

  it('inputs that are not item ids return 400 and commit nothing', async () => {
    const { body } = await guest();
    clock += 30_000;
    for (const bad of [['constructor', 'constructor'], ['el:thunder:1', '__proto__'], ['el:dark:1', 'el:thunder:1']]) {
      const res = await app.request('/api/synthesize', json({ state: thunder2(), baseRevision: 0, inputs: bad }, body.token));
      expect(res.status, bad.join('+')).toBe(400);
    }
    expect(store.saves.get(body.playerId)?.revision).toBe(0);
    expect(store.synthEvents).toHaveLength(0);
  });

  it('a synthesis result that fails parseState is a 500 and is not committed', async () => {
    // a recipe whose outcome is not a known spell cannot come from real data; it stands in for any engine bug
    const broken = {
      ...gameData,
      recipes: [...gameData.recipes, { id: 'ghost', inputs: ['mat:slime_gel', 'mat:slime_gel'], outcomes: [{ spellId: 'ghost', weight: 1 }] }],
    };
    app = createApp({ store, now: () => clock, rng: () => createRng(1), data: broken });
    const { body } = await guest();
    clock += 30_000;
    const res = await app.request(
      '/api/synthesize',
      json({ state: withInv({ 'mat:slime_gel': 2 }), baseRevision: 0, inputs: ['mat:slime_gel', 'mat:slime_gel'] }, body.token),
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
    app = createApp({ store, now: () => clock, rng: () => createRng(1), data: gameData });
    const { body } = await guest();
    clock += 3_600_000;
    const send = () => app.request('/api/synthesize', json({ state: thunder2(), baseRevision: 0, inputs }, body.token));
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const lost = (await loser.json()) as { reason: string; state: GameState; revision: number };
    expect(lost.reason).toBe('conflict');
    expect(lost.revision).toBe(1);
    const saved = JSON.parse(store.saves.get(body.playerId)!.state) as GameState;
    expect(saved.inventory['el:thunder:1'] ?? 0).toBe(0);
    expect(store.saves.get(body.playerId)?.revision).toBe(1);
    expect(store.synthEvents).toHaveLength(1);
  });
});

describe('MemoryStore.commitSave', () => {
  const player = { id: 'p', displayName: 'x', tokenHash: 'h', createdAt: 0, suspicious: false };
  it('stale baseRevision returns false and leaves the save unchanged', async () => {
    const s = new MemoryStore();
    await s.createPlayer(player, 'A', 0);
    expect(await s.commitSave('p', 0, 'B', 10, null)).toBe(true);
    expect(await s.commitSave('p', 0, 'C', 20, { state: 'C', at: 20 })).toBe(false);
    expect(await s.getSave('p')).toMatchObject({
      state: 'B', revision: 1, savedAt: 10, prevState: 'A', prevSavedAt: 0, anchorState: 'A', anchorAt: 0,
    });
  });
  it('writes the anchor only when given one, in the same commit', async () => {
    const s = new MemoryStore();
    await s.createPlayer(player, 'A', 0);
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
    const res = await app.request(
      '/api/save',
      json({ state: withInv({ 'el:fire:1': 500 }), baseRevision: 0 }, body.token, 'PUT'),
    );
    expect(res.status).toBe(422);
  });
  it('synthesize is capped by the same window', async () => {
    const { body } = await guest();
    clock += 8 * 3_600_000;
    const res = await app.request(
      '/api/synthesize',
      json({ state: withInv({ 'el:fire:1': 500, 'el:thunder:1': 2 }), baseRevision: 0, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token),
    );
    expect(res.status).toBe(422);
    expect(store.synthEvents).toHaveLength(0);
  });
});

describe('anchor window', () => {
  /** The honest bound for `ms` of play from the initial state, per element. */
  const honestLimit = (ms: number) => {
    const b = maxGain(createInitialState(gameData), ms, gameData);
    return Object.fromEntries(ELEMENT_ORDER.map((e) => [e, b.elements[e] * GAIN_TOLERANCE + GAIN_SLACK]));
  };
  /** Adds the full per-upload 100 ms allowance (tolerance + slack) on top of `prev`. */
  const inflate = (prev: GameState): GameState => {
    const b = maxGain(prev, 100, gameData);
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
    const saved = JSON.parse(store.saves.get(body.playerId)!.state) as GameState;
    const limit = honestLimit(30_000);
    for (const e of ELEMENT_ORDER) expect(gainOf(saved, e), e).toBeLessThan(2 * limit[e]!);
  });

  it('high-frequency synthesize calls cannot accumulate per-call allowances either', async () => {
    const { body } = await guest();
    let accepted = body.state;
    let revision = 0;
    let rejected = 0;
    for (let i = 0; i < 300; i++) {
      clock += 100;
      const claim = inflate(accepted);
      // a one-slot synth is an engine rejection: 200, nothing consumed, but it commits the claim
      const res = await app.request('/api/synthesize', json({ state: claim, baseRevision: revision, inputs: ['el:fire:1'] }, body.token));
      const out = (await res.json()) as { revision: number; state: GameState };
      revision = out.revision;
      if (res.status === 200) accepted = out.state;
      else {
        rejected++;
        accepted = out.state;
      }
    }
    expect(rejected).toBeGreaterThan(0);
    const saved = JSON.parse(store.saves.get(body.playerId)!.state) as GameState;
    const limit = honestLimit(30_000);
    for (const e of ELEMENT_ORDER) expect(gainOf(saved, e), e).toBeLessThan(2 * limit[e]!);
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
    const res = await app.request(
      '/api/synthesize',
      json({ state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { kind: string } }).result.kind).toBe('learned');
    // and the next regular upload keeps the server-learned spell
    clock += 1000;
    const learned = JSON.parse(store.saves.get(body.playerId)!.state) as GameState;
    expect((await app.request('/api/save', json({ state: learned, baseRevision: 2 }, body.token, 'PUT'))).status).toBe(200);
  });

  it('restoring synthesis inputs inside one window is rejected: no free re-rolls', async () => {
    // The reviewer's probe: restore the two inputs, synthesize again, repeat. Every restore now counts
    // as gain against the anchor, so re-rolls are paid for by the window's farming allowance and the
    // restores are rejected once they exceed it (here: 100 cycles at 100 ms within ~20 s).
    const { body } = await guest();
    const inputs = ['el:thunder:1', 'el:thunder:1'];
    const two = { 'el:thunder:1': 2 };
    let revision = 0;
    const statuses: string[] = [];
    let paid = 0;
    const t0 = clock;
    for (let i = 0; i < 100; i++) {
      clock += 100;
      const current = JSON.parse(store.saves.get(body.playerId)!.state) as GameState;
      const restored = { ...current, inventory: two };
      const put = await app.request('/api/save', json({ state: restored, baseRevision: revision }, body.token, 'PUT'));
      revision = ((await put.json()) as { revision: number }).revision;
      statuses.push(`put${put.status}`);
      if (put.status !== 200) continue;
      clock += 100;
      const syn = await app.request('/api/synthesize', json({ state: restored, baseRevision: revision, inputs }, body.token));
      const out = (await syn.json()) as { revision: number; state: GameState; result?: { kind: string } };
      revision = out.revision;
      statuses.push(`syn${syn.status}:${out.result?.kind ?? ''}`);
      if (syn.status === 200) paid += 2 - (out.state.inventory['el:thunder:1'] ?? 0);
    }
    expect(statuses).toContain('put422');
    // every element spent by synthesis fits what the window could have produced
    const limit = maxGain(createInitialState(gameData), clock - t0, gameData).elements.thunder * GAIN_TOLERANCE + GAIN_SLACK;
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
    const syn = await app.request('/api/synthesize', json({ state: s1, baseRevision: 1, inputs: ['el:thunder:1', 'el:thunder:1'] }, body.token));
    expect(syn.status).toBe(200);
    const after = (await syn.json()) as { state: GameState; revision: number };
    expect(store.saves.get(body.playerId)!.anchorAt).toBe(clock - 31_000);
    const r = await playHonestly(body.token, after, { uploadEveryMs: 20_000, until: (_g, ms) => ms >= 60_000 });
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
    const boss = gameData.zones[0].bossId;
    const row = store.saves.get(body.playerId)!;
    const current: GameState = {
      ...body.state,
      defeatedBosses: [boss],
      unlockedZones: [gameData.zones[0].id, gameData.zones[1].id],
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
    const r = stepBattle(game, battle, gameData, rng);
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
    const firstBoss = gameData.zones[0].bossId;
    const r = await playHonestly(body.token, body, {
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
