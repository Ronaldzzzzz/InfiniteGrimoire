import type { ActionResult } from '../game/api';
import type { Content } from '../engine/model';
import { MAX_SPELL_LEVEL, resolveSpell, spellAtLevel } from '../engine/spells';
import { ELEMENT_ORDER, MAX_ELEMENT_GRADE, type ElementId } from '../engine/types';
import { blendForSpell, particleStyle, type ParticleShape } from '../render/element-fx';
import { COLORS } from '../render/palette';
import { itemName, synthMessage } from './messages';

/** One thing that can sit in a synthesis slot, described for display. */
export type AltarInput =
  | { kind: 'spell'; id: string; name: string; elements: ElementId[]; tier: number; level: number }
  | { kind: 'element'; id: string; name: string; element: ElementId; grade: number }
  | { kind: 'material'; id: string; name: string };

/** Describes a slot id (an element item, a material, or a spell); null for anything else, including key items. */
export function describeInput(id: string, content: Content, levels: Record<string, number>): AltarInput | null {
  const [kind, a, b] = id.split(':');
  if (kind === 'el') {
    const grade = Number(b);
    if (!(ELEMENT_ORDER as readonly string[]).includes(a ?? '')) return null;
    if (!Number.isInteger(grade) || grade < 1 || grade > MAX_ELEMENT_GRADE) return null;
    return { kind: 'element', id, name: itemName(id, content), element: a as ElementId, grade };
  }
  if (kind === 'mat') {
    if (!Object.hasOwn(content.materials, id)) return null;
    return { kind: 'material', id, name: itemName(id, content) };
  }
  if (kind === 'key') return null;

  const spell = resolveSpell(id, content);
  if (!spell) return null;
  const requested = Object.hasOwn(levels, id) ? levels[id]! : 1;
  const level = Math.min(MAX_SPELL_LEVEL, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)));
  return { kind: 'spell', id, name: spell.name, elements: [...spell.elements], tier: spellAtLevel(spell, level).tier, level };
}

/** How a slot is drawn: colours and particle shapes, the particle count, and whether it gets a halo. */
export interface AltarLook {
  primary: string;
  secondary: string | null;
  shapes: ParticleShape[];
  particles: number;
  halo: boolean;
}

/** Elements use their own particle; spells blend their elements and look stronger (more particles, a halo); materials are neutral gold. */
export function lookOf(input: AltarInput): AltarLook {
  if (input.kind === 'element') {
    const style = particleStyle(input.element);
    return { primary: style.color, secondary: null, shapes: [style.shape], particles: 8, halo: false };
  }
  if (input.kind === 'spell') {
    const blend = blendForSpell(input.elements);
    return { primary: blend.primary, secondary: blend.secondary, shapes: blend.shapes, particles: 14, halo: true };
  }
  return { primary: COLORS.amber, secondary: null, shapes: ['spark'], particles: 6, halo: false };
}

export type RevealTone = 'new' | 'crafted' | 'known' | 'fizzle' | 'dormant' | 'overload';

/** What the altar shows once a synthesis answers. */
export interface Reveal {
  tone: RevealTone;
  kicker: string;
  spellId: string | null;
  detail: string;
}

/** Maps a synthesis result to its reveal; refusals (and non-synthesis results) map to null. */
export function revealOf(result: ActionResult, content: Content, inputs: string[]): Reveal | null {
  const detail = (): string => synthMessage(result, content, inputs);
  switch (result.kind) {
    case 'learned':
      return result.crafted
        ? { tone: 'crafted', kicker: '自創魔法！', spellId: result.spellId, detail: detail() }
        : { tone: 'new', kicker: '新發現！', spellId: result.spellId, detail: detail() };
    case 'duplicate':
      return { tone: 'known', kicker: '已經會了', spellId: result.spellId, detail: detail() };
    case 'noReaction':
      return { tone: 'fizzle', kicker: '沒有反應', spellId: null, detail: detail() };
    case 'dormant':
      return { tone: 'dormant', kicker: '似乎還缺少什麼……', spellId: null, detail: detail() };
    case 'overload':
      return { tone: 'overload', kicker: '魔力過載！', spellId: result.spellId, detail: detail() };
    default:
      return null;
  }
}
