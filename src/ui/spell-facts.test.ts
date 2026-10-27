import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { MAX_SPELL_LEVEL, spellAtLevel } from '../engine/spells';
import { spellFacts } from './spell-facts';

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
