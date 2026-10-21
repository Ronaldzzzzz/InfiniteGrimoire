import { overlevelEfficiency, computeHit } from './combat-rules';
import { addItems } from './inventory';
import type { Rng } from './rng';
import type { GameState } from './state';
import type { GameData, ItemId, MonsterDef, SpellDef, StatusKind, ZoneDef } from './types';

export const STEP_MS = 50;
const MOVE_PER_SEC = 0.1;
const MIN_X = 0.15;
const BURN_FRACTION = 0.2;
const CHAIN_FALLOFF = 0.7;
const NOVA_MULT = 0.6;

export interface ActiveStatus {
  kind: StatusKind;
  remainingMs: number;
  /** burn only: damage per second */
  dps?: number;
}
export interface MonsterInstance {
  uid: number;
  defId: string;
  hp: number;
  maxHp: number;
  x: number;
  statuses: ActiveStatus[];
}
export interface BattleState {
  zoneId: string;
  monsters: MonsterInstance[];
  spawnTimerMs: number;
  castTimerMs: number;
  bossActive: boolean;
  nextUid: number;
}
export type BattleEvent =
  | { type: 'spawn'; uid: number; boss: boolean }
  | { type: 'cast'; spellId: string; targets: number[] }
  | { type: 'hit'; uid: number; damage: number; immune: boolean }
  | { type: 'status'; uid: number; kind: StatusKind }
  | { type: 'kill'; uid: number; defId: string; drops: ItemId[] }
  | { type: 'bossDefeated'; zoneId: string; unlockedZoneId: string | null };

export function createBattle(zoneId: string): BattleState {
  return { zoneId, monsters: [], spawnTimerMs: 0, castTimerMs: 0, bossActive: false, nextUid: 1 };
}

const hasStatus = (m: MonsterInstance, kind: StatusKind): boolean => m.statuses.some((s) => s.kind === kind);

function applyStatus(m: MonsterInstance, kind: StatusKind, durationMs: number, dps?: number): void {
  const existing = m.statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.remainingMs = durationMs;
    if (dps !== undefined) existing.dps = Math.max(existing.dps ?? 0, dps);
  } else {
    m.statuses.push(dps !== undefined ? { kind, remainingMs: durationMs, dps } : { kind, remainingMs: durationMs });
  }
}

function targetsFor(spell: SpellDef, sorted: MonsterInstance[]): { m: MonsterInstance; mult: number }[] {
  switch (spell.pattern) {
    case 'bolt':
      return sorted.slice(0, 1).map((m) => ({ m, mult: 1 }));
    case 'beam':
      return sorted.slice(0, 2).map((m) => ({ m, mult: 1 }));
    case 'chain':
      return sorted
        .slice(0, 1 + (spell.chainCount ?? 0))
        .map((m, i) => ({ m, mult: Math.pow(CHAIN_FALLOFF, i) }));
    case 'nova':
      return sorted.map((m) => ({ m, mult: NOVA_MULT }));
  }
}

