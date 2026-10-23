import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { OVERLOAD_SPELL } from '../engine/model';
import { describeInput, lookOf, revealOf } from './altar-data';

describe('describeInput', () => {
  it('describes elements, materials and spells', () => {
    expect(describeInput('el:fire:2', content, {})).toMatchObject({ kind: 'element', element: 'fire', grade: 2, name: '中階火' });
    expect(describeInput('fireball', content, { fireball: 4 })).toMatchObject({ kind: 'spell', level: 4, elements: ['fire'] });
    expect(describeInput('nope', content, {})).toBeNull();
  });

  it('describes a material by its content name', () => {
    expect(describeInput('mat:ember_core', content, {})).toMatchObject({ kind: 'material', id: 'mat:ember_core', name: content.materials['mat:ember_core']!.name });
  });

  it('rejects malformed element, material and key ids', () => {
    expect(describeInput('el:fire:9', content, {})).toBeNull();
    expect(describeInput('el:lava:1', content, {})).toBeNull();
    expect(describeInput('mat:not_a_material', content, {})).toBeNull();
    expect(describeInput('key:anything', content, {})).toBeNull();
  });

  it('uses the spell level for the tier and defaults the level to 1', () => {
    expect(describeInput('fireball', content, {})).toMatchObject({ kind: 'spell', level: 1 });
    const base = content.spells['fireball']!;
    expect(describeInput('fireball', content, { fireball: 11 })).toMatchObject({ tier: base.tier + 1 });
  });
});

describe('lookOf', () => {
  it('a spell looks stronger than an element', () => {
    const el = lookOf(describeInput('el:fire:1', content, {})!), sp = lookOf(describeInput('fireball', content, {})!);
    expect(sp.halo && !el.halo).toBe(true);
    expect(sp.particles).toBeGreaterThan(el.particles);
  });

  it('uses the element colour and shape for an element', () => {
    const look = lookOf(describeInput('el:water:1', content, {})!);
    expect(look.primary).toBe('#5aa0e8');
    expect(look.secondary).toBeNull();
    expect(look.shapes).toEqual(['drop']);
  });

  it('uses the amber spark for a material', () => {
    expect(lookOf(describeInput('mat:ember_core', content, {})!)).toMatchObject({ primary: '#e8b84a', shapes: ['spark'], particles: 6, halo: false });
  });
});

describe('revealOf', () => {
  it('maps synthesis results to reveals and leaves refusals out', () => {
    expect(revealOf({ kind: 'learned', spellId: 'fireball', crafted: false }, content, [])).toMatchObject({ tone: 'new', kicker: '新發現！' });
    expect(revealOf({ kind: 'duplicate', spellId: 'fireball', refunded: [] }, content, [])!.detail).toContain('沒有退還');
    expect(revealOf({ kind: 'rejected', reason: 'grade' }, content, [])).toBeNull();
  });

  it('gives crafted spells their own kicker', () => {
    expect(revealOf({ kind: 'learned', spellId: 'c(el:fire:1|el:wind:1)', crafted: true }, content, [])).toMatchObject({ tone: 'crafted', kicker: '自創魔法！' });
  });

  it('maps the remaining synthesis outcomes', () => {
    expect(revealOf({ kind: 'noReaction' }, content, [])).toMatchObject({ tone: 'fizzle', kicker: '沒有反應', spellId: null });
    expect(revealOf({ kind: 'dormant' }, content, [])).toMatchObject({ tone: 'dormant', kicker: '似乎還缺少什麼……' });
    expect(revealOf({ kind: 'overload', spellId: OVERLOAD_SPELL }, content, [])).toMatchObject({ tone: 'overload', kicker: '魔力過載！' });
  });

  it('leaves a rare result to the full-screen reveal (null), first finder or not', () => {
    expect(revealOf({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: true } }, content, [])).toBeNull();
    expect(revealOf({ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: false } }, content, [])).toBeNull();
  });

  it('returns null for non-synthesis results', () => {
    expect(revealOf({ kind: 'revealed', region: 'x' }, content, [])).toBeNull();
  });
});
