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
    expect(await store.findPlayerBySession('h-old')).toEqual({
      player: { id: 'p1', displayName: 'Old', createdAt: 1234, suspicious: false },
      lastSeenAt: 1234,
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
