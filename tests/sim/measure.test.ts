import { describe, expect, it } from 'vitest';
import { EMPOWER_MAX, MAX_SPELL_LEVEL } from '../../src/engine/spells';
import { content } from '../../src/engine/content';
import { crowdClear, crowdDps, crowdStats, HOME_ZONE, soloBossDps, ZONE_TIER } from './measure';

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
});
