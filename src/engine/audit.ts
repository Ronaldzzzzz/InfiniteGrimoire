import { canDamage } from './combat-rules';
import { elementEquivalent } from './inventory';
import type { Content, DropDef, GameState, Spell, Zone } from './model';
import { resolveSpell, spellAtLevel } from './spells';
import { highestPlayable, maxWaveSize, minStageMs, stageCount, WALK_MS } from './stages';
import { ELEMENT_ORDER, gradeValue, type ElementId } from './types';

/**
 * Upload audit for v2 saves: how much a client may have gained by fighting since `prev`. The server
 * passes the anchor state (with the current server-owned fields) and the capped time since the anchor.
 */
export const GAIN_TOLERANCE = 1.25;
export const GAIN_SLACK = 6;
/** Key items each lift one fog region, so they get no free allowance beyond what bosses could drop. */
export const KEY_SLACK = 0;

export interface GainBound {
  elements: Record<ElementId, number>;
  /** mat: and key: items */
  items: Record<string, number>;
}
export type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

const zeroElements = (): Record<ElementId, number> =>
  Object.fromEntries(ELEMENT_ORDER.map((e) => [e, 0])) as Record<ElementId, number>;

/** Most kills possible in a zone: one of its largest waves per walk, plus the wave already in range when the window began. */
export function maxKills(zone: Zone, elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  return (Math.floor(elapsed / WALK_MS) + 1) * maxWaveSize(zone);
}

/** Fastest sustained kill rate of a zone, in kills per ms. */
export const killRate = (zone: Zone): number => maxWaveSize(zone) / WALK_MS;

/** Per-item maximum yield of one kill, with element grades converted to grade-1 equivalents. */
function dropMaxima(drops: DropDef[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of drops) {
    let value = d.max;
    const m = /^el:([a-z]+):(\d+)$/.exec(d.itemId);
    if (m) value *= gradeValue(Number(m[2]));
    out.set(d.itemId, (out.get(d.itemId) ?? 0) + value);
  }
  return out;
}

const keyOf = (itemId: string): { element: ElementId } | { item: string } | null => {
  const m = /^el:([a-z]+):\d+$/.exec(itemId);
  if (m) return (ELEMENT_ORDER as readonly string[]).includes(m[1]!) ? { element: m[1] as ElementId } : null;
  return itemId.startsWith('mat:') || itemId.startsWith('key:') ? { item: itemId } : null;
};

/** The learned spells as they fight: each at its level. */
function fighting(state: GameState, content: Content): Spell[] {
  const out: Spell[] = [];
  for (const id of state.learned) {
    const s = resolveSpell(id, content);
    if (s) out.push(spellAtLevel(s, Object.hasOwn(state.levels, id) ? state.levels[id]! : 1));
  }
  return out;
}

const monsterOf = (content: Content, id: string) => (Object.hasOwn(content.monsters, id) ? content.monsters[id] : undefined);

