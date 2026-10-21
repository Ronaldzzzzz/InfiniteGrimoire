import { describe, expect, it } from 'vitest';
import { gameData } from '../engine/data';
import { layoutGrimoire } from './grimoire-layout';

const spells = Object.values(gameData.spells);
const { nodes, edges } = layoutGrimoire(spells);
const at = (id: string) => nodes.find((n) => n.spellId === id)!;
const polar = (id: string) => {
  const { x, y } = at(id);
  return { r: Math.hypot(x, y), deg: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360 };
};

describe('layoutGrimoire', () => {
  it('places every spell once', () => expect(nodes).toHaveLength(spells.length));
  it('puts mana_bolt at the centre', () => {
    expect(at('mana_bolt').x).toBeCloseTo(0);
    expect(at('mana_bolt').y).toBeCloseTo(0);
  });
  it('puts fireball straight up at radius 120', () => {
    expect(at('fireball').x).toBeCloseTo(0);
    expect(at('fireball').y).toBeCloseTo(-120);
  });
  it('puts steam_burst at 324deg, radius 215', () => {
    const p = polar('steam_burst');
    expect(p.deg).toBeCloseTo(324);
    expect(p.r).toBeCloseTo(215);
  });
  it('puts fire_whirl at 36deg', () => expect(polar('fire_whirl').deg).toBeCloseTo(36));
  it('draws prerequisite edges', () => {
    expect(edges).toContainEqual({ from: 'flame_burst', to: 'fire_whirl' });
    expect(edges).toContainEqual({ from: 'whirlwind', to: 'fire_whirl' });
  });
});
