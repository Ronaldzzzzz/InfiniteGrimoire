import { describe, expect, it } from 'vitest';
import { ContentError, LIGHT_DARK_SPELLS, NAMED_DEPTH, content, loadContent } from './content';
import spells from '../data/content/spells.json';
import monsters from '../data/content/monsters.json';
import zones from '../data/content/zones.json';
import materials from '../data/content/materials.json';
import keyItems from '../data/content/key-items.json';
import passives from '../data/content/passives.json';
import regions from '../data/content/regions.json';
import { stageTotal } from './stages';
import { parseCanonical } from './circle';
import { ELEMENT_ORDER } from './types';
import baseline from './content-baseline.json';

const base = () => structuredClone({ spells, monsters, zones, materials, keyItems, passives, regions }) as Record<string, any>;

function issuesOf(raw: Record<string, any>): string {
  try {
    loadContent(raw as never);
  } catch (e) {
    expect(e).toBeInstanceOf(ContentError);
    return (e as ContentError).issues.join('\n');
  }
  throw new Error('expected loadContent to throw');
}

describe('content', () => {
  it('loads the shipped content', () => {
    expect(content.spells.mana_bolt).toBeDefined();
    expect(content.spells.mana_overload).toBeDefined();
    for (const e of ['fire', 'wind', 'thunder', 'earth', 'water'] as const) expect(content.baseSpells[e]).toBeDefined();
    expect(content.zones[0]!.id).toBe('mist_meadow');
  });

  it('accepts the unmodified fixture', () => {
    expect(() => loadContent(base() as never)).not.toThrow();
  });

  it('every zone has 10 stages, each with at least one wave of 1+ foes', () => {
    for (const z of content.zones) {
      expect(z.stages).toHaveLength(10);
      for (const st of z.stages) {
        expect(st.waves.length).toBeGreaterThan(0);
        for (const n of st.waves) expect(n).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('ordinary stages ramp up', () => {
    for (const z of content.zones) {
      for (let s = 2; s <= 9; s++) expect(stageTotal(z, s), `${z.id} stage ${s}`).toBeGreaterThan(stageTotal(z, s - 1));
      const w9 = z.stages[8]!.waves.length, w10 = z.stages[9]!.waves.length;
      expect(w10, z.id).toBeGreaterThanOrEqual(0.25 * w9);
      expect(w10, z.id).toBeLessThanOrEqual(0.45 * w9);
    }
  });

  it('rejects a stage without waves', () => {
    const raw = base();
    raw.zones[0].stages[0].waves = [];
    expect(issuesOf(raw)).toContain('waves');
  });

  it('rejects duplicate ids', () => {
    const raw = base();
    raw.spells.push(structuredClone(raw.spells[0]));
    expect(issuesOf(raw)).toContain('duplicate id "mana_bolt"');
  });

  it('rejects duplicate or missing baseOf', () => {
    const raw = base();
    raw.spells.find((s: any) => s.id === 'wind_blade').baseOf = 'fire';
    const text = issuesOf(raw);
    expect(text).toContain('baseOf');
    expect(text).toContain('duplicate');
    expect(text).toContain('wind');
  });

  it('rejects a node in an unknown region', () => {
    const raw = base();
    raw.spells[2].node.region = 'void';
    expect(issuesOf(raw)).toContain('unknown region "void"');
  });

  it('rejects a key item revealing an unknown region', () => {
    const raw = base();
    raw.keyItems[0].reveals = 'void';
    expect(issuesOf(raw)).toContain('reveals unknown region "void"');
  });

  it('rejects a passive unlock that references an unknown item', () => {
    const raw = base();
    raw.passives[0].unlock = { kind: 'items', items: { 'mat:ghost': 1 } };
    expect(issuesOf(raw)).toContain('unknown item "mat:ghost"');
  });

  it('rejects a zone with an unknown monster', () => {
    const raw = base();
    raw.zones[0].monsters.push('ghost');
    expect(issuesOf(raw)).toContain('unknown monster "ghost"');
  });

  it('rejects a boss that is not flagged boss', () => {
    const raw = base();
    raw.monsters.find((m: any) => m.id === 'mist_stag').boss = false;
    expect(issuesOf(raw)).toContain('not flagged boss');
  });

  it('rejects a drop chance outside 0..1 and max < min', () => {
    const raw = base();
    raw.monsters[0].drops[0].chance = 1.5;
    expect(issuesOf(raw)).toContain('chance');
    const raw2 = base();
    raw2.monsters[0].drops[0].min = 3;
    raw2.monsters[0].drops[0].max = 1;
    expect(issuesOf(raw2)).toContain('max < min');
  });

  it('rejects a material nothing drops', () => {
    const raw = base();
    for (const m of raw.monsters) m.drops = m.drops.filter((d: any) => d.itemId !== 'mat:ember_core');
    expect(issuesOf(raw)).toContain('"mat:ember_core" is never dropped');
  });

  it('requires mana_bolt and mana_overload', () => {
    const raw = base();
    raw.spells = raw.spells.filter((s: any) => s.id !== 'mana_overload' && s.id !== 'mana_bolt');
    const text = issuesOf(raw);
    expect(text).toContain('mana_overload');
    expect(text).toContain('mana_bolt');
  });

  it('rejects named spell ids that are not snake_case', () => {
    const raw = base();
    raw.spells[2].id = 'Fire-ball';
    expect(issuesOf(raw)).toContain('Fire-ball');
  });
});

describe('effect status', () => {
  it('lets water_wave apply both slow and wet', () => {
    const fx = content.spells.water_wave!.effects[0]!;
    expect(fx.kind).toBe('ring');
    const kinds = ((fx as { status?: { kind: string }[] }).status ?? []).map((s) => s.kind);
    expect(kinds).toContain('slow');
    expect(kinds).toContain('wet');
  });

  it('rejects a non-array status', () => {
    const raw = base();
    raw.spells.find((s: any) => s.id === 'fireball').effects[0].status = { kind: 'burn', ms: 1000 };
    expect(issuesOf(raw)).toContain('fireball');
  });
});

describe('shipped content set', () => {
  const spellsOf = Object.values(content.spells);
  const hidden = new Set(content.regions.filter((r) => !r.initiallyVisible).map((r) => r.id));
  const zoneMonsters = (z: (typeof content.zones)[number]) => [...z.monsters, z.bossId];
  const topTier = Math.max(...Object.values(content.monsters).map((m) => m.tier));

  it('each boss but the last drops a key item that reveals a different region', () => {
    const revealed = content.zones.slice(0, -1).map((z) => {
      const boss = content.monsters[z.bossId]!;
      const key = boss.drops.find((d) => d.itemId.startsWith('key:') && d.chance === 1 && d.min >= 1);
      expect(key, z.bossId).toBeDefined();
      return content.keyItems[key!.itemId]!.reveals;
    });
    expect(new Set(revealed).size).toBe(content.zones.length - 1);
    for (const r of revealed) expect(hidden.has(r), r).toBe(true);
  });

  it('materials and key items are all dropped somewhere', () => {
    const inZones = new Set(content.zones.flatMap(zoneMonsters));
    const dropped = new Set(Object.values(content.monsters).filter((m) => inZones.has(m.id)).flatMap((m) => m.drops.map((d) => d.itemId)));
    for (const id of [...Object.keys(content.materials), ...Object.keys(content.keyItems)]) expect(dropped.has(id), id).toBe(true);
    for (const z of content.zones) {
      const mats = new Set(z.monsters.flatMap((m) => content.monsters[m]!.drops.map((d) => d.itemId)).filter((i) => i.startsWith('mat:')));
      expect(mats.size, z.id).toBeGreaterThanOrEqual(2);
    }
    for (const m of Object.values(content.materials)) expect(m.elements.length, m.id).toBeGreaterThan(0);
  });

  it('counts meet the minimums', () => {
    const by = (f: (s: (typeof spellsOf)[number]) => boolean) => spellsOf.filter(f).length;
    expect(by((s) => s.affinity === 'base' && s.elements.length === 1)).toBe(5);
    expect(by((s) => s.affinity === 'self' && s.tier === 3)).toBe(5);
    expect(by((s) => s.elements.length === 2 && s.depth === 1)).toBe(10);
    expect(by((s) => s.elements.length >= 2 && s.depth >= 2 && !s.rare)).toBeGreaterThanOrEqual(6);
    expect(Object.keys(content.materials).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(content.keyItems).length).toBeGreaterThanOrEqual(3);
    const passives = Object.values(content.passives);
    expect(passives.length).toBeGreaterThanOrEqual(6);
    expect(passives.filter((p) => p.bonus.kind === 'depth' && p.bonus.add === 1).length).toBeGreaterThanOrEqual(2);
    expect(passives.some((p) => p.unlock.kind === 'boss')).toBe(true);
    expect(passives.some((p) => p.unlock.kind === 'learned')).toBe(true);
    expect(content.regions.length).toBeGreaterThanOrEqual(4);
    expect(content.regions.filter((r) => r.initiallyVisible).map((r) => r.id)).toEqual(['core']);
    expect(content.zones.length).toBe(6);
    const bands = content.zones.map((z) => z.monsters.map((m) => content.monsters[m]!.tier));
    [[1, 2], [3, 4], [5, 6], [7, 8], [8, 9], [9, 10]].forEach(([lo, hi], i) => {
      expect(Math.min(...bands[i]!), content.zones[i]!.id).toBe(lo);
      expect(Math.max(...bands[i]!), content.zones[i]!.id).toBe(hi);
    });
    // each zone leans to its own element: the most common monster element differs from the previous zone's
    // (six zones, five elements: the two ends cannot all differ)
    const lean = content.zones.map((z) => {
      const n: Record<string, number> = {};
      for (const m of z.monsters) n[content.monsters[m]!.element] = (n[content.monsters[m]!.element] ?? 0) + 1;
      return Object.entries(n).sort((a, b) => b[1] - a[1])[0]![0];
    });
    lean.forEach((e, i) => { if (i > 0) expect(e, lean.join(',')).not.toBe(lean[i - 1]); });
    expect(new Set(lean.slice(0, 5)).size, lean.join(',')).toBe(5);
  });

  it('every named spell is readable and placed', () => {
    const at = new Set<string>();
    for (const s of spellsOf) {
      for (const w of [s.words.pre, s.words.noun, s.hint, s.name]) expect(w.trim().length, s.id).toBeGreaterThan(0);
      if (s.id === 'mana_overload') { expect(s.node).toBeNull(); continue; }
      expect(s.node, s.id).not.toBeNull();
      const key = `${s.node!.tree ?? 'elements'}${s.node!.side ?? ''}:${s.node!.region}:${s.node!.ring}:${((s.node!.angle % 360) + 360) % 360}`;
      expect(at.has(key), `${s.id} shares ${key}`).toBe(false);
      at.add(key);
    }
    for (const p of Object.values(content.passives)) {
      const key = `elements:${p.node.region}:${p.node.ring}:${((p.node.angle % 360) + 360) % 360}`;
      expect(at.has(key), `${p.id} shares ${key}`).toBe(false);
      at.add(key);
    }
  });
});

describe('map expansion', () => {
  const zs = content.zones;
  const normals = (z: (typeof zs)[number]) => z.monsters.map((m) => content.monsters[m]!);
  const boss = (z: (typeof zs)[number]) => content.monsters[z.bossId]!;
  const rows = (m: { drops: { itemId: string; chance: number }[] }, prefix: string) => m.drops.filter((d) => d.itemId.startsWith(prefix));

  it('has six zones with non-decreasing boss tiers and the two new ones in order', () => {
    expect(zs.map((z) => z.id)).toEqual(['mist_meadow', 'thunder_gorge', 'ember_wastes', 'sunken_temple', 'starfall_plateau', 'worlds_end']);
    for (let i = 1; i < zs.length; i++) expect(boss(zs[i]!).tier).toBeGreaterThanOrEqual(boss(zs[i - 1]!).tier);
  });

  it('every boss is at least as strong as its zone\'s regular monsters', () => {
    for (const z of zs) expect(boss(z).tier, z.id).toBeGreaterThanOrEqual(Math.max(...normals(z).map((m) => m.tier)));
  });

  it('rejects a boss weaker than the zone\'s regular monsters', () => {
    const raw = base();
    raw.monsters.find((m: any) => m.id === 'fallen_star_wyrm').tier = 5;
    expect(issuesOf(raw)).toContain('weaker than');
  });

  it('every pure element drops in every zone (R12)', () => {
    for (const z of zs) {
      for (const e of ELEMENT_ORDER) {
        expect(normals(z).some((m) => m.drops.some((d) => d.itemId.startsWith(`el:${e}:`))), `${z.id} ${e}`).toBe(true);
      }
    }
  });

  it('Basic and Intermediate elements never drop less in a later zone, so no one walks back to farm empower costs', () => {
    // per element: the lowest chance among a zone's regular monsters (0 when one does not drop it)
    const floor = (z: (typeof zs)[number], id: string) =>
      Math.min(...normals(z).map((m) => m.drops.find((d) => d.itemId === id)?.chance ?? 0));
    for (const grade of [1, 2]) {
      for (const e of ELEMENT_ORDER) {
        for (let i = 1; i < zs.length; i++) {
          const id = `el:${e}:${grade}`;
          expect(floor(zs[i]!, id), `${zs[i]!.id} ${id}`).toBeGreaterThanOrEqual(floor(zs[i - 1]!, id));
        }
      }
    }
    // the late zones carry the empower floor (spec section 10)
    for (const z of zs.slice(3)) expect(floor(z, 'el:fire:1'), z.id).toBe(0.05);
    for (const z of zs.slice(4)) expect(floor(z, 'el:fire:2'), z.id).toBe(0.05);
  });

  it('the new monsters have the specified elements and tiers', () => {
    const want: Record<string, [string, number]> = {
      meteor_golem: ['earth', 8], frost_griffin: ['wind', 9], astral_ray: ['water', 9], fallen_star_wyrm: ['fire', 9],
      ash_giant: ['fire', 9], chaos_wisp: ['thunder', 10], doom_knight: ['earth', 10], first_page_warden: ['wind', 10],
    };
    for (const [id, [el, tier]] of Object.entries(want)) {
      expect(content.monsters[id]!.element, id).toBe(el);
      expect(content.monsters[id]!.tier, id).toBe(tier);
    }
  });

  it('Divine elements come from upgrading Extreme ones (the Starfall boss drops Extreme only); World\'s End regulars drop them', () => {
    const star = zs[4]!;
    for (const e of ELEMENT_ORDER) {
      expect(boss(star).drops.some((x) => x.itemId === `el:${e}:5`), e).toBe(false);
      expect(rows(boss(star), 'el:').some((x) => x.itemId === `el:${e}:4` && x.chance > 0 && x.chance < 1), e).toBe(true);
      expect(normals(zs[5]!).some((m) => m.drops.some((x) => x.itemId === `el:${e}:5`)), e).toBe(true);
    }
  });

  it('the two new zones drop all seven rare materials, 2-3 per regular monster at 1-2%', () => {
    const rareMats = new Set(['mat:ember_core', 'mat:roc_feather', 'mat:fulgurite', 'mat:lava_stone', 'mat:tide_scale', 'mat:sun_shard', 'mat:abyss_pearl']);
    expect(rareMats.size).toBe(7);
    const seen = new Set<string>();
    for (const z of [zs[4]!, zs[5]!]) {
      for (const m of normals(z)) {
        const mats = rows(m, 'mat:');
        expect(mats.length, m.id).toBeGreaterThanOrEqual(2);
        expect(mats.length, m.id).toBeLessThanOrEqual(3);
        for (const d of mats) {
          expect(rareMats.has(d.itemId), d.itemId).toBe(true);
          expect(d.chance, m.id).toBeGreaterThanOrEqual(0.01);
          expect(d.chance, m.id).toBeLessThanOrEqual(0.02);
          seen.add(d.itemId);
        }
      }
    }
    expect(seen).toEqual(rareMats);
  });

  it('the Star Sigil opens the astral region and only the Starfall boss drops it; the last boss drops no key', () => {
    expect(content.keyItems['key:star_sigil']!.reveals).toBe('astral');
    const holders = Object.values(content.monsters).filter((m) => m.drops.some((d) => d.itemId === 'key:star_sigil')).map((m) => m.id);
    expect(holders).toEqual(['fallen_star_wyrm']);
    expect(boss(zs[4]!).drops.find((d) => d.itemId === 'key:star_sigil')!.chance).toBe(1);
    expect(boss(zs[5]!).drops.some((d) => d.itemId.startsWith('key:'))).toBe(false);
  });

  it('astral attunement sits on the astral ring and unlocks with the Starfall boss', () => {
    const p = content.passives.astral_attunement!;
    expect(p.node.region).toBe('astral');
    expect(p.node.ring).toBe(9);
    expect(p.bonus).toEqual({ kind: 'damage', element: null, pct: 5 });
    expect(p.unlock).toEqual({ kind: 'boss', bossId: 'fallen_star_wyrm' });
  });

  it('a Lv.N monster is hurt by Lv.N-1 spells but not Lv.N-2 spells of attack 90 or less', () => {
    for (const id of ['meteor_golem', 'frost_griffin', 'astral_ray', 'fallen_star_wyrm', 'ash_giant', 'chaos_wisp', 'doom_knight', 'first_page_warden']) {
      const m = content.monsters[id]!;
      expect(m.defense * 0.7, id).toBeGreaterThan(90);
    }
  });
});

describe('rare spells', () => {
  const NEW = ['worldfire', 'heavens_breath', 'ninefold_thunder', 'titans_grip', 'moontide', 'holy_judgment', 'abyss_devour'];

  it('has the seven rare spells, each rolled from its own Lv.10 circle', () => {
    const rares = Object.values(content.spells).filter((s) => s.rare);
    expect(rares.map((s) => s.id).sort()).toEqual(
      ['abyss_devour', 'heavens_breath', 'holy_judgment', 'moontide', 'ninefold_thunder', 'titans_grip', 'worldfire'],
    );
    for (const [id, lv9, mat] of [
      ['worldfire', 'corona_scorch', 'mat:ember_core'], ['heavens_breath', 'void_gale', 'mat:roc_feather'],
      ['ninefold_thunder', 'astral_fulmination', 'mat:fulgurite'], ['titans_grip', 'continental_crush', 'mat:lava_stone'],
      ['moontide', 'nether_tides', 'mat:tide_scale'], ['holy_judgment', 'astral_fulmination', 'mat:sun_shard'],
      ['abyss_devour', 'nether_tides', 'mat:abyss_pearl'],
    ] as const) {
      const s = content.spells[id]!;
      expect(s, id).toMatchObject({ tier: 10, school: 'forbidden', named: true, rare: true, prerequisites: [lv9] });
      expect(content.spells[lv9]!.tier, lv9).toBe(9);
      void mat;
      const c = parseCanonical(s.circle!);
      expect(c, id).not.toBeNull();
      expect(c!.tier, id).toBe(10);
      expect(s.elements, id).toContain(c!.core);
    }
  });

  it('has exactly one pure non-rare spell per element for each of Lv.2-9', () => {
    for (const e of ELEMENT_ORDER) {
      const tiers = Object.values(content.spells).filter((s) => !s.rare && s.elements.length === 1 && s.elements[0] === e).map((s) => s.tier).sort((a, b) => a - b);
      expect(tiers, e).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('has 67 named spells with the roster per tier', () => {
    const named = Object.values(content.spells).filter((s) => s.named);
    const per = (t: number) => named.filter((s) => s.tier === t).length;
    expect(named.length).toBe(67);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(per)).toEqual([2, 5, 5, 15, 11, 6, 6, 5, 5, 7]);
  });

  it('rejects a missing tier in a pure element chain', () => {
    const raw = base();
    raw.spells.find((s: any) => s.id === 'crimson_pillar').tier = 5;
    expect(issuesOf(raw)).toContain('pure fire');
  });

  it('rejects a rare spell without its circle', () => {
    const raw = base();
    delete raw.spells.find((s: any) => s.id === 'worldfire').circle;
    expect(issuesOf(raw)).toContain('rare spell worldfire: needs the Lv.10 circle');
  });

  it('existing spells are unchanged', () => {
    for (const s of Object.values(content.spells)) {
      if (NEW.includes(s.id) || s.rare || !(s.id in baseline.spells)) continue;
      expect([s.tier, s.attack, s.cooldownMs, s.depth].join('|'), s.id).toBe((baseline.spells as Record<string, string>)[s.id]);
    }
    expect(Object.keys(baseline.spells).every((id) => id in content.spells)).toBe(true);
  });
});

describe('spell schools, chants and the tree layout', () => {
  const spell = (raw: Record<string, any>, id: string) => raw.spells.find((s: any) => s.id === id);

  it('requires a school, forbidden exactly for rares', () => {
    const raw = base();
    delete spell(raw, 'fireball').school;
    expect(issuesOf(raw)).toContain('fireball');
    const r2 = base();
    spell(r2, 'worldfire').school = 'cataclysm';
    expect(issuesOf(r2)).toContain('spell worldfire: rare spells must have school forbidden');
    const r3 = base();
    spell(r3, 'fireball').school = 'forbidden';
    expect(issuesOf(r3)).toContain('spell fireball: only rare spells may have school forbidden');
  });

  it('requires a chant for tier 7+ and for rares', () => {
    const raw = base();
    delete spell(raw, 'sunfall').chant;
    expect(issuesOf(raw)).toContain('spell sunfall: tier 7+ and rare spells need a chant');
    const r2 = base();
    delete spell(r2, 'worldfire').chant;
    expect(issuesOf(r2)).toContain('spell worldfire: tier 7+ and rare spells need a chant');
  });

  it('keeps tier 10 for rares only', () => {
    const raw = base();
    spell(raw, 'fireball').tier = 10;
    expect(issuesOf(raw)).toContain('spell fireball: non-rare spells must be tier 1-9');
    const r2 = base();
    spell(r2, 'worldfire').tier = 9;
    expect(issuesOf(r2)).toContain('spell worldfire: rare spells must be tier 10');
  });

  it('checks depth against the tier', () => {
    expect(NAMED_DEPTH(2)).toBe(0);
    expect(NAMED_DEPTH(4)).toBe(1);
    expect(NAMED_DEPTH(6)).toBe(2);
    expect(NAMED_DEPTH(10)).toBe(3);
    const raw = base();
    spell(raw, 'inferno').depth = 3;
    expect(issuesOf(raw)).toContain('spell inferno: depth 3 does not match tier 5 (expected 2)');
  });

  it('rejects repeated words.pre or words.noun', () => {
    const raw = base();
    spell(raw, 'inferno').words.pre = spell(raw, 'fireball').words.pre;
    expect(issuesOf(raw)).toContain('duplicate words.pre');
    const r2 = base();
    spell(r2, 'inferno').words.noun = spell(r2, 'fireball').words.noun;
    expect(issuesOf(r2)).toContain('duplicate words.noun');
  });

  it('keeps the light/dark tree for exactly the two light/dark spells', () => {
    expect([...LIGHT_DARK_SPELLS]).toEqual(['holy_judgment', 'abyss_devour']);
    const raw = base();
    delete spell(raw, 'holy_judgment').node.tree;
    expect(issuesOf(raw)).toContain('spell holy_judgment: light/dark spells need node.tree "lightdark" and a side');
    const r2 = base();
    delete spell(r2, 'abyss_devour').node.side;
    expect(issuesOf(r2)).toContain('spell abyss_devour');
    const r3 = base();
    spell(r3, 'fireball').node.tree = 'lightdark';
    spell(r3, 'fireball').node.side = 'light';
    expect(issuesOf(r3)).toContain('spell fireball: only light/dark spells may use the lightdark tree');
    const r4 = base();
    r4.passives[0].node.tree = 'lightdark';
    expect(issuesOf(r4)).toContain('passive');
  });

  it('places every named spell on ring tier - 1, in the region of its tier', () => {
    const regionOf = (t: number) => (t <= 4 ? 'core' : t <= 6 ? 'outer' : t === 7 ? 'rift' : t === 8 ? 'abyss' : t === 9 ? 'zenith' : 'astral');
    for (const s of Object.values(content.spells)) {
      if (!s.node) continue;
      expect(s.node.ring, s.id).toBe(s.tier - 1);
      expect(s.node.region, s.id).toBe(regionOf(s.tier));
    }
    expect(content.spells.holy_judgment!.node).toEqual({ region: 'astral', ring: 9, angle: 0, tree: 'lightdark', side: 'light' });
    expect(content.spells.abyss_devour!.node).toEqual({ region: 'astral', ring: 9, angle: 0, tree: 'lightdark', side: 'dark' });
    const astral = content.regions.find((r) => r.id === 'astral')!;
    expect(astral).toMatchObject({ order: 6, initiallyVisible: false, name: '星界', nameEn: 'Astral Sea' });
  });

  it('puts passives on a ring inside their own region', () => {
    const rings: Record<string, number[]> = { outer: [4, 5], rift: [6], abyss: [7], zenith: [8], astral: [9] };
    for (const p of Object.values(content.passives)) expect(rings[p.node.region], p.id).toContain(p.node.ring);
  });

  it('renames the 11 spells', () => {
    const names: Record<string, string> = {
      water_wave: '湧泉之環', tailwind: '翠風祝禱', earthquake: '地脈震盪', mire: '腐殖泥潭', sandstorm: '黃昏沙暴',
      steam: '沸霧逆流', grounding: '地脈噬雷', rain_cloud: '劫雷積雲', thunder_tsunami: '狂雷怒濤',
      quicksand: '噬骨流沙', thunder_fire_hurricane: '雷火狂嵐',
    };
    for (const [id, n] of Object.entries(names)) expect(content.spells[id]!.name, id).toBe(n);
  });
});
