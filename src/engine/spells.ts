import { ELEMENT_ORDER } from './types';
import type { ElementId } from './types';
import type { Affinity, Content, Effect, Material, Spell } from './model';

export const CRAFTED_MAX_LEN = 512;
export const HARD_MAX_DEPTH = 8;
export const MAX_EFFECTS = 4;
export const MAX_SPELL_LEVEL = 50;
export const CEILING_FACTOR = 1.25;

const MAX_TIER = 20;
const MAX_COOLDOWN_MS = 6000;

/** Crafted spell id: the two input tokens in sorted order, so the id does not depend on slot order. */
export function craftedId(a: string, b: string): string {
  return a <= b ? `c(${a}|${b})` : `c(${b}|${a})`;
}

/** What an inventory item or spell id contributes to a crafted spell, or null if it can't be an input. */
export function inputToken(input: string, content: Content): string | null {
  if (input.startsWith('el:')) {
    const e = input.split(':')[1] as ElementId;
    return content.baseSpells[e] ?? null;
  }
  if (input.startsWith('mat:')) return input;
  if (input.length > 0 && !input.startsWith('key:')) return input;
  return null;
}

// Spec 6.4: +1 good, -1 bad, unlisted pairs 0.
const GOOD = new Set(['fire|wind', 'thunder|water', 'thunder|wind', 'earth|fire', 'water|wind', 'fire|thunder']);
const BAD = new Set(['fire|water', 'earth|thunder']);
const pairKey = (x: string, y: string) => (x <= y ? `${x}|${y}` : `${y}|${x}`);

export function affinityOf(a: ElementId[], b: ElementId[]): 'good' | 'odd' | 'bad' {
  let score = 0;
  for (const x of a) for (const y of b) {
    const k = pairKey(x, y);
    if (GOOD.has(k)) score++;
    else if (BAD.has(k)) score--;
  }
  return score > 0 ? 'good' : score < 0 ? 'bad' : 'odd';
}

/** Crafted attack may not exceed this for its tier: a bit above the strongest named spell of that tier or lower. */
export function attackCeiling(tier: number, content: Content): number {
  let max = 0;
  for (const s of Object.values(content.spells)) if (s.tier <= tier && s.attack > max) max = s.attack;
  return CEILING_FACTOR * max;
}

/** One side of a crafted spell: a spell, or a material standing in as a zero-attack pseudo spell. */
interface Part { spell: Spell; material: boolean }

function materialPart(m: Material): Part {
  return {
    material: true,
    spell: {
      id: m.id, name: m.name, nameEn: m.nameEn, desc: m.desc, elements: m.elements, tier: 1, attack: 0, cooldownMs: 0,
      effects: [m.effect], words: m.words, affinity: 'odd', depth: 0, named: false,
    },
  };
}

/** Index of the top-level '|' of "c(<a>|<b>)" contents, or -1 when the shape is wrong. */
function splitTop(inner: string): number {
  let depth = 0, at = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth++;
    else if (ch === ')') { if (--depth < 0) return -1; }
    else if (ch === '|' && depth === 0) { if (at !== -1) return -1; at = i; }
  }
  return depth === 0 ? at : -1;
}

const cache = new WeakMap<Content, Map<string, Spell | null>>();

function part(token: string, content: Content): Part | null {
  if (token.startsWith('mat:')) {
    const m = content.materials[token];
    return m ? materialPart(m) : null;
  }
  const s = resolveSpell(token, content);
  return s ? { spell: s, material: false } : null;
}

const scaleEffect = (e: Effect, material: boolean): Effect =>
  !material && 'mult' in e ? { ...e, mult: e.mult * 0.6 } : e;

