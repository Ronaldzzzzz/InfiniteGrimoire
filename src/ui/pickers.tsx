import type { Content, GameState } from '../engine/model';
import { highestPlayable, isBossStage } from '../engine/stages';
import { COLORS } from '../render/palette';
import { Picker, type PickerItem } from './Picker';
import {
  fightingSpell,
  SHAPE_LABEL,
  spellPickerGroups,
  tierRangeLabel,
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
  content,
  sort,
  onSortChange,
  onEquip,
  disabled = false,
}: {
  game: GameState;
  content: Content;
  sort: SpellSort;
  onSortChange: (s: SpellSort) => void;
  onEquip: (id: string) => void;
  disabled?: boolean;
}) {
  const groups = spellPickerGroups(game, content, sort);
  const equipped = fightingSpell(game, game.equipped, content);
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
          <span className="muted">{SHAPE_LABEL[r.shape]}</span>
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
      disabled={disabled}
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

/** Option keys are 「zoneId:stage」; locked zones get one disabled row keyed 「lock:zoneId」. */
export function ZonePicker({
  game,
  content,
  onTravel,
  disabled = false,
}: {
  game: GameState;
  content: Content;
  onTravel: (zoneId: string, stage: number) => void;
  disabled?: boolean;
}) {
  const rows = zonePickerRows(game, content);
  const current = rows.find((r) => r.status === 'current');
  const items: PickerItem[] = rows.flatMap((r): PickerItem[] => {
    const zone = content.zones.find((z) => z.id === r.id)!;
    if (r.status === 'locked') {
      return [{
        key: `lock:${r.id}`,
        label: r.name,
        disabled: true,
        content: (
          <div className="zone-row">
            <div>
              <span className="zone-row-name">🔒 {r.name}</span> <span className="spell-row-tier">{tierRangeLabel(r)}</span>
            </div>
            <div className="muted">魔王 {r.bossName} Lv.{r.bossTier}</div>
            <div className="muted">{r.lockText}</div>
          </div>
        ),
      }];
    }
    const group = `${r.name} ${tierRangeLabel(r)}・魔王 ${r.bossName}${r.status === 'cleared' ? '（已擊敗）' : ''}`;
    const reach = highestPlayable(game, zone);
    const cleared = game.clearedStages[zone.id] ?? 0;
    return zone.stages.map((_, i): PickerItem => {
      const n = i + 1;
      const here = r.status === 'current' && game.currentStage === n;
      const boss = isBossStage(zone, n);
      return {
        key: `${zone.id}:${n}`,
        label: `${r.name} ${zone.order}-${n}`,
        group,
        selected: here,
        disabled: here || n > reach,
        content: (
          <div className="zone-row">
            <div>
              <span className="zone-row-name">{zone.order}-{n}</span>{boss && <span className="tag warn">魔王關</span>}
            </div>
            <div className={n > reach ? 'muted' : 'zone-row-status'}>{here ? '目前所在' : n > reach ? `先通過 ${zone.order}-${n - 1}` : n <= cleared ? '已通過' : '可挑戰'}</div>
          </div>
        ),
      };
    });
  });
  return (
    <Picker
      buttonLabel="選擇地點"
      disabled={disabled}
      buttonContent={
        <>
          📍 {current?.name ?? game.currentZone} {current && <span className="muted">{content.zones.find((z) => z.id === current.id)?.order}-{game.currentStage}</span>}
        </>
      }
      items={items}
      onSelect={(key) => {
        const i = key.lastIndexOf(':');
        const stage = Number(key.slice(i + 1));
        if (key.startsWith('lock:') || !Number.isInteger(stage)) return;
        onTravel(key.slice(0, i), stage);
      }}
    />
  );
}
