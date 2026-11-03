import type { Content } from '../engine/model';
import type { ActionResult } from '../game/api';

/**
 * The parchment's charge and reveal (spec 2026-11-03 polish 2, section 2): every outcome charges for PROGRESS_MS, the last
 * PAUSE_MS of it a pause; a mutation (today's rare 2%) turns at 3 s and plays MUTATION_MS more before its card.
 */
export const PROGRESS_MS = 3000;
export const RARE_PROGRESS_MS = 5000;
/** the pause at the end of the charge; App.css keys it as the last 10% (300 / 3000) of the charge keyframes */
export const PAUSE_MS = 300;
export const MUTATION_MS = RARE_PROGRESS_MS - PROGRESS_MS;

/** `great` has no real trigger yet (project 3); only the dev preview plays it */
export type RevealKind = 'fail' | 'success' | 'learned' | 'great' | 'mutation';

/** The particle layer over the sheet (Task 8 supplies the Pixi one); CircleTable calls it at the right moments. */
export interface CircleFxApi {
  charge(colours: string[], ms: number): void;
  /** the reply is late: freeze the particles, the orb pulses */
  hold(): void;
  reveal(kind: RevealKind): void;
  /** refused, failed or unmounted mid-charge: fade out */
  stop(): void;
}

export const NO_FX: CircleFxApi = { charge() {}, hold() {}, reveal() {}, stop() {} };

/** a rare spell (learned, or rolled again while already known: it still plays the full 5 s) */
export const isRare = (r: ActionResult, content: Content): boolean =>
  (r.kind === 'learned' || r.kind === 'known') &&
  ((('rare' in r) && !!r.rare) || (Object.hasOwn(content.spells, r.spellId) && !!content.spells[r.spellId]!.rare));

export function revealKindOf(r: ActionResult, content: Content): RevealKind {
  if (r.kind !== 'learned' && r.kind !== 'known') return 'fail';
  if (isRare(r, content)) return 'mutation';
  return r.kind === 'learned' ? 'learned' : 'success';
}
