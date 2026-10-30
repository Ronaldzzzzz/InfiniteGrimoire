import { content as shippedContent } from './content';
import { canDamage, computeDamage, overlevelEfficiency } from './combat-rules';
import { addItems } from './inventory';
import type { Rng } from './rng';
import { resolveSpell, spellAtLevel } from './spells';
import { BOSS_LIMIT_MS, WALK_MS, isBossStage, stageTotal } from './stages';
import { passiveBonuses } from './tree';
import type { Content, Effect, GameState, Monster, Spell, StatusDef, StatusKind, Target } from './model';
import type { ElementId, ItemId } from './types';

/**
 * Side-scrolling crowd battle. The field is a horizontal strip: the mage stands at (0, 0), monsters enter from the
 * right (x about 1) and walk left along a lane of half-height LANE_Y until they reach the stop line at STOP_X.
 * Each cast turns every effect of the equipped spell into an ActiveFx that runs
 * for a while (projectile flight, expanding ring, lingering zone...). Deterministic for a given Rng.
 */
export const STEP_MS = 50;
/** Burn and other damage over time is summed and reported as one 'dot' event this often (for the DPS readout). */
export const DOT_REPORT_MS = 1000;
export const MAX_ACTIVE_FX = 24;
/** The lane is y in [-LANE_Y, LANE_Y]. */
export const LANE_Y = 0.09;
/**
 * Area spells aimed at 'densest' / 'random' / 'strongest' pick among foes in front of the mage with x <= RANGE
 * (the visible fight); only when nobody is that close do they consider the whole field.
 */
export const RANGE = 0.75;
/** Foes stop when their centre reaches x = STOP_X + radius. */
export const STOP_X = 0.16;
/** Foes appear at SPAWN_X (plus up to SPAWN_JITTER), just off the right edge. */
export const SPAWN_X = 1.05;
const SPAWN_JITTER = 0.15;
/** Knockback and blind wandering never carry a foe that is already in view past this x. */
export const RIGHT_X = 1.0;
/** Foes walk at def.speed x LANE_SPEED along the lane. */
export const LANE_SPEED = 2.5;
/** Blades fly forward in a fan of +-BLADE_FAN radians around +x. */
export const BLADE_FAN = 0.7;

const DT = STEP_MS / 1000;
const KNOCK_KEEP = Math.pow(0.02, DT); // knockback velocity decays to 2% per second
const SLOW_DEFAULT = 0.75; // slow power = fraction of speed taken away
const REGEN_DEFAULT = 0.15; // regen power = max-hp fraction healed per second
const BLIND_TURN = 3; // rad/s of random wandering
const DENSE_R = 0.25;
export const BOLT_SPEED = 1.4;
const BOLT_MAX_MS = 4000;
export const RING_SPEED = 1;
export const BLADE_SPEED = 1;
export const BLADE_MS = 1100;
const BLADE_HIT_R = 0.07;
const CHAIN_MS = 300;
const CHAIN_EXPLODE_MULT = 0.7;
export const ZONE_REACH = 1.6; // zones pull foes within radius x this
const ZONE_SWIRL = 0.6;
const FOLLOW_RATE = 0.5;
const STRIKE_MULT = 2; // a zone's strikes hit harder than its tick
export const METEOR_STAGGER_MS = 180;
const METEOR_PUSH = 0.8;
const LAVA = { radius: 0.7, mult: 0.05, tickMs: 250, burn: { kind: 'burn', ms: 2000, power: 0.3 } as StatusDef };
const BURN_SPREAD_R = 0.12;
const BURN_SPREAD_MS = 2500;

export interface ActiveStatus { kind: StatusKind; remainingMs: number; power?: number }
export interface Foe { uid: number; defId: string; x: number; y: number; hp: number; maxHp: number; statuses: ActiveStatus[]; kx: number; ky: number; wander: number }
/**
 * One running effect. hits: bolt = pending target uids, meteor = target uids by landing order,
 * ring/blades/chain = uids already hit; unused for the others.
 */
