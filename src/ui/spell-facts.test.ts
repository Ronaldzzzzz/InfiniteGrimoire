import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { MAX_SPELL_LEVEL, spellAtLevel } from '../engine/spells';
import { formatPerHit, perHit, perHitDiff, spellFacts } from './spell-facts';

describe('spellFacts', () => {
  it('lists school, attack, cooldown and the burn of a fireball', () => {
    const s = content.spells.fireball!;
    const f = spellFacts(s, 1);
    expect(f.school).toBe('塑能投射');
    expect(f.attack).toBe(Math.round(s.attack));
    expect(f.cooldownSec).toBe(`${(s.cooldownMs / 1000).toFixed(1)} 秒`);
    expect(f.statuses).toEqual([{ name: '燃燒', sec: '3.0 秒' }]);
    expect(f.chant).toBeNull();
  });
  it('uses the empowered attack', () => {
    const s = content.spells.fireball!;
    expect(spellFacts(s, MAX_SPELL_LEVEL).attack).toBe(Math.round(spellAtLevel(s, MAX_SPELL_LEVEL).attack));
    expect(spellFacts(s, MAX_SPELL_LEVEL).attack).toBeGreaterThan(spellFacts(s, 1).attack);
  });
  it('names the forbidden school of a rare spell and passes the chant through', () => {
    const s = content.spells.worldfire!;
    const f = spellFacts(s, 1, s.chant);
    expect(s.school).toBe('forbidden');
    expect(f.school).toBe('神話禁咒');
    expect(f.chant).toBe(s.chant);
  });
  it('merges a repeated status to its longest duration, in first-seen order', () => {
    const s = structuredClone(content.spells.fireball!);
    s.effects = [
      { kind: 'bolt', mult: 1, count: 1, radius: 0.1, target: 'nearest', status: [{ kind: 'burn', ms: 2000 }, { kind: 'wet', ms: 1500 }] },
      { kind: 'storm', mult: 1, ms: 1000, tickMs: 100, status: [{ kind: 'burn', ms: 4500 }] },
    ];
    expect(spellFacts(s, 1).statuses).toEqual([{ name: '燃燒', sec: '4.5 秒' }, { name: '潮濕', sec: '1.5 秒' }]);
  });
});

describe('perHit', () => {
  it('is the empowered attack times the largest effect mult, rounded', () => {
    const s = structuredClone(content.spells.fireball!);
    s.attack = 1000;
    s.effects = [
      { kind: 'bolt', mult: 1, count: 1, radius: 0.1, target: 'nearest' },
      { kind: 'ring', mult: 1.85, radius: 0.3, push: 0 },
    ];
    expect(perHit(s, 1)).toBe(1850);
    expect(spellFacts(s, 1).perHit).toBe(1850);
    expect(perHit(s, MAX_SPELL_LEVEL)).toBe(Math.round(spellAtLevel(s, MAX_SPELL_LEVEL).attack * 1.85));
  });
});

describe('perHitDiff', () => {
  const mk = (attack: number, mult: number) => {
    const s = structuredClone(content.spells.fireball!);
    s.attack = attack;
    s.effects = [{ kind: 'ring', mult, radius: 0.3, push: 0 }];
    return s;
  };
  it('is plus when the viewed spell hits harder, minus when softer, none when equal', () => {
    const eq = { spell: mk(1000, 1), level: 1 };
    expect(perHitDiff(mk(1420, 1), 1, eq)).toEqual({ value: 420, text: '（+420）', tone: 'up' });
    expect(perHitDiff(mk(870, 1), 1, eq)).toEqual({ value: -130, text: '（−130）', tone: 'down' });
    expect(perHitDiff(mk(1000, 1), 1, eq)).toBeNull();
  });
  it('shows no difference when there is nothing to compare with', () => {
    expect(perHitDiff(mk(1000, 1), 1, null)).toBeNull();
    expect(perHitDiff(mk(1000, 1), 1, undefined)).toBeNull();
  });
  it('groups thousands', () => {
    expect(formatPerHit(1850)).toBe('1,850');
    const eq = { spell: mk(1000, 1), level: 1 };
    expect(perHitDiff(mk(3200, 1), 1, eq)?.text).toBe('（+2,200）');
  });
});
