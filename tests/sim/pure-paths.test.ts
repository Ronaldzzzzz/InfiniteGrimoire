import { describe, expect, it } from 'vitest';
import { ELEMENT_ORDER } from '../../src/engine/types';
import { gameData } from '../../src/engine/data';
import { canDamage } from '../../src/engine/combat-rules';
import { runBot } from './bot';

const THREE_HOURS = 3 * 60 * 60 * 1000;
const SEED = 20261021;
const spellsOf = (el: string) =>
  Object.values(gameData.spells).filter((s) => s.elements.length === 1 && s.elements[0] === el).map((s) => s.id);

const cache = new Map<string, ReturnType<typeof runBot>>();
const botFor = (el: (typeof ELEMENT_ORDER)[number]) => {
  if (!cache.has(el)) cache.set(el, runBot({ element: el, seed: SEED, maxSimMs: THREE_HOURS }));
  return cache.get(el)!;
};
const TIMEOUT = 180_000;

describe('pure element paths', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el} path clears all MVP zones within 3 simulated hours`, { timeout: TIMEOUT }, async () => {
      const r = await botFor(el);
      expect(r.clearedZones).toEqual(gameData.zones.map((z) => z.id));
      expect(r.simMs).toBeLessThanOrEqual(THREE_HOURS);
      expect(r.learned.every((id) => id === 'mana_bolt' || spellsOf(el).includes(id))).toBe(true);
      expect(r.learned).toContain('mana_bolt');
      // one PUT per 30 s of play plus the three synthesis calls
      expect(r.serverCalls).toBeGreaterThanOrEqual(Math.floor(r.simMs / 30_000) + 3);
      expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
    });
  }

  it('mana_bolt only cannot clear thunder_gorge', { timeout: TIMEOUT }, async () => {
    const gorge = gameData.zones.find((z) => z.id === 'thunder_gorge')!;
    for (const id of gorge.monsters) {
      expect(canDamage(gameData.spells.mana_bolt!, gameData.monsters[id]!), id).toBe(false);
    }
    const r = await runBot({ element: null, seed: SEED, maxSimMs: THREE_HOURS });
    expect(r.clearedZones).toEqual(['mist_meadow']);
    expect(r.learned).toEqual(['mana_bolt']);
    expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  });

  it('each pure path needs the third zone to take at least 20 simulated minutes', { timeout: TIMEOUT * ELEMENT_ORDER.length }, async () => {
    for (const el of ELEMENT_ORDER) {
      const r = await botFor(el);
      expect(r.lastZoneMs, el).not.toBeNull();
      expect(r.lastZoneMs!, el).toBeGreaterThanOrEqual(20 * 60 * 1000);
    }
  });
});