function derive(id: string, content: Content): Spell | null {
  if (!id.startsWith('c(') || !id.endsWith(')')) return null;
  const inner = id.slice(2, -1);
  const bar = splitTop(inner);
  if (bar <= 0 || bar >= inner.length - 1) return null;
  const ta = inner.slice(0, bar), tb = inner.slice(bar + 1);
  if (ta > tb) return null; // one input pair, one id: parts must be in craftedId order
  const a = part(ta, content);
  const b = part(tb, content);
  if (!a || !b) return null;
  if (a.material && b.material) return null; // no reaction without a recipe
  const A = a.spell, B = b.spell;

  const depth = Math.max(A.depth, B.depth) + 1;
  if (depth > HARD_MAX_DEPTH) return null;
  const elements = ELEMENT_ORDER.filter((e) => A.elements.includes(e) || B.elements.includes(e));
  const affinity = affinityOf(A.elements, B.elements);
  const good = affinity === 'good', bad = affinity === 'bad';
  const tier = Math.min(MAX_TIER, Math.max(A.tier, B.tier) + (good ? 1 : 0));
  const gain = good ? 1 + 0.35 * 0.7 ** (depth - 1) : bad ? 0.6 : 1;
  const attack = Math.min(attackCeiling(tier, content), Math.round(Math.max(A.attack, B.attack) * gain));
  const cooldownMs = a.material ? B.cooldownMs
    : b.material ? A.cooldownMs
    : Math.min(MAX_COOLDOWN_MS, Math.round((A.cooldownMs + B.cooldownMs) * 0.6));

  const combined = [...A.effects.map((e) => scaleEffect(e, a.material)), ...B.effects.map((e) => scaleEffect(e, b.material))]
    .slice(0, MAX_EFFECTS);
  let seenBackfire = false;
  const effects = combined.filter((e) => e.kind !== 'backfire' || (!seenBackfire && (seenBackfire = true)));
  if (bad && !seenBackfire) effects.push({ kind: 'backfire', chance: 0.3, stunMs: 1200 });

  const desc = good ? `${A.name}和${B.name}互相增幅。`
    : bad ? `${A.name}和${B.name}互相干擾，威力下降，偶爾會反噬自己。`
    : `${A.name}和${B.name}同時發動。`;
  return {
    id, name: (bad ? '失控的' : '') + A.words.pre + B.words.noun,
    nameEn: (bad ? 'Unstable ' : '') + `${A.words.preEn} ${B.words.nounEn}`,
    desc, elements, tier, attack, cooldownMs, effects,
    words: { pre: A.words.pre, noun: B.words.noun, preEn: A.words.preEn, nounEn: B.words.nounEn },
    affinity: affinity as Affinity, depth, named: false,
  };
}

/** Named spell by lookup, crafted spell by deriving it from its id. Null for anything invalid; never throws. */
export function resolveSpell(id: string, content: Content): Spell | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > CRAFTED_MAX_LEN) return null;
  const named = Object.hasOwn(content.spells, id) ? content.spells[id] : undefined;
  if (named) return named;
  let memo = cache.get(content);
  if (!memo) cache.set(content, (memo = new Map()));
  if (memo.has(id)) return memo.get(id)!;
  const result = derive(id, content);
  memo.set(id, result);
  return result;
}

const bump = (level: number) => Math.floor((level - 1) / 10);

/** Level scaling: attack, tier, projectile counts and radii grow with the spell level (1-50). */
export function spellAtLevel(spell: Spell, level: number): Spell {
  const L = Math.min(MAX_SPELL_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  if (L === 1) return spell;
  const extra = bump(L), rad = 1 + 0.02 * (L - 1);
  const effects = spell.effects.map((e): Effect => {
    const out: Effect = { ...e };
    if (out.kind === 'bolt' || out.kind === 'blades' || out.kind === 'meteor') out.count += extra;
    if (out.kind === 'chain') out.hops += extra;
    if (out.kind === 'zone' && out.strikes > 0) out.strikes += extra;
    if ('radius' in out) out.radius *= rad;
    return out;
  });
  return { ...spell, attack: spell.attack * (1 + 0.08 * (L - 1)), tier: Math.min(MAX_TIER, spell.tier + extra), effects };
}
