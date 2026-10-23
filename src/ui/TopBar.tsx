import { useState } from 'react';
import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { Content } from '../engine/model';
import type { Discovery } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { ConnStatus } from '../game/sync';
import { DiscoveryBell } from './DiscoveryBell';
import { BOSS_HINT } from './messages';
import { fightingSpell, zoneRegularTier, type SpellSort } from './picker-data';
import { readSpellSort, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { SaveErrorBanner } from './SaveErrorBanner';
import { bossAlive, useGameState, useRuntime, type RuntimeStore } from './useGame';

export function TopBar({
  runtime,
  content,
  status,
  bound,
  onOpenAccount,
  feed = [],
  ownName = '',
}: {
  runtime: RuntimeStore & Pick<GameRuntime, 'equip' | 'travel'>;
  content: Content;
  status: ConnStatus;
  bound: boolean | null;
  onOpenAccount: () => void;
  feed?: Discovery[];
  ownName?: string;
}) {
  const game = useGameState(runtime);
  const bossOnField = useRuntime(runtime, (s) => bossAlive(s, content));
  // the synthesis reply replaces the game state, which would undo a travel / equip made meanwhile
  const locked = useRuntime(runtime, (s) => s.synthPending);
  const [sort, setSort] = useState<SpellSort>(readSpellSort);

  const zone = content.zones.find((z) => z.id === game.currentZone);
  const spell = fightingSpell(game, game.equipped, content);
  const efficiency = spell && zone ? overlevelEfficiency(spell.tier, zoneRegularTier(zone, content)) : 1;
  const boss = zone ? content.monsters[zone.bossId] : undefined;
  const stuck = bossOnField && Boolean(boss) && !game.learned.some((id) => {
    const s = fightingSpell(game, id, content);
    return s !== null && canDamage(s, boss!);
  });

  const changeSort = (s: SpellSort): void => {
    setSort(s);
    writeSpellSort(s);
  };

  return (
    <header className="topbar">
      <div className="topbar-row">
        <ZonePicker game={game} content={content} onTravel={(id) => runtime.travel(id)} disabled={locked} />
        <span className="topbar-equipped only-wide">
          裝備：<b>{spell?.name ?? game.equipped}</b> <span className="muted">Lv.{spell?.tier ?? '-'}</span>
        </span>
        <div className="only-narrow topbar-spell">
          <SpellPicker game={game} content={content} sort={sort} onSortChange={changeSort} onEquip={(id) => runtime.equip(id)} disabled={locked} />
        </div>
        {efficiency < 1 && <span className="hud-note">越級：掉落效益 {Math.round(efficiency * 100)}%</span>}
        {stuck && <span className="hud-note warn">{BOSS_HINT}</span>}
        <div className="topbar-right">
          <DiscoveryBell entries={feed} content={content} ownName={ownName} />
          <button type="button" className="account-button" onClick={onOpenAccount}>
            帳號{bound === false && <span className="tag warn">未綁定</span>}
          </button>
        </div>
      </div>
      <SaveErrorBanner status={status} />
    </header>
  );
}
