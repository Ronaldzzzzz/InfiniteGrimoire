import { describe, expect, it } from 'vitest';
import { curveReport, CURVE_OPTS } from './measure';

/** Task 7 flips this on once the numbers are tuned (ledger R4); until then the report is only printed. */
const ENFORCE = true;

describe('spell tier curve', () => {
  it('measures the curve and reports failures', { timeout: 60_000 }, () => {
    const report = curveReport(CURVE_OPTS);
    const lines = report.medians.map((m) =>
      `Lv.${m.tier} @${m.zone}: 單挑 ${m.solo.toFixed(1)}${m.ratioSolo ? ` (×${m.ratioSolo.toFixed(2)})` : ''}；群怪 ${m.crowd.toFixed(1)}${m.ratioCrowd ? ` (×${m.ratioCrowd.toFixed(2)})` : ''}；幾何 ${m.geo.toFixed(1)}`);
    console.info(`各階中位數\n${lines.join('\n')}\n失敗 ${report.failures.length} 條\n${report.failures.join('\n')}`);
    expect(report.perSpell.length).toBeGreaterThan(0);
    if (ENFORCE) expect(report.failures).toEqual([]);
  });
});
