import { ELEMENT_ORDER } from './types';
import type { ElementId } from './types';
import type { Affinity, Content, Effect, NamedSpellDef, RuneId, School, Spell, StatusDef, Words } from './model';
import { parseCanonical, relations } from './circle';
import type { CircleNode, Placement } from './circle';
import { circleRules, NAMED_DEPTH } from './content';
import { TIER_STEP } from './spells';

/**
 * Spells generated from magic circles (spec 2026-10-30 sections 2.2, 3.5): the form comes from the rune, the scale from
 * the tier (attack x TIER_STEP per tier), the main element from the core and the side effects from the node elements
 * (火 burn, 風 push / pull / reach, 水 wet, 土 slow, 雷 more chain hops and a short stun; more nodes of one element = stronger).
 * 相生 pairs on the pentagram raise every mult, 相剋 pairs lower them and add the counter element's reaction status.
 * All numbers are placeholders (spec "範圍"); only the tier curve (tests/sim/tier-curve.test.ts) is gated.
 */

/** Attack of a Lv.2 circle; each tier above multiplies it by TIER_STEP. */
export const CIRCLE_ATTACK_LV2 = 120;

interface FormKit { cooldownMs: number; school: School; noun: string; nounEn: string; desc: string }
const FORMS: Record<RuneId, FormKit> = {
  bolt: { cooldownMs: 1100, school: 'evocation', noun: '魔彈', nounEn: 'Bolt', desc: '射出魔彈打向最近的怪，命中時炸開' },
  blades: { cooldownMs: 1100, school: 'evocation', noun: '飛刃', nounEn: 'Blades', desc: '向前方扇形射出飛刃，把怪往後推' },
  ring: { cooldownMs: 1100, school: 'conjuration', noun: '衝環', nounEn: 'Ring', desc: '以施法者為中心擴散一圈衝擊' },
  chain: { cooldownMs: 1100, school: 'evocation', noun: '鎖鏈', nounEn: 'Chain', desc: '從最近的怪開始一隻接一隻跳躍' },
  zone: { cooldownMs: 3500, school: 'conjuration', noun: '結界', nounEn: 'Ward', desc: '在怪最密集的地方留下持續傷害的區域' },
  meteor: { cooldownMs: 3500, school: 'cataclysm', noun: '隕星', nounEn: 'Meteor', desc: '召喚隕石砸向怪群，落地留下熔岩' },
  storm: { cooldownMs: 4000, school: 'cataclysm', noun: '風暴', nounEn: 'Storm', desc: '全場風暴，不斷隨機打擊場上的怪' },
  field: { cooldownMs: 3000, school: 'cataclysm', noun: '天罰', nounEn: 'Judgment', desc: '稍後對全場每一隻怪同時降下打擊' },
};

