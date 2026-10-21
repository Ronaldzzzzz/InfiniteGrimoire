/** Render-side motion helpers. Visual only: the engine's positions and targeting are untouched. */

/** Blend the previous and current fixed-step value (alpha clamped to [0, 1]). */
export function interpolate(prev: number, cur: number, alpha: number): number {
  const a = Math.max(0, Math.min(1, alpha));
  return prev + (cur - prev) * a;
}

/** Max sideways drift along the stop ring, in radians (±12°). */
export const WANDER_MAX_ANGLE = (12 * Math.PI) / 180;
/** Max outward bob in unscaled pixels; never inward, so a monster can't move onto the hero. */
export const WANDER_BOB = 4;
/** Time after arriving at the stop ring over which the wander fades in. */
export const WANDER_RAMP_MS = 600;
const SPEED = 0.0011; // rad per ms for the sideways sway (~5.7 s per cycle)

/**
 * Idle movement for a monster standing on the stop ring.
 * `phase` is random per monster; `arrivedForMs` is how long it has been on the ring.
 */
export function wander(timeMs: number, phase: number, arrivedForMs: number): { dAngle: number; dRadius: number } {
  const ramp = Math.max(0, Math.min(1, arrivedForMs / WANDER_RAMP_MS));
  if (ramp === 0) return { dAngle: 0, dRadius: 0 };
  const jitter = phase * 997 - Math.floor(phase * 997); // per-monster speed, derived from its phase
  const speed = SPEED * (0.8 + 0.4 * jitter);
  const dAngle = ramp * WANDER_MAX_ANGLE * Math.sin(timeMs * speed + phase);
  const dRadius = ramp * WANDER_BOB * (0.5 + 0.5 * Math.sin(timeMs * speed * 2.3 + phase * 2));
  return { dAngle, dRadius };
}
