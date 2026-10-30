import { describe, expect, it } from 'vitest';
import { content } from './content';
import { EMPOWER_MAX, SPELL_ID_MAX_LEN, resolveSpell, spellAtLevel } from './spells';

describe('resolveSpell', () => {
  it('resolves named spells, rare spells and magic circle ids', () => {
    expect(resolveSpell('mana_bolt', content)).toBe(content.spells.mana_bolt);
    expect(resolveSpell('worldfire', content)!.tier).toBe(10);
    const circle = resolveSpell('m:fire.3.---fw.-----.bolt', content)!;
    expect(circle).toMatchObject({ tier: 3, elements: ['fire', 'wind'], named: false });
    expect(resolveSpell(content.spells.fireball!.circle!, content)!.name).toBe(content.spells.fireball!.name);
  });

  it('resolveSpell rejects c(…) ids', () => {
    // the retired two-input crafted ids, well-formed or not, never resolve and never throw
    for (const bad of ['c(fireball|rock_spear)', 'c(fireball|mat:ember_core)', 'c(c(fireball|water_wave)|lightning)', 'c(fireball|', 'c(|)']) {
      expect(() => resolveSpell(bad, content)).not.toThrow();
      expect(resolveSpell(bad, content), bad).toBeNull();
    }
  });

  it('rejects empty, oversized, unknown and malformed ids', () => {
    for (const bad of ['', 'x'.repeat(SPELL_ID_MAX_LEN + 1), 'nope', 'mat:ember_core', 'el:fire:1', 'm:', 'm:fire.3.---fw.-----.laser', '__proto__', 'constructor']) {
      expect(() => resolveSpell(bad, content)).not.toThrow();
      expect(resolveSpell(bad, content), bad).toBeNull();
    }
    expect(resolveSpell(7 as unknown as string, content)).toBeNull();
  });
});

describe('spellAtLevel', () => {
  it('spellAtLevel scales attack only, by EMPOWER_MAX over the 50 levels', () => {
    const base = content.spells.fireball!;
    expect(spellAtLevel(base, 1)).toBe(base);
    expect(EMPOWER_MAX).toBe(1.4);
    expect(spellAtLevel(base, 50).attack).toBeCloseTo(base.attack * EMPOWER_MAX);
    expect(spellAtLevel(base, 99).attack).toBeCloseTo(base.attack * EMPOWER_MAX);
    expect(spellAtLevel(base, 26).attack).toBeCloseTo(base.attack * (1 + 0.4 * 25 / 49));
    for (const L of [2, 11, 26, 50]) {
      const s = spellAtLevel(base, L);
      expect(s.tier).toBe(base.tier);
      expect(s.effects).toEqual(base.effects);
      expect(s.depth).toBe(base.depth);
    }
  });

});
