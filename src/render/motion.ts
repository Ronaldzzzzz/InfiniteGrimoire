/** Render-side motion helpers. Visual only: the engine's positions and targeting are untouched. */

/** Blend the previous and current fixed-step value (alpha clamped to [0, 1]). */
export function interpolate(prev: number, cur: number, alpha: number): number {
  const a = Math.max(0, Math.min(1, alpha));
  return prev + (cur - prev) * a;
}
