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
  it('neighbouring tiers are about TIER_STEP apart and empowering stays below the next tier', { timeout: 120_000 }, () => {
    const report = curveReport(CURVE_OPTS);
    const lines = report.medians.map((m) =>
      `Lv.${m.tier} @${m.zone}: 單挑 ${m.solo.toFixed(1)}${m.ratioSolo ? ` (×${m.ratioSolo.toFixed(2)})` : ''}；群怪 ${m.crowd.toFixed(1)}${m.ratioCrowd ? ` (×${m.ratioCrowd.toFixed(2)})` : ''}；幾何 ${m.geo.toFixed(1)}`);
    console.info(`各階中位數（倍率在較低階的主場量）\n${lines.join('\n')}\n未通過 ${report.failures.length} 條\n${report.failures.map((f) => `[${f.key}] ${f.text}`).join('\n')}`);
    expect(report.perCircle.length).toBeGreaterThanOrEqual(5 * 9);
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
