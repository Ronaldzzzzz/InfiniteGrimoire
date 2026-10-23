import { describe, expect, it } from 'vitest';
import type { CredentialsRow, PlayerRow, Store } from './store';

const DAY = 24 * 60 * 60 * 1000;
const player = (id: string): PlayerRow => ({ id, displayName: `name-${id}`, createdAt: 1000, suspicious: false });
const cred = (playerId: string, key: string): CredentialsRow => ({
  playerId,
  username: key.toUpperCase(),
  usernameKey: key,
  passwordHash: `hash-${playerId}`,
  createdAt: 2000,
  updatedAt: 2000,
});

/** Behaviour every Store must share (run against MemoryStore and against D1Store on real SQLite). */
export function describeStoreContract(name: string, make: () => Promise<Store>): void {
  describe(`${name} store contract`, () => {
    it('creates a player with its first session and save', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{"v":1}', 1000);
      expect(await s.getPlayer('p1')).toEqual(player('p1'));
      expect(await s.findPlayerBySession('h1')).toEqual({ player: player('p1'), lastSeenAt: 1000 });
      expect(await s.findPlayerBySession('nope')).toBeNull();
      expect((await s.getSave('p1'))?.state).toBe('{"v":1}');
    });

    it('manages several sessions per player', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{}', 1000);
      await s.createSession('h2', 'p1', 1500);
      await s.createSession('h3', 'p1', 1600);
      expect(await s.countSessions('p1')).toBe(3);
      await s.touchSession('h2', 9000);
      expect((await s.findPlayerBySession('h2'))?.lastSeenAt).toBe(9000);
      await s.deleteOtherSessions('p1', 'h2');
      expect(await s.countSessions('p1')).toBe(1);
      expect(await s.findPlayerBySession('h1')).toBeNull();
      await s.deleteSession('h2');
      expect(await s.countSessions('p1')).toBe(0);
    });

    it('binds credentials once per player and once per username key', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{}', 1000);
      await s.createPlayer(player('p2'), 'h2', '{}', 1000);
      expect(await s.createCredentials(cred('p1', 'mage'))).toBe('ok');
      expect(await s.createCredentials(cred('p2', 'mage'))).toBe('taken');
      expect(await s.createCredentials(cred('p1', 'other'))).toBe('already_bound');
      expect(await s.findCredentialsByKey('mage')).toEqual(cred('p1', 'mage'));
      expect(await s.findCredentialsByPlayer('p1')).toEqual(cred('p1', 'mage'));
      expect(await s.findCredentialsByPlayer('p2')).toBeNull();
      await s.updatePasswordHash('p1', 'new-hash', 3000);
      expect(await s.findCredentialsByKey('mage')).toMatchObject({ passwordHash: 'new-hash', updatedAt: 3000 });
    });

    it('counts login failures in a window and prunes day-old ones', async () => {
      const s = await make();
      await s.recordLoginFailure(['u:mage', 'ip:1.2.3.4'], 1000);
      await s.recordLoginFailure(['u:mage'], 2000);
      expect(await s.loginFailures('u:mage', 0)).toEqual({ count: 2, oldest: 1000 });
      expect(await s.loginFailures('u:mage', 1500)).toEqual({ count: 1, oldest: 2000 });
      expect(await s.loginFailures('ip:1.2.3.4', 0)).toEqual({ count: 1, oldest: 1000 });
      expect(await s.loginFailures('u:none', 0)).toEqual({ count: 0, oldest: null });
      await s.recordLoginFailure(['u:other'], 2000 + DAY + 1);
      expect(await s.loginFailures('u:mage', 0)).toEqual({ count: 0, oldest: null });
    });

    it('counts guest creations per ip in a window and prunes day-old ones', async () => {
      const s = await make();
      await s.recordGuestCreation('1.2.3.4', 1000);
      await s.recordGuestCreation('1.2.3.4', 2000);
      await s.recordGuestCreation('5.6.7.8', 2000);
      expect(await s.guestCreations('1.2.3.4', 0)).toEqual({ count: 2, oldest: 1000 });
      expect(await s.guestCreations('1.2.3.4', 1500)).toEqual({ count: 1, oldest: 2000 });
      await s.recordGuestCreation('9.9.9.9', 2000 + DAY + 1);
      expect(await s.guestCreations('1.2.3.4', 0)).toEqual({ count: 0, oldest: null });
    });

    it('records discoveries with a single first per spell and lists them newest first', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{}', 1000);
      await s.createPlayer(player('p2'), 'h2', '{}', 1000);
      const d = (spellId: string, playerId: string, at: number) => ({ spellId, playerId, displayName: `name-${playerId}`, at });
      expect(await s.recordDiscovery(d('holy', 'p1', 10))).toEqual({ first: true });
      expect(await s.recordDiscovery(d('holy', 'p2', 20))).toEqual({ first: false });
      expect(await s.recordDiscovery(d('abyss', 'p2', 30))).toEqual({ first: true });
      const all = await s.recentDiscoveries(null, 20);
      expect(all.map((r) => [r.spellId, r.displayName, r.at, r.first])).toEqual([
        ['abyss', 'name-p2', 30, true],
        ['holy', 'name-p2', 20, false],
        ['holy', 'name-p1', 10, true],
      ]);
      expect(all[0].id).toBeGreaterThan(all[1].id);
      expect(all[1].id).toBeGreaterThan(all[2].id);
      for (const r of all) expect(Object.keys(r).sort()).toEqual(['at', 'displayName', 'first', 'id', 'spellId']);
      expect((await s.recentDiscoveries(all[2].id, 20)).map((r) => r.id)).toEqual([all[0].id, all[1].id]);
      expect(await s.recentDiscoveries(all[0].id, 20)).toEqual([]);
      expect((await s.recentDiscoveries(null, 2)).map((r) => r.id)).toEqual([all[0].id, all[1].id]);
    });
  });
}
