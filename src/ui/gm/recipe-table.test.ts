import { describe, expect, it } from 'vitest';
import { content } from '../../engine/content';
import { FAIL_BASE, RARE_CHANCE } from '../../engine/circle-synth';
import { circleLabel, circleTable } from './recipe-table';

describe('circleTable', () => {
  const rows = circleTable(content);

  it('has one row per named spell with a circle, ordered by tier', () => {
    expect(rows).toHaveLength(Object.values(content.spells).filter((s) => s.circle).length);
    expect(rows.map((r) => r.tier)).toEqual([...rows.map((r) => r.tier)].sort((a, b) => a - b));
  });

  it('a rare spell is its circle at RARE_CHANCE; an ordinary one is 90% (after FAIL_BASE; a rare is RARE_CHANCE of a success)', () => {
    const fire = rows.find((r) => r.id === 'worldfire')!;
    expect(fire).toMatchObject({ name: '焚世之焰', tier: 10, rare: true, pct: RARE_CHANCE * 100 });
    expect(rows.find((r) => r.id === 'fireball')).toMatchObject({ rare: false, pct: 90, circle: content.spells.fireball!.circle });
  });

  it('describes the circle in words', () => {
    expect(circleLabel('m:fire.2.----f.-----.bolt')).toBe('核心火｜一環 火｜二環 —｜射');
    expect(circleLabel('m:fire.10.fffff.-tttt.field')).toBe('核心火｜一環 火・火・火・火・火｜二環 雷・雷・雷・雷｜臨');
    expect(circleLabel('nope')).toBe('nope');
  });
});
