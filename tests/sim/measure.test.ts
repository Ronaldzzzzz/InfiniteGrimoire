import { describe, expect, it } from 'vitest';
import { MAX_SPELL_LEVEL, TIER_STEP } from '../../src/engine/spells';
import { crowdDps, HOME_ZONE, soloBossDps } from './measure';

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
  it('level 50 is about TIER_STEP times level 1', () => {
    const a = soloBossDps('mana_bolt', 1, 'mist_meadow', opts);
    const b = soloBossDps('mana_bolt', MAX_SPELL_LEVEL, 'mist_meadow', opts);
    expect(b / a).toBeGreaterThan(TIER_STEP * 0.85);
    expect(b / a).toBeLessThan(TIER_STEP * 1.15);
  });
  it('returns 0 when the spell cannot damage the foes', () => {
    expect(crowdDps('mana_bolt', 1, 'worlds_end', { seed: 1, ms: 5_000 })).toBe(0);
  });
});
