import { z } from 'zod';
import { ELEMENT_ORDER, ITEM_ID_RE } from './types';
import type { ElementId } from './types';
import { OVERLOAD_SPELL, STARTING_SPELL } from './model';
import type { Content } from './model';
import spellsJson from '../data/content/spells.json';
import recipesJson from '../data/content/recipes.json';
import monstersJson from '../data/content/monsters.json';
import zonesJson from '../data/content/zones.json';
import materialsJson from '../data/content/materials.json';
import keyItemsJson from '../data/content/key-items.json';
import passivesJson from '../data/content/passives.json';
import regionsJson from '../data/content/regions.json';

export class ContentError extends Error {
  constructor(public issues: string[]) {
    super(`Invalid content:\n- ${issues.join('\n- ')}`);
    this.name = 'ContentError';
  }
}

const element = z.enum(ELEMENT_ORDER);
const itemId = z.string().refine((v) => ITEM_ID_RE.test(v), { error: (iss) => `invalid item id "${String(iss.input)}"` });
const spellId = z.string().regex(/^[a-z][a-z0-9_]*$/, { error: (iss) => `invalid spell id "${String(iss.input)}"` });
const str = z.string().min(1);
const ms = z.number().positive();
const frac = z.number().min(0);

const target = z.enum(['nearest', 'densest', 'strongest', 'center', 'random']);
const status = z.object({
  kind: z.enum(['burn', 'wet', 'slow', 'stun', 'freeze', 'blind', 'regen']),
  ms,
  power: frac.optional(),
});
const effect = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bolt'), mult: frac, count: z.number().int().positive(), radius: frac, target, status: z.array(status).optional() }),
  z.object({ kind: z.literal('ring'), mult: frac, radius: frac, push: frac, status: z.array(status).optional() }),
  z.object({ kind: z.literal('blades'), mult: frac, count: z.number().int().positive(), push: frac }),
  z.object({ kind: z.literal('chain'), mult: frac, hops: z.number().int().positive(), range: frac, explode: frac, status: z.array(status).optional() }),
  z.object({ kind: z.literal('zone'), mult: frac, radius: frac, ms, tickMs: ms, target, pull: frac, follow: z.boolean(), strikes: z.number().int().min(0), status: z.array(status).optional() }),
  z.object({ kind: z.literal('storm'), mult: frac, ms, tickMs: ms, status: z.array(status).optional() }),
  z.object({ kind: z.literal('meteor'), mult: frac, count: z.number().int().positive(), radius: frac, delayMs: frac, lavaMs: frac, target }),
  z.object({ kind: z.literal('field'), mult: frac, delayMs: frac, status: z.array(status).optional() }),
  z.object({ kind: z.literal('haste'), factor: z.number().positive(), ms }),
  z.object({ kind: z.literal('backfire'), chance: z.number().min(0).max(1), stunMs: frac }),
]);
const words = z.object({ pre: str, noun: str, preEn: str, nounEn: str });
const node = z.object({ region: str, ring: z.number().int().min(0), angle: z.number() });

const spellSchema = z.object({
  id: spellId,
  name: str,
  nameEn: str,
  desc: str,
  hint: str,
  elements: z.array(element).max(5),
  tier: z.number().int().min(1).max(20),
  attack: z.number().positive(),
  cooldownMs: ms,
  effects: z.array(effect).min(1),
  words,
  affinity: z.enum(['base', 'self', 'good', 'odd', 'bad']),
  depth: z.number().int().min(0),
  named: z.literal(true),
  prerequisites: z.array(z.string()),
  node: node.nullable(),
  baseOf: element.optional(),
  rare: z.boolean().optional(),
});

const recipeSchema = z.object({
  id: str,
  inputs: z.tuple([str, str]),
  outcomes: z.array(z.object({ spellId: z.string().nullable(), weight: z.number().positive() })).min(1),
});

const monsterSchema = z.object({
  id: str,
  name: str,
  nameEn: str,
  element,
  tier: z.number().int().min(1).max(20),
  hp: z.number().positive(),
  defense: frac,
  regenPerSec: frac,
  speed: z.number().positive(),
  radius: z.number().positive(),
  boss: z.boolean(),
  drops: z.array(z.object({ itemId, chance: z.number().min(0).max(1), min: z.number().int().min(0), max: z.number().int().min(0) })),
});

