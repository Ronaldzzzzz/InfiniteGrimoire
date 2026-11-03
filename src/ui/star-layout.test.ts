import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import type { Spell } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import { layoutPassives, layoutStars, MIN_STAR_DIST, SECTOR_ORDER, sectorAngle, starEdges, starPosition, visiblePassives } from './star-layout';

const spell = (id: string): Spell => resolveSpell(id, content)!;
/** Smallest angle between two directions, in degrees. */
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('starPosition', () => {
  it('puts a fire spell in the fire sector and a water spell in the water sector', () => {
    const fire = starPosition(spell('m:fire.2.----f.-----.bolt'));
    expect(gap(fire.angle, sectorAngle('fire'))).toBeLessThan(36);
    const water = starPosition(spell('m:water.6.aaaaa.-----.zone'));
    expect(gap(water.angle, sectorAngle('water'))).toBeLessThan(36);
  });

  it('a Lv.8 spell sits farther from the centre than a Lv.2 one', () => {
    expect(starPosition(spell('m:fire.8.fffff.---ff.ring')).radius).toBeGreaterThan(starPosition(spell('m:fire.2.----f.-----.bolt')).radius);
  });

  it('sectors follow the 相生 circle', () => {
    expect(SECTOR_ORDER).toEqual(['water', 'earth', 'fire', 'thunder', 'wind']);
    expect([sectorAngle('water'), sectorAngle('earth'), sectorAngle('fire'), sectorAngle('thunder'), sectorAngle('wind')]).toEqual([36, 108, 180, 252, 324]);
  });

  it('a 水＋風 spell sits between the water and wind sectors', () => {
    const s = spell('m:water.2.----w.-----.bolt');
    expect([...s.elements].sort()).toEqual(['water', 'wind']);
    expect(gap(starPosition(s).angle, 0)).toBeLessThanOrEqual(10 + 1e-9);
  });

  it('a 水＋火 spell (not neighbours) sits in the earth sector between them', () => {
    const s = spell('m:water.2.----f.-----.bolt');
    expect([...s.elements].sort()).toEqual(['fire', 'water']);
    expect(gap(starPosition(s).angle, 108)).toBeLessThan(36);
  });

  it('a 火＋土 spell sits between the fire and earth sectors', () => {
    const s = spell('m:fire.4.--eef.-----.meteor');
    expect([...s.elements].sort()).toEqual(['earth', 'fire']);
    const { angle } = starPosition(s);
    const span = gap(sectorAngle('fire'), sectorAngle('earth'));
    expect(gap(angle, sectorAngle('fire'))).toBeLessThan(span);
    expect(gap(angle, sectorAngle('earth'))).toBeLessThan(span);
  });

  it('is deterministic', () => {
    expect(starPosition(spell('m:fire.2.----f.-----.bolt'))).toEqual(starPosition(spell('m:fire.2.----f.-----.bolt')));
  });

  it('a spell with no element (魔力彈) sits at the centre', () => {
    expect(starPosition(spell('mana_bolt')).radius).toBe(0);
  });
});

describe('layoutStars', () => {
  // every named spell plus a crowd of generated Lv.2 fire circles in one sector
  const forms = ['bolt', 'blades', 'ring', 'chain'];
  const crowd = ['f', 'w', 't', 'e', 'a'].flatMap((x) => forms.map((f) => `m:fire.2.----${x}.-----.${f}`));
  const ids = [...Object.keys(content.spells), ...crowd].filter((id) => resolveSpell(id, content));
  const spells = ids.map(spell);
  const passives = layoutPassives(visiblePassives(content));

  it('no two stars (or a star and a passive) are closer than the minimum', () => {
    const stars = layoutStars(spells, [...passives.values()]);
    const pts = [...stars.values(), ...passives.values()];
    expect(stars.size).toBe(spells.length);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThanOrEqual(MIN_STAR_DIST - 1e-6);
      }
    }
  });

  it('a newly learned spell does not move the stars already drawn', () => {
    const before = layoutStars(spells.slice(0, -1));
    const after = layoutStars(spells);
    for (const [id, p] of before) expect(after.get(id)).toEqual(p);
  });
});

describe('starEdges', () => {
  it('links spells that share a node element on the same ring, and only those', () => {
    const a = 'm:fire.2.----f.-----.bolt'; // ring 1: 火
    const b = 'm:fire.4.--fff.-----.bolt'; // ring 1: 火
    const c = 'm:water.2.----a.-----.ring'; // ring 1: 水
    const d = 'm:water.10.aaaaa.-ffff.zone'; // ring 1: 水, ring 2: 火 — not the same ring as a's 火
    const key = (e: [string, string]) => [...e].sort().join('|');
    const edges = starEdges([a, b, c, d, 'mana_bolt'], content).map(key);
    expect(edges.sort()).toEqual([key([a, b]), key([c, d])].sort());
  });

  it('a named or rare spell id uses its own circle', () => {
    const edges = starEdges(['fireball', 'm:fire.4.--fff.-----.bolt', 'worldfire', 'm:fire.8.fffff.---ff.ring'], content);
    expect(edges).toContainEqual(['fireball', 'm:fire.4.--fff.-----.bolt']);
    // worldfire (ring 2 火) and the Lv.8 circle (ring 2 火) share ring 2 as well as ring 1
    expect(edges).toContainEqual(['worldfire', 'm:fire.8.fffff.---ff.ring']);
  });
});

describe('passives on the star map', () => {
  it('hides passives whose only bonus is the retired depth cap', () => {
    const ids = visiblePassives(content).map((p) => p.id);
    expect(ids).not.toContain('deep_insight');
    expect(ids).not.toContain('abyss_insight');
    expect(ids).toContain('ember_affinity');
  });

  it('sit near the centre, inside the Lv.1 ring', () => {
    const lv1 = starPosition(spell('m:fire.1.-----.-----.bolt')).radius;
    for (const p of layoutPassives(visiblePassives(content)).values()) expect(Math.hypot(p.x, p.y)).toBeLessThan(lv1);
  });
});
