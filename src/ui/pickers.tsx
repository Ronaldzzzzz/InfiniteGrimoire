import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import { COLORS } from '../render/palette';
import { Picker, type PickerItem } from './Picker';
import {
  PATTERN_LABEL,
  spellPickerGroups,
  tierRangeLabel,
  ZONE_STATUS_LABEL,
  zonePickerRows,
  type SpellRow,
  type SpellSort,
} from './picker-data';

export const SPELL_SORT_KEY = 'ig.spellSort';

export function readSpellSort(): SpellSort {
  try {
    return window.localStorage.getItem(SPELL_SORT_KEY) === 'tier' ? 'tier' : 'element';
  } catch {
    return 'element';
  }
}

export function writeSpellSort(sort: SpellSort): void {
  try {
    window.localStorage.setItem(SPELL_SORT_KEY, sort);
  } catch {
    /* ignore: the preference just won't persist */
  }
}

function Swatches({ row }: { row: SpellRow }) {
  const colors = row.elements.length > 0 ? row.elements.map((e) => COLORS.element[e]) : [COLORS.element.none];
  return (
    <span className="swatches" aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} className="swatch" style={{ background: c }} />
      ))}
    </span>
  );
}

export function SpellPicker({
  game,
  data,
  sort,
  onSortChange,
  onEquip,
}: {
  game: GameState;
  data: GameData;
  sort: SpellSort;
  onSortChange: (s: SpellSort) => void;
  onEquip: (id: string) => void;
}) {
  const groups = spellPickerGroups(game, data, sort);
  const equipped = data.spells[game.equipped];
  const items: PickerItem[] = groups.flatMap((g) =>
    g.rows.map((r) => ({
      key: r.id,
      label: r.name,
      group: sort === 'element' ? g.label : undefined,
      selected: r.equipped,
      content: (
        <div className="spell-row">
          <Swatches row={r} />
          <span className="spell-row-name">{r.name}</span>
          <span className="spell-row-tier">Lv.{r.tier}</span>
          <span className="muted">{PATTERN_LABEL[r.pattern]}</span>
          <span className="muted">攻 {r.attack}</span>
          {r.bossImmune && <span className="tag warn">對魔王無效</span>}
          {r.dropEfficiency < 1 && <span className="tag">掉落 {Math.round(r.dropEfficiency * 100)}%</span>}
        </div>
      ),
    })),
  );
  return (
    <Picker
      buttonLabel="裝備魔法"
      align="right"
      buttonContent={
        <>
          {equipped?.name ?? game.equipped} <span className="muted">Lv.{equipped?.tier ?? '-'}</span>
        </>
      }
      items={items}
      onSelect={onEquip}
      header={
        <button type="button" className="picker-sort" onClick={() => onSortChange(sort === 'element' ? 'tier' : 'element')}>
          排序：{sort === 'element' ? '依屬性' : '依階級'}
        </button>
      }
    />
  );
}

export function ZonePicker({ game, data, onTravel }: { game: GameState; data: GameData; onTravel: (id: string) => void }) {
  const rows = zonePickerRows(game, data);
  const current = rows.find((r) => r.status === 'current');
  const items: PickerItem[] = rows.map((r) => ({
    key: r.id,
    label: r.name,
    selected: r.status === 'current',
    disabled: r.status === 'current' || r.status === 'locked',
    content: (
      <div className="zone-row">
        <div>
          <span className="zone-row-name">{r.status === 'locked' ? '🔒 ' : ''}{r.name}</span>{' '}
          <span className="spell-row-tier">{tierRangeLabel(r)}</span>
        </div>
        <div className="muted">魔王 {r.bossName} Lv.{r.bossTier}</div>
        <div className={r.status === 'locked' ? 'muted' : 'zone-row-status'}>{r.lockText ?? ZONE_STATUS_LABEL[r.status]}</div>
      </div>
    ),
  }));
  return (
    <Picker
      buttonLabel="選擇地點"
      buttonContent={
        <>
          📍 {current?.name ?? game.currentZone} {current && <span className="muted">{tierRangeLabel(current)}</span>}
        </>
      }
      items={items}
      onSelect={onTravel}
    />
  );
}
