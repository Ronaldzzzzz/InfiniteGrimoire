import { ELEMENT_ORDER } from './types';
import type { ElementId, ItemId } from './types';
import { RUNE_IDS } from './model';
import type { Content, RuneId } from './model';
import { COUNTERS } from './combat-rules';
import { circleRules } from './content';

export { RUNE_IDS };
export type { RuneId };

/**
 * Magic circle rules (spec 2026-10-30 sections 2.6, 2.7, 3.1-3.4, 3.6).
 * Ring 1 has 5 pentagram slots (0..4); ring-2 slot j sits outside ring-1 slot j and is wired to it.
 */
export const RUNE_NAMES: Record<RuneId, string> = {
  bolt: '射', blades: '刃', ring: '波', chain: '鏈', zone: '域', meteor: '墜', storm: '嵐', field: '臨',
};

export interface CircleNode { element: ElementId; grade: number }
export interface Placement {
  core: CircleNode;
  /** length 5, pentagram positions */
  ring1: (CircleNode | null)[];
  /** length 5, slot j sits outside ring-1 slot j; at most 4 filled */
  ring2: (CircleNode | null)[];
  runes: [RuneId | null, RuneId | null];
}
export type CircleProblem =
  | 'overCap' | 'overUnlocked' | 'ring2BeforeRing1Full' | 'tooManyRing2' | 'belowRingFloor'
  | 'runeLocked' | 'runeWithoutRing' | 'ringWithoutRune';

/** Highest tier a core of each grade (1..5) allows. */
export const GRADE_CAP = [2, 4, 6, 8, 10] as const;
/** Lowest element grade a node may have, per ring (ring 1 初階, ring 2 高階). */
export const RING_FLOOR = [1, 3] as const;
export const SLOTS = 5;
export const MAX_RING2 = 4;

/** 相生 cycle 水 → 土 → 火 → 雷 → 風 → 水: element -> the element it generates. */
export const GENERATES: Record<ElementId, ElementId> = {
  water: 'earth', earth: 'fire', fire: 'thunder', thunder: 'wind', wind: 'water',
};

const filled = (ring: (CircleNode | null)[]) => ring.filter((x): x is CircleNode => x != null).length;
const slot = <T,>(ring: (T | null)[] | undefined, j: number): T | null => ring?.[j] ?? null;
const overcomes = (a: ElementId, b: ElementId) => COUNTERS[a] === b || COUNTERS[b] === a;
const capOf = (grade: number) => GRADE_CAP[Math.min(Math.max(Math.round(grade), 1), 5) - 1]!;

/** Tier = node count with the core counted as 1. */
export function placementTier(p: Placement): number {
  return 1 + filled(p.ring1) + filled(p.ring2);
}

export function placementProblems(p: Placement, ctx: { unlockedTier: number; runes: RuneId[] }): CircleProblem[] {
  const out = new Set<CircleProblem>();
  const tier = placementTier(p);
  const n1 = filled(p.ring1), n2 = filled(p.ring2);
  if (tier > capOf(p.core.grade)) out.add('overCap');
  if (tier > ctx.unlockedTier) out.add('overUnlocked');
  if (n2 > 0 && n1 < SLOTS) out.add('ring2BeforeRing1Full');
  if (n2 > MAX_RING2) out.add('tooManyRing2');
  const rings = [p.ring1, p.ring2];
  rings.forEach((ring, i) => {
    if (ring.some((x) => x != null && x.grade < RING_FLOOR[i]!)) out.add('belowRingFloor');
  });
  rings.forEach((ring, i) => {
    const rune = p.runes[i] ?? null;
    if (rune !== null && !ctx.runes.includes(rune)) out.add('runeLocked');
    if (rune !== null && filled(ring) === 0) out.add('runeWithoutRing');
    if (rune === null && filled(ring) > 0) out.add('ringWithoutRune');
  });
  const order: CircleProblem[] = ['overCap', 'overUnlocked', 'ring2BeforeRing1Full', 'tooManyRing2', 'belowRingFloor', 'runeLocked', 'runeWithoutRing', 'ringWithoutRune'];
  return order.filter((x) => out.has(x));
}

