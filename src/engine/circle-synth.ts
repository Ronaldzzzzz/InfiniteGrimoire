import { z } from 'zod';
import { canonicalCircle, circuitMismatches, placementProblems, possibleForms, runesUnlocked } from './circle';
import type { CircleNode, CircleProblem, Placement } from './circle';
import { removeItems } from './inventory';
import { RUNE_IDS } from './model';
import type { Content, GameState, NamedSpellDef, RuneId } from './model';
import type { Rng } from './rng';
import { ELEMENT_ORDER, MAX_ELEMENT_GRADE, elementItem } from './types';
import type { ItemId } from './types';

/**
 * Server synthesis of a magic circle (spec 2026-10-30 sections 2.6, 2.10, 3.3, 3.6). The numbers are placeholders
 * (spec "範圍"): a big failure happens FAIL_BASE of the time, plus FAIL_PER_MISMATCH per circuit layer that does not
 * connect; a rare spell's own Lv.10 circle rolls it RARE_CHANCE of the time.
 */
export const FAIL_BASE = 0.1;
export const FAIL_PER_MISMATCH = 0.25;
export const RARE_CHANCE = 0.02;

export type CircleResult =
  | { kind: 'learned' | 'known'; spellId: string; form: RuneId; rare?: boolean }
  | { kind: 'failed'; form: RuneId }
  | { kind: 'rejected'; reason: CircleProblem | 'insufficient' };

/** What POST /api/circle answers: a new rare learn carries whether it is the first discovery (filled by the worker). */
export type CircleReply =
  | Exclude<CircleResult, { kind: 'learned' | 'known' }>
  | { kind: 'learned' | 'known'; spellId: string; form: RuneId; rare?: { first: boolean } };

const node = z.strictObject({ element: z.enum(ELEMENT_ORDER), grade: z.number().int().min(1).max(MAX_ELEMENT_GRADE) });
const ring = z.array(node.nullable()).length(5);
const rune = z.enum(RUNE_IDS).nullable();
const placementSchema = z.strictObject({ core: node, ring1: ring, ring2: ring, runes: z.tuple([rune, rune]) });

/** Validates an untrusted placement's shape (ring lengths, integer grades 1..5, known elements and runes). Never throws. */
export function parsePlacement(input: unknown): Placement | null {
  const r = placementSchema.safeParse(input);
  return r.success ? (r.data as Placement) : null;
}

/** What a circle costs: one element item per placed node and the core, at the grade placed. Runes are free. */
export function circleCost(p: Placement): ItemId[] {
  const nodes = [p.core, ...p.ring1, ...p.ring2].filter((x): x is CircleNode => x != null);
  return nodes.map((x) => elementItem(x.element, x.grade));
}

/** Chance of a big failure: the base plus a step per circuit layer that does not connect. */
export function failChance(p: Placement): number {
  return Math.min(1, FAIL_BASE + FAIL_PER_MISMATCH * circuitMismatches(p));
}

const rareIndex = new WeakMap<Content, Map<string, NamedSpellDef>>();

/** The rare named spell whose Lv.10 circle this canonical id is, if any. */
export function rareFor(circleId: string, content: Content): NamedSpellDef | undefined {
  let index = rareIndex.get(content);
  if (!index) {
    index = new Map();
    for (const s of Object.values(content.spells)) if (s.rare && s.circle) index.set(s.circle, s);
    rareIndex.set(content, index);
  }
  return index.get(circleId);
}

/** Most circles the save's attempt log keeps; a new one past this drops the least-attempted. */
export const SYNTH_LOG_CAP = 1000;

function logAttempt(log: GameState['synthesisLog'], key: string): GameState['synthesisLog'] {
  if (Object.hasOwn(log, key)) return { ...log, [key]: log[key]! + 1 };
  const next = { ...log };
  const keys = Object.keys(next);
  if (keys.length >= SYNTH_LOG_CAP) {
    let least = keys[0]!;
    for (const k of keys) if (next[k]! < next[least]!) least = k;
    delete next[least];
  }
  next[key] = 1;
  return next;
}

/** The synthesis log's result key of an outcome (also what the worker records). */
export function circleResultKey(result: CircleResult): string {
  return result.kind === 'learned' || result.kind === 'known' ? `${result.kind}:${result.spellId}` : result.kind;
}

/**
 * Draws a circle: refuses a placement that breaks the rules (with the player's unlocked tier and runes) or that the
 * inventory cannot pay; otherwise spends the elements and rolls, from one rng stream, the form (uniformly among the
 * rings' runes), a big failure, and on a rare spell's circle the rare spell. `known`: already learned, nothing added.
 */
export function synthesizeCircle(state: GameState, p: Placement, content: Content, rng: Rng): { state: GameState; result: CircleResult } {
  const reject = (reason: CircleProblem | 'insufficient') => ({ state, result: { kind: 'rejected', reason } as const });
  const problems = placementProblems(p, { unlockedTier: state.circleTier, runes: runesUnlocked(state.defeatedBosses, content) });
  if (problems.length > 0) return reject(problems[0]!);
  const inventory = removeItems(state.inventory, circleCost(p));
  if (!inventory) return reject('insufficient');

  const forms = possibleForms(p);
  const form = forms[rng.int(0, forms.length - 1)]!;
  const circleId = canonicalCircle(p, form);
  const failed = rng.next() < failChance(p);
  let result: CircleResult;
  if (failed) {
    result = { kind: 'failed', form };
  } else {
    const rare = rareFor(circleId, content);
    const spellId = rare && rng.next() < RARE_CHANCE ? rare.id : circleId;
    const known = state.learned.includes(spellId);
    result = { kind: known ? 'known' : 'learned', spellId, form, ...(spellId === circleId ? {} : { rare: true }) };
  }
  const learned = result.kind === 'learned' ? [...state.learned, result.spellId] : state.learned;
  const synthesisLog = logAttempt(state.synthesisLog, circleId);
  return { state: { ...state, inventory, learned, synthesisLog }, result };
}
