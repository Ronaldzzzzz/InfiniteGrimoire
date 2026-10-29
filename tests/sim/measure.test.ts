import { describe, expect, it } from 'vitest';
import { EMPOWER_MAX, MAX_SPELL_LEVEL } from '../../src/engine/spells';
import { content } from '../../src/engine/content';
import { BOSS_LIMIT_MS } from '../../src/engine/stages';
import { bossKillTime, crowdDps, HOME_ZONE, medianOrNull, soloBossDps, stageTime, ZONE_TIER } from './measure';

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
  it('a stage the spell cannot hurt never finishes', () =>
    expect(stageTime('mana_bolt', 1, 'worlds_end', 1, { seed: 1, limitMs: 30_000 })).toBeNull());
  it('stageTime is deterministic per seed and finishes an easy stage', () => {
    const a = stageTime('fireball', 1, 'mist_meadow', 1, { seed: 3, limitMs: 600_000 });
    expect(a).not.toBeNull();
    expect(stageTime('fireball', 1, 'mist_meadow', 1, { seed: 3, limitMs: 600_000 })).toBe(a);
  });
  it('stageTime returns null when the limit is shorter than the stage', () =>
    expect(stageTime('fireball', 1, 'mist_meadow', 1, { seed: 3, limitMs: 5_000 })).toBeNull());
  it('bossKillTime times the boss from its arrival; an immune boss times out (null)', () => {
    const t = bossKillTime('thunder_hammer', 1, 'mist_meadow', { seed: 1, limitMs: 900_000 });
    expect(t).not.toBeNull();
    expect(t!).toBeLessThan(BOSS_LIMIT_MS);
    expect(bossKillTime('mana_bolt', 1, 'thunder_gorge', { seed: 1, limitMs: 900_000 })).toBeNull();
  });
  it('medianOrNull counts unfinished runs as the slowest', () => {
    expect(medianOrNull([1, 2, null])).toBe(2);
    expect(medianOrNull([1, null, null])).toBeNull();
    expect(medianOrNull([])).toBeNull();
  });
});
