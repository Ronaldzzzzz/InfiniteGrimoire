import type { GameState, Zone } from './model';

/** Time a wave needs to walk into range; the floor for any stage's duration. */
export const WALK_MS = 1500;
/** A boss stage fails if the boss is still alive after this long. */
export const BOSS_LIMIT_MS = 180_000;

export const stageCount = (zone: Zone): number => zone.stages.length;
export const isBossStage = (zone: Zone, stage: number): boolean => stage === stageCount(zone);

const waves = (zone: Zone, stage: number): number[] => zone.stages[stage - 1]?.waves ?? [];

/** Foes in a stage; the boss stage counts its boss as one extra. */
export const stageTotal = (zone: Zone, stage: number): number =>
  waves(zone, stage).reduce((a, b) => a + b, 0) + (isBossStage(zone, stage) ? 1 : 0);

/** Fastest possible stage: one walk per wave, the boss wave included. */
export const minStageMs = (zone: Zone, stage: number): number =>
  (waves(zone, stage).length + (isBossStage(zone, stage) ? 1 : 0)) * WALK_MS;

export const maxWaveSize = (zone: Zone): number => Math.max(0, ...zone.stages.flatMap((s) => s.waves));

export const highestPlayable = (state: GameState, zone: Zone): number =>
  Math.min(stageCount(zone), (state.clearedStages[zone.id] ?? 0) + 1);
