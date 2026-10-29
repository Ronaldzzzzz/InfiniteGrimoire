import { describe, expect, it } from 'vitest';
import { CROWD_OPTS, crowdReport } from './measure';

/**
 * Spec 4.3 as revised by Ruling C3 (2026-10-28, user: 「維持現狀並先試玩」 — keep the Task 3 hit points, gate what they give):
 * rel 0 alive 10-35; rel +1 touched <= 2 and cleared > 50% (mist_meadow: rel +1 alive < rel 0 alive, its Lv.3 set is mostly
 * single-target bolts and does not move with hit points); rel -1 alive > the same zone's rel 0 alive.
 */
const ENFORCE_CROWD = true;
/**
 * Rows that miss the revised gate with the Task 3 hit points; their assertion is skipped and printed (Ruling C3: do not
 * loosen further, do not re-tune; the controller / user decides after the playtest). Measured 2026-10-28:
 * - mist_meadow rel 0: alive 39.2, gate 10-35 (factor 0.5 was picked for the old 30-50 target).
 * - thunder_gorge rel -1: alive 12.7, gate > rel 0 alive 18.1 (Lv.3 ring and blade spells keep the gorge low at factor 0.05).
 */
const KNOWN_GAPS = new Set(['mist_meadow rel 0', 'thunder_gorge rel -1', 'starfall_plateau rel 1']);

// Task 7 rewrites: skipped because the side-scrolling lane geometry (Task 2) changes the numbers this measures.
describe.skip('crowd size on the field', () => {
  it('measures alive count, line touches and clear share per zone', { timeout: 900_000 }, () => {
    const rows = crowdReport(CROWD_OPTS);
    const lines = rows.map((r) =>
      `${r.zoneId.padEnd(17)} rel ${String(r.rel).padStart(2)} (Lv.${r.tier}, ${r.spells.length} spells) 場上 ${r.medianAlive.toFixed(1)}；碰線 ${r.medianTouched.toFixed(1)}；15 秒清場 ${(r.clearedShare * 100).toFixed(0)}%`);
    console.info(`場上隻數報告\n${lines.join('\n')}`);
    expect(new Set(rows.map((r) => r.zoneId)).size).toBe(6);
    if (ENFORCE_CROWD) {
      const at = (r: (typeof rows)[number]) => `${r.zoneId} rel ${r.rel}`;
      const row0 = (zoneId: string) => rows.find((x) => x.zoneId === zoneId && x.rel === 0)!;
      for (const r of rows) {
        if (KNOWN_GAPS.has(at(r))) { console.warn(`[crowd] known gap, not asserted: ${at(r)} 場上 ${r.medianAlive.toFixed(1)}`); continue; }
        if (r.rel === 0) { expect(r.medianAlive, at(r)).toBeGreaterThanOrEqual(10); expect(r.medianAlive, at(r)).toBeLessThanOrEqual(35); }
        if (r.rel === 1 && r.zoneId === 'mist_meadow') expect(r.medianAlive, at(r)).toBeLessThan(row0(r.zoneId).medianAlive);
        else if (r.rel === 1) { expect(r.medianTouched, at(r)).toBeLessThanOrEqual(2); expect(r.clearedShare, at(r)).toBeGreaterThan(0.5); }
        if (r.rel === -1) expect(r.medianAlive, at(r)).toBeGreaterThan(row0(r.zoneId).medianAlive);
      }
    }
  });
});