/**
 * Branch counts shown on the parchment. core.out is the total the core sends (coreOut to each ring-1 node);
 * a ring-1 node's out is what it sends to its ring-2 node (element value + the slot's fixed shift).
 */
export function branches(p: Placement): {
  core: { out: number };
  ring1: ({ in: number; out: number } | null)[];
  ring2: ({ in: number } | null)[];
} {
  const b = circleRules.branches, shift = circleRules.slotShift;
  const idx = [0, 1, 2, 3, 4];
  return {
    core: { out: b[p.core.element].coreOut * filled(p.ring1) },
    ring1: idx.map((j) => {
      const x = slot(p.ring1, j);
      return x ? { in: b[x.element].ring1In, out: b[x.element].ring1Out + shift[j]! } : null;
    }),
    ring2: idx.map((j) => {
      const x = slot(p.ring2, j);
      return x ? { in: b[x.element].ring2In + shift[j]! } : null;
    }),
  };
}

/**
 * Layers core↔ring 1 and ring 1↔ring 2 (each only when the outer ring has nodes) match when the inner layer's
 * outward branches into the outer layer sum to the outer layer's inward branches and no wired pair is 相剋.
 * Only ring-1 nodes wired to a ring-2 node count their outward branches.
 */
export function circuitMismatches(p: Placement): number {
  const br = branches(p);
  let bad = 0;
  const ring1 = [0, 1, 2, 3, 4].map((j) => slot(p.ring1, j));
  const ring2 = [0, 1, 2, 3, 4].map((j) => slot(p.ring2, j));
  if (ring1.some((x) => x)) {
    const inSum = br.ring1.reduce((s, x) => s + (x?.in ?? 0), 0);
    const clash = ring1.some((x) => x && overcomes(p.core.element, x.element));
    if (inSum !== br.core.out || clash) bad++;
  }
  if (ring2.some((x) => x)) {
    let outSum = 0, inSum = 0, clash = false;
    ring2.forEach((x, j) => {
      if (!x) return;
      inSum += br.ring2[j]!.in;
      const inner = ring1[j];
      if (!inner) return;
      outSum += br.ring1[j]!.out;
      if (overcomes(inner.element, x.element)) clash = true;
    });
    if (inSum !== outSum || clash) bad++;
  }
  return bad;
}

/** 相生 pairs on the ring-1 circle (neighbours, [generator, generated]) and 相剋 pairs on its star lines ([counter, countered]). */
export function relations(p: Placement): { generate: [ElementId, ElementId][]; overcome: [ElementId, ElementId][] } {
  const generate: [ElementId, ElementId][] = [], overcome: [ElementId, ElementId][] = [];
  for (let i = 0; i < SLOTS; i++) {
    const a = slot(p.ring1, i)?.element;
    const nb = slot(p.ring1, (i + 1) % SLOTS)?.element;
    const st = slot(p.ring1, (i + 2) % SLOTS)?.element;
    if (a && nb) {
      if (GENERATES[a] === nb) generate.push([a, nb]);
      else if (GENERATES[nb] === a) generate.push([nb, a]);
    }
    if (a && st) {
      if (COUNTERS[a] === st) overcome.push([a, st]);
      else if (COUNTERS[st] === a) overcome.push([st, a]);
    }
  }
  return { generate, overcome };
}

/** Distinct runes of the rings that hold nodes; a core-only circle is a bolt. */
export function possibleForms(p: Placement): RuneId[] {
  const forms: RuneId[] = [];
  [p.ring1, p.ring2].forEach((ring, i) => {
    const r = p.runes[i] ?? null;
    if (r && filled(ring) > 0 && !forms.includes(r)) forms.push(r);
  });
  return forms.length > 0 ? forms : ['bolt'];
}