export function stepBattle(
  game: GameState,
  battle: BattleState,
  data: GameData,
  rng: Rng,
): { game: GameState; battle: BattleState; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  const zone: ZoneDef | undefined = data.zones.find((z) => z.id === battle.zoneId);
  if (!zone) return { game, battle, events };

  let monsters: MonsterInstance[] = battle.monsters.map((m) => ({
    ...m,
    statuses: m.statuses.map((s) => ({ ...s })),
  }));
  let spawnTimerMs = battle.spawnTimerMs + STEP_MS;
  let castTimerMs = battle.castTimerMs + STEP_MS;
  let bossActive = battle.bossActive;
  let nextUid = battle.nextUid;
  let inventory = game.inventory;
  let defeatedBosses = game.defeatedBosses;
  let unlockedZones = game.unlockedZones;
  let zoneKills = game.zoneKills;
  const dt = STEP_MS / 1000;

  const spawn = (defId: string, boss: boolean): void => {
    const def = data.monsters[defId];
    if (!def) return;
    const uid = nextUid++;
    monsters.push({ uid, defId, hp: def.hp, maxHp: def.hp, x: 1, statuses: [] });
    events.push({ type: 'spawn', uid, boss });
  };

  // 1. normal spawning (continues during a boss fight; the boss does not count toward maxAlive)
  const normalsAlive = monsters.filter((m) => !data.monsters[m.defId]?.boss).length;
  if (normalsAlive < zone.maxAlive) {
    if (spawnTimerMs >= zone.spawnIntervalMs) {
      spawnTimerMs -= zone.spawnIntervalMs;
      spawn(zone.monsters[rng.int(0, zone.monsters.length - 1)]!, false);
    }
  } else {
    spawnTimerMs = Math.min(spawnTimerMs, zone.spawnIntervalMs);
  }

  const dead: { m: MonsterInstance; def: MonsterDef }[] = [];
  const markDead = (m: MonsterInstance): void => {
    if (m.hp <= 0 && !dead.some((d) => d.m.uid === m.uid)) {
      const def = data.monsters[m.defId];
      if (def) dead.push({ m, def });
    }
  };

  // 2. statuses, movement, regen
  for (const m of monsters) {
    const def = data.monsters[m.defId];
    if (!def) continue;
    const stopped = hasStatus(m, 'paralyze') || hasStatus(m, 'freeze');
    for (const s of m.statuses) {
      if (s.kind === 'burn' && s.dps) m.hp -= s.dps * dt;
    }
    if (m.hp > 0 && !stopped) {
      m.x = Math.max(MIN_X, m.x - MOVE_PER_SEC * dt);
      m.hp = Math.min(m.maxHp, m.hp + def.regenPerSec * dt);
    }
    for (const s of m.statuses) s.remainingMs -= STEP_MS;
    m.statuses = m.statuses.filter((s) => s.remainingMs > 0);
    markDead(m);
  }

  // 3. casting
  const spell = data.spells[game.equipped];
  if (spell) {
    const live = monsters.filter((m) => m.hp > 0);
    if (live.length === 0) {
      castTimerMs = Math.min(castTimerMs, spell.cooldownMs);
    } else if (castTimerMs >= spell.cooldownMs) {
      castTimerMs -= spell.cooldownMs;
      const sorted = [...live].sort((a, b) => a.x - b.x || a.uid - b.uid);
      const targets = targetsFor(spell, sorted);
      events.push({ type: 'cast', spellId: spell.id, targets: targets.map((t) => t.m.uid) });
      for (const { m, mult } of targets) {
        const def = data.monsters[m.defId]!;
        const base = computeHit(spell, def, { frozen: hasStatus(m, 'freeze') });
        if (base === 0) {
          events.push({ type: 'hit', uid: m.uid, damage: 0, immune: true });
          continue;
        }
        const damage = Math.max(1, Math.round(base * mult));
        m.hp -= damage;
        events.push({ type: 'hit', uid: m.uid, damage, immune: false });
        if (spell.status && m.hp > 0 && rng.next() < spell.status.chance) {
          applyStatus(
            m,
            spell.status.kind,
            spell.status.durationMs,
            spell.status.kind === 'burn' ? damage * BURN_FRACTION : undefined,
          );
          events.push({ type: 'status', uid: m.uid, kind: spell.status.kind });
        }
        markDead(m);
      }
    }
  }

  // 4. kills
  const efficiencyOf = (def: MonsterDef): number => (spell ? overlevelEfficiency(spell.tier, def.tier) : 1);
  dead.sort((a, b) => a.m.uid - b.m.uid);
  const bossWasActive = bossActive;
  for (const { m, def } of dead) {
    const drops: ItemId[] = [];
    const eff = efficiencyOf(def);
    for (const d of def.drops) {
      if (rng.next() < d.chance * eff) {
        const qty = rng.int(d.min, d.max);
        for (let i = 0; i < qty; i++) drops.push(d.itemId);
      }
    }
    inventory = addItems(inventory, drops);
    events.push({ type: 'kill', uid: m.uid, defId: m.defId, drops });
    monsters = monsters.filter((x) => x.uid !== m.uid);

    if (def.boss) {
      bossActive = false;
      if (!defeatedBosses.includes(zone.bossId)) defeatedBosses = [...defeatedBosses, zone.bossId];
      const next = data.zones.find((z) => z.order === zone.order + 1);
      if (next && !unlockedZones.includes(next.id)) unlockedZones = [...unlockedZones, next.id];
      events.push({ type: 'bossDefeated', zoneId: zone.id, unlockedZoneId: next?.id ?? null });
    } else if (!bossWasActive && !bossActive) {
      const kills = (zoneKills[zone.id] ?? 0) + 1;
      if (kills >= zone.killsForBoss) {
        zoneKills = { ...zoneKills, [zone.id]: 0 };
        bossActive = true;
        spawn(zone.bossId, true);
      } else {
        zoneKills = { ...zoneKills, [zone.id]: kills };
      }
    }
  }

  const changed = inventory !== game.inventory || defeatedBosses !== game.defeatedBosses ||
    unlockedZones !== game.unlockedZones || zoneKills !== game.zoneKills;
  return {
    game: changed ? { ...game, inventory, defeatedBosses, unlockedZones, zoneKills } : game,
    battle: { zoneId: battle.zoneId, monsters, spawnTimerMs, castTimerMs, bossActive, nextUid },
    events,
  };
}
