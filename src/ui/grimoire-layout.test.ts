import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import type { NamedSpellDef } from '../engine/model';
import { layoutGrimoire, layoutLightDark, ringRadius } from './grimoire-layout';
import { HOME, viewBoxOf } from './tree-viewport';

const NODE_R = 16; // GrimoirePanel's node radius

const spells = Object.values(content.spells);
const visible = new Set(['core']);
const passives = Object.values(content.passives);
const { nodes, edges } = layoutGrimoire(spells, visible);
const at = (id: string) => nodes.find((n) => n.id === id)!;
const polar = (id: string) => {
  const { x, y } = at(id);
  return { r: Math.hypot(x, y), deg: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360 };
};

describe('layoutGrimoire', () => {
  it('places every visible spell with a node once, and none without one', () => {
    expect(nodes).toHaveLength(spells.filter((s) => s.node && visible.has(s.node.region)).length);
    expect(nodes.every((n) => n.kind === 'spell')).toBe(true);
    expect(nodes.find((n) => n.id === 'mana_overload')).toBeUndefined();
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
    expect(fogged.nodes.find((n) => n.id === 'hidden_spell')).toBeUndefined();
    expect(fogged.edges.find((e) => e.to === 'hidden_spell')).toBeUndefined();
    const revealed = layoutGrimoire([...spells, hidden], new Set(['core', 'outer']));
    const n = revealed.nodes.find((x) => x.id === 'hidden_spell')!;
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(315);
    expect(revealed.edges).toContainEqual({ from: 'fireball', to: 'hidden_spell' });
  });
  it('draws prerequisite edges', () => {
    expect(edges).toContainEqual({ from: 'fireball', to: 'fire_tornado' });
    expect(edges).toContainEqual({ from: 'wind_blade', to: 'fire_tornado' });
  });
  it('places visible passives as passive nodes', () => {
    const l = layoutGrimoire(spells, new Set(['core', 'outer']), passives);
    const p = l.nodes.find((n) => n.id === 'ember_affinity')!;
    expect(p.kind).toBe('passive');
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(380); // outer passives sit on ring 5
    expect(l.nodes.find((n) => n.id === 'deep_insight')).toBeUndefined();
  });
  it('gives every fogged region a band around its rings and none to visible ones', () => {
    const l = layoutGrimoire(spells, visible, passives, content.regions);
    expect(l.fog.map((f) => f.region)).toEqual(['outer', 'rift', 'abyss', 'zenith', 'astral']);
    const outer = l.fog[0]!;
    expect(outer.inner).toBeLessThan(315);
    expect(outer.outer).toBeGreaterThan(315);
    expect(outer.inner).toBeGreaterThan(250);
    const rift = l.fog[1]!;
    expect(rift.inner).toBeCloseTo(outer.outer);
  });
});

describe('light/dark tree and ten rings', () => {
  const all = new Set(content.regions.map((r) => r.id));
  const allPassives = Object.values(content.passives);
  it('keeps lightdark spells out of the elements layout', () => {
    const l = layoutGrimoire(spells, all, allPassives, content.regions);
    expect(l.nodes.find((n) => n.id === 'holy_judgment')).toBeUndefined();
    expect(l.nodes.find((n) => n.id === 'abyss_devour')).toBeUndefined();
    expect(l.nodes.find((n) => n.id === 'wind_blade')).toBeDefined();
  });
  it('lays the two spells left (light) and right (dark) on one row', () => {
    const l = layoutLightDark(spells, all, content.regions);
    expect(l.nodes.map((n) => n.id).sort()).toEqual(['abyss_devour', 'holy_judgment']);
    const light = l.nodes.find((n) => n.id === 'holy_judgment')!;
    const dark = l.nodes.find((n) => n.id === 'abyss_devour')!;
    expect(light.x).toBeLessThan(0);
    expect(dark.x).toBeGreaterThan(0);
    expect(light.y).toBe(dark.y);
    expect(l.fog).toEqual([]);
  });
  it('shows only an anonymous astral fog band while the region is hidden', () => {
    const l = layoutLightDark(spells, new Set(['core']), content.regions);
    expect(l.nodes).toEqual([]);
    expect(l.fog.map((f) => f.region)).toEqual(['astral']);
    expect(JSON.stringify(l)).not.toContain('holy');
    expect(l.fog[0]!.outer).toBeGreaterThan(l.fog[0]!.inner);
  });
  it('fits all ten rings in the home view without crowding a ring', () => {
    const l = layoutGrimoire(spells, all, allPassives, content.regions);
    const maxR = Math.max(...l.nodes.map((n) => Math.hypot(n.x, n.y)));
    expect(maxR).toBeCloseTo(ringRadius(9));
    const base = Math.max(600, 2 * (maxR + 50)); // GrimoirePanel's base size
    const [vx, vy, w] = viewBoxOf(HOME, base).split(' ').map(Number) as [number, number, number];
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThan(vx + NODE_R);
      expect(n.x).toBeLessThan(vx + w - NODE_R);
      expect(n.y).toBeGreaterThan(vy + NODE_R);
      expect(n.y).toBeLessThan(vy + w - NODE_R);
    }
    for (const a of l.nodes) for (const b of l.nodes) {
      if (a.id >= b.id || Math.round(Math.hypot(a.x, a.y)) !== Math.round(Math.hypot(b.x, b.y))) continue;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * NODE_R);
    }
    for (let r = 1; r < 10; r++) expect(ringRadius(r) - ringRadius(r - 1)).toBeGreaterThanOrEqual(2 * NODE_R);
  });
  it('no node label overlaps another label or node (Minor 4)', () => {
    // GrimoirePanel draws each name centred at y + NODE_R + 12 in 11 px text; a CJK glyph is about one em wide,
    // so the label box is (chars x 11) wide and spans the baseline - 11 .. baseline + 2.
    const FS = 11;
    const l = layoutGrimoire(spells, all, allPassives, content.regions);
    const nameOf = (id: string) => content.spells[id]?.name ?? content.passives[id]!.name;
    type Box = { x0: number; x1: number; y0: number; y1: number };
    const label = (n: { id: string; x: number; y: number }): Box => {
      const w = [...nameOf(n.id)].length * FS, base = n.y + NODE_R + 12;
      return { x0: n.x - w / 2, x1: n.x + w / 2, y0: base - FS, y1: base + 2 };
    };
    const disc = (n: { x: number; y: number }): Box => ({ x0: n.x - NODE_R, x1: n.x + NODE_R, y0: n.y - NODE_R, y1: n.y + NODE_R });
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const clashes: string[] = [];
    for (const a of l.nodes) for (const b of l.nodes) {
      if (a.id === b.id) continue;
      if (a.id < b.id && hit(label(a), label(b))) clashes.push(`${nameOf(a.id)} / ${nameOf(b.id)} labels`);
      if (hit(label(a), disc(b))) clashes.push(`${nameOf(a.id)} label on ${nameOf(b.id)}`);
    }
    expect(clashes).toEqual([]);
  });
});

