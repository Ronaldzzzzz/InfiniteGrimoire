import { describe, expect, it } from 'vitest';
import { content } from './content';
import {
  CRAFTED_MAX_LEN, HARD_MAX_DEPTH, MAX_EFFECTS, MAX_SPELL_LEVEL,
  affinityOf, attackCeiling, craftedId, inputToken, resolveSpell, spellAtLevel,
} from './spells';

describe('crafted spells', () => {
  it('crafted ids and names do not depend on input order', () => {
    expect(craftedId('fireball', 'mat:ember_core')).toBe(craftedId('mat:ember_core', 'fireball'));
    const a = resolveSpell(craftedId('fireball', 'mat:ember_core'), content)!;
    const b = resolveSpell(craftedId('mat:ember_core', 'fireball'), content)!;
    expect(a.name).toBe(b.name);
  });

  it('maps inputs to tokens', () => {
    expect(inputToken('el:fire:3', content)).toBe(content.baseSpells.fire);
    expect(inputToken('mat:ember_core', content)).toBe('mat:ember_core');
    expect(inputToken('fireball', content)).toBe('fireball');
    expect(inputToken('key:x', content)).toBeNull();
  });

  it('computes affinity from the table', () => {
    expect(affinityOf(['fire'], ['wind'])).toBe('good');
    expect(affinityOf(['fire'], ['water'])).toBe('bad');
    expect(affinityOf(['earth'], ['thunder'])).toBe('bad');
    expect(affinityOf(['fire'], ['fire'])).toBe('odd');
    expect(affinityOf([], ['fire'])).toBe('odd');
  });

  it('derives a good-affinity spell', () => {
    const s = resolveSpell(craftedId('fire_tornado', 'lightning'), content)!;
    expect(s.elements).toEqual(['fire', 'wind', 'thunder']);
    expect(s.affinity).toBe('good');
    expect(s.depth).toBe(2);
    expect(s.tier).toBe(5);
    expect(s.effects.length).toBeLessThanOrEqual(MAX_EFFECTS);
    expect(s.named).toBe(false);
  });

  it('derives a bad-affinity spell with a backfire', () => {
    const s = resolveSpell(craftedId('fireball', 'water_wave'), content)!;
    expect(s.affinity).toBe('bad');
    expect(s.name.startsWith('失控的')).toBe(true);
    expect(s.effects.filter((e) => e.kind === 'backfire')).toHaveLength(1);
  });

  it('material modifies a spell', () => {
    const s = resolveSpell(craftedId('lightning', 'mat:ember_core'), content)!;
    expect(s.effects).toContainEqual(content.materials['mat:ember_core']!.effect);
    expect(s.cooldownMs).toBe(content.spells.lightning!.cooldownMs);
    expect(s.depth).toBe(1);
  });

  it('rejects malformed, oversized and over-deep crafted ids', () => {
    const nest = (n: number) => { let id = 'fireball'; for (let i = 0; i < n; i++) id = `c(${id}|lightning)`; return id; };
    for (const bad of ['c(fireball|', 'c(|)', 'c(nope|fireball)', 'c(fireball)', 'c(a|b|c)', 'x'.repeat(CRAFTED_MAX_LEN + 1), `c(${'x'.repeat(CRAFTED_MAX_LEN)}|fireball)`, nest(9), 'c(mat:nope|fireball)', '']) {
      expect(() => resolveSpell(bad, content)).not.toThrow();
      expect(resolveSpell(bad, content)).toBeNull();
    }
    expect(resolveSpell(nest(HARD_MAX_DEPTH), content)).not.toBeNull();
  });

  it('deep good chains stay under the attack ceiling', () => {
    let id = 'fire_tornado';
    let beatNamed = false;
    for (let d = 1; d < HARD_MAX_DEPTH; d++) { // named spells already have depth 1
      id = craftedId(id, d % 2 ? 'lightning' : 'wind_blade');
      const s = resolveSpell(id, content)!;
      expect(s).not.toBeNull();
      expect(s.attack).toBeLessThanOrEqual(attackCeiling(s.tier, content));
      const namedMax = Math.max(...Object.values(content.spells).filter((n) => n.tier <= s.tier).map((n) => n.attack));
      if (s.attack > namedMax) beatNamed = true;
    }
    expect(beatNamed).toBe(true);
  });

  it('spellAtLevel scales damage, counts, radius and tier', () => {
    const base = content.spells.fireball!;
    expect(spellAtLevel(base, 1)).toBe(base);
    const s = spellAtLevel(base, 11);
    expect(s.attack).toBeCloseTo(base.attack * 1.8);
    expect(s.tier).toBe(base.tier + 1);
    const b0 = base.effects[0] as Extract<typeof base.effects[number], { kind: 'bolt' }>;
    const b1 = s.effects[0] as typeof b0;
    expect(b1.count).toBe(b0.count + 1);
    expect(b1.radius).toBeCloseTo(b0.radius * 1.2);
    expect(spellAtLevel(base, 99).attack).toBeCloseTo(base.attack * (1 + 0.08 * (MAX_SPELL_LEVEL - 1)));
    expect(spellAtLevel(base, 99).tier).toBe(Math.min(20, base.tier + 4));
  });
});
