import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { GameState } from '../engine/state';
import { ELEMENT_ORDER, type ElementId, type GameData, type SpellDef, type SpellPattern, type ZoneDef } from '../engine/types';

export type SpellSort = 'element' | 'tier';

export const PATTERN_LABEL: Record<SpellPattern, string> = { bolt: '單體', beam: '光束', chain: '連鎖', nova: '擴散' };
export const ELEMENT_LABEL: Record<ElementId, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };

export interface SpellRow {
  id: string;
  name: string;
  elements: ElementId[];
  tier: number;
  pattern: SpellPattern;
  attack: number;
  equipped: boolean;
  bossImmune: boolean;
  dropEfficiency: number;
}

export interface SpellGroup {
  label: string;
  rows: SpellRow[];
}

/** Overlevel is measured against the strongest regular monster of the zone (same as the HUD note). */
export function zoneRegularTier(zone: ZoneDef, data: GameData): number {
  return Math.max(...zone.monsters.map((id) => data.monsters[id]?.tier ?? 1));
}

export function spellPickerGroups(game: GameState, data: GameData, sort: SpellSort): SpellGroup[] {
  const zone = data.zones.find((z) => z.id === game.currentZone);
  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const regular = zone ? zoneRegularTier(zone, data) : 1;
  const rows: SpellRow[] = game.learned
    .map((id) => data.spells[id])
    .filter((s): s is SpellDef => Boolean(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      elements: s.elements,
      tier: s.tier,
      pattern: s.pattern,
      attack: s.attack,
      equipped: s.id === game.equipped,
      bossImmune: boss ? !canDamage(s, boss) : false,
      dropEfficiency: overlevelEfficiency(s.tier, regular),
    }));

  if (sort === 'tier') {
    return [{ label: '依階級', rows: [...rows].sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id)) }];
  }
  const groups: SpellGroup[] = [];
  const push = (label: string, list: SpellRow[]): void => {
    if (list.length > 0) groups.push({ label, rows: list.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)) });
  };
  push('無屬性', rows.filter((r) => r.elements.length === 0));
  for (const el of ELEMENT_ORDER) push(ELEMENT_LABEL[el], rows.filter((r) => r.elements.length === 1 && r.elements[0] === el));
  push('混合', rows.filter((r) => r.elements.length >= 2));
  return groups;
}

export type ZoneStatus = 'current' | 'cleared' | 'available' | 'locked';

export const ZONE_STATUS_LABEL: Record<ZoneStatus, string> = {
  current: '目前所在',
  cleared: '已擊敗魔王',
  available: '可前往',
  locked: '未解鎖',
};

export interface ZoneRow {
  id: string;
  name: string;
  minTier: number;
  maxTier: number;
  bossName: string;
  bossTier: number;
  status: ZoneStatus;
  lockText: string | null;
}

export function zonePickerRows(game: GameState, data: GameData): ZoneRow[] {
  const zones = [...data.zones].sort((a, b) => a.order - b.order);
  return zones.map((z, i) => {
    const tiers = z.monsters.map((id) => data.monsters[id]?.tier ?? 1);
    const boss = data.monsters[z.bossId];
    const prevBoss = i > 0 ? data.monsters[zones[i - 1]!.bossId] : undefined;
    const status: ZoneStatus =
      game.currentZone === z.id
        ? 'current'
        : !game.unlockedZones.includes(z.id)
          ? 'locked'
          : game.defeatedBosses.includes(z.bossId)
            ? 'cleared'
            : 'available';
    return {
      id: z.id,
      name: z.name,
      minTier: Math.min(...tiers),
      maxTier: Math.max(...tiers),
      bossName: boss?.name ?? z.bossId,
      bossTier: boss?.tier ?? 0,
      status,
      lockText: status === 'locked' ? `擊敗${prevBoss?.name ?? '前一個魔王'}後解鎖` : null,
    };
  });
}

export function tierRangeLabel(r: { minTier: number; maxTier: number }): string {
  return r.minTier === r.maxTier ? `Lv.${r.minTier}` : `Lv.${r.minTier}–${r.maxTier}`;
}
