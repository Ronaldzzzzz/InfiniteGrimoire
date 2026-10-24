/** The DPS readout averages this much recent damage, so swapping spells shows in a few seconds without jitter. */
export const DPS_WINDOW_MS = 10_000;
const MIN_SPAN_MS = 1000;

/** Rolling damage-per-second over the last DPS_WINDOW_MS (hits plus the summed burn of 'dot' events). */
export class DpsMeter {
  private samples: { at: number; damage: number }[] = [];

  constructor(private startedAt: number) {}

  add(atMs: number, damage: number): void {
    if (!Number.isFinite(damage) || damage <= 0) return;
    this.samples.push({ at: atMs, damage });
  }

  /** A new battle (travel, reload): forget the old damage and restart the clock. */
  reset(atMs: number): void {
    this.samples = [];
    this.startedAt = atMs;
  }

  value(nowMs: number): number {
    const from = nowMs - DPS_WINDOW_MS;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop]!.at <= from) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    let total = 0;
    for (const s of this.samples) total += s.damage;
    if (total === 0) return 0;
    // until the window has filled, average over the time the battle has run (never under a second)
    const span = Math.max(MIN_SPAN_MS, Math.min(DPS_WINDOW_MS, nowMs - this.startedAt));
    return (total * 1000) / span;
  }
}

export function formatDps(dps: number): string {
  if (dps <= 0) return 'DPS —';
  if (dps >= 100_000) return `DPS ${Math.round(dps / 1000).toLocaleString('en-US')}k`;
  return `DPS ${Math.round(dps).toLocaleString('en-US')}`;
}
