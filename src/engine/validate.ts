import { canDamage } from './combat-rules';
import { elementEquivalent } from './inventory';
import type { GameState } from './state';
import { ELEMENT_ORDER, type ElementId, type GameData, type SpellDef } from './types';

export const GAIN_TOLERANCE = 1.25;
export const GAIN_SLACK = 6;

export interface GainBound {
  elements: Record<ElementId, number>;
  materials: Record<string, number>;
}
export type ValidationResult = { ok: true } | { ok: false; reasons: string[] };

const zeroElements = (): Record<ElementId, number> =>
  Object.fromEntries(ELEMENT_ORDER.map((e) => [e, 0])) as Record<ElementId, number>;

/** Per-item maximum yield of one kill, with element grades converted to grade-1 equivalents. */
function dropMaxima(drops: { itemId: string; max: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of drops) {
    let value = d.max;
    const m = /^el:([a-z]+):(\d+)$/.exec(d.itemId);
    if (m) value *= 3 ** (Number(m[2]) - 1);
    out.set(d.itemId, (out.get(d.itemId) ?? 0) + value);
  }
  return out;
}

const keyOf = (itemId: string): { element: ElementId } | { material: string } | null => {
  const m = /^el:([a-z]+):\d+$/.exec(itemId);
  if (m) return (ELEMENT_ORDER as readonly string[]).includes(m[1]!) ? { element: m[1] as ElementId } : null;
  return itemId.startsWith('mat:') ? { material: itemId } : null;
};

