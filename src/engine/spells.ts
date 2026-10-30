import type { Content, Spell } from './model';
import { namedCircleSpell, rareSpell } from './circle-spell';

/** Longest spell id the engine resolves (canonical circle ids are about 30 characters). */
export const SPELL_ID_MAX_LEN = 64;
export const MAX_SPELL_LEVEL = 50;
/** Target ratio between the median DPS of neighbouring spell tiers (spec 7.1/15; the curve check allows +-0.2). */
export const TIER_STEP = 1.8;
/** Attack multiplier of a fully empowered spell (level 50) over level 1 (spec 15): progress within a tier, short of the next. */
export const EMPOWER_MAX = 1.4;

const cache = new WeakMap<Content, Map<string, Spell | null>>();

/**
 * Named spell by lookup (a rare one: its circle's Lv.10 spell x RARE_BONUS with its own texts), or magic circle spell
 * (`m:` canonical id, with its named spell laid over) by generating it. Null for anything else, including the retired
 * crafted ids `c(<a>|<b>)`; never throws.
 */
export function resolveSpell(id: string, content: Content): Spell | null {
  if (typeof id !== 'string' || id.length === 0 || id.length > SPELL_ID_MAX_LEN) return null;
  const named = Object.hasOwn(content.spells, id) ? content.spells[id] : undefined;
  if (named && !(named.rare && named.circle)) return named;
  let memo = cache.get(content);
  if (!memo) cache.set(content, (memo = new Map()));
  if (memo.has(id)) return memo.get(id)!;
  const result = named ? rareSpell(named, content) : id.startsWith('m:') ? namedCircleSpell(id, content) : null;
  memo.set(id, result);
  return result;
}

/** Level scaling: only attack grows, from x1 at level 1 to x EMPOWER_MAX at MAX_SPELL_LEVEL. Tier and effects stay. */
export function spellAtLevel(spell: Spell, level: number): Spell {
  const L = Math.min(MAX_SPELL_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  if (L === 1) return spell;
  return { ...spell, attack: spell.attack * (1 + (EMPOWER_MAX - 1) * (L - 1) / (MAX_SPELL_LEVEL - 1)) };
}