const CORE_WORDS: Record<ElementId, { pre: string; preEn: string }> = {
  fire: { pre: '烈焰', preEn: 'Blazing' },
  wind: { pre: '疾風', preEn: 'Gale' },
  thunder: { pre: '雷霆', preEn: 'Thunder' },
  earth: { pre: '岩石', preEn: 'Stone' },
  water: { pre: '流水', preEn: 'Tidal' },
};
const ELEMENT_CHAR: Record<ElementId, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };
const ELEMENT_EN: Record<ElementId, string> = { fire: 'Fire', wind: 'Wind', thunder: 'Thunder', earth: 'Earth', water: 'Water' };
const STATUS_NAME: Record<StatusDef['kind'], string> = {
  burn: '燃燒', wet: '潮濕', slow: '緩速', stun: '暈眩', freeze: '冰凍', blind: '致盲', regen: '回復',
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Statuses from the node elements and the 相剋 reactions; one per kind (longest time, strongest power). */
function statusesOf(n: Record<ElementId, number>, reactions: StatusDef[]): StatusDef[] {
  const list: StatusDef[] = [];
  if (n.fire > 0) list.push({ kind: 'burn', ms: 2500 + 250 * n.fire, power: round3(0.08 + 0.004 * n.fire) });
  if (n.water > 0) list.push({ kind: 'wet', ms: 3000 + 300 * n.water });
  if (n.thunder > 0) list.push({ kind: 'stun', ms: 150 + 50 * n.thunder });
  if (n.earth > 0) list.push({ kind: 'slow', ms: 1000 + 250 * n.earth, power: round3(Math.min(0.7, 0.35 + 0.04 * n.earth)) });
  const out: StatusDef[] = [];
  for (const st of [...list, ...reactions]) {
    const prior = out.find((x) => x.kind === st.kind);
    if (!prior) { out.push({ ...st }); continue; }
    prior.ms = Math.max(prior.ms, st.ms);
    if (st.power !== undefined) prior.power = Math.max(prior.power ?? 0, st.power);
  }
  return out;
}

/** The one effect of a form at tier `tier` (s = tier - 2 steps above Lv.2) with node counts `n`. */
function formEffect(form: RuneId, tier: number, n: Record<ElementId, number>, mult: number, status: StatusDef[]): Effect {
  const s = Math.max(0, tier - 2);
  const st = status.length > 0 ? { status } : {};
  switch (form) {
    case 'bolt':
      return { kind: 'bolt', mult: round3(1.3 * mult), count: 1, radius: round3(0.13 * (1 + 0.03 * s) * (1 + 0.05 * n.wind)), target: 'nearest', ...st };
    case 'blades':
      return { kind: 'blades', mult: round3(1.35 * mult), count: 3, push: round3(Math.min(1.5, 0.4 + 0.15 * n.wind)) };
    case 'ring':
      return { kind: 'ring', mult: round3(1.3 * mult), radius: round3(Math.min(0.9, 0.6 + 0.02 * s)), push: round3(Math.min(1.2, 0.2 + 0.1 * n.wind)), ...st };
    case 'chain':
      return { kind: 'chain', mult: round3(1.5 * mult), hops: 8 + (n.thunder >> 1), range: round3(0.3 + 0.02 * n.wind), explode: 0, ...st };
    case 'zone':
      return {
        kind: 'zone', mult: round3(0.265 * mult), radius: round3(0.3 + 0.01 * s), ms: 4000, tickMs: 250, target: 'densest',
        pull: round3(Math.min(0.8, 0.1 * n.wind)), follow: false, strikes: n.thunder >> 2, ...st,
      };
    case 'meteor':
      return { kind: 'meteor', mult: round3(2.8 * mult), count: 1, radius: round3(0.22 * (1 + 0.05 * n.wind)), delayMs: 800, lavaMs: 2000, target: 'densest' };
    case 'storm':
      return { kind: 'storm', mult: round3(0.42 * mult), ms: 5000, tickMs: 140, ...st };
    case 'field':
      return { kind: 'field', mult: round3(1.8 * mult), delayMs: 400, ...st };
  }
}

/**
 * The spell a canonical circle id makes, or null for anything that is not a canonical id. Deterministic: the same id
 * always gives the same spell. Named spells are laid over it by `namedCircleSpell`.
 */
export function circleSpell(id: string, _content: Content): Spell | null {
  const c = parseCanonical(id);
  if (!c) return null;
  const node = (e: ElementId | null): CircleNode | null => (e ? { element: e, grade: 1 } : null);
  const p: Placement = { core: { element: c.core, grade: 5 }, ring1: c.ring1.map(node), ring2: c.ring2.map(node), runes: [null, null] };
  const n = Object.fromEntries(ELEMENT_ORDER.map((e) => [e, 0])) as Record<ElementId, number>;
  for (const e of [...c.ring1, ...c.ring2]) if (e) n[e]++;

  const rel = relations(p), r = circleRules.relations;
  const mult = r.generateBonus ** rel.generate.length * r.overcomePenalty ** rel.overcome.length;
  const reactions = [...new Set(rel.overcome.map(([counter]) => counter))].map((e) => r.reactions[e]);
  const status = statusesOf(n, reactions);
  const effect = formEffect(c.form, c.tier, n, mult, status);
  const shown = 'status' in effect ? effect.status ?? [] : [];

  const others = ELEMENT_ORDER.filter((e) => e !== c.core && n[e] > 0);
  const elements: ElementId[] = [c.core, ...others];
  const kit = FORMS[c.form], core = CORE_WORDS[c.core];
  const words: Words = { pre: core.pre, noun: kit.noun, preEn: core.preEn, nounEn: kit.nounEn };
  const affinity: Affinity = others.length === 0 ? 'self'
    : rel.generate.length > rel.overcome.length ? 'good' : rel.overcome.length > rel.generate.length ? 'bad' : 'odd';
  return {
    id,
    name: core.pre + kit.noun + (others.length ? `・${others.map((e) => ELEMENT_CHAR[e]).join('')}` : ''),
    nameEn: `${core.preEn} ${kit.nounEn}` + (others.length ? ` (+${others.map((e) => ELEMENT_EN[e]).join(', ')})` : ''),
    desc: kit.desc + (shown.length ? `，附帶${shown.map((x) => STATUS_NAME[x.kind]).join('、')}。` : '。'),
    elements,
    tier: c.tier,
    attack: Math.round(CIRCLE_ATTACK_LV2 * TIER_STEP ** (c.tier - 2)),
    cooldownMs: kit.cooldownMs,
    effects: [effect],
    words,
    affinity,
    depth: NAMED_DEPTH(c.tier),
    named: false,
    school: kit.school,
  };
}

const namedIndex = new WeakMap<Content, Map<string, NamedSpellDef>>();

/** The non-rare named spell that names this circle (rare spells only roll from their circle; they never name it). */
export function namedFor(circleId: string, content: Content): NamedSpellDef | undefined {
  let index = namedIndex.get(content);
  if (!index) {
    index = new Map();
    for (const s of Object.values(content.spells)) if (s.circle && !s.rare) index.set(s.circle, s);
    namedIndex.set(content, index);
  }
  return index.get(circleId);
}

/** A circle's spell with its named spell's name, texts and school laid over the generated numbers. */
export function namedCircleSpell(id: string, content: Content): (Spell & { hint?: string; chant?: string }) | null {
  const spell = circleSpell(id, content);
  if (!spell) return null;
  const def = namedFor(id, content);
  if (!def) return spell;
  return {
    ...spell, name: def.name, nameEn: def.nameEn, desc: def.desc, hint: def.hint, words: def.words, school: def.school, named: true,
    ...(def.chant ? { chant: def.chant } : {}),
  };
}
