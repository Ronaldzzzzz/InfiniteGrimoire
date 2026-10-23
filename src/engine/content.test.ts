import { describe, expect, it } from 'vitest';
import { ContentError, content, loadContent } from './content';
import spells from '../data/content/spells.json';
import recipes from '../data/content/recipes.json';
import monsters from '../data/content/monsters.json';
import zones from '../data/content/zones.json';
import materials from '../data/content/materials.json';
import keyItems from '../data/content/key-items.json';
import passives from '../data/content/passives.json';
import regions from '../data/content/regions.json';
import { craftedId, inputToken, resolveSpell } from './spells';
import { ELEMENT_ORDER } from './types';
import baseline from './content-baseline.json';

const base = () => structuredClone({ spells, recipes, monsters, zones, materials, keyItems, passives, regions }) as Record<string, any>;

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

  it('rejects duplicate ids', () => {
    const raw = base();
    raw.spells.push(structuredClone(raw.spells[0]));
    expect(issuesOf(raw)).toContain('duplicate id "mana_bolt"');
  });

  it('rejects a recipe input that does not exist', () => {
    const raw = base();
    raw.recipes[0].inputs = ['nope', 'el:fire:1'];
    expect(issuesOf(raw)).toContain('unknown input "nope"');
    raw.recipes[0].inputs = ['mat:ghost', 'el:fire:1'];
    expect(issuesOf(raw)).toContain('unknown input "mat:ghost"');
  });

  it('rejects a recipe outcome that does not exist', () => {
    const raw = base();
    raw.recipes[0].outcomes = [{ spellId: 'nope', weight: 1 }];
    expect(issuesOf(raw)).toContain('unknown outcome spell "nope"');
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
    raw.recipes = [];
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
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const recipesFor = (inputs: [string, string]) =>
    content.recipes.filter((r) => sameSet([...r.inputs].sort(), [...inputs].sort()));
  const zoneMonsters = (z: (typeof content.zones)[number]) => [...z.monsters, z.bossId];
  const topTier = Math.max(...Object.values(content.monsters).map((m) => m.tier));

  it('every element pair has a named spell', () => {
    for (const [i, x] of ELEMENT_ORDER.entries()) {
      for (const y of ELEMENT_ORDER.slice(i)) {
        const candidates = [
          ...recipesFor([`el:${x}:1`, `el:${y}:1`]),
          ...(x === y ? [] : recipesFor([content.baseSpells[x], content.baseSpells[y]])),
        ];
        const named = candidates.flatMap((r) => r.outcomes.map((o) => o.spellId)).filter((s): s is string => !!s);
        const want = x === y ? [x] : [x, y];
        expect(named.some((id) => sameSet(content.spells[id]!.elements, want)), `${x}+${y}`).toBe(true);
      }
    }
  });

  it('each element has a pure line to the top tier', () => {
    for (const e of ELEMENT_ORDER) {
      const line = [content.baseSpells[e]];
      for (;;) {
        const cur = line[line.length - 1]!;
        const next = content.recipes.find((r) =>
          r.inputs.includes(cur) && r.inputs.some((i) => i.startsWith(`el:${e}:`)) && r.outcomes.length === 1 &&
          r.outcomes[0]!.spellId !== null && sameSet(content.spells[r.outcomes[0]!.spellId]!.elements, [e]));
        if (!next) break;
        line.push(next.outcomes[0]!.spellId!);
      }
      expect(line.length, `${e}: ${line.join(' > ')}`).toBeGreaterThanOrEqual(4);
      const spells = line.map((id) => content.spells[id]!);
      spells.forEach((s, d) => expect(s.depth, s.id).toBe(d));
      for (const s of spells.slice(2)) {
        expect(s.tier, s.id).toBeGreaterThanOrEqual(5);
        expect(s.tier, s.id).toBeLessThanOrEqual(8);
      }
      // the end of the line can hurt every monster by tier alone
      expect(spells[spells.length - 1]!.tier, e).toBeGreaterThanOrEqual(topTier - 1);
    }
  });

  it('at least two named spells sit in hidden regions', () => {
    // ... and can be made from core spells or items, so random experiments can stumble on them before the fog lifts
    const core = (id: string) => /^(el|mat):/.test(id) || (!!content.spells[id]?.node && !hidden.has(content.spells[id]!.node!.region));
    const stumble = spellsOf.filter((s) => s.node && hidden.has(s.node.region) &&
      content.recipes.some((r) => r.outcomes.some((o) => o.spellId === s.id) && r.inputs.every(core)));
    expect(stumble.length, stumble.map((s) => s.id).join(',')).toBeGreaterThanOrEqual(2);
  });

  it('each boss drops a key item that reveals a different region', () => {
    const revealed = content.zones.map((z) => {
      const boss = content.monsters[z.bossId]!;
      const key = boss.drops.find((d) => d.itemId.startsWith('key:') && d.chance === 1 && d.min >= 1);
      expect(key, z.bossId).toBeDefined();
      return content.keyItems[key!.itemId]!.reveals;
    });
    expect(new Set(revealed).size).toBe(content.zones.length);
    for (const r of revealed) expect(hidden.has(r), r).toBe(true);
  });

  it('random recipes succeed at most 10% and fall through to crafted', () => {
    const random = content.recipes.filter((r) => r.outcomes.length > 1);
    expect(random.length).toBeGreaterThanOrEqual(2);
    for (const r of random) {
      const total = r.outcomes.reduce((n, o) => n + o.weight, 0);
      const named = r.outcomes.filter((o) => o.spellId !== null).reduce((n, o) => n + o.weight, 0);
      expect(r.outcomes.some((o) => o.spellId === null), r.id).toBe(true);
      expect(named / total, r.id).toBeLessThanOrEqual(0.1);
      const [a, b] = r.inputs.map((i) => inputToken(i, content));
      expect(resolveSpell(craftedId(a!, b!), content), r.id).not.toBeNull();
    }
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
    expect(by((s) => s.affinity === 'self' && s.depth === 1)).toBe(5);
    expect(by((s) => s.elements.length === 2 && s.depth === 1)).toBe(10);
    expect(by((s) => s.elements.length >= 2 && s.depth >= 2 && !content.recipes.some((r) => r.outcomes.length > 1 && r.outcomes.some((o) => o.spellId === s.id)))).toBeGreaterThanOrEqual(6);
    expect(Object.keys(content.materials).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(content.keyItems).length).toBeGreaterThanOrEqual(3);
    const passives = Object.values(content.passives);
    expect(passives.length).toBeGreaterThanOrEqual(6);
    expect(passives.filter((p) => p.bonus.kind === 'depth' && p.bonus.add === 1).length).toBeGreaterThanOrEqual(2);
    expect(passives.some((p) => p.unlock.kind === 'boss')).toBe(true);
    expect(passives.some((p) => p.unlock.kind === 'learned')).toBe(true);
    expect(content.regions.length).toBeGreaterThanOrEqual(4);
    expect(content.regions.filter((r) => r.initiallyVisible).map((r) => r.id)).toEqual(['core']);
    expect(content.zones.length).toBeGreaterThanOrEqual(4);
    const bands = content.zones.map((z) => z.monsters.map((m) => content.monsters[m]!.tier));
    [[1, 2], [3, 4], [5, 6], [7, 8]].forEach(([lo, hi], i) => {
      expect(Math.min(...bands[i]!), content.zones[i]!.id).toBe(lo);
      expect(Math.max(...bands[i]!), content.zones[i]!.id).toBe(hi);
    });
    // each zone leans to its own element: the most common monster element differs per zone
    const lean = content.zones.map((z) => {
      const n: Record<string, number> = {};
      for (const m of z.monsters) n[content.monsters[m]!.element] = (n[content.monsters[m]!.element] ?? 0) + 1;
      return Object.entries(n).sort((a, b) => b[1] - a[1])[0]![0];
    });
    expect(new Set(lean).size, lean.join(',')).toBe(content.zones.length);
  });

  it('every named spell is readable and placed', () => {
    const at = new Set<string>();
    for (const s of spellsOf) {
      for (const w of [s.words.pre, s.words.noun, s.hint, s.name]) expect(w.trim().length, s.id).toBeGreaterThan(0);
      if (s.id === 'mana_overload') { expect(s.node).toBeNull(); continue; }
      expect(s.node, s.id).not.toBeNull();
      const key = `${s.node!.region}:${s.node!.ring}:${((s.node!.angle % 360) + 360) % 360}`;
      expect(at.has(key), `${s.id} shares ${key}`).toBe(false);
      at.add(key);
    }
    for (const p of Object.values(content.passives)) {
      const key = `${p.node.region}:${p.node.ring}:${((p.node.angle % 360) + 360) % 360}`;
      expect(at.has(key), `${p.id} shares ${key}`).toBe(false);
      at.add(key);
    }
  });
});