const zoneSchema = z.object({
  id: str,
  name: str,
  nameEn: str,
  order: z.number().int(),
  monsters: z.array(z.string()).min(1),
  bossId: z.string(),
  killsForBoss: z.number().int().positive(),
  maxAlive: z.number().int().positive(),
  spawnIntervalMs: ms,
  pack: z.object({ everyMs: ms, size: z.number().int().positive() }),
});

const materialSchema = z.object({ id: itemId, name: str, nameEn: str, desc: str, elements: z.array(element), words, effect });
const keyItemSchema = z.object({ id: itemId, name: str, nameEn: str, desc: str, reveals: str });
const passiveSchema = z.object({
  id: str,
  name: str,
  nameEn: str,
  desc: str,
  node,
  bonus: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('damage'), element: element.nullable(), pct: z.number() }),
    z.object({ kind: z.literal('cooldown'), pct: z.number() }),
    z.object({ kind: z.literal('depth'), add: z.number().int() }),
  ]),
  unlock: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('items'), items: z.record(itemId, z.number().int().positive()) }),
    z.object({ kind: z.literal('boss'), bossId: z.string() }),
    z.object({ kind: z.literal('learned'), count: z.number().int().positive(), element: element.nullable() }),
  ]),
});
const regionSchema = z.object({ id: str, name: str, nameEn: str, order: z.number().int(), initiallyVisible: z.boolean() });

function fmtPath(path: PropertyKey[]): string {
  return path.map(String).join('.');
}

function parseList<T extends { id: string }>(
  label: string,
  schema: z.ZodType<T>,
  raw: unknown,
  issues: string[],
): T[] {
  const arr = z.array(z.unknown()).safeParse(raw);
  if (!arr.success) {
    issues.push(`${label}: expected an array`);
    return [];
  }
  const out: T[] = [];
  arr.data.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) {
      out.push(r.data);
      return;
    }
    const id = (item as { id?: unknown } | null)?.id;
    for (const iss of r.error.issues) {
      issues.push(`${label}[${i}${typeof id === 'string' ? ` ${id}` : ''}].${fmtPath(iss.path)}: ${iss.message}`);
    }
  });
  return out;
}

function checkUnique(label: string, ids: string[], issues: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issues.push(`${label}: duplicate id "${id}"`);
    seen.add(id);
  }
}

