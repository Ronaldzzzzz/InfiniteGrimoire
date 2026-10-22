import type { Effect } from '../engine/model';
import type { ElementId } from '../engine/types';
import { COLORS } from './palette';

/** Particle language: every element has its own colour, shape and drift, so combo spells read as both. */
export type ParticleShape = 'spark' | 'streak' | 'bolt' | 'shard' | 'drop';

export interface ParticleStyle {
  color: string;
  /** vertical drift in px/s at unit scale (negative = rises) */
  vy: number;
  /** side length range in px at unit scale */
  size: [number, number];
  lifeMs: [number, number];
  shape: ParticleShape;
}

const STYLES: Record<ElementId, Omit<ParticleStyle, 'color'>> = {
  fire: { vy: -70, size: [2, 4], lifeMs: [350, 750], shape: 'spark' }, // embers float up
  wind: { vy: 0, size: [3, 6], lifeMs: [250, 500], shape: 'streak' }, // quick cyan arcs
  thunder: { vy: 0, size: [3, 6], lifeMs: [120, 260], shape: 'bolt' }, // short jagged flickers
  earth: { vy: 160, size: [3, 5], lifeMs: [400, 800], shape: 'shard' }, // heavy chips fall
  water: { vy: 90, size: [2, 4], lifeMs: [300, 650], shape: 'drop' }, // drops fall
};

export function particleStyle(element: ElementId): ParticleStyle {
  return { color: COLORS.element[element], ...STYLES[element], size: [...STYLES[element].size], lifeMs: [...STYLES[element].lifeMs] };
}

/** Colours and particle shapes of a spell: a fire + wind spell shows both fire sparks and wind streaks. */
export function blendForSpell(elements: readonly ElementId[]): { primary: string; secondary: string | null; shapes: ParticleShape[] } {
  const unique = [...new Set(elements)];
  const [first, second] = unique;
  if (!first) return { primary: COLORS.element.none, secondary: null, shapes: ['spark'] };
  return {
    primary: COLORS.element[first],
    secondary: second ? COLORS.element[second] : null,
    shapes: unique.map((e) => STYLES[e].shape),
  };
}

export const MULTI_KILL_WINDOW_MS = 800;
export const MULTI_KILL_MIN = 6;

/** 「×N 一網打盡！」: N kills within the last 0.8 s, shown from six. */
export function multiKillLabel(killTimesMs: readonly number[], nowMs: number): { n: number } | null {
  let n = 0;
  for (const t of killTimesMs) if (nowMs - t < MULTI_KILL_WINDOW_MS && t <= nowMs) n++;
  return n >= MULTI_KILL_MIN ? { n } : null;
}

/** Screen shake in px at unit scale: meteors land hard, fields hit the whole arena, striking zones rumble. */
export function shakeFor(effect: Effect): number {
  switch (effect.kind) {
    case 'meteor':
      return 10;
    case 'field':
      return 6;
    case 'zone':
      return effect.strikes > 0 ? 2.5 : 0;
    default:
      return 0;
  }
}
