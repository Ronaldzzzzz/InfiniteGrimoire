import { describe, expect, it } from 'vitest';
import { curveReport, CURVE_OPTS } from './measure';

/**
 * Known gaps of the circle-spell tier curve (magic circle Task 2, 2026-10-30): failure key -> the ratio measured when it
 * was recorded. A known gap is printed, not failed, as long as it gets no worse than that ratio (+- GAP_TOLERANCE in the
 * direction it broke). Numbers are placeholders (spec "範圍"); refitting them is balance work for later.
 */
const KNOWN_GAPS: Record<string, number> = {};
const GAP_TOLERANCE = 0.03;

describe('spell tier curve (magic circle spells)', () => {
  it('neighbouring tiers are about TIER_STEP apart, empowering stays below the next tier, rares beat their circle and x1.5 Lv.9', { timeout: 120_000 }, () => {
    const report = curveReport(CURVE_OPTS);
    const lines = report.medians.map((m) =>
      `Lv.${m.tier} @${m.zone}: 單挑 ${m.solo.toFixed(1)}；群怪 ${m.crowd.toFixed(1)}；幾何 ${m.geo.toFixed(1)}${m.ratioSolo ? `；對 Lv.${m.tier - 1}（在 Lv.${m.tier - 1} 的主場）單挑 ×${m.ratioSolo.toFixed(2)}、群怪 ×${m.ratioCrowd!.toFixed(2)}` : ''}`);
    const rares = report.rares.map((r) => `${r.name} ${r.geo.toFixed(1)}（自己的陣 ×${(r.geo / r.circleGeo).toFixed(2)}，Lv.9 中位數 ×${(r.geo / r.lv9Median).toFixed(2)}）`);
    console.info(`各階中位數\n${lines.join('\n')}\n稀有魔法（${report.rares[0]?.lv9Median.toFixed(1)} = Lv.9 中位數）\n${rares.join('\n')}\n未通過 ${report.failures.length} 條\n${report.failures.map((f) => `[${f.key}] ${f.text}`).join('\n')}`);
    expect(report.perCircle.length).toBeGreaterThanOrEqual(5 * 9);
    expect(report.rares.length).toBe(7);
    const unknown = report.failures.filter((f) => KNOWN_GAPS[f.key] === undefined).map((f) => `[${f.key}] ${f.text}`);
    expect(unknown).toEqual([]);
    for (const f of report.failures) {
      const recorded = KNOWN_GAPS[f.key]!;
      console.warn(`[curve] known gap ${f.key}: ×${f.ratio.toFixed(2)} (recorded ×${recorded})`);
      if (f.side === 'max') expect(f.ratio, f.key).toBeLessThanOrEqual(recorded + GAP_TOLERANCE);
      else expect(f.ratio, f.key).toBeGreaterThanOrEqual(recorded - GAP_TOLERANCE);
    }
  });
});
