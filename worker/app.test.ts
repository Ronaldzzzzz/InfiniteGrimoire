import { beforeEach, describe, expect, it } from 'vitest';
import { gameData } from '../src/engine/data';
import { createRng } from '../src/engine/rng';
import { createInitialState, type GameState } from '../src/engine/state';
import { createApp, MAX_BODY_BYTES, SUSPICIOUS_REJECTIONS_24H } from './app';
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
  it('GET save touches savedAt', async () => {
    const { body } = await guest();
    clock += 5000;
    const res = await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: body.state, revision: 0 });
    expect(store.saves.get(body.playerId)?.savedAt).toBe(clock);
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
  it('stale baseRevision returns false and leaves the save unchanged', async () => {
    const s = new MemoryStore();
    await s.createPlayer({ id: 'p', displayName: 'x', tokenHash: 'h', createdAt: 0, suspicious: false }, 'A', 0);
    expect(await s.commitSave('p', 0, 'B', 10)).toBe(true);
    expect(await s.commitSave('p', 0, 'C', 20)).toBe(false);
    expect(await s.getSave('p')).toMatchObject({ state: 'B', revision: 1, savedAt: 10, prevState: 'A', prevSavedAt: 0 });
  });
});

describe('elapsed cap', () => {
  it('caps credited time at MAX_ELAPSED_MS even after 8h without GET', async () => {
    const { body } = await guest();
    clock += 8 * 3_600_000;
    const res = await app.request(
      '/api/save',
      json({ state: withInv({ 'el:fire:1': 500 }), baseRevision: 0 }, body.token, 'PUT'),
    );
    expect(res.status).toBe(422);
  });
});
