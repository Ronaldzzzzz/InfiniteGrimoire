import { describe, expect, it } from 'vitest';
import { EMPOWER_MAX, MAX_SPELL_LEVEL } from '../../src/engine/spells';
import { content } from '../../src/engine/content';
import { STOP_R, type ActiveFx, type Foe } from '../../src/engine/combat';
import { crowdClear, crowdDps, crowdStats, HOME_ZONE, inPull, soloBossDps, walkedTouch, ZONE_TIER } from './measure';

const opts = { seed: 20261021, ms: 10_000 };

describe('DPS measurement', () => {
  it('maps every tier to a home zone', () => {
    expect(Object.keys(HOME_ZONE)).toHaveLength(10);
    expect(HOME_ZONE[10]).toBe('worlds_end');
  });
  it('mana_bolt hurts the Mist Meadow boss, deterministically', () => {
    const a = soloBossDps('mana_bolt', 1, 'mist_meadow', opts);
    expect(a).toBeGreaterThan(0);
    expect(soloBossDps('mana_bolt', 1, 'mist_meadow', opts)).toBe(a);
  });
  it('level 50 is about EMPOWER_MAX times level 1', () => {
    const a = soloBossDps('mana_bolt', 1, 'mist_meadow', opts);
    const b = soloBossDps('mana_bolt', MAX_SPELL_LEVEL, 'mist_meadow', opts);
    expect(b / a).toBeGreaterThan(EMPOWER_MAX * 0.85);
    expect(b / a).toBeLessThan(EMPOWER_MAX * 1.15);
  });
  it('returns 0 when the spell cannot damage the foes', () => {
    expect(crowdDps('mana_bolt', 1, 'worlds_end', { seed: 1, ms: 5_000 })).toBe(0);
  });

  it('ZONE_TIER covers every zone', () => expect(Object.keys(ZONE_TIER).sort()).toEqual(content.zones.map((z) => z.id).sort()));
  it('a spell that cannot hurt leaves the zone full and every foe touches the line', () => {
    const s = crowdStats('mana_bolt', 'worlds_end', { seed: 1, ms: 40_000, warmMs: 30_000 });
    expect(s.alive).toBeGreaterThan(70);
    expect(s.touched).toBeGreaterThan(0);
  });
  it('crowdStats is deterministic per seed', () => {
    const o = { seed: 3, ms: 20_000, warmMs: 10_000 };
    expect(crowdStats('fireball', 'mist_meadow', o)).toEqual(crowdStats('fireball', 'mist_meadow', o));
  });
  it('crowdClear returns null when the spell cannot clear', () =>
    expect(crowdClear('mana_bolt', 'worlds_end', { seed: 1, limitMs: 5_000 })).toBeNull());

  describe('touches exclude foes dragged in by a pull (Ruling C3)', () => {
    const def = content.monsters.doom_knight!;
    const onRing: Foe = { uid: 1, defId: 'doom_knight', x: STOP_R + def.radius, y: 0, hp: 1, maxHp: 1, statuses: [], kx: 0, ky: 0, wander: 0 };
    const zoneFx = (pull: number): ActiveFx => ({
      uid: 9, spellId: 'test', elements: ['wind'], x: 0, y: 0, ageMs: 0, hits: [],
      effect: { kind: 'zone', mult: 0, radius: 0.2, ms: 3000, tickMs: 500, target: 'center', pull, follow: false, strikes: 0 },
    });
    it('a foe on the ring inside a pulling zone is not a touch, before or after the step', () => {
      expect(inPull([zoneFx(0.5)], onRing)).toBe(true);
      expect(walkedTouch(onRing, [zoneFx(0.5)], [])).toBe(false);
      expect(walkedTouch(onRing, [], [zoneFx(0.5)])).toBe(false);
    });
    it('the same foe with no pull (or a zone that does not pull) is a touch', () => {
      expect(walkedTouch(onRing, [], [])).toBe(true);
      expect(walkedTouch(onRing, [zoneFx(0)], [zoneFx(0)])).toBe(true);
    });
    it('a foe off the ring is never a touch', () =>
      expect(walkedTouch({ ...onRing, x: 0.9 }, [], [])).toBe(false));
    it('a pull spell no longer racks up a touch for every foe it drags in', () => {
      // sky_tempest at ember_wastes: field down to ~4 foes but ~308 "touches" before the fix (ledger T3-impossible)
      const s = crowdStats('sky_tempest', 'ember_wastes', { seed: 20261021, ms: 60_000, warmMs: 30_000 });
      expect(s.alive).toBeLessThan(15);
      expect(s.touched).toBeLessThan(20);
    });
  });
});