export interface ActiveFx { uid: number; spellId: string; elements: ElementId[]; effect: Effect; x: number; y: number; ageMs: number; hits: number[] }
export interface Mage { cooldownMs: number; hasteMs: number; hasteFactor: number; stunMs: number }
/** walk: the next wave is on its way; fight: a wave is alive; held: boss stage waiting at the door; done/failed: over. */
export type StagePhase = 'walk' | 'fight' | 'held' | 'done' | 'failed';
export interface BattleState {
  zoneId: string; foes: Foe[]; fx: ActiveFx[]; mage: Mage; bossActive: boolean; nextUid: number;
  stage: number; phase: StagePhase;
  /** simulated ms spent in the current phase */
  phaseMs: number;
  /** index of the next wave to send (the boss wave comes after the last listed wave) */
  wave: number;
  killed: number; total: number;
  /** simulated ms since the boss appeared; null until then */
  bossMs: number | null;
  /** damage over time not yet reported, and how long it has been collecting */
  dotDamage: number; dotMs: number;
}
export type BattleEvent =
  | { type: 'spawn'; uid: number; boss: boolean }
  | { type: 'cast'; spellId: string }
  /** `damage` is the full hit (shown as the floating number); `dealt` is the hit points it actually removed (no overkill) */
  | { type: 'hit'; uid: number; damage: number; dealt: number; immune: boolean; element: ElementId | null }
  /** burn damage dealt over the last DOT_REPORT_MS, all foes together (hit events do not include it) */
  | { type: 'dot'; damage: number }
  | { type: 'status'; uid: number; kind: StatusKind }
  | { type: 'kill'; uid: number; defId: string; drops: ItemId[]; x: number; y: number }
  | { type: 'burst'; x: number; y: number; r: number; elements: ElementId[] }
  | { type: 'chain'; points: { x: number; y: number }[]; elements: ElementId[] }
  | { type: 'strike'; x: number; y: number; elements: ElementId[] }
  | { type: 'backfire'; stunMs: number }
  | { type: 'bossDefeated'; zoneId: string; unlockedZoneId: string | null }
  | { type: 'waveStart'; wave: number }
  | { type: 'stageCleared'; zoneId: string; stage: number }
  | { type: 'stageFailed'; zoneId: string; stage: number };

/** Where a new foe appears: just off the right edge, anywhere across the lane. */
export function spawnPoint(rng: Rng): { x: number; y: number } {
  return { x: SPAWN_X + rng.next() * SPAWN_JITTER, y: (rng.next() * 2 - 1) * LANE_Y };
}

/**
 * A fresh stage. `held` only applies to a boss stage: it waits at the door until `enterStage`.
 * `content` is where the zone's stages are read from (the shipped content unless a test passes its own).
 */
export function createBattle(zoneId: string, stage: number, opts: { held?: boolean; content?: Content } = {}): BattleState {
  const zone = (opts.content ?? shippedContent).zones.find((z) => z.id === zoneId);
  const held = !!opts.held && !!zone && isBossStage(zone, stage);
  return {
    zoneId, foes: [], fx: [], mage: { cooldownMs: 0, hasteMs: 0, hasteFactor: 1, stunMs: 0 },
    bossActive: false, nextUid: 1, dotDamage: 0, dotMs: 0,
    stage, phase: held ? 'held' : 'walk', phaseMs: 0, wave: 0, killed: 0, total: zone ? stageTotal(zone, stage) : 0, bossMs: null,
  };
}

/** Leaves the door of a held boss stage and starts walking; any other phase is returned as it is. */
export function enterStage(battle: BattleState): BattleState {
  return battle.phase === 'held' ? { ...battle, phase: 'walk', phaseMs: 0 } : battle;
}

/** How much of the stage's foes are down, 0..1. */
export const stageProgress = (b: BattleState): number => (b.total > 0 ? Math.min(1, b.killed / b.total) : 0);

