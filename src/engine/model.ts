import type { ElementId, Inventory, ItemId } from './types';

export type StatusKind = 'burn' | 'wet' | 'slow' | 'stun' | 'freeze' | 'blind' | 'regen';
/** burn: power = dps as a fraction of the hit; regen: power = max-hp fraction healed per second. */
export interface StatusDef { kind: StatusKind; ms: number; power?: number }
export type Target = 'nearest' | 'densest' | 'strongest' | 'center' | 'random';
/** Strip units: the field runs from the mage at x = 0 to x = 1, monsters stop at STOP_X = 0.08. mult scales the spell's attack. */
export type Effect =
  | { kind: 'bolt'; mult: number; count: number; radius: number; target: Target; status?: StatusDef[] }
  | { kind: 'ring'; mult: number; radius: number; push: number; status?: StatusDef[] }
  | { kind: 'blades'; mult: number; count: number; push: number }
  | { kind: 'chain'; mult: number; hops: number; range: number; explode: number; status?: StatusDef[] }
  | { kind: 'zone'; mult: number; radius: number; ms: number; tickMs: number; target: Target; pull: number; follow: boolean; strikes: number; status?: StatusDef[] }
  | { kind: 'storm'; mult: number; ms: number; tickMs: number; status?: StatusDef[] }
  | { kind: 'meteor'; mult: number; count: number; radius: number; delayMs: number; lavaMs: number; target: Target }
  | { kind: 'field'; mult: number; delayMs: number; status?: StatusDef[] }
  | { kind: 'haste'; factor: number; ms: number }
  | { kind: 'backfire'; chance: number; stunMs: number };

/** Spell school (術式學派). `forbidden` is only for rare named spells; crafted spells never get it. */
export type School = 'evocation' | 'conjuration' | 'cataclysm' | 'enchantment' | 'forbidden';
export interface Words { pre: string; noun: string; preEn: string; nounEn: string }
export type Affinity = 'base' | 'self' | 'good' | 'odd' | 'bad';
/** A castable spell: a named one from data, or a crafted one derived from its id. */
export interface Spell {
  id: string; name: string; nameEn: string; desc: string;
  elements: ElementId[]; tier: number; attack: number; cooldownMs: number;
  effects: Effect[]; words: Words; affinity: Affinity; depth: number; named: boolean; school: School;
}
export interface TreeNode { region: string; ring: number; angle: number; tree?: 'elements' | 'lightdark'; side?: 'light' | 'dark' }
export interface NamedSpellDef extends Spell {
  named: true; hint: string; prerequisites: string[]; node: TreeNode | null;
  /** the element whose "el+el" grade-1 recipe teaches it; crafted inputs use it for that element */
  baseOf?: ElementId;
  /** only obtainable from a random recipe; a discovery is announced to everyone */
  rare?: boolean;
  /** old-language incantation shown when a high-tier or rare spell is cast */
  chant?: string;
}
export interface Material { id: ItemId; name: string; nameEn: string; desc: string; elements: ElementId[]; words: Words; effect: Effect }
export interface KeyItem { id: ItemId; name: string; nameEn: string; desc: string; reveals: string }
export type PassiveBonus =
  | { kind: 'damage'; element: ElementId | null; pct: number }
  | { kind: 'cooldown'; pct: number }
  | { kind: 'depth'; add: number };
export type PassiveUnlock =
  | { kind: 'items'; items: Record<ItemId, number> }
  | { kind: 'boss'; bossId: string }
  | { kind: 'learned'; count: number; element: ElementId | null };
export interface Passive { id: string; name: string; nameEn: string; desc: string; node: TreeNode; bonus: PassiveBonus; unlock: PassiveUnlock }
export interface TreeRegion { id: string; name: string; nameEn: string; order: number; initiallyVisible: boolean }
/** spellId null: the roll fell through, the inputs make their crafted spell instead. */
export interface Recipe { id: string; inputs: [string, string]; outcomes: { spellId: string | null; weight: number }[] }
export interface DropDef { itemId: ItemId; chance: number; min: number; max: number }
export interface Monster { id: string; name: string; nameEn: string; element: ElementId; tier: number; hp: number; defense: number; regenPerSec: number; speed: number; radius: number; boss: boolean; drops: DropDef[] }
/** One stage of a zone: each number is the size of one wave. A boss stage's boss comes on top of these. */
export interface StageDef { waves: number[] }
export interface Zone { id: string; name: string; nameEn: string; order: number; monsters: string[]; bossId: string; killsForBoss: number; maxAlive: number; spawnIntervalMs: number; pack: { everyMs: number; size: number }; stages: StageDef[] }
export interface Content {
  spells: Record<string, NamedSpellDef>; recipes: Recipe[]; monsters: Record<string, Monster>; zones: Zone[];
  materials: Record<ItemId, Material>; keyItems: Record<ItemId, KeyItem>; passives: Record<string, Passive>; regions: TreeRegion[];
  /** element -> its base spell id (from baseOf) */
  baseSpells: Record<ElementId, string>;
}
export interface SynthLogEntry { attempts: number; results: Record<string, number>; noReaction: boolean }
export interface GameState {
  version: 2; inventory: Inventory; learned: string[]; equipped: string; levels: Record<string, number>;
  revealed: string[]; passives: string[]; currentZone: string; unlockedZones: string[];
  defeatedBosses: string[]; zoneKills: Record<string, number>;
  /** 1-based stage being played in currentZone */
  currentStage: number;
  /** highest stage cleared per zone (0 or missing = none) */
  clearedStages: Record<string, number>;
  /** server time (ms) of the last stage settlement */
  lastClearAt: number;
  synthesisLog: Record<string, SynthLogEntry>;
}
export const STARTING_SPELL = 'mana_bolt';
export const OVERLOAD_SPELL = 'mana_overload';
