import { describe, expect, it } from 'vitest';
import { OVERLEVEL_K, affinityMultiplier, canDamage, computeDamage, overlevelEfficiency } from './combat-rules';
import type { Monster } from './model';
import { ELEMENT_ORDER } from './types';

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

describe('computeDamage', () => {
  const mon = (o: Partial<Monster> = {}): Monster => ({
    id: 'm', name: 'm', nameEn: 'm', element: 'fire', tier: 5, hp: 100, defense: 100,
    regenPerSec: 0, speed: 0, radius: 0.03, boss: false, drops: [], ...o,
  });
  const sp = { tier: 5, attack: 100, elements: [] };
  const plain = { frozen: false, wetThunder: false, bonusPct: 0 };
  it('is 0 when the spell cannot damage', () => {
    expect(computeDamage(1000, { tier: 1, attack: 1, elements: [] }, mon({ tier: 10, defense: 100 }), plain)).toBe(0);
  });
  it('applies defense, counters, frozen, wet thunder and bonus', () => {
    expect(computeDamage(200, sp, mon(), plain)).toBe(100);
    expect(computeDamage(200, { ...sp, elements: ['water'] }, mon(), plain)).toBe(110);
    expect(computeDamage(200, sp, mon(), { ...plain, frozen: true })).toBe(150);
    expect(computeDamage(200, sp, mon(), { ...plain, wetThunder: true })).toBe(200);
    expect(computeDamage(200, sp, mon(), { ...plain, bonusPct: 10 })).toBe(110);
    expect(computeDamage(200, sp, mon(), { frozen: true, wetThunder: true, bonusPct: 50 })).toBe(450);
  });
  it('is at least 1 when it can damage', () => {
    expect(computeDamage(0.01, sp, mon({ defense: 1e6 }), plain)).toBe(1);
  });
});