// Geometry shared with the renderer.
export const boltTravel = (fx: ActiveFx): number => (fx.ageMs / 1000) * BOLT_SPEED;
export const ringRadius = (fx: ActiveFx): number => (fx.ageMs / 1000) * RING_SPEED;
export function bladePositions(fx: ActiveFx): { x: number; y: number }[] {
  if (fx.effect.kind !== 'blades') return [];
  const t = fx.ageMs / 1000, r = 0.03 + BLADE_SPEED * t, n = fx.effect.count;
  return Array.from({ length: n }, (_, k) => {
    const a = -BLADE_FAN + (2 * BLADE_FAN * (k + 0.5)) / n;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/** The element a hit of this effect shows (for colour), preferring the element the shape belongs to. */
const SHAPE_ELEMENT: Record<Effect['kind'], ElementId | null> = {
  bolt: 'fire', ring: 'water', blades: 'wind', chain: 'thunder', zone: 'wind', storm: 'thunder',
  meteor: 'earth', field: null, haste: 'wind', backfire: null,
};
const elementOf = (kind: Effect['kind'], elements: ElementId[]): ElementId | null => {
  const pref = SHAPE_ELEMENT[kind];
  return pref && elements.includes(pref) ? pref : (elements[0] ?? null);
};

const hasStatus = (f: Foe, kind: StatusKind): boolean => f.statuses.some((s) => s.kind === kind);
const statusOf = (f: Foe, kind: StatusKind): ActiveStatus | undefined => f.statuses.find((s) => s.kind === kind);
const alive = (f: Foe): boolean => f.hp > 0;

/** Per-step working state. */
interface Ctx {
  game: GameState; content: Content; rng: Rng; events: BattleEvent[];
  foes: Foe[]; byUid: Map<number, Foe>; newFx: ActiveFx[]; nextUid: number;
  /** burn damage dealt this step */
  dot: number;
  spells: Map<string, Spell | null>; bonus: ReturnType<typeof passiveBonuses> | null;
  densest: Foe | null | undefined; counts: Map<number, number> | null; engaged: Foe[] | null;
}

function spellOf(ctx: Ctx, id: string): Spell | null {
  let s = ctx.spells.get(id);
  if (s === undefined) {
    const base = resolveSpell(id, ctx.content);
    const level = Object.hasOwn(ctx.game.levels, id) ? ctx.game.levels[id]! : 1;
    s = base ? spellAtLevel(base, level) : null;
    ctx.spells.set(id, s);
  }
  return s;
}

function bonusPct(ctx: Ctx, spell: Spell): number {
  const b = (ctx.bonus ??= passiveBonuses(ctx.game, ctx.content));
  let pct = b.damagePct.all;
  for (const e of spell.elements) pct += b.damagePct[e];
  return pct;
}

const monsterOf = (ctx: Ctx, f: Foe): Monster | undefined =>
  Object.hasOwn(ctx.content.monsters, f.defId) ? ctx.content.monsters[f.defId] : undefined;

function applyStatuses(ctx: Ctx, f: Foe, list: StatusDef[] | undefined, damage: number): void {
  if (!list) return;
  for (const st of list) {
    const power = st.kind === 'burn' ? damage * (st.power ?? 0) : st.power;
    const existing = statusOf(f, st.kind);
    if (existing) {
      existing.remainingMs = Math.max(existing.remainingMs, st.ms);
      if (power !== undefined) existing.power = Math.max(existing.power ?? 0, power);
    } else {
      f.statuses.push(power !== undefined ? { kind: st.kind, remainingMs: st.ms, power } : { kind: st.kind, remainingMs: st.ms });
      ctx.events.push({ type: 'status', uid: f.uid, kind: st.kind });
    }
  }
}

/** One hit of `mult` x the spell's attack. mult 0 only applies statuses. thunder: lightning shapes, x2 on wet foes. */
function hit(ctx: Ctx, fx: ActiveFx, spell: Spell, f: Foe, mult: number, status: StatusDef[] | undefined, thunder = false): void {
  if (!alive(f)) return;
  const def = monsterOf(ctx, f);
  if (!def) return;
  const element = elementOf(fx.effect.kind, fx.elements);
  if (!canDamage(spell, def)) {
    if (mult > 0) ctx.events.push({ type: 'hit', uid: f.uid, damage: 0, dealt: 0, immune: true, element });
    return;
  }
  let damage = 0;
  if (mult > 0) {
    damage = computeDamage(spell.attack * mult, spell, def, {
      frozen: hasStatus(f, 'freeze'), wetThunder: thunder && hasStatus(f, 'wet'), bonusPct: bonusPct(ctx, spell),
    });
    const dealt = Math.min(f.hp, damage); // alive above, so f.hp > 0
    f.hp -= damage;
    ctx.events.push({ type: 'hit', uid: f.uid, damage, dealt, immune: false, element });
  }
  if (alive(f)) applyStatuses(ctx, f, status, damage);
}

function radiusOf(ctx: Ctx, f: Foe): number {
  return monsterOf(ctx, f)?.radius ?? 0;
}

function within(ctx: Ctx, x: number, y: number, r: number): Foe[] {
  const out: Foe[] = [];
  for (const f of ctx.foes) {
    if (!alive(f)) continue;
    const reach = r + radiusOf(ctx, f);
    const dx = f.x - x, dy = f.y - y;
    if (dx * dx + dy * dy <= reach * reach) out.push(f);
  }
  return out;
}

function push(f: Foe, fromX: number, fromY: number, power: number): void {
  if (power <= 0) return;
  const dx = f.x - fromX, dy = f.y - fromY, d = Math.hypot(dx, dy);
  if (d === 0) return;
  f.kx += Math.max(0, dx / d) * power; // knockback never sends a foe back toward (or behind) the mage
  f.ky += (dy / d) * power;
}

function explode(ctx: Ctx, fx: ActiveFx, spell: Spell, x: number, y: number, r: number, mult: number, status: StatusDef[] | undefined, pushPower = 0): void {
  for (const f of within(ctx, x, y, r)) {
    hit(ctx, fx, spell, f, mult, status);
    push(f, x, y, pushPower);
  }
  ctx.events.push({ type: 'burst', x, y, r, elements: fx.elements });
}

function strike(ctx: Ctx, fx: ActiveFx, spell: Spell, f: Foe, mult: number, status: StatusDef[] | undefined): void {
  ctx.events.push({ type: 'strike', x: f.x, y: f.y, elements: fx.elements });
  hit(ctx, fx, spell, f, mult, status, true);
}

/** Neighbour counts within DENSE_R, computed at most once per step and only when asked for. */
function neighbourCounts(ctx: Ctx): Map<number, number> {
  if (ctx.counts) return ctx.counts;
  const live = ctx.foes.filter(alive);
  const n = new Array<number>(live.length).fill(1);
  const r2 = DENSE_R * DENSE_R;
  for (let i = 0; i < live.length; i++) {
    const a = live[i]!;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j]!;
      const dx = a.x - b.x;
      if (dx > DENSE_R || dx < -DENSE_R) continue;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy <= r2) { n[i]!++; n[j]!++; }
    }
  }
  ctx.counts = new Map(live.map((f, i) => [f.uid, n[i]!]));
  return ctx.counts;
}

