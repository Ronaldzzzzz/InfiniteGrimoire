import { describe, expect, it } from 'vitest';
import { content } from './content';
import { createInitialState } from './persist';
import { BOSS_LIMIT_MS, WALK_MS, highestPlayable, isBossStage, maxWaveSize, minStageMs, stageCount, stageTotal } from './stages';

const zone = { ...content.zones[0]!, stages: [...Array(9)].map(() => ({ waves: [5, 6] })).concat([{ waves: [4] }]) };

describe('stages', () => {
  it('counts stages and finds the boss stage', () => {
    expect(stageCount(zone)).toBe(10);
    expect(isBossStage(zone, 10)).toBe(true);
    expect(isBossStage(zone, 9)).toBe(false);
  });
  it('totals include the boss on the boss stage', () => {
    expect(stageTotal(zone, 1)).toBe(11);
    expect(stageTotal(zone, 10)).toBe(5);
  });
  it('minimum stage time is one walk per wave, the boss wave included', () => {
    expect(minStageMs(zone, 1)).toBe(2 * WALK_MS);
    expect(minStageMs(zone, 10)).toBe(2 * WALK_MS);
  });
  it('largest wave of a zone', () => {
    expect(maxWaveSize(zone)).toBe(6);
    expect(BOSS_LIMIT_MS).toBe(180_000);
  });
  it('highest playable stage is one past the highest cleared, capped', () => {
    const s = { ...createInitialState(content), clearedStages: { [zone.id]: 3 } };
    expect(highestPlayable(s, zone)).toBe(4);
    expect(highestPlayable({ ...s, clearedStages: { [zone.id]: 10 } }, zone)).toBe(10);
    expect(highestPlayable({ ...s, clearedStages: {} }, zone)).toBe(1);
  });
});
