import { describe, expect, it } from 'vitest';
import { OVERLEVEL_K, affinityMultiplier, canDamage, computeHit, overlevelEfficiency } from './combat-rules';
import { ELEMENT_ORDER, type MonsterDef, type SpellDef } from './types';

const spell = (o: Partial<SpellDef> = {}): SpellDef => ({
  id: 's', name: 's', nameEn: 's', elements: [], tier: 5, attack: 100, cooldownMs: 1000,
  pattern: 'bolt', prerequisites: [], hint: '', grimoire: { ring: 0, offset: 0 }, ...o,
});
const monster = (o: Partial<MonsterDef> = {}): MonsterDef => ({
  id: 'm', name: 'm', nameEn: 'm', element: 'fire', tier: 5, hp: 100, defense: 100,
  regenPerSec: 0, boss: false, drops: [], ...o,
});

describe('canDamage', () => {
  it('tier >= monster tier - 1 always damages', () => {
    expect(canDamage({ tier: 9, attack: 0 }, { tier: 10, defense: 1000 })).toBe(true);
  });
  it('otherwise needs attack >= defense * 0.7', () => {
    expect(canDamage({ tier: 8, attack: 10 }, { tier: 10, defense: 100 })).toBe(false);
    expect(canDamage({ tier: 8, attack: 70 }, { tier: 10, defense: 100 })).toBe(true);
    expect(canDamage({ tier: 8, attack: 69 }, { tier: 10, defense: 100 })).toBe(false);
  });
});

describe('overlevelEfficiency', () => {
  it('matches the formula', () => {
    expect(OVERLEVEL_K).toBe(0.5);
    expect(overlevelEfficiency(10, 10)).toBe(1);
    expect(overlevelEfficiency(11, 10)).toBe(1);
    expect(overlevelEfficiency(12, 10)).toBe(0.75);
    expect(overlevelEfficiency(13, 10)).toBe(0.625);
    expect(overlevelEfficiency(14, 10)).toBeCloseTo(0.5625, 10);
    const far = overlevelEfficiency(20, 1);
    expect(far).toBeGreaterThanOrEqual(0.5);
    expect(far).toBeLessThanOrEqual(0.5001);
  });
});

describe('affinityMultiplier', () => {
  it('counter cycle', () => {
    for (const [a, b] of [['water', 'fire'], ['fire', 'wind'], ['wind', 'earth'], ['earth', 'thunder'], ['thunder', 'water']] as const) {
      expect(affinityMultiplier([a], b)).toBe(1.1);
      expect(affinityMultiplier([b], a)).toBe(0.9);
    }
  });
  it('neutral and mixed', () => {
    expect(affinityMultiplier([], 'fire')).toBe(1);
    expect(affinityMultiplier(['fire'], 'fire')).toBe(1);
    expect(affinityMultiplier(['water', 'fire'], 'fire')).toBe(1.1);
  });
  it('always within [0.9, 1.1]', () => {
    for (const a of ELEMENT_ORDER) for (const b of ELEMENT_ORDER) for (const m of ELEMENT_ORDER) {
      const v = affinityMultiplier([a, b], m);
      expect(v).toBeGreaterThanOrEqual(0.9);
      expect(v).toBeLessThanOrEqual(1.1);
    }
  });
});

describe('computeHit', () => {
  it('is 0 when it cannot damage', () => {
    expect(computeHit(spell({ tier: 1, attack: 1 }), monster({ tier: 10, defense: 100 }), { frozen: false })).toBe(0);
  });
  it('is an integer >= 1 when it can damage', () => {
    const h = computeHit(spell({ tier: 9, attack: 1 }), monster({ tier: 10, defense: 100000 }), { frozen: false });
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(1);
  });
  it('applies defense formula', () => {
    expect(computeHit(spell({ attack: 100 }), monster({ defense: 100 }), { frozen: false })).toBe(50);
  });
  it('frozen deals more', () => {
    const s = spell(), m = monster();
    expect(computeHit(s, m, { frozen: true })).toBeGreaterThan(computeHit(s, m, { frozen: false }));
  });
});
