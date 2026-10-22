import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import type { NamedSpellDef } from '../engine/model';
import { layoutGrimoire } from './grimoire-layout';

const spells = Object.values(content.spells);
const visible = new Set(['core']);
const { nodes, edges } = layoutGrimoire(spells, visible);
const at = (id: string) => nodes.find((n) => n.spellId === id)!;
const polar = (id: string) => {
  const { x, y } = at(id);
  return { r: Math.hypot(x, y), deg: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360 };
};

describe('layoutGrimoire', () => {
  it('places every visible spell with a node once, and none without one', () => {
    expect(nodes).toHaveLength(spells.filter((s) => s.node && visible.has(s.node.region)).length);
    expect(nodes.find((n) => n.spellId === 'mana_overload')).toBeUndefined();
  });
  it('puts mana_bolt at the centre', () => {
    expect(at('mana_bolt').x).toBeCloseTo(0);
    expect(at('mana_bolt').y).toBeCloseTo(0);
  });
  it('puts fireball straight up at radius 120', () => {
    expect(at('fireball').x).toBeCloseTo(0);
    expect(at('fireball').y).toBeCloseTo(-120);
  });
  it('follows the node angle and ring', () => {
    expect(polar('wind_blade').deg).toBeCloseTo(72);
    const p = polar('fire_tornado');
    expect(p.deg).toBeCloseTo(36);
    expect(p.r).toBeCloseTo(250);
  });
  it('fogged nodes are not drawn', () => {
    const hidden: NamedSpellDef = { ...content.spells.fire_tornado!, id: 'hidden_spell', node: { region: 'outer', ring: 4, angle: 10 }, prerequisites: ['fireball'] };
    const fogged = layoutGrimoire([...spells, hidden], visible);
    expect(fogged.nodes.find((n) => n.spellId === 'hidden_spell')).toBeUndefined();
    expect(fogged.edges.find((e) => e.to === 'hidden_spell')).toBeUndefined();
    const revealed = layoutGrimoire([...spells, hidden], new Set(['core', 'outer']));
    const n = revealed.nodes.find((x) => x.spellId === 'hidden_spell')!;
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(315);
    expect(revealed.edges).toContainEqual({ from: 'fireball', to: 'hidden_spell' });
  });
  it('draws prerequisite edges', () => {
    expect(edges).toContainEqual({ from: 'fireball', to: 'fire_tornado' });
    expect(edges).toContainEqual({ from: 'wind_blade', to: 'fire_tornado' });
  });
});
