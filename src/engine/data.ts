import { z } from 'zod';
import { ELEMENT_ORDER } from './types';
import type { GameData } from './types';
import spellsJson from '../data/spells.json';
import recipesJson from '../data/recipes.json';
import monstersJson from '../data/monsters.json';
import zonesJson from '../data/zones.json';

export class DataError extends Error {
  constructor(public issues: string[]) {
    super(`Invalid game data:\n- ${issues.join('\n- ')}`);
    this.name = 'DataError';
  }
}

const element = z.enum(ELEMENT_ORDER);
const tier = z.number().int().min(1).max(20);
const ITEM_RE = /^(el:(fire|wind|thunder|earth|water):[1-3]|mat:[a-z_]+)$/;
const itemId = z.string().refine((v) => ITEM_RE.test(v), { error: (iss) => `invalid item id "${String(iss.input)}"` });

const spellSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().min(1),
  elements: z.array(element).max(2),
  tier,
  attack: z.number().positive(),
  cooldownMs: z.number().positive(),
  pattern: z.enum(['bolt', 'beam', 'chain', 'nova']),
  chainCount: z.number().int().positive().optional(),
  status: z
    .object({
      kind: z.enum(['burn', 'paralyze', 'freeze']),
      chance: z.number().min(0).max(1),
      durationMs: z.number().positive(),
    })
    .optional(),
  prerequisites: z.array(z.string()),
  hint: z.string().min(1),
  grimoire: z.object({
    ring: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    offset: z.number(),
  }),
});

const recipeSchema = z.object({
  id: z.string().min(1),
  inputs: z.array(itemId).length(2),
  outcomes: z.array(z.object({ spellId: z.string(), weight: z.number().positive() })).min(1),
});

const monsterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().min(1),
  element,
  tier,
  hp: z.number().positive(),
  defense: z.number().min(0),
  regenPerSec: z.number().min(0),
  boss: z.boolean(),
  drops: z.array(
    z.object({
      itemId,
      chance: z.number().min(0).max(1),
      min: z.number().int().min(0),
      max: z.number().int().min(0),
    }),
  ),
});

const zoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().min(1),
  order: z.number().int(),
  monsters: z.array(z.string()).min(1),
  bossId: z.string(),
  killsForBoss: z.number().int().positive(),
  maxAlive: z.number().int().positive(),
  spawnIntervalMs: z.number().positive(),
});

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

export function loadGameData(raw: {
  spells: unknown;
  recipes: unknown;
  monsters: unknown;
  zones: unknown;
}): GameData {
  const issues: string[] = [];
  const spells = parseList('spells', spellSchema, raw.spells, issues);
  const recipes = parseList('recipes', recipeSchema, raw.recipes, issues);
  const monsters = parseList('monsters', monsterSchema, raw.monsters, issues);
  const zones = parseList('zones', zoneSchema, raw.zones, issues);

  checkUnique('spells', spells.map((s) => s.id), issues);
  checkUnique('recipes', recipes.map((s) => s.id), issues);
  checkUnique('monsters', monsters.map((s) => s.id), issues);
  checkUnique('zones', zones.map((s) => s.id), issues);

  const spellIds = new Set(spells.map((s) => s.id));
  const monsterIds = new Set(monsters.map((m) => m.id));

  for (const s of spells) {
    for (const p of s.prerequisites) {
      if (!spellIds.has(p)) issues.push(`spell ${s.id}: unknown prerequisite "${p}"`);
    }
    if (s.pattern === 'chain' && !s.chainCount) issues.push(`spell ${s.id}: chain pattern needs chainCount`);
  }
  for (const r of recipes) {
    for (const o of r.outcomes) {
      if (!spellIds.has(o.spellId)) issues.push(`recipe ${r.id}: unknown outcome spell "${o.spellId}"`);
    }
  }
  const dropMats = new Set(monsters.flatMap((m) => m.drops.map((d) => d.itemId)).filter((i) => i.startsWith('mat:')));
  for (const r of recipes) {
    for (const i of r.inputs) {
      if (i.startsWith('mat:') && !dropMats.has(i)) issues.push(`recipe ${r.id}: input "${i}" is never dropped`);
    }
  }
  for (const m of monsters) {
    for (const d of m.drops) {
      if (d.max < d.min) issues.push(`monster ${m.id}: drop ${d.itemId} has max < min`);
    }
  }
  for (const z of zones) {
    for (const m of z.monsters) {
      if (!monsterIds.has(m)) issues.push(`zone ${z.id}: unknown monster "${m}"`);
    }
    if (!monsterIds.has(z.bossId)) issues.push(`zone ${z.id}: unknown boss "${z.bossId}"`);
    else if (!monsters.find((m) => m.id === z.bossId)!.boss) issues.push(`zone ${z.id}: boss "${z.bossId}" is not flagged boss`);
  }

  if (issues.length > 0) throw new DataError(issues);

  return {
    spells: Object.fromEntries(spells.map((s) => [s.id, s])),
    recipes,
    monsters: Object.fromEntries(monsters.map((m) => [m.id, m])),
    zones: [...zones].sort((a, b) => a.order - b.order),
  };
}

export const gameData: GameData = loadGameData({
  spells: spellsJson,
  recipes: recipesJson,
  monsters: monstersJson,
  zones: zonesJson,
});
