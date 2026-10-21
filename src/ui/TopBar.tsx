import { useState } from 'react';
import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { GameData } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import type { ConnStatus } from '../game/sync';
import { BOSS_HINT } from './messages';
import { zoneRegularTier, type SpellSort } from './picker-data';
import { readSpellSort, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { SaveErrorBanner } from './SaveErrorBanner';
import { bossAlive, useGameState, useRuntime, type RuntimeStore } from './useGame';

export function TopBar({
  runtime,
  data,
  status,
}: {
  runtime: RuntimeStore & Pick<GameRuntime, 'equip' | 'travel'>;
  data: GameData;
  status: ConnStatus;
}) {
  const game = useGameState(runtime);
  const bossOnField = useRuntime(runtime, (s) => bossAlive(s, data));
  // the synthesis reply replaces the game state, which would undo a travel / equip made meanwhile
  const locked = useRuntime(runtime, (s) => s.synthPending);
  const [sort, setSort] = useState<SpellSort>(readSpellSort);

  const zone = data.zones.find((z) => z.id === game.currentZone);
  const spell = data.spells[game.equipped];
  const efficiency = spell && zone ? overlevelEfficiency(spell.tier, zoneRegularTier(zone, data)) : 1;
  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const stuck = bossOnField && Boolean(boss) && !game.learned.some((id) => data.spells[id] && canDamage(data.spells[id]!, boss!));

  const changeSort = (s: SpellSort): void => {
    setSort(s);
    writeSpellSort(s);
  };

  return (
    <header className="topbar">
      <div className="topbar-row">
        <ZonePicker game={game} data={data} onTravel={(id) => runtime.travel(id)} disabled={locked} />
        <span className="topbar-equipped only-wide">
          裝備：<b>{spell?.name ?? game.equipped}</b> <span className="muted">Lv.{spell?.tier ?? '-'}</span>
        </span>
        <div className="only-narrow topbar-spell">
          <SpellPicker game={game} data={data} sort={sort} onSortChange={changeSort} onEquip={(id) => runtime.equip(id)} disabled={locked} />
        </div>
        {efficiency < 1 && <span className="hud-note">越級：掉落效益 {Math.round(efficiency * 100)}%</span>}
        {stuck && <span className="hud-note warn">{BOSS_HINT}</span>}
      </div>
      <SaveErrorBanner status={status} />
    </header>
  );
}
