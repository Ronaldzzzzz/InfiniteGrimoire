/** The DPS readout averages this much recent damage, so swapping spells shows in a few seconds without jitter. */
export const DPS_WINDOW_MS = 10_000;
const MIN_SPAN_MS = 1000;
/** Burn damage arrives as one 'dot' event per second (combat.ts DOT_REPORT_MS). */
export const DOT_GAP_MS = 1000;

/** After each damage, the next max(1 s, the spell's cooldown) still counts as "fighting". */
export function dpsGapMs(cooldownMs: number): number {
  return Math.max(MIN_SPAN_MS, Number.isFinite(cooldownMs) ? cooldownMs : 0);
}

/**
 * Active-time DPS: damage over the last DPS_WINDOW_MS divided by the time we were actually fighting (the union of
 * the "gap" after each damage sample, never under a second). A mowing game spawns foes at a fixed rate, so dividing
 * by the whole window would measure the spawn rate, not the spell: a stronger spell that clears the field faster
 * would even read lower. Counting only active time (like Recount in WoW) keeps the number about the spell.
 */
export class DpsMeter {
  private samples: { at: number; damage: number; gap: number }[] = [];

  add(atMs: number, damage: number, gapMs: number = MIN_SPAN_MS): void {
    if (!Number.isFinite(damage) || damage <= 0) return;
    this.samples.push({ at: atMs, damage, gap: Math.max(MIN_SPAN_MS, Number.isFinite(gapMs) ? gapMs : 0) });
  }

  /** A new battle or a spell swap: forget the old damage. */
  reset(): void {
    this.samples = [];
  }

  value(nowMs: number): number {
    const from = nowMs - DPS_WINDOW_MS;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop]!.at <= from) drop++;
    if (drop > 0) this.samples.splice(0, drop);
    if (this.samples.length === 0) return 0;
    let total = 0;
    let active = 0;
    let end = -Infinity; // right edge of the part of the timeline already counted
    for (const s of this.samples) {
      total += s.damage;
      const a = Math.max(s.at, end);
      const b = Math.min(s.at + s.gap, nowMs);
      if (b > a) active += b - a;
      end = Math.max(end, s.at + s.gap);
    }
    if (total === 0) return 0;
    return (total * 1000) / Math.max(MIN_SPAN_MS, active);
  }
}

/** The meter plus the small "previous spell" comparison line; swapping spells moves the last number there. */
export class DpsReadout {
  private meter = new DpsMeter();
  private spellId: string | null = null;
  private spellName: string | null = null;
  private gap = MIN_SPAN_MS;
  private last = 0;
  private prev: { name: string; dps: number } | null = null;

  /** Call every sync with the equipped spell; a change (not the first call) archives the old spell's last DPS. */
  equip(spellId: string | null, name: string | null, cooldownMs: number): void {
    this.gap = dpsGapMs(cooldownMs);
    if (spellId === this.spellId) {
      this.spellName = name;
      return;
    }
    if (this.spellId !== null && this.spellName && this.last > 0) this.prev = { name: this.spellName, dps: this.last };
    this.meter.reset();
    this.last = 0;
    this.spellId = spellId;
    this.spellName = name;
  }

  /** Travel or reload: everything, including the previous-spell line, starts over. */
  newBattle(): void {
    this.meter.reset();
    this.last = 0;
    this.prev = null;
  }

  hit(atMs: number, damage: number): void {
    this.meter.add(atMs, damage, this.gap);
  }

  dot(atMs: number, damage: number): void {
    this.meter.add(atMs, damage, Math.max(this.gap, DOT_GAP_MS));
  }

  value(nowMs: number): number {
    const v = this.meter.value(nowMs);
    if (v > 0) this.last = v;
    return v;
  }

  get previous(): { name: string; dps: number } | null {
    return this.prev;
  }
}

/** "前一招 〈name〉 3,457", or an empty string when there is nothing to compare with. */
export function formatPrevDps(prev: { name: string; dps: number } | null): string {
  return prev ? `前一招 ${prev.name} ${Math.round(prev.dps).toLocaleString('en-US')}` : '';
}

export function formatDps(dps: number): string {
  if (dps <= 0) return 'DPS —';
  if (dps >= 1_000_000) return `DPS ${Math.round(dps / 1000).toLocaleString('en-US')}k`;
  return `DPS ${Math.round(dps).toLocaleString('en-US')}`;
}
