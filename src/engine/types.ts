export const ELEMENT_ORDER = ['fire', 'wind', 'thunder', 'earth', 'water'] as const;
export type ElementId = typeof ELEMENT_ORDER[number];
export type ItemId = string; // 'el:<ElementId>:<grade 1-5>', 'mat:<id>' or 'key:<id>'
export type Inventory = Record<ItemId, number>;
export type SpellPattern = 'bolt' | 'beam' | 'chain' | 'nova';
export type StatusKind = 'burn' | 'paralyze' | 'freeze';

export interface SpellDef {
  id: string;
  name: string;
  nameEn: string;
  elements: ElementId[];
  tier: number;
  attack: number;
  cooldownMs: number;
  pattern: SpellPattern;
  chainCount?: number;
  status?: { kind: StatusKind; chance: number; durationMs: number };
  prerequisites: string[];
  hint: string;
  grimoire: { ring: 0 | 1 | 2 | 3; offset: number };
}
export interface RecipeDef {
  id: string;
  inputs: ItemId[];
  outcomes: { spellId: string; weight: number }[];
}
export interface DropDef {
  itemId: ItemId;
  chance: number;
  min: number;
  max: number;
}
export interface MonsterDef {
  id: string;
  name: string;
  nameEn: string;
  element: ElementId;
  tier: number;
  hp: number;
  defense: number;
  regenPerSec: number;
  boss: boolean;
  drops: DropDef[];
}
export interface ZoneDef {
  id: string;
  name: string;
  nameEn: string;
  order: number;
  monsters: string[];
  bossId: string;
  killsForBoss: number;
  maxAlive: number;
  spawnIntervalMs: number;
}
export interface GameData {
  spells: Record<string, SpellDef>;
  recipes: RecipeDef[];
  monsters: Record<string, MonsterDef>;
  zones: ZoneDef[]; // sorted by order
}

export const elementItem = (e: ElementId, grade: number): ItemId => `el:${e}:${grade}`;
export const MAX_ELEMENT_GRADE = 5;
/** GRADE_UPGRADE_COST[g-1] = how many grade-g elements it takes to make one grade g+1. */
export const GRADE_UPGRADE_COST: readonly number[] = [3, 10, 30, 100];
export const GRADE_NAMES = ['初階', '中階', '高階', '極階', '神階'] as const;
/** Worth of one element of this grade, in grade-1 units (1, 3, 30, 900, 90000). */
export const gradeValue = (grade: number): number => {
  let v = 1;
  for (let g = 1; g < grade; g++) v *= GRADE_UPGRADE_COST[g - 1]!;
  return v;
};
/** Format of every inventory / synthesis item id. */
export const ITEM_ID_RE = new RegExp(`^(el:(${ELEMENT_ORDER.join('|')}):[1-${MAX_ELEMENT_GRADE}]|mat:[a-z_]+|key:[a-z_]+)$`);
export const STARTING_SPELL = 'mana_bolt';