export function loadContent(raw: Record<'spells' | 'recipes' | 'monsters' | 'zones' | 'materials' | 'keyItems' | 'passives' | 'regions', unknown>): Content {
  const issues: string[] = [];
  const spells = parseList('spells', spellSchema, raw.spells, issues);
  const recipes = parseList('recipes', recipeSchema, raw.recipes, issues);
  const monsters = parseList('monsters', monsterSchema, raw.monsters, issues);
  const zones = parseList('zones', zoneSchema, raw.zones, issues);
  const materials = parseList('materials', materialSchema, raw.materials, issues);
  const keyItems = parseList('keyItems', keyItemSchema, raw.keyItems, issues);
  const passives = parseList('passives', passiveSchema, raw.passives, issues);
  const regions = parseList('regions', regionSchema, raw.regions, issues);

  checkUnique('spells', spells.map((s) => s.id), issues);
  checkUnique('recipes', recipes.map((s) => s.id), issues);
  checkUnique('monsters', monsters.map((s) => s.id), issues);
  checkUnique('zones', zones.map((s) => s.id), issues);
  checkUnique('items', [...materials, ...keyItems].map((s) => s.id), issues);
  checkUnique('passives', passives.map((s) => s.id), issues);
  checkUnique('regions', regions.map((s) => s.id), issues);

  const spellIds = new Set(spells.map((s) => s.id));
  const monsterIds = new Set(monsters.map((m) => m.id));
  const regionIds = new Set(regions.map((r) => r.id));
  const materialIds = new Set(materials.map((m) => m.id));
  const keyIds = new Set(keyItems.map((k) => k.id));
  const knownItem = (i: string) => i.startsWith('el:') || materialIds.has(i) || keyIds.has(i);

  for (const id of [STARTING_SPELL, OVERLOAD_SPELL]) {
    if (!spellIds.has(id)) issues.push(`spells: required spell "${id}" is missing`);
  }

  const baseSpells: Partial<Record<ElementId, string>> = {};
  for (const s of spells) {
    if (s.baseOf) {
      if (baseSpells[s.baseOf]) issues.push(`spell ${s.id}: duplicate baseOf "${s.baseOf}" (already ${baseSpells[s.baseOf]})`);
      else baseSpells[s.baseOf] = s.id;
    }
    for (const p of s.prerequisites) {
      if (!spellIds.has(p)) issues.push(`spell ${s.id}: unknown prerequisite "${p}"`);
    }
    if (s.node && !regionIds.has(s.node.region)) issues.push(`spell ${s.id}: node has unknown region "${s.node.region}"`);
  }
  for (const e of ELEMENT_ORDER) {
    if (!baseSpells[e]) issues.push(`spells: no spell has baseOf "${e}"`);
  }

  for (const r of recipes) {
    for (const i of r.inputs) {
      if (!spellIds.has(i) && !(ITEM_ID_RE.test(i) && knownItem(i))) issues.push(`recipe ${r.id}: unknown input "${i}"`);
    }
    for (const o of r.outcomes) {
      if (o.spellId !== null && !spellIds.has(o.spellId)) issues.push(`recipe ${r.id}: unknown outcome spell "${o.spellId}"`);
    }
  }

  for (const s of spells) {
    if (!s.rare) continue;
    const makers = recipes.filter((r) => r.outcomes.some((o) => o.spellId === s.id));
    if (makers.length === 0) issues.push(`rare spell "${s.id}" has no recipe that produces it`);
    for (const r of makers) {
      if (!r.outcomes.some((o) => o.spellId === null)) issues.push(`rare spell "${s.id}" comes from recipe ${r.id}, which has no fall-through (spellId null) outcome`);
    }
  }

  for (const m of monsters) {
    for (const d of m.drops) {
      if (d.max < d.min) issues.push(`monster ${m.id}: drop ${d.itemId} has max < min`);
      if (!knownItem(d.itemId)) issues.push(`monster ${m.id}: drop has unknown item "${d.itemId}"`);
    }
  }
  const dropped = new Set(monsters.flatMap((m) => m.drops.map((d) => d.itemId)));
  for (const it of [...materials, ...keyItems]) {
    if (!dropped.has(it.id)) issues.push(`item "${it.id}" is never dropped`);
  }
  for (const k of keyItems) {
    if (!regionIds.has(k.reveals)) issues.push(`key item ${k.id}: reveals unknown region "${k.reveals}"`);
  }
  for (const p of passives) {
    if (!regionIds.has(p.node.region)) issues.push(`passive ${p.id}: node has unknown region "${p.node.region}"`);
    if (p.unlock.kind === 'items') {
      for (const i of Object.keys(p.unlock.items)) {
        if (!knownItem(i)) issues.push(`passive ${p.id}: unlock has unknown item "${i}"`);
      }
    } else if (p.unlock.kind === 'boss' && !monsters.find((m) => m.id === (p.unlock as { bossId: string }).bossId)?.boss) {
      issues.push(`passive ${p.id}: unlock boss "${p.unlock.bossId}" is not a boss monster`);
    }
  }
  for (const z of zones) {
    for (const m of z.monsters) {
      if (!monsterIds.has(m)) issues.push(`zone ${z.id}: unknown monster "${m}"`);
    }
    const boss = monsters.find((m) => m.id === z.bossId);
    if (!boss) issues.push(`zone ${z.id}: unknown boss "${z.bossId}"`);
    else if (!boss.boss) issues.push(`zone ${z.id}: boss "${z.bossId}" is not flagged boss`);
  }

  if (issues.length > 0) throw new ContentError(issues);

  return {
    spells: Object.fromEntries(spells.map((s) => [s.id, s])),
    recipes,
    monsters: Object.fromEntries(monsters.map((m) => [m.id, m])),
    zones: [...zones].sort((a, b) => a.order - b.order),
    materials: Object.fromEntries(materials.map((m) => [m.id, m])),
    keyItems: Object.fromEntries(keyItems.map((k) => [k.id, k])),
    passives: Object.fromEntries(passives.map((p) => [p.id, p])),
    regions: [...regions].sort((a, b) => a.order - b.order),
    baseSpells: baseSpells as Record<ElementId, string>,
  };
}

export const content: Content = loadContent({
  spells: spellsJson,
  recipes: recipesJson,
  monsters: monstersJson,
  zones: zonesJson,
  materials: materialsJson,
  keyItems: keyItemsJson,
  passives: passivesJson,
  regions: regionsJson,
});