export function maxGain(prev: GameState, elapsedMs: number, content: Content, zoneIds: string[] = prev.unlockedZones): GainBound {
  const elapsed = Math.max(0, elapsedMs);
  const spells = fighting(prev, content);
  const canHit = (monsterId: string): boolean => {
    const m = monsterOf(content, monsterId);
    return !!m && spells.some((s) => canDamage(s, m));
  };
  type Acc = { elements: Record<ElementId, number>; items: Record<string, number> };
  const newAcc = (): Acc => ({ elements: zeroElements(), items: {} });
  // element drops are tracked per element (all grades summed in grade-1 equivalents)
  const add = (acc: Acc, itemId: string, v: number) => {
    const k = keyOf(itemId);
    if (!k) return;
    if ('element' in k) acc.elements[k.element] += v;
    else acc.items[k.item] = (acc.items[k.item] ?? 0) + v;
  };

  const totals: Acc[] = [];
  const bursts: Acc[] = [];
  for (const zone of content.zones) {
    if (!zoneIds.includes(zone.id)) continue;
    const killable = zone.monsters.filter(canHit);
    if (killable.length === 0) continue;
    const kills = maxKills(zone, elapsed);

    // per kill, take the best monster for each key
    const perKill = newAcc();
    for (const id of killable) {
      const mine = newAcc();
      for (const [itemId, v] of dropMaxima(monsterOf(content, id)!.drops)) add(mine, itemId, v);
      for (const e of ELEMENT_ORDER) perKill.elements[e] = Math.max(perKill.elements[e], mine.elements[e]);
      for (const [k, v] of Object.entries(mine.items)) perKill.items[k] = Math.max(perKill.items[k] ?? 0, v);
    }

    const total = newAcc();
    const burst = newAcc();
    for (const e of ELEMENT_ORDER) {
      total.elements[e] = perKill.elements[e] * kills;
      burst.elements[e] = perKill.elements[e] * maxWaveSize(zone);
    }
    for (const [k, v] of Object.entries(perKill.items)) {
      total.items[k] = v * kills;
      burst.items[k] = v * maxWaveSize(zone);
    }
    if (canHit(zone.bossId)) {
      const bossDrops = dropMaxima(monsterOf(content, zone.bossId)!.drops);
      // a boss falls at most once per run of the boss stage, plus one already on its way down
      const bossKills = Math.floor(elapsed / minStageMs(zone, stageCount(zone))) + 1;
      for (const [itemId, v] of bossDrops) add(total, itemId, v * bossKills);
      // the player may have killed this zone's boss before moving on
      for (const [itemId, v] of bossDrops) add(burst, itemId, v);
    }
    totals.push(total);
    bursts.push(burst);
  }

  // Per key: the player spent the window mostly in one zone (its full total) and
  // possibly switched through the others (a burst of one largest wave each).
  const best = (get: (a: Acc) => number): number => {
    const burstSum = bursts.reduce((n, b) => n + get(b), 0);
    let out = 0;
    totals.forEach((t, i) => { out = Math.max(out, get(t) + burstSum - get(bursts[i]!)); });
    return out;
  };
  const bound: GainBound = { elements: zeroElements(), items: {} };
  for (const e of ELEMENT_ORDER) bound.elements[e] = best((a) => a.elements[e]);
  const itemKeys = new Set(totals.flatMap((t) => Object.keys(t.items)));
  for (const k of itemKeys) bound.items[k] = best((a) => a.items[k] ?? 0);
  return bound;
}

const sameSet = (a: string[], b: string[]): boolean => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val);