const LETTER: Record<ElementId, string> = { fire: 'f', wind: 'w', thunder: 't', earth: 'e', water: 'a' };
const FROM_LETTER = Object.fromEntries(ELEMENT_ORDER.map((e) => [LETTER[e], e])) as Record<string, ElementId>;
const EMPTY = '-';

/** The 10 rotations / mirrors of the 5 pentagram slots: index maps. */
const SYMMETRIES: number[][] = [0, 1, 2, 3, 4].flatMap((r) => [
  [0, 1, 2, 3, 4].map((i) => (i + r) % SLOTS),
  [0, 1, 2, 3, 4].map((i) => (r - i + SLOTS) % SLOTS),
]);

function foldRings(r1: string, r2: string): string {
  let best: string | null = null;
  for (const m of SYMMETRIES) {
    const s = `${m.map((k) => r1[k]).join('')}.${m.map((k) => r2[k]).join('')}`;
    if (best === null || s < best) best = s;
  }
  return best!;
}

const ringString = (ring: (CircleNode | null)[]) => [0, 1, 2, 3, 4].map((j) => {
  const x = slot(ring, j);
  return x ? LETTER[x.element] : EMPTY;
}).join('');

/**
 * Canonical spell id of a circle and its form: `m:<core>.<tier>.<ring1>.<ring2>.<form>`, rings as 5 letters
 * (f w t e a, `-` empty) folded over the pentagram's rotations and mirrors (smallest string). Node grades are ignored,
 * tier is the actual tier min(placementTier, core cap). Example: `m:fire.3.---fw.-----.bolt`.
 */
export function canonicalCircle(p: Placement, form: RuneId): string {
  const tier = Math.min(placementTier(p), capOf(p.core.grade));
  return `m:${p.core.element}.${tier}.${foldRings(ringString(p.ring1), ringString(p.ring2))}.${form}`;
}

const CANON_RE = new RegExp(`^m:(${ELEMENT_ORDER.join('|')})\\.(\\d{1,2})\\.([fwtea-]{5})\\.([fwtea-]{5})\\.(${RUNE_IDS.join('|')})$`);

export function parseCanonical(id: string): { core: ElementId; tier: number; ring1: (ElementId | null)[]; ring2: (ElementId | null)[]; form: RuneId } | null {
  if (typeof id !== 'string') return null;
  const m = CANON_RE.exec(id);
  if (!m) return null;
  const [, core, tierS, r1, r2, form] = m as unknown as [string, ElementId, string, string, string, RuneId];
  const tier = Number(tierS);
  const toRing = (s: string) => [...s].map((ch) => (ch === EMPTY ? null : FROM_LETTER[ch]!));
  const ring1 = toRing(r1), ring2 = toRing(r2);
  const n1 = ring1.filter((x) => x).length, n2 = ring2.filter((x) => x).length;
  if (n2 > MAX_RING2 || (n2 > 0 && n1 < SLOTS)) return null;
  if (tier < 1 || tier > 1 + n1 + n2 || tier > GRADE_CAP[GRADE_CAP.length - 1]) return null;
  if (n1 + n2 === 0 && form !== 'bolt') return null;
  if (foldRings(r1, r2) !== `${r1}.${r2}`) return null;
  return { core, tier, ring1, ring2, form };
}

/** Runes known after defeating these bosses (starting runes first, then in zone order). */
export function runesUnlocked(defeatedBosses: string[], content: Content): RuneId[] {
  const out: RuneId[] = [...circleRules.startRunes];
  for (const z of content.zones) {
    if (!defeatedBosses.includes(z.bossId)) continue;
    for (const r of circleRules.runeUnlocks[z.bossId] ?? []) if (!out.includes(r)) out.push(r);
  }
  return out;
}

/** The tier a key item opens the circle to, or null if it opens nothing. */
export function tierUnlockOf(keyItemId: ItemId): number | null {
  return Object.hasOwn(circleRules.tierUnlocks, keyItemId) ? circleRules.tierUnlocks[keyItemId]! : null;
}
