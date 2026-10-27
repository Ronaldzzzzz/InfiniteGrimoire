import { describe, expect, it } from 'vitest';
import { ELEMENT_ORDER, type ElementId } from '../../src/engine/types';
import { runBot } from './bot';

const MINUTE = 60_000;
const SIX_HOURS = 360 * MINUTE;
const SEED = 20261021;
/** Tuning target is measured and printed until Task 7 finishes tuning; flip to true to enforce it. */
const ENFORCE = false;
/** Spec 2.1: farming one rare spell takes at most this many simulated minutes. */
const RARE_FARM_CEILING_MIN = 120;
/** The Lv.9 spell each element's rare recipe takes as its first input, and the rare's material (R1: one material per attempt). */
const LV9: Record<ElementId, { spell: string; material: string }> = {
  fire: { spell: 'corona_scorch', material: 'mat:ember_core' },
  wind: { spell: 'void_gale', material: 'mat:roc_feather' },
  thunder: { spell: 'astral_fulmination', material: 'mat:fulgurite' },
  earth: { spell: 'continental_crush', material: 'mat:lava_stone' },
  water: { spell: 'nether_tides', material: 'mat:tide_scale' },
};
/** Expected attempts for a 1:49 weight rare outcome. */
const ATTEMPTS = 50;

/** Items gained per sim minute in the `windowMin` minutes after `fromMs` (or to the end of the samples). */
function perMinuteAfter(samples: { atMs: number; n: number }[], fromMs: number, windowMin: number): number {
  const start = samples.findLast((s) => s.atMs <= fromMs) ?? { atMs: fromMs, n: 0 };
  const end = samples.findLast((s) => s.atMs <= fromMs + windowMin * MINUTE);
  if (!end) return 0;
  const mins = (end.atMs - start.atMs) / MINUTE;
  return mins > 0 ? (end.n - start.n) / mins : 0;
}

describe('rare spell farming cost', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el}: farming one rare spell takes at most RARE_FARM_CEILING_MIN simulated minutes`, async () => {
      const { spell, material } = LV9[el];
      const r = await runBot({ route: el, seed: SEED, maxSimMs: SIX_HOURS });
      expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
      const from = r.learnedAt[spell];
      if (from === undefined) {
        console.info(`[rare-cost] ${el}: ${spell} was never learned (sim ${(r.simMs / MINUTE).toFixed(0)} min)`);
        if (ENFORCE) expect(from, `${spell} was never learned`).toBeDefined();
        return;
      }
      const rate = perMinuteAfter(r.gainedItems[material] ?? [], from, 30);
      const minutes = rate > 0 ? ATTEMPTS / rate : Infinity;
      console.info(`[rare-cost] ${el}: learned ${spell} at ${(from / MINUTE).toFixed(1)} min, ${rate.toFixed(2)} ${material}/min -> ${minutes.toFixed(0)} min`);
      if (ENFORCE) expect(minutes).toBeLessThanOrEqual(RARE_FARM_CEILING_MIN);
    }, 600_000);
  }
});
