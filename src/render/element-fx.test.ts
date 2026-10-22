import { describe, expect, it } from 'vitest';
import type { Effect } from '../engine/model';
import type { ElementId } from '../engine/types';
import { blendForSpell, MULTI_KILL_MIN, MULTI_KILL_WINDOW_MS, multiKillLabel, particleStyle, shakeFor } from './element-fx';
import { COLORS } from './palette';

const ELEMENTS: ElementId[] = ['fire', 'wind', 'thunder', 'earth', 'water'];

describe('particleStyle', () => {
  it('uses the palette colour of each element', () => {
    for (const el of ELEMENTS) expect(particleStyle(el).color).toBe(COLORS.element[el]);
  });

  it('gives each element its own shape', () => {
    expect(particleStyle('fire').shape).toBe('spark');
    expect(particleStyle('wind').shape).toBe('streak');
    expect(particleStyle('thunder').shape).toBe('bolt');
    expect(particleStyle('earth').shape).toBe('shard');
    expect(particleStyle('water').shape).toBe('drop');
    expect(new Set(ELEMENTS.map((e) => particleStyle(e).shape)).size).toBe(5);
  });

  it('fire sparks float up, earth shards and water drops fall', () => {
    expect(particleStyle('fire').vy).toBeLessThan(0);
    expect(particleStyle('earth').vy).toBeGreaterThan(0);
    expect(particleStyle('water').vy).toBeGreaterThan(0);
  });

  it('has sane size and life ranges', () => {
    for (const el of ELEMENTS) {
      const s = particleStyle(el);
      expect(s.size[0]).toBeGreaterThan(0);
      expect(s.size[1]).toBeGreaterThanOrEqual(s.size[0]);
      expect(s.lifeMs[0]).toBeGreaterThan(0);
      expect(s.lifeMs[1]).toBeGreaterThanOrEqual(s.lifeMs[0]);
    }
  });
});

describe('blendForSpell', () => {
  it('carries both colours and both shapes of a combo spell', () => {
    const b = blendForSpell(['fire', 'wind']);
    expect(b.primary).toBe(COLORS.element.fire);
    expect(b.secondary).toBe(COLORS.element.wind);
    expect(b.shapes).toEqual(['spark', 'streak']);
  });

  it('a single element has no secondary colour', () => {
    expect(blendForSpell(['water'])).toEqual({ primary: COLORS.element.water, secondary: null, shapes: ['drop'] });
  });

  it('an element-less spell uses the neutral colour', () => {
    expect(blendForSpell([])).toEqual({ primary: COLORS.element.none, secondary: null, shapes: ['spark'] });
  });

  it('keeps every shape of a three-element spell, without duplicates', () => {
    const b = blendForSpell(['fire', 'wind', 'thunder', 'fire']);
    expect(b.secondary).toBe(COLORS.element.wind);
    expect(b.shapes).toEqual(['spark', 'streak', 'bolt']);
  });
});

describe('multiKillLabel', () => {
  const now = 10_000;
  const times = (n: number, ago = 100) => Array.from({ length: n }, () => now - ago);

  it('needs at least six kills', () => {
    expect(MULTI_KILL_MIN).toBe(6);
    expect(multiKillLabel(times(5), now)).toBeNull();
    expect(multiKillLabel(times(6), now)).toEqual({ n: 6 });
    expect(multiKillLabel(times(11), now)).toEqual({ n: 11 });
  });

  it('only counts kills inside the last 0.8 s', () => {
    expect(MULTI_KILL_WINDOW_MS).toBe(800);
    expect(multiKillLabel([...times(5), now - 801], now)).toBeNull();
    expect(multiKillLabel([...times(5), now - MULTI_KILL_WINDOW_MS], now)).toBeNull();
    expect(multiKillLabel([...times(5), now - 799], now)).toEqual({ n: 6 });
    expect(multiKillLabel([...times(6), now - 2000, now - 5000], now)).toEqual({ n: 6 });
  });

  it('is null with no kills', () => {
    expect(multiKillLabel([], now)).toBeNull();
  });
});

describe('shakeFor', () => {
  const zone = (strikes: number): Effect => ({
    kind: 'zone', mult: 1, radius: 0.3, ms: 1000, tickMs: 250, target: 'densest', pull: 0.5, follow: true, strikes,
  });

  it('shakes for meteors, fields and striking zones', () => {
    expect(shakeFor({ kind: 'meteor', mult: 1, count: 1, radius: 0.3, delayMs: 800, lavaMs: 0, target: 'densest' })).toBeGreaterThan(0);
    expect(shakeFor({ kind: 'field', mult: 1, delayMs: 0 })).toBeGreaterThan(0);
    expect(shakeFor(zone(2))).toBeGreaterThan(0);
  });

  it('meteors shake hardest', () => {
    const meteor = shakeFor({ kind: 'meteor', mult: 1, count: 1, radius: 0.3, delayMs: 800, lavaMs: 0, target: 'densest' });
    expect(meteor).toBeGreaterThan(shakeFor({ kind: 'field', mult: 1, delayMs: 0 }));
    expect(meteor).toBeGreaterThan(shakeFor(zone(3)));
  });

  it('everything else does not shake', () => {
    expect(shakeFor(zone(0))).toBe(0);
    expect(shakeFor({ kind: 'bolt', mult: 1, count: 1, radius: 0.1, target: 'nearest' })).toBe(0);
    expect(shakeFor({ kind: 'ring', mult: 1, radius: 0.5, push: 0 })).toBe(0);
    expect(shakeFor({ kind: 'blades', mult: 1, count: 3, push: 0 })).toBe(0);
    expect(shakeFor({ kind: 'chain', mult: 1, hops: 3, range: 0.3, explode: 0 })).toBe(0);
    expect(shakeFor({ kind: 'storm', mult: 1, ms: 1000, tickMs: 100 })).toBe(0);
    expect(shakeFor({ kind: 'haste', factor: 2, ms: 1000 })).toBe(0);
    expect(shakeFor({ kind: 'backfire', chance: 0.1, stunMs: 500 })).toBe(0);
  });
});