export function validateUpload(prev: GameState, next: GameState, elapsedMs: number, content: Content): ValidationResult {
  const reasons: string[] = [];
  const elapsed = Math.max(0, elapsedMs);

  // server-owned fields
  if (!sameSet(prev.learned, next.learned)) reasons.push('learned spells changed');
  if (canonical(prev.levels) !== canonical(next.levels)) reasons.push('levels changed');
  if (!sameSet(prev.revealed, next.revealed)) reasons.push('revealed changed');
  if (!sameSet(prev.passives, next.passives)) reasons.push('passives changed');
  if (canonical(prev.synthesisLog) !== canonical(next.synthesisLog)) reasons.push('synthesisLog changed');
  if (canonical(prev.clearedStages) !== canonical(next.clearedStages)) reasons.push('clearedStages changed');
  if (prev.lastClearAt !== next.lastClearAt) reasons.push('lastClearAt changed');
  if (!next.learned.includes(next.equipped)) reasons.push(`equipped spell ${next.equipped} is not learned`);
  if (!next.unlockedZones.includes(next.currentZone)) reasons.push(`currentZone ${next.currentZone} is not unlocked`);
  const here = content.zones.find((z) => z.id === next.currentZone);
  // stage progress is server-owned, so the reachable stage is measured on prev's clearedStages
  if (here && next.currentStage > highestPlayable(prev, here)) {
    reasons.push(`currentStage ${next.currentStage} of ${here.id} is beyond stage ${highestPlayable(prev, here)}`);
  }

  for (const b of prev.defeatedBosses) {
    if (!next.defeatedBosses.includes(b)) reasons.push(`defeatedBosses lost boss ${b}`);
  }

  // bosses and zone unlocks
  const newBosses = next.defeatedBosses.filter((b) => !prev.defeatedBosses.includes(b));
  const expectedUnlocked = new Set(prev.unlockedZones);
  const bossZones: { boss: string; zone: Zone; unlocks: string | null }[] = [];
  for (const boss of newBosses) {
    const z = content.zones.find((zz) => zz.bossId === boss);
    if (!z) {
      reasons.push(`unknown boss ${boss}`);
      continue;
    }
    const unlocks = content.zones.find((zz) => zz.order === z.order + 1)?.id ?? null;
    bossZones.push({ boss, zone: z, unlocks });
  }
  const spells = fighting(prev, content);
  const hits = (bossId: string): boolean => {
    const def = monsterOf(content, bossId);
    return !!def && spells.some((s) => canDamage(s, def));
  };
  const available = new Set(prev.unlockedZones);
  for (let progress = true; progress;) {
    progress = false;
    for (const b of bossZones) {
      if (available.has(b.zone.id) && hits(b.boss) && b.unlocks && !available.has(b.unlocks)) {
        available.add(b.unlocks);
        progress = true;
      }
    }
  }
  let minMs = 0;
  for (const b of bossZones) {
    const z = b.zone;
    if (!available.has(z.id)) reasons.push(`boss ${b.boss} defeated in locked zone ${z.id}`);
    if (!hits(b.boss)) reasons.push(`boss ${b.boss} cannot be damaged by learned spells`);
    // the boss stage opens only once every stage before it is cleared (server-owned)
    if ((prev.clearedStages[z.id] ?? 0) < stageCount(z) - 1) reasons.push(`boss ${b.boss} defeated before the stages of ${z.id} were cleared`);
    // a player already standing in the boss stage when the window began may have spent its time before it
    const underway = prev.currentZone === z.id && prev.currentStage === stageCount(z);
    if (!underway) minMs += minStageMs(z, stageCount(z));
    if (b.unlocks && available.has(z.id) && hits(b.boss)) expectedUnlocked.add(b.unlocks);
  }
  if (minMs > elapsed * GAIN_TOLERANCE) reasons.push(`boss ${newBosses.join(',')} defeated too fast: need ${Math.ceil(minMs)}ms, got ${elapsed}ms`);
  // inventory gains
  const bound = maxGain(prev, elapsed, content, [...available]);
  for (const e of ELEMENT_ORDER) {
    const gain = elementEquivalent(next.inventory, e) - elementEquivalent(prev.inventory, e);
    const limit = bound.elements[e] * GAIN_TOLERANCE + GAIN_SLACK;
    if (gain > limit) reasons.push(`element ${e} gain ${gain} exceeds limit ${limit}`);
  }
  const items = new Set<string>(Object.keys(bound.items));
  for (const inv of [prev.inventory, next.inventory]) for (const k of Object.keys(inv)) if (keyOf(k) && !k.startsWith('el:')) items.add(k);
  for (const k of items) {
    const gain = (next.inventory[k] ?? 0) - (prev.inventory[k] ?? 0);
    const limit = (bound.items[k] ?? 0) * GAIN_TOLERANCE + (k.startsWith('key:') ? KEY_SLACK : GAIN_SLACK);
    if (gain > limit) reasons.push(`item ${k} gain ${gain} exceeds limit ${limit}`);
  }

  if (!sameSet([...expectedUnlocked], next.unlockedZones)) reasons.push('unlockedZones does not match defeated bosses');

  return reasons.length ? { ok: false, reasons } : { ok: true };
}
