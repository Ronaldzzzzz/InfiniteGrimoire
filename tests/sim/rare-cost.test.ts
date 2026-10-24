import { describe, expect, it } from 'vitest';
import { ELEMENT_ORDER, gradeValue, type ElementId } from '../../src/engine/types';
import { runBot } from './bot';

const MINUTE = 60_000;
const FOUR_HOURS = 240 * MINUTE;
const SEED = 20261021;
/**
 * Spec 2.1 cost check. The first cut (1:64) measured 139–211 minutes against a 120 ceiling; the user chose to raise the
 * odds slightly (1:49, 2%) and accept the rest, so the ceiling is the accepted range with a little headroom.
 */
const RARE_FARM_CEILING_MIN = 180;
/** The Lv.5 pure spell each element's rare recipe takes as its first input. */
const BASE: Record<ElementId, string> = {
  fire: 'inferno',
  wind: 'vacuum_blades',
  thunder: 'myriad_thunder',
  earth: 'landslide',
  water: 'maelstrom',
};
/** Expected attempts for a 1:49 weight rare outcome. */
const ATTEMPTS = 50;

/** Grade-1 equivalents gained per sim minute in the `windowMin` minutes after `fromMs` (or to the end of the samples). */
function eqPerMinuteAfter(samples: { atMs: number; eq: number }[], fromMs: number, windowMin: number): number {
  const start = samples.findLast((s) => s.atMs <= fromMs) ?? { atMs: fromMs, eq: 0 };
  const end = samples.findLast((s) => s.atMs <= fromMs + windowMin * MINUTE)!;
  const mins = (end.atMs - start.atMs) / MINUTE;
  return mins > 0 ? (end.eq - start.eq) / mins : 0;
}

describe('rare spell farming cost', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el}: farming one rare spell takes at most RARE_FARM_CEILING_MIN simulated minutes`, async () => {
      const r = await runBot({ route: el, seed: SEED, maxSimMs: FOUR_HOURS });
      const from = r.learnedAt[BASE[el]];
      expect(from, `${BASE[el]} was never learned`).toBeDefined();
      const rate = eqPerMinuteAfter(r.gained[el], from!, 30);
      const minutes = (ATTEMPTS * gradeValue(3)) / rate;
      console.info(`[rare-cost] ${el}: ${rate.toFixed(1)} eq/min -> ${minutes.toFixed(0)} min`);
      expect(minutes).toBeLessThanOrEqual(RARE_FARM_CEILING_MIN);
    }, 600_000);
  }
});
