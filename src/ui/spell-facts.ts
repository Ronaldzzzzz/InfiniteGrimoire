import type { School, Spell, StatusKind } from '../engine/model';
import { spellAtLevel } from '../engine/spells';

export const SCHOOL_NAMES: Record<School, string> = {
  evocation: '塑能投射',
  conjuration: '結界領域',
  cataclysm: '天象災變',
  enchantment: '秘儀賦予',
  forbidden: '神話禁咒',
};

export const STATUS_NAMES: Record<StatusKind, string> = {
  burn: '燃燒',
  wet: '潮濕',
  slow: '緩速',
  stun: '暈眩',
  freeze: '冰凍',
  blind: '致盲',
  regen: '再生',
};

export interface SpellFacts {
  school: string;
  attack: number;
  /** attack × the largest effect mult: the number before defence, affinity and statuses. */
  perHit: number;
  cooldownSec: string;
  statuses: { name: string; sec: string }[];
  chant: string | null;
}

/** Damage of one hit before defence: the empowered attack times the strongest effect's mult, rounded. */
export function perHit(spell: Spell, level: number): number {
  const mult = Math.max(0, ...spell.effects.map((e) => ('mult' in e ? e.mult : 0)));
  return Math.round(spellAtLevel(spell, level).attack * mult);
}

export const formatPerHit = (n: number): string => n.toLocaleString('en-US');

export interface PerHitDiff {
  value: number;
  text: string;
  tone: 'up' | 'down';
}

/** How far the viewed spell's per-hit damage is from the equipped one's (null when equal or nothing to compare). */
export function perHitDiff(spell: Spell, level: number, versus?: { spell: Spell; level: number } | null): PerHitDiff | null {
  if (!versus) return null;
  const value = perHit(spell, level) - perHit(versus.spell, versus.level);
  if (value === 0) return null;
  return value > 0
    ? { value, text: `（+${formatPerHit(value)}）`, tone: 'up' }
    : { value, text: `（−${formatPerHit(-value)}）`, tone: 'down' };
}

/** The numbers a player may read about a spell (attack at the given empower level, rounded). */
export function spellFacts(spell: Spell, level: number, chant?: string): SpellFacts {
  const longest = new Map<StatusKind, number>();
  for (const e of spell.effects) {
    if (!('status' in e) || !e.status) continue;
    for (const s of e.status) longest.set(s.kind, Math.max(longest.get(s.kind) ?? 0, s.ms));
  }
  return {
    school: SCHOOL_NAMES[spell.school],
    attack: Math.round(spellAtLevel(spell, level).attack),
    perHit: perHit(spell, level),
    cooldownSec: `${(spell.cooldownMs / 1000).toFixed(1)} 秒`,
    statuses: [...longest].map(([kind, ms]) => ({ name: STATUS_NAMES[kind], sec: `${(ms / 1000).toFixed(1)} 秒` })),
    chant: chant ?? null,
  };
}