/** Live foes with x <= RANGE, or every live foe when none are (computed once per step). */
function engagedFoes(ctx: Ctx): Foe[] {
  if (ctx.engaged) return ctx.engaged;
  const live = ctx.foes.filter(alive);
  const near = live.filter((f) => f.x <= RANGE);
  return (ctx.engaged = near.length > 0 ? near : live);
}

function densestFoe(ctx: Ctx): Foe | null {
  if (ctx.densest !== undefined) return ctx.densest;
  const counts = neighbourCounts(ctx);
  let best: Foe | null = null, bn = -1;
  for (const f of engagedFoes(ctx)) {
    const c = counts.get(f.uid);
    if (c !== undefined && c > bn) { bn = c; best = f; }
  }
  return (ctx.densest = best);
}

function pickTargets(ctx: Ctx, target: Target, n: number): Foe[] {
  const live = target === 'center' || target === 'nearest' ? ctx.foes.filter(alive) : engagedFoes(ctx).filter(alive);
  switch (target) {
    case 'center':
    case 'nearest':
      return live.sort((a, b) => a.x - b.x).slice(0, n);
    case 'strongest':
      return live.sort((a, b) => b.hp - a.hp).slice(0, n);
    case 'densest': {
      if (n === 1) { const d = densestFoe(ctx); return d ? [d] : []; }
      const counts = neighbourCounts(ctx);
      return live.sort((a, b) => counts.get(b.uid)! - counts.get(a.uid)!).slice(0, n);
    }
    case 'random': {
      const out: Foe[] = [];
      for (let i = 0; i < n && live.length > 0; i++) out.push(live.splice(ctx.rng.int(0, live.length - 1), 1)[0]!);
      return out;
    }
  }
}

