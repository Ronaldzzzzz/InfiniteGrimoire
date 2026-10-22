import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import { createInitialState } from '../engine/persist';
import { craftedId } from '../engine/spells';
import { spellPickerGroups, tierRangeLabel, zonePickerRows } from './picker-data';

const LEARNED = ['mana_bolt', 'flame_burst', 'fireball', 'fire_tornado', 'wind_blade', 'tailwind'];

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(content), learned: LEARNED, equipped: 'fireball', ...patch };
}

describe('spellPickerGroups', () => {
  it('groups by element (none first, hybrids last), tier ascending inside a group', () => {
    const groups = spellPickerGroups(game(), content, 'element');
    expect(groups.map((g) => g.label)).toEqual(['無屬性', '火', '風', '混合']);
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['fireball', 'flame_burst']);
    expect(groups[2]!.rows.map((r) => r.id)).toEqual(['wind_blade', 'tailwind']);
  });

  it('sorts every spell by tier descending in tier mode', () => {
    const groups = spellPickerGroups(game(), content, 'tier');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(['fire_tornado', 'flame_burst', 'tailwind', 'fireball', 'wind_blade', 'mana_bolt']);
  });

  it('carries tier, shape, attack and the equipped flag', () => {
    const rows = spellPickerGroups(game(), content, 'tier')[0]!.rows;
    const fb = rows.find((r) => r.id === 'fireball')!;
    expect(fb).toMatchObject({ tier: 2, shape: 'bolt', attack: 12, equipped: true, elements: ['fire'] });
    expect(rows.find((r) => r.id === 'wind_blade')!.shape).toBe('blades');
    expect(rows.find((r) => r.id === 'mana_bolt')!.equipped).toBe(false);
  });

  it('shows learned spells at their empower level', () => {
    const rows = spellPickerGroups(game({ levels: { fireball: 11 } }), content, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'fireball')!).toMatchObject({ tier: 3, attack: 22 });
  });

  it('lists crafted spells by their derived name', () => {
    const id = craftedId('fireball', 'mat:ember_core');
    const rows = spellPickerGroups(game({ learned: ['mana_bolt', id] }), content, 'tier')[0]!.rows;
    const row = rows.find((r) => r.id === id)!;
    expect(row.name).not.toBe(id);
    expect(row.elements).toContain('fire');
  });

  it('marks drop efficiency against the strongest regular monster of the zone', () => {
    const rows = spellPickerGroups(game({ currentZone: 'mist_meadow' }), content, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'fireball')!.dropEfficiency).toBe(1);
    expect(rows.find((r) => r.id === 'fire_tornado')!.dropEfficiency).toBeCloseTo(0.75);
  });

  it('marks spells that cannot damage the zone boss', () => {
    const rows = spellPickerGroups(game({ currentZone: 'thunder_gorge' }), content, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'mana_bolt')!.bossImmune).toBe(true);
    expect(rows.find((r) => r.id === 'flame_burst')!.bossImmune).toBe(false);
  });

  it('skips learned ids that are not spells', () => {
    const rows = spellPickerGroups(game({ learned: ['mana_bolt', 'ghost'] }), content, 'tier')[0]!.rows;
    expect(rows.map((r) => r.id)).toEqual(['mana_bolt']);
  });
});

describe('zonePickerRows', () => {
  it('lists zones in order with tier range, boss, status and unlock text', () => {
    const rows = zonePickerRows(game({ currentZone: 'mist_meadow', unlockedZones: ['mist_meadow'] }), content);
    expect(rows.map((r) => r.id)).toEqual(['mist_meadow', 'thunder_gorge', 'ember_wastes', 'sunken_temple']);
    expect(rows[0]).toMatchObject({ minTier: 1, maxTier: 2, bossName: '迷霧雄鹿', bossTier: 2, status: 'current', lockText: null });
    expect(rows[1]).toMatchObject({ status: 'locked', lockText: '擊敗迷霧雄鹿後解鎖', bossName: '風暴大鵬', bossTier: 4 });
  });

  it('marks cleared and available zones', () => {
    const rows = zonePickerRows(
      game({ currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'] }),
      content,
    );
    expect(rows[0]!.status).toBe('cleared');
    const avail = zonePickerRows(game({ currentZone: 'mist_meadow', unlockedZones: ['mist_meadow', 'thunder_gorge'] }), content);
    expect(avail[1]!.status).toBe('available');
  });
});

describe('tierRangeLabel', () => {
  it('collapses equal bounds', () => {
    expect(tierRangeLabel({ minTier: 3, maxTier: 3 })).toBe('Lv.3');
    expect(tierRangeLabel({ minTier: 3, maxTier: 5 })).toBe('Lv.3–5');
  });
});