describe('rare spells', () => {
  const NEW = ['worldfire', 'heavens_breath', 'ninefold_thunder', 'titans_grip', 'moontide'];

  it('has one rare spell per element, each only from a random recipe that needs a 高階 element', () => {
    const rares = Object.values(content.spells).filter((s) => s.rare);
    expect(rares.map((s) => s.id).sort()).toEqual(
      ['abyss_devour', 'heavens_breath', 'holy_judgment', 'moontide', 'ninefold_thunder', 'titans_grip', 'worldfire'],
    );
    for (const [id, el, baseSpell] of [
      ['worldfire', 'fire', 'inferno'], ['heavens_breath', 'wind', 'vacuum_blades'], ['ninefold_thunder', 'thunder', 'myriad_thunder'],
      ['titans_grip', 'earth', 'landslide'], ['moontide', 'water', 'maelstrom'],
    ] as const) {
      const s = content.spells[id]!;
      expect(s).toMatchObject({ elements: [el], tier: 8, named: true, affinity: 'self', rare: true, prerequisites: [baseSpell] });
      const r = content.recipes.find((x) => x.id === id)!;
      expect([...r.inputs].sort()).toEqual([baseSpell, `el:${el}:3`].sort());
      expect(r.outcomes).toEqual([{ spellId: id, weight: 1 }, { spellId: null, weight: 64 }]);
    }
  });

  it('rejects content where a rare spell comes from a fixed recipe', () => {
    const raw = base();
    raw.recipes.find((r: any) => r.id === 'worldfire').outcomes = [{ spellId: 'worldfire', weight: 1 }];
    expect(issuesOf(raw)).toContain('rare spell "worldfire"');
  });

  it('rejects a rare spell no recipe can produce', () => {
    const raw = base();
    raw.recipes = raw.recipes.filter((r: any) => r.id !== 'worldfire');
    expect(issuesOf(raw)).toContain('rare spell "worldfire"');
  });

  it('existing spells and recipes are unchanged', () => {
    for (const s of Object.values(content.spells)) {
      if (NEW.includes(s.id)) continue;
      expect([s.tier, s.attack, s.cooldownMs, s.depth].join('|'), s.id).toBe((baseline.spells as Record<string, string>)[s.id]);
    }
    for (const r of content.recipes) {
      if (NEW.includes(r.id)) continue;
      expect(r.inputs.join('+') + '>' + r.outcomes.map((q) => `${q.spellId}:${q.weight}`).join(','), r.id).toBe((baseline.recipes as Record<string, string>)[r.id]);
    }
    expect(Object.keys(baseline.spells).every((id) => id in content.spells)).toBe(true);
    expect(Object.keys(baseline.recipes).every((id) => content.recipes.some((r) => r.id === id))).toBe(true);
  });

  it('balances each new spell between the Lv.7 pure spell and Holy Judgment', () => {
    const dps = (id: string) => {
      const s = content.spells[id]!;
      const mult = s.effects.reduce((a, e) => a + ('mult' in e ? e.mult * (e.kind === 'bolt' ? e.count : e.kind === 'blades' ? e.count : e.kind === 'meteor' ? e.count : e.kind === 'chain' ? e.hops : e.kind === 'storm' ? e.ms / e.tickMs : e.kind === 'zone' ? e.ms / e.tickMs : 1) : 0), 0);
      return (s.attack * mult) / s.cooldownMs;
    };
    for (const [id, lv7] of [['worldfire', 'sunfall'], ['heavens_breath', 'sky_tempest'], ['ninefold_thunder', 'thunder_god'], ['titans_grip', 'wrath_of_earth'], ['moontide', 'deluge']] as const) {
      const ratio = dps(id) / dps(lv7);
      expect(ratio, id).toBeGreaterThan(1.12);
      expect(ratio, id).toBeLessThan(1.25);
      expect(dps(id), id).toBeLessThan(dps('holy_judgment'));
    }
  });
});
