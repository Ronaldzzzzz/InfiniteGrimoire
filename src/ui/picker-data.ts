import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { Content, Effect, GameState, Spell, Zone } from '../engine/model';
import { resolveSpell, spellAtLevel } from '../engine/spells';
import { ELEMENT_ORDER, type ElementId } from '../engine/types';

export type SpellSort = 'element' | 'tier';

/** Short label for a spell's main effect shape. */
export const SHAPE_LABEL: Record<Effect['kind'], string> = {
  bolt: '飛彈', ring: '擴散', blades: '刃', chain: '連鎖', zone: '區域', storm: '風暴',
  meteor: '隕石', field: '全場', haste: '加速', backfire: '反噬',
};
export const ELEMENT_LABEL: Record<ElementId, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };

export interface SpellRow {
  id: string;
  name: string;
  elements: ElementId[];
  tier: number;
  shape: Effect['kind'];
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
export function zoneRegularTier(zone: Zone, content: Content): number {
  return Math.max(...zone.monsters.map((id) => content.monsters[id]?.tier ?? 1));
}

/** A learned spell as it fights: named or crafted, at its empower level. Null for an unknown id. */
export function fightingSpell(game: GameState, id: string, content: Content): Spell | null {
  const base = resolveSpell(id, content);
  if (!base) return null;
  return spellAtLevel(base, Object.hasOwn(game.levels, id) ? game.levels[id]! : 1);
}

export function spellPickerGroups(game: GameState, content: Content, sort: SpellSort): SpellGroup[] {
  const zone = content.zones.find((z) => z.id === game.currentZone);
  const boss = zone ? content.monsters[zone.bossId] : undefined;
  const regular = zone ? zoneRegularTier(zone, content) : 1;
  const rows: SpellRow[] = game.learned
    .map((id) => fightingSpell(game, id, content))
    .filter((s): s is Spell => Boolean(s))
    .map((s) => ({
      id: s.id,
      name: s.name,
      elements: s.elements,
      tier: s.tier,
      shape: s.effects[0]?.kind ?? 'bolt',
      attack: Math.round(s.attack),
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

export function zonePickerRows(game: GameState, content: Content): ZoneRow[] {
  const zones = [...content.zones].sort((a, b) => a.order - b.order);
  return zones.map((z, i) => {
    const tiers = z.monsters.map((id) => content.monsters[id]?.tier ?? 1);
    const boss = content.monsters[z.bossId];
    const prevBoss = i > 0 ? content.monsters[zones[i - 1]!.bossId] : undefined;
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
