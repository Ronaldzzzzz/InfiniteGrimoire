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
