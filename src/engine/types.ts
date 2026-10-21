export const ELEMENT_ORDER = ['fire', 'wind', 'thunder', 'earth', 'water'] as const;
export type ElementId = typeof ELEMENT_ORDER[number];
export type ItemId = string; // 'el:<ElementId>:<grade 1-3>' or 'mat:<id>'
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
export const MAX_ELEMENT_GRADE = 3;
export const STARTING_SPELL = 'mana_bolt';