function nearestTo(ctx: Ctx, x: number, y: number, skip?: Set<number>): Foe | null {
  let best: Foe | null = null, bd = Infinity;
  for (const f of ctx.foes) {
    if (!alive(f) || skip?.has(f.uid)) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function addFx(ctx: Ctx, spell: Spell, effect: Effect, x = 0, y = 0, hits: number[] = []): ActiveFx {
  const fx: ActiveFx = { uid: ctx.nextUid++, spellId: spell.id, elements: spell.elements, effect, x, y, ageMs: 0, hits };
  ctx.newFx.push(fx);
  return fx;
}

function runChain(ctx: Ctx, fx: ActiveFx, spell: Spell, e: Extract<Effect, { kind: 'chain' }>): void {
  const points = [{ x: 0, y: 0 }];
  const seen = new Set<number>();
  let cx = 0, cy = 0;
  for (let i = 0; i < e.hops; i++) {
    const n = nearestTo(ctx, cx, cy, seen);
    if (!n || (i > 0 && Math.hypot(n.x - cx, n.y - cy) > e.range)) break;
    seen.add(n.uid);
    fx.hits.push(n.uid);
    points.push({ x: n.x, y: n.y });
    cx = n.x; cy = n.y;
    hit(ctx, fx, spell, n, e.mult, e.status, true);
    if (e.explode > 0) explode(ctx, fx, spell, cx, cy, e.explode, e.mult * CHAIN_EXPLODE_MULT, e.status);
  }
  ctx.events.push({ type: 'chain', points, elements: fx.elements });
}

/** Turns one effect of a cast into an ActiveFx (chain resolves right away). */
function launch(ctx: Ctx, spell: Spell, e: Effect, mage: Mage): void {
  switch (e.kind) {
    case 'haste':
      mage.hasteMs = e.ms;
      mage.hasteFactor = e.factor;
      return;
    case 'backfire':
      return; // rolled before the cast
    case 'bolt': {
      const targets = pickTargets(ctx, e.target, e.count);
      if (targets.length > 0) addFx(ctx, spell, e, 0, 0, targets.map((f) => f.uid));
      return;
    }
    case 'meteor': {
      const targets = pickTargets(ctx, e.target, e.count);
      const first = targets[0];
      addFx(ctx, spell, e, first?.x ?? 0, first?.y ?? 0, targets.map((f) => f.uid));
      return;
    }
    case 'zone': {
      const at = e.target === 'center' ? null : pickTargets(ctx, e.target, 1)[0];
      addFx(ctx, spell, e, at?.x ?? 0, at?.y ?? 0);
      return;
    }
    case 'chain':
      runChain(ctx, addFx(ctx, spell, e), spell, e);
      return;
    case 'ring':
    case 'blades':
    case 'storm':
    case 'field':
      addFx(ctx, spell, e);
      return;
  }
}

/** Number of tick boundaries crossed going from age - STEP_MS to age (ticks at tickMs, 2 tickMs... up to endMs). */
function ticksCrossed(age: number, tickMs: number, endMs: number): number {
  const now = Math.floor(Math.min(age, endMs) / tickMs);
  const before = Math.floor(Math.min(age - STEP_MS, endMs) / tickMs);
  return Math.max(0, now - before);
}

/** Advances one active effect; returns false when it is finished. */
function advance(ctx: Ctx, fx: ActiveFx): boolean {
  fx.ageMs += STEP_MS;
  const spell = spellOf(ctx, fx.spellId);
  if (!spell) return false;
  const e = fx.effect;
  switch (e.kind) {
    case 'bolt': {
      const travel = boltTravel(fx);
      const pending: number[] = [];
      for (const uid of fx.hits) {
        let t = ctx.byUid.get(uid);
        if (!t || !alive(t)) t = nearestTo(ctx, 0, 0) ?? undefined;
        if (!t) continue;
        if (travel >= Math.hypot(t.x, t.y) - radiusOf(ctx, t)) explode(ctx, fx, spell, t.x, t.y, e.radius, e.mult, e.status);
        else pending.push(t.uid);
      }
      fx.hits = pending;
      return pending.length > 0 && fx.ageMs < BOLT_MAX_MS;
    }
    case 'ring': {
      const r = ringRadius(fx);
      for (const f of within(ctx, 0, 0, Math.min(r, e.radius))) {
        if (fx.hits.includes(f.uid)) continue;
        fx.hits.push(f.uid);
        hit(ctx, fx, spell, f, e.mult, e.status);
        push(f, 0, 0, e.push);
      }
      return r < e.radius;
    }
    case 'blades': {
      for (const p of bladePositions(fx)) {
        for (const f of within(ctx, p.x, p.y, BLADE_HIT_R)) {
          if (fx.hits.includes(f.uid)) continue;
          fx.hits.push(f.uid);
          hit(ctx, fx, spell, f, e.mult, undefined);
          push(f, 0, 0, e.push);
        }
      }
      return fx.ageMs < BLADE_MS;
    }
    case 'chain':
      return fx.ageMs < CHAIN_MS;
    case 'zone': {
      if (e.follow) {
        const d = densestFoe(ctx);
        if (d) { fx.x += (d.x - fx.x) * FOLLOW_RATE * DT; fx.y += (d.y - fx.y) * FOLLOW_RATE * DT; }
      }
      if (e.pull > 0) {
        const step = e.pull * DT;
        for (const f of within(ctx, fx.x, fx.y, e.radius * ZONE_REACH)) {
          const dx = f.x - fx.x, dy = f.y - fx.y, d = Math.hypot(dx, dy);
          if (d === 0) continue;
          const inward = Math.min(step, d);
          f.x -= (dx / d) * inward - (dy / d) * step * ZONE_SWIRL;
          f.y -= (dy / d) * inward + (dx / d) * step * ZONE_SWIRL;
        }
      }
      for (let t = ticksCrossed(fx.ageMs, e.tickMs, e.ms); t > 0; t--) {
        const inside = within(ctx, fx.x, fx.y, e.radius);
        for (const f of inside) hit(ctx, fx, spell, f, e.mult, e.status);
        for (let s = 0; s < e.strikes; s++) {
          const live = inside.filter(alive);
          if (live.length === 0) break;
          strike(ctx, fx, spell, live[ctx.rng.int(0, live.length - 1)]!, e.mult * STRIKE_MULT, e.status);
        }
      }
      return fx.ageMs < e.ms;
    }
    case 'storm': {
      for (let t = ticksCrossed(fx.ageMs, e.tickMs, e.ms); t > 0; t--) {
        const live = ctx.foes.filter(alive);
        if (live.length === 0) break;
        strike(ctx, fx, spell, live[ctx.rng.int(0, live.length - 1)]!, e.mult, e.status);
      }
      return fx.ageMs < e.ms;
    }
    case 'meteor': {
      for (let i = 0; i < e.count; i++) {
        const at = e.delayMs + i * METEOR_STAGGER_MS;
        if (at > fx.ageMs || at <= fx.ageMs - STEP_MS) continue;
        const uid = fx.hits.length > 0 ? fx.hits[i % fx.hits.length]! : -1;
        const t = ctx.byUid.get(uid);
        const x = t && alive(t) ? t.x : fx.x, y = t && alive(t) ? t.y : fx.y;
        explode(ctx, fx, spell, x, y, e.radius, e.mult, undefined, METEOR_PUSH);
        if (e.lavaMs > 0) {
          addFx(ctx, spell, {
            kind: 'zone', mult: e.mult * LAVA.mult, radius: e.radius * LAVA.radius, ms: e.lavaMs, tickMs: LAVA.tickMs,
            target: 'center', pull: 0, follow: false, strikes: 0, status: [LAVA.burn],
          }, x, y);
        }
      }
      return fx.ageMs < e.delayMs + (e.count - 1) * METEOR_STAGGER_MS;
    }
    case 'field': {
      if (fx.ageMs < e.delayMs) return true;
      for (const f of ctx.foes) hit(ctx, fx, spell, f, e.mult, e.status);
      ctx.events.push({ type: 'burst', x: 0, y: 0, r: 1, elements: fx.elements });
      return false;
    }
    case 'haste':
    case 'backfire':
      return false;
  }
}

/** Burn, regen, knockback and walking for one foe. */
function moveFoe(ctx: Ctx, f: Foe, def: Monster): void {
  for (const s of f.statuses) {
    if (s.kind === 'burn' && s.power) {
      if (f.hp > 0) ctx.dot += Math.min(f.hp, s.power * DT);
      f.hp -= s.power * DT;
    }
    else if (s.kind === 'regen') f.hp += f.maxHp * (s.power ?? REGEN_DEFAULT) * DT;
  }
  if (f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + def.regenPerSec * DT);

  const inView = f.x <= RIGHT_X; // foes still walking in from SPAWN_X are not confined yet
  f.x += f.kx * DT;
  f.y += f.ky * DT;
  f.kx *= KNOCK_KEEP;
  f.ky *= KNOCK_KEEP;

  if (!hasStatus(f, 'stun') && !hasStatus(f, 'freeze')) {
    const slow = statusOf(f, 'slow');
    const sp = def.speed * LANE_SPEED * (slow ? 1 - (slow.power ?? SLOW_DEFAULT) : 1) * DT;
    if (hasStatus(f, 'blind')) {
      f.wander += (ctx.rng.next() * 2 - 1) * BLIND_TURN * DT;
      f.x += Math.cos(f.wander) * sp;
      f.y += Math.sin(f.wander) * sp;
    } else {
      const stop = STOP_X + def.radius;
      if (f.x > stop) f.x -= Math.min(sp, f.x - stop);
    }
  }
  // keep foes that are in view inside the lane: knockback, wandering and zone pulls cannot push them out of it
  if (inView || f.x <= RIGHT_X) {
    if (f.x > RIGHT_X) { f.x = RIGHT_X; f.kx = 0; }
    if (f.y > LANE_Y) { f.y = LANE_Y; f.ky = 0; } else if (f.y < -LANE_Y) { f.y = -LANE_Y; f.ky = 0; }
    const minX = STOP_X + def.radius;
    if (f.x < minX) { f.x = minX; if (f.kx < 0) f.kx = 0; }
  }

  for (const s of f.statuses) s.remainingMs -= STEP_MS;
  if (f.statuses.some((s) => s.remainingMs <= 0)) f.statuses = f.statuses.filter((s) => s.remainingMs > 0);
}

export function stepBattle(
  game: GameState,
  battle: BattleState,
  content: Content,
  rng: Rng,
): { game: GameState; battle: BattleState; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  const zone = content.zones.find((z) => z.id === battle.zoneId);
  if (!zone) return { game, battle, events };
  if (battle.phase === 'held' || battle.phase === 'done' || battle.phase === 'failed') return { game, battle, events };

  const foes: Foe[] = battle.foes.map((f) => ({ ...f, statuses: f.statuses.map((s) => ({ ...s })) }));
  const ctx: Ctx = {
    game, content, rng, events, foes, byUid: new Map(foes.map((f) => [f.uid, f])), newFx: [],
    nextUid: battle.nextUid, spells: new Map(), bonus: null, densest: undefined, counts: null, engaged: null, dot: 0,
  };
  const mage: Mage = { ...battle.mage };
  let phase: StagePhase = battle.phase;
  let phaseMs = battle.phaseMs + STEP_MS;
  let wave = battle.wave;
  let killed = battle.killed;
  let bossMs = battle.bossMs === null ? null : battle.bossMs + STEP_MS;
  let bossActive = battle.bossActive;
  let inventory = game.inventory;
  let defeatedBosses = game.defeatedBosses;
  let unlockedZones = game.unlockedZones;

  const spawn = (defId: string, boss: boolean): void => {
    const def = Object.hasOwn(content.monsters, defId) ? content.monsters[defId] : undefined;
    if (!def) return;
    const uid = ctx.nextUid++;
    const f: Foe = {
      uid, defId, ...spawnPoint(rng), hp: def.hp, maxHp: def.hp, statuses: [],
      kx: 0, ky: 0, wander: rng.next() * 2 * Math.PI,
    };
    foes.push(f);
    ctx.byUid.set(uid, f);
    events.push({ type: 'spawn', uid, boss });
  };
  const randomMonster = () => zone.monsters[rng.int(0, zone.monsters.length - 1)]!;

  // 1. waves: after a walk the whole next wave appears at once; the boss comes alone after the last listed wave
  if (phase === 'walk' && phaseMs >= WALK_MS) {
    const sizes = zone.stages[battle.stage - 1]?.waves ?? [];
    events.push({ type: 'waveStart', wave });
    if (wave < sizes.length) {
      for (let i = 0; i < sizes[wave]!; i++) spawn(randomMonster(), false);
    } else {
      bossActive = true;
      bossMs = 0;
      spawn(zone.bossId, true);
    }
    wave++;
    phase = 'fight';
    phaseMs = 0;
  }

  // 2. running effects
  const fx: ActiveFx[] = [];
  for (const old of battle.fx) {
    const cur = { ...old, hits: [...old.hits] };
    if (advance(ctx, cur)) fx.push(cur);
  }

  // 3. casting
  const equipped = spellOf(ctx, game.equipped);
  if (mage.hasteMs > 0) mage.hasteMs = Math.max(0, mage.hasteMs - STEP_MS);
  if (mage.stunMs > 0) {
    mage.stunMs = Math.max(0, mage.stunMs - STEP_MS);
  } else if (equipped) {
    mage.cooldownMs -= STEP_MS * (mage.hasteMs > 0 ? mage.hasteFactor : 1);
    if (mage.cooldownMs <= 0) {
      if (!foes.some(alive)) {
        mage.cooldownMs = 0;
      } else {
        const cdPct = Math.min(90, (ctx.bonus ??= passiveBonuses(game, content)).cooldownPct);
        mage.cooldownMs += Math.max(STEP_MS, equipped.cooldownMs * (1 - cdPct / 100));
        const backfire = equipped.effects.find((e) => e.kind === 'backfire');
        if (backfire && rng.next() < backfire.chance) {
          mage.stunMs = backfire.stunMs;
          events.push({ type: 'backfire', stunMs: backfire.stunMs });
        } else {
          events.push({ type: 'cast', spellId: equipped.id });
          for (const e of equipped.effects) launch(ctx, equipped, e, mage);
        }
      }
    }
  }
  // effects spawned this step (casts, lava) join; the oldest end first past the cap
  fx.push(...ctx.newFx);
  if (fx.length > MAX_ACTIVE_FX) fx.splice(0, fx.length - MAX_ACTIVE_FX);

  // 4. statuses and movement
  for (const f of foes) {
    if (!alive(f)) continue;
    const def = monsterOf(ctx, f);
    if (def) moveFoe(ctx, f, def);
  }

  // 5. kills
  const dead = foes.filter((f) => !alive(f)).sort((a, b) => a.uid - b.uid);
  const efficiencyOf = (def: Monster): number => (equipped ? overlevelEfficiency(equipped.tier, def.tier) : 1);
  for (const f of dead) {
    const burn = statusOf(f, 'burn');
    // spread fire, but never onto foes the equipped spell cannot damage (immune foes take no statuses)
    if (burn?.power && equipped) {
      for (const o of foes) {
        if (!alive(o) || Math.hypot(o.x - f.x, o.y - f.y) > BURN_SPREAD_R) continue;
        const odef = monsterOf(ctx, o);
        if (!odef || !canDamage(equipped, odef)) continue;
        const own = statusOf(o, 'burn');
        if (own) {
          own.remainingMs = Math.max(own.remainingMs, BURN_SPREAD_MS);
          own.power = Math.max(own.power ?? 0, burn.power);
        } else {
          o.statuses.push({ kind: 'burn', remainingMs: BURN_SPREAD_MS, power: burn.power });
          events.push({ type: 'status', uid: o.uid, kind: 'burn' });
        }
      }
    }
    const def = monsterOf(ctx, f);
    const drops: ItemId[] = [];
    if (def) {
      const eff = efficiencyOf(def);
      for (const d of def.drops) {
        // overleveling thins out loot, but a key item is what lifts the fog: it always drops at its own chance
        if (rng.next() < d.chance * (d.itemId.startsWith('key:') ? 1 : eff)) {
          const qty = rng.int(d.min, d.max);
          for (let i = 0; i < qty; i++) drops.push(d.itemId);
        }
      }
    }
    if (drops.length > 0) inventory = addItems(inventory, drops);
    events.push({ type: 'kill', uid: f.uid, defId: f.defId, drops, x: f.x, y: f.y });

    if (def?.boss) {
      bossActive = false;
      if (!defeatedBosses.includes(zone.bossId)) defeatedBosses = [...defeatedBosses, zone.bossId];
      const next = content.zones.find((z) => z.order === zone.order + 1);
      if (next && !unlockedZones.includes(next.id)) unlockedZones = [...unlockedZones, next.id];
      events.push({ type: 'bossDefeated', zoneId: zone.id, unlockedZoneId: next?.id ?? null });
    }
    killed++;
  }

  let dotDamage = battle.dotDamage + ctx.dot;
  let dotMs = battle.dotMs + STEP_MS;
  if (dotMs >= DOT_REPORT_MS) {
    if (dotDamage > 0) events.push({ type: 'dot', damage: dotDamage });
    dotDamage = 0;
    dotMs -= DOT_REPORT_MS;
  }

  // 6. stage flow: a cleared wave sends us walking again; nothing left to send ends the stage; a slow boss fails it
  const remaining = dead.length > 0 ? foes.filter(alive) : foes;
  if (phase === 'fight' && !remaining.some(alive)) {
    const waveCount = zone.stages[battle.stage - 1]?.waves.length ?? 0;
    if (wave < waveCount || (isBossStage(zone, battle.stage) && bossMs === null)) {
      phase = 'walk';
      phaseMs = 0;
    } else {
      phase = 'done';
      events.push({ type: 'stageCleared', zoneId: zone.id, stage: battle.stage });
    }
  } else if (phase === 'fight' && bossActive && bossMs !== null && bossMs >= BOSS_LIMIT_MS) {
    phase = 'failed';
    events.push({ type: 'stageFailed', zoneId: zone.id, stage: battle.stage });
  }

  const changed = inventory !== game.inventory || defeatedBosses !== game.defeatedBosses || unlockedZones !== game.unlockedZones;
  return {
    game: changed ? { ...game, inventory, defeatedBosses, unlockedZones } : game,
    battle: {
      zoneId: battle.zoneId, foes: remaining, fx, mage, bossActive, nextUid: ctx.nextUid, dotDamage, dotMs,
      stage: battle.stage, phase, phaseMs, wave, killed, total: battle.total, bossMs,
    },
    events,
  };
}