export function maxGain(prev: GameState, elapsedMs: number, data: GameData): GainBound {
  const elapsed = Math.max(0, elapsedMs);
  const bound: GainBound = { elements: zeroElements(), materials: {} };
  const spells: SpellDef[] = prev.learned.map((id) => data.spells[id]).filter((s): s is SpellDef => !!s);
  const canHit = (monsterId: string): boolean => {
    const m = data.monsters[monsterId];
    return !!m && spells.some((s) => canDamage(s, m));
  };
  // element drops are tracked per element (all grades summed in grade-1 equivalents)
  const add = (perZone: { elements: Record<ElementId, number>; materials: Record<string, number> }, itemId: string, v: number) => {
    const k = keyOf(itemId);
    if (!k) return;
    if ('element' in k) perZone.elements[k.element] += v;
    else perZone.materials[k.material] = (perZone.materials[k.material] ?? 0) + v;
  };

  for (const zone of data.zones) {
    if (!prev.unlockedZones.includes(zone.id)) continue;
    const killable = zone.monsters.filter(canHit);
    if (killable.length === 0) continue;
    const maxKills = Math.floor(elapsed / zone.spawnIntervalMs) + zone.maxAlive;

    // per kill, take the best monster for each key
    const perKill = { elements: zeroElements(), materials: {} as Record<string, number> };
    for (const id of killable) {
      const mine = { elements: zeroElements(), materials: {} as Record<string, number> };
      for (const [itemId, v] of dropMaxima(data.monsters[id]!.drops)) add(mine, itemId, v);
      for (const e of ELEMENT_ORDER) perKill.elements[e] = Math.max(perKill.elements[e], mine.elements[e]);
      for (const [k, v] of Object.entries(mine.materials)) perKill.materials[k] = Math.max(perKill.materials[k] ?? 0, v);
    }

    const zoneTotal = { elements: zeroElements(), materials: {} as Record<string, number> };
    for (const e of ELEMENT_ORDER) zoneTotal.elements[e] = perKill.elements[e] * maxKills;
    for (const [k, v] of Object.entries(perKill.materials)) zoneTotal.materials[k] = v * maxKills;

    if (canHit(zone.bossId)) {
      const bossKills = Math.floor(maxKills / zone.killsForBoss) + 1;
      for (const [itemId, v] of dropMaxima(data.monsters[zone.bossId]!.drops)) add(zoneTotal, itemId, v * bossKills);
    }

    for (const e of ELEMENT_ORDER) bound.elements[e] = Math.max(bound.elements[e], zoneTotal.elements[e]);
    for (const [k, v] of Object.entries(zoneTotal.materials)) bound.materials[k] = Math.max(bound.materials[k] ?? 0, v);
  }
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

export function validateUpload(prev: GameState, next: GameState, elapsedMs: number, data: GameData): ValidationResult {
  const reasons: string[] = [];
  const elapsed = Math.max(0, elapsedMs);

  if (!sameSet(prev.learned, next.learned)) reasons.push('learned spells changed');
  if (canonical(prev.synthesisLog) !== canonical(next.synthesisLog)) reasons.push('synthesisLog changed');
  if (!next.learned.includes(next.equipped)) reasons.push(`equipped spell ${next.equipped} is not learned`);
  if (!next.unlockedZones.includes(next.currentZone)) reasons.push(`currentZone ${next.currentZone} is not unlocked`);

  // inventory gains
  const bound = maxGain(prev, elapsed, data);
  for (const e of ELEMENT_ORDER) {
    const gain = elementEquivalent(next.inventory, e) - elementEquivalent(prev.inventory, e);
    const limit = bound.elements[e] * GAIN_TOLERANCE + GAIN_SLACK;
    if (gain > limit) reasons.push(`element ${e} gain ${gain} exceeds limit ${limit}`);
  }
  const mats = new Set<string>();
  for (const inv of [prev.inventory, next.inventory]) for (const k of Object.keys(inv)) if (k.startsWith('mat:')) mats.add(k);
  for (const k of Object.keys(bound.materials)) mats.add(k);
  for (const k of mats) {
    const gain = (next.inventory[k] ?? 0) - (prev.inventory[k] ?? 0);
    const limit = (bound.materials[k] ?? 0) * GAIN_TOLERANCE + GAIN_SLACK;
    if (gain > limit) reasons.push(`material ${k} gain ${gain} exceeds limit ${limit}`);
  }

  // bosses and zone unlocks
  const newBosses = next.defeatedBosses.filter((b) => !prev.defeatedBosses.includes(b));
  const expectedUnlocked = new Set(prev.unlockedZones);
  const bossZones: { boss: string; zoneId: string; unlocks: string | null }[] = [];
  for (const boss of newBosses) {
    const z = data.zones.find((zz) => zz.bossId === boss);
    if (!z) {
      reasons.push(`unknown boss ${boss}`);
      continue;
    }
    const unlocks = data.zones.find((zz) => zz.order === z.order + 1)?.id ?? null;
    bossZones.push({ boss, zoneId: z.id, unlocks });
  }
  const available = new Set(prev.unlockedZones);
  for (let progress = true; progress;) {
    progress = false;
    for (const b of bossZones) {
      if (available.has(b.zoneId) && b.unlocks && !available.has(b.unlocks)) {
        available.add(b.unlocks);
        progress = true;
      }
    }
  }
  let minMs = 0;
  for (const b of bossZones) {
    const z = data.zones.find((zz) => zz.id === b.zoneId)!;
    if (!available.has(b.zoneId)) reasons.push(`boss ${b.boss} defeated in locked zone ${b.zoneId}`);
    const def = data.monsters[b.boss];
    const hittable = !!def && prev.learned.some((id) => data.spells[id] && canDamage(data.spells[id]!, def));
    if (!hittable) reasons.push(`boss ${b.boss} cannot be damaged by learned spells`);
    minMs += z.killsForBoss * z.spawnIntervalMs;
    if (b.unlocks && available.has(b.zoneId)) expectedUnlocked.add(b.unlocks);
  }
  if (minMs > elapsed * GAIN_TOLERANCE) reasons.push(`boss ${newBosses.join(',')} defeated too fast: need ${minMs}ms, got ${elapsed}ms`);
  if (!sameSet([...expectedUnlocked], next.unlockedZones)) reasons.push('unlockedZones does not match defeated bosses');

  return reasons.length ? { ok: false, reasons } : { ok: true };
}
