import { describe, expect, it } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import { spellPickerGroups, tierRangeLabel, zonePickerRows } from './picker-data';

const LEARNED = ['mana_bolt', 'explosion', 'fireball', 'fire_whirl', 'wind_blade', 'flame_burst'];

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(gameData), learned: LEARNED, equipped: 'fireball', ...patch };
}

describe('spellPickerGroups', () => {
  it('groups by element (none first, hybrids last), tier ascending inside a group', () => {
    const groups = spellPickerGroups(game(), gameData, 'element');
    expect(groups.map((g) => g.label)).toEqual(['無屬性', '火', '風', '混合']);
    expect(groups[1]!.rows.map((r) => r.id)).toEqual(['fireball', 'flame_burst', 'explosion']);
  });

  it('sorts every spell by tier descending in tier mode', () => {
    const groups = spellPickerGroups(game(), gameData, 'tier');
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(['fire_whirl', 'explosion', 'flame_burst', 'fireball', 'wind_blade', 'mana_bolt']);
  });

  it('carries tier, pattern, attack and the equipped flag', () => {
    const rows = spellPickerGroups(game(), gameData, 'tier')[0]!.rows;
    const fb = rows.find((r) => r.id === 'fireball')!;
    expect(fb).toMatchObject({ tier: 2, pattern: 'bolt', attack: 22, equipped: true, elements: ['fire'] });
    expect(rows.find((r) => r.id === 'mana_bolt')!.equipped).toBe(false);
  });

  it('marks drop efficiency against the strongest regular monster of the zone', () => {
    const rows = spellPickerGroups(game({ currentZone: 'mist_meadow' }), gameData, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'fireball')!.dropEfficiency).toBe(1);
    expect(rows.find((r) => r.id === 'explosion')!.dropEfficiency).toBeCloseTo(0.5625);
  });

  it('marks spells that cannot damage the zone boss', () => {
    const rows = spellPickerGroups(game({ currentZone: 'ash_volcano' }), gameData, 'tier')[0]!.rows;
    expect(rows.find((r) => r.id === 'mana_bolt')!.bossImmune).toBe(true);
    expect(rows.find((r) => r.id === 'explosion')!.bossImmune).toBe(false);
  });

  it('skips learned ids that have no spell definition', () => {
    const rows = spellPickerGroups(game({ learned: ['mana_bolt', 'ghost'] }), gameData, 'tier')[0]!.rows;
    expect(rows.map((r) => r.id)).toEqual(['mana_bolt']);
  });
});

describe('zonePickerRows', () => {
  it('lists zones in order with tier range, boss, status and unlock text', () => {
    const rows = zonePickerRows(
      game({ currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'] }),
      gameData,
    );
    expect(rows.map((r) => r.id)).toEqual(['mist_meadow', 'thunder_gorge', 'ash_volcano']);
    expect(rows[0]).toMatchObject({ minTier: 1, maxTier: 1, bossName: '迷霧雄鹿', bossTier: 2, status: 'cleared', lockText: null });
    expect(rows[1]).toMatchObject({ status: 'current', bossName: '暴風巨鵬', bossTier: 4 });
    expect(rows[2]).toMatchObject({ status: 'locked', lockText: '擊敗暴風巨鵬後解鎖' });
  });

  it('marks an unlocked zone whose boss is alive as available', () => {
    const rows = zonePickerRows(game({ currentZone: 'mist_meadow', unlockedZones: ['mist_meadow', 'thunder_gorge'] }), gameData);
    expect(rows[1]!.status).toBe('available');
  });
});

describe('tierRangeLabel', () => {
  it('collapses equal bounds', () => {
    expect(tierRangeLabel({ minTier: 3, maxTier: 3 })).toBe('Lv.3');
    expect(tierRangeLabel({ minTier: 3, maxTier: 5 })).toBe('Lv.3–5');
  });
});
