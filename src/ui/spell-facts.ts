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
  cooldownSec: string;
  statuses: { name: string; sec: string }[];
  chant: string | null;
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
    cooldownSec: `${(spell.cooldownMs / 1000).toFixed(1)} 秒`,
    statuses: [...longest].map(([kind, ms]) => ({ name: STATUS_NAMES[kind], sec: `${(ms / 1000).toFixed(1)} 秒` })),
    chant: chant ?? null,
  };
}
