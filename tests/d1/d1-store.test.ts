import { describe, expect, it } from 'vitest';
import { describeStoreContract } from '../../worker/store-contract';
import { D1Store } from '../../worker/d1-store';
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

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0003'));

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
