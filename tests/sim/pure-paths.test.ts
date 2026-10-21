import { describe, expect, it } from 'vitest';
import { ELEMENT_ORDER } from '../../src/engine/types';
import { gameData } from '../../src/engine/data';
import { runBot } from './bot';

const THREE_HOURS = 3 * 60 * 60 * 1000;
const SEED = 20261021;
const spellsOf = (el: string) =>
  Object.values(gameData.spells).filter((s) => s.elements.length === 1 && s.elements[0] === el).map((s) => s.id);

describe('pure element paths', () => {
  const results = new Map<string, ReturnType<typeof runBot>>();
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el} path clears all MVP zones within 3 simulated hours`, { timeout: 60_000 }, () => {
      const r = runBot({ element: el, seed: SEED, maxSimMs: THREE_HOURS });
      results.set(el, r);
      expect(r.clearedZones).toEqual(gameData.zones.map((z) => z.id));
      expect(r.simMs).toBeLessThanOrEqual(THREE_HOURS);
      expect(r.learned.every((id) => id === 'mana_bolt' || spellsOf(el).includes(id))).toBe(true);
      expect(r.learned).toContain('mana_bolt');
      expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
    });
  }

  it('mana_bolt only cannot clear thunder_gorge', { timeout: 60_000 }, () => {
    const r = runBot({ element: null, seed: SEED, maxSimMs: THREE_HOURS });
    expect(r.clearedZones).toEqual(['mist_meadow']);
    expect(r.learned).toEqual(['mana_bolt']);
    expect(r.rejectedUploads).toBe(0);
  });

  it('each pure path needs the third zone to take at least 20 simulated minutes', { timeout: 60_000 }, () => {
    for (const el of ELEMENT_ORDER) {
      const r = runBot({ element: el, seed: SEED, maxSimMs: THREE_HOURS });
      expect(r.lastZoneMs, el).not.toBeNull();
      expect(r.lastZoneMs!, el).toBeGreaterThanOrEqual(20 * 60 * 1000);
    }
  });
});
