import { describe, expect, it } from 'vitest';
import { failChance, circleCost, RARE_CHANCE, rareFor } from '../../src/engine/circle-synth';
import { runesUnlocked } from '../../src/engine/circle';
import { content } from '../../src/engine/content';
import { ELEMENT_ORDER, gradeValue } from '../../src/engine/types';
import { routeCircle, runBot } from './bot';

const MINUTE = 60_000;
const SIX_HOURS = 360 * MINUTE;
const SEED = 20261021;
/**
 * The farming-time ceiling is report-only. Since the magic circle (project 2) a rare spell is rolled from its own Lv.10
 * circle (RARE_CHANCE per success), so its cost is that circle's elements, not one material per attempt as when the
 * old 120-minute ceiling was set (spec 2.1 of the tier curve); the drop rebalance is deferred ("4的掉落平衡後續再更動").
 */
const ENFORCE_TIMES = false;
const RARE_FARM_CEILING_MIN = 120;

/** Grade-1 equivalents per sim minute gained in the `windowMin` minutes after `fromMs` (or to the end of the samples). */
function perMinuteAfter(samples: { atMs: number; eq: number }[], fromMs: number, windowMin: number): number {
  const start = samples.findLast((s) => s.atMs <= fromMs) ?? { atMs: fromMs, eq: 0 };
  const end = samples.findLast((s) => s.atMs <= fromMs + windowMin * MINUTE);
  if (!end) return 0;
  const mins = (end.atMs - start.atMs) / MINUTE;
  return mins > 0 ? (end.eq - start.eq) / mins : 0;
}

describe('rare spell farming cost', () => {
  const allRunes = runesUnlocked(content.zones.map((z) => z.bossId), content);
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el}: draws its rare spell's Lv.10 circle; farming time printed`, async () => {
      const circle = routeCircle(el, 10, allRunes);
      const rare = rareFor(circle.id, content);
      expect(rare, `${circle.id} is no rare spell's circle`).toBeDefined();
      const r = await runBot({ route: el, seed: SEED, maxSimMs: SIX_HOURS });
      expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
      const from = r.learnedAt[circle.id] ?? r.learnedAt[rare!.id];
      expect(from, `${circle.id} was never drawn`).toBeDefined();
      const cost = circleCost(circle.placement).reduce((n, it) => n + gradeValue(Number(it.split(':')[2])), 0);
      const attempts = 1 / (RARE_CHANCE * (1 - failChance(circle.placement)));
      const rate = perMinuteAfter(r.gained[el], from!, 30);
      const minutes = rate > 0 ? (attempts * cost) / rate : Infinity;
      console.info(`[rare-cost] ${el}: drew ${circle.id} at ${(from! / MINUTE).toFixed(1)} min; ${cost} eq per circle x ${attempts.toFixed(1)} attempts`
        + ` at ${rate.toFixed(1)} eq/min -> ${minutes.toFixed(0)} min for ${rare!.id}`);
      if (ENFORCE_TIMES) expect(minutes).toBeLessThanOrEqual(RARE_FARM_CEILING_MIN);
    }, 600_000);
  }
});
