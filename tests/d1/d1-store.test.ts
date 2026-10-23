import { describe, expect, it } from 'vitest';
import { describeStoreContract } from '../../worker/store-contract';
import { D1Store } from '../../worker/d1-store';
import { content } from '../../src/engine/content';
import { createInitialState, parseState, serialize } from '../../src/engine/persist';
import { applyMigrations, createD1, MIGRATIONS } from './d1-shim';

describeStoreContract('D1Store (sqlite)', async () => {
  const { d1, raw } = createD1();
  applyMigrations(raw);
  return new D1Store(d1);
});

describe('migration 0003', () => {
  it('keeps existing guests logged in and their saves intact', async () => {
    const { d1, raw } = createD1();
    const before = MIGRATIONS.filter((f) => f < '0003');
    applyMigrations(raw, before);
    raw.prepare('INSERT INTO players (id, display_name, token_hash, created_at, suspicious) VALUES (?, ?, ?, ?, 0)').run('p1', 'Old', 'h-old', 1234);
    raw.prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 3, 5000, ?, 5000)').run('p1', '{"v":1}', '{"v":1}');

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0003' && f < '0004'));

    const store = new D1Store(d1);
    // the store reads players.gm_used (added by 0006), so check the 0003 result with plain SQL
    expect(raw.prepare('SELECT s.last_seen_at, p.display_name, p.created_at FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?').get('h-old')).toEqual({
      last_seen_at: 1234,
      display_name: 'Old',
      created_at: 1234,
    });
    expect((await store.getSave('p1'))?.revision).toBe(3);
    const cols = raw.prepare("SELECT name FROM pragma_table_info('players')").all().map((r) => (r as { name: string }).name);
    expect(cols).not.toContain('token_hash');
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('migration 0004', () => {
  it('migration 0004 resets every save to the v2 initial state', async () => {
    const { d1, raw } = createD1();
    applyMigrations(raw, MIGRATIONS.filter((f) => f < '0004'));
    raw.prepare('INSERT INTO players (id, display_name, created_at, suspicious) VALUES (?, ?, ?, 0)').run('p1', 'Old', 1234);
    raw.prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run('h1', 'p1', 1234, 1234);
    const v1 = '{"version":1,"inventory":{"el:fire:1":3},"learned":["mana_bolt","fireball"],"equipped":"fireball"}';
    raw.prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 7, 5000, ?, 4000)').run('p1', v1, v1);

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0004'));

    const save = (await new D1Store(d1).getSave('p1'))!;
    expect(parseState(JSON.parse(save.state), content)).toEqual(createInitialState(content));
    // the literal in the migration is exactly what the server writes for a new player
    expect(save.state).toBe(serialize(createInitialState(content)));
    expect(save.anchorState).toBe(save.state);
    expect(save.anchorAt).toBe(5000);
    expect(save.revision).toBe(8);
    // accounts and sessions are kept
    expect((await new D1Store(d1).findPlayerBySession('h1'))?.player.id).toBe('p1');
  });
});

describe('migration 0005', () => {
  it('keeps existing saves and adds the discoveries table', async () => {
    const { d1, raw } = createD1();
    applyMigrations(raw, MIGRATIONS.filter((f) => f < '0005'));
    raw.prepare('INSERT INTO players (id, display_name, created_at, suspicious) VALUES (?, ?, ?, 0)').run('p1', 'Old', 1234);
    raw.prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 7, 5000, ?, 4000)').run('p1', '{"v":1}', '{"v":1}');

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0005'));

    const save = (await new D1Store(d1).getSave('p1'))!;
    expect(save.state).toBe('{"v":1}');
    expect(save.revision).toBe(7);
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'discoveries'").all()).toHaveLength(1);
  });
});

describe('migration 0006', () => {
  it('keeps saves and players, defaults gm_used to 0 and adds the GM tables', async () => {
    const { d1, raw } = createD1();
    applyMigrations(raw, MIGRATIONS.filter((f) => f < '0006'));
    raw.prepare('INSERT INTO players (id, display_name, created_at, suspicious) VALUES (?, ?, ?, 0)').run('p1', 'Old', 1234);
    raw.prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 7, 5000, ?, 4000)').run('p1', '{"v":1}', '{"v":1}');

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0006'));

    const store = new D1Store(d1);
    expect((await store.getSave('p1'))?.state).toBe('{"v":1}');
    expect((await store.getSave('p1'))?.revision).toBe(7);
    expect((await store.getPlayer('p1'))?.gmUsed).toBe(false);
    expect((raw.prepare('SELECT gm_used FROM players WHERE id = ?').get('p1') as { gm_used: number }).gm_used).toBe(0);
    for (const t of ['gm_tokens', 'gm_actions'])
      expect(raw.prepare('SELECT name FROM sqlite_master WHERE name = ?').all(t)).toHaveLength(1);
    await store.recordGmAction({ gmPlayerId: 'p1', at: 1, action: 'login', target: null, detail: null });
    expect((raw.prepare('SELECT COUNT(*) AS n FROM gm_actions').get() as { n: number }).n).toBe(1);
  });
});

describe('D1Store discoveries race', () => {
  it('inserts as non-first when a first already exists, leaving one first row', async () => {
    const { d1, raw } = createD1();
    applyMigrations(raw);
    const store = new D1Store(d1);
    await store.createPlayer({ id: 'p1', displayName: 'A', createdAt: 1, suspicious: false, gmUsed: false }, 'h1', '{}', 1);
    raw.prepare('INSERT INTO discoveries (spell_id, player_id, display_name, at, first) VALUES (?, ?, ?, ?, 1)').run('holy', 'p1', 'A', 5);
    expect(await store.recordDiscovery({ spellId: 'holy', playerId: 'p1', displayName: 'A', at: 6 })).toEqual({ first: false });
    const rows = raw.prepare('SELECT first FROM discoveries WHERE spell_id = ?').all('holy') as { first: number }[];
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.first === 1)).toHaveLength(1);
  });
});
