import { describe, expect, it } from 'vitest';
import { content } from './content';
import {
  CRAFTED_MAX_LEN, HARD_MAX_DEPTH, MAX_CRAFTED_TIER, MAX_EFFECTS, MAX_SPELL_LEVEL, TIER_STEP,
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

  it('rejects material-only and non-canonical ids', () => {
    expect(resolveSpell('c(mat:ember_core|mat:ember_core)', content)).toBeNull();
    expect(resolveSpell('c(fireball|water_wave)', content)).not.toBeNull();
    expect(resolveSpell('c(water_wave|fireball)', content)).toBeNull();
    expect(resolveSpell('c(mat:ember_core|fireball)', content)).toBeNull();
    expect(resolveSpell('c(lightning|c(fireball|water_wave))', content)).toBeNull();
    expect(resolveSpell('c(c(water_wave|fireball)|lightning)', content)).toBeNull();
    expect(resolveSpell('c(c(fireball|water_wave)|lightning)', content)).not.toBeNull();
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

  it('spellAtLevel scales attack only, by TIER_STEP over the 50 levels', () => {
    const base = content.spells.fireball!;
    expect(spellAtLevel(base, 1)).toBe(base);
    expect(spellAtLevel(base, 50).attack).toBeCloseTo(base.attack * TIER_STEP);
    expect(spellAtLevel(base, 99).attack).toBeCloseTo(base.attack * TIER_STEP);
    expect(spellAtLevel(base, 26).attack).toBeCloseTo(base.attack * (1 + 0.7 * 25 / 49));
    for (const L of [2, 11, 26, 50]) {
      const s = spellAtLevel(base, L);
      expect(s.tier).toBe(base.tier);
      expect(s.effects).toEqual(base.effects);
      expect(s.depth).toBe(base.depth);
    }
  });

  it('crafted tier caps at MAX_CRAFTED_TIER', () => {
    expect(MAX_CRAFTED_TIER).toBe(9);
    const mk = (id: string, elements: ('fire' | 'wind')[]) => ({ ...content.spells.fireball!, id, elements, tier: 9, depth: 1 });
    const c = { ...content, spells: { ...content.spells, hi_fire: mk('hi_fire', ['fire']), hi_wind: mk('hi_wind', ['wind']) } };
    const s = resolveSpell(craftedId('hi_fire', 'hi_wind'), c)!;
    expect(s.affinity).toBe('good');
    expect(s.tier).toBe(9);
  });

  it('attackCeiling ignores rare spells', () => {
    const rare = { ...content.spells.fireball!, id: 'rare_x', tier: 10, attack: 1e9, rare: true };
    const c = { ...content, spells: { ...content.spells, rare_x: rare } };
    expect(attackCeiling(10, c)).toBe(attackCeiling(10, content));
  });
});

describe('crafted school', () => {
  const sch = (a: string, b: string) => resolveSpell(craftedId(a, b), content)!.school;
  it('takes the school of the higher-attack side', () => {
    // inferno (attack higher) vs fireball
    expect(content.spells.inferno!.attack).toBeGreaterThan(content.spells.fireball!.attack);
    expect(sch('inferno', 'fireball')).toBe(content.spells.inferno!.school);
    expect(sch('water_wave', 'sunfall')).toBe('cataclysm');
  });
  it('ties go to the id sorted first', () => {
    expect(content.spells.fireball!.attack).toBe(content.spells.water_wave!.attack);
    expect(content.spells.fireball!.school).toBe('evocation');
    expect(content.spells.water_wave!.school).toBe('conjuration');
    expect(sch('fireball', 'water_wave')).toBe('evocation');
  });
  it('downgrades forbidden to cataclysm', () => {
    expect(content.spells.worldfire!.school).toBe('forbidden');
    expect(sch('worldfire', 'fireball')).toBe('cataclysm');
  });
  it('takes the other side when a material is an input', () => {
    expect(sch('fireball', 'mat:ember_core')).toBe('evocation');
    expect(sch('mat:ember_core', 'water_wave')).toBe('conjuration');
  });
});
