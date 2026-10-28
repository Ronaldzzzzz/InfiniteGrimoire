import { describe, expect, it } from 'vitest';
import { CROWD_OPTS, crowdReport } from './measure';

/** Task 3 flips this on once hit points are tuned; until then the report is only printed (spec 4.3). */
const ENFORCE_CROWD = false;

describe('crowd size on the field', () => {
  it('measures alive count, line touches and clear share per zone', { timeout: 900_000 }, () => {
    const rows = crowdReport(CROWD_OPTS);
    const lines = rows.map((r) =>
      `${r.zoneId.padEnd(17)} rel ${String(r.rel).padStart(2)} (Lv.${r.tier}, ${r.spells.length} spells) 場上 ${r.medianAlive.toFixed(1)}；碰線 ${r.medianTouched.toFixed(1)}；15 秒清場 ${(r.clearedShare * 100).toFixed(0)}%`);
    console.info(`場上隻數報告\n${lines.join('\n')}`);
    expect(new Set(rows.map((r) => r.zoneId)).size).toBe(6);
    if (ENFORCE_CROWD) {
      for (const r of rows) {
        const at = `${r.zoneId} rel ${r.rel}`;
        if (r.rel === 0) { expect(r.medianAlive, at).toBeGreaterThanOrEqual(30); expect(r.medianAlive, at).toBeLessThanOrEqual(50); }
        if (r.rel === 1) { expect(r.medianTouched, at).toBeLessThanOrEqual(2); expect(r.clearedShare, at).toBeGreaterThan(0.5); }
        if (r.rel === -1) expect(r.medianAlive, at).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
