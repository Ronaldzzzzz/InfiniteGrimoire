import { canDamage, overlevelEfficiency } from '../engine/combat-rules';
import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import type { GameRuntime } from '../game/runtime';
import { BOSS_HINT } from './messages';

export function Hud({ game, bossAlive, data, runtime }: { game: GameState; bossAlive: boolean; data: GameData; runtime: GameRuntime }) {
  const zone = data.zones.find((z) => z.id === game.currentZone);
  const spell = data.spells[game.equipped];

  // Overlevel is measured against the strongest regular monster of the zone.
  const regularTier = zone ? Math.max(...zone.monsters.map((id) => data.monsters[id]?.tier ?? 1)) : 1;
  const efficiency = spell ? overlevelEfficiency(spell.tier, regularTier) : 1;

  const boss = zone ? data.monsters[zone.bossId] : undefined;
  const stuck = bossAlive && Boolean(boss) && !game.learned.some((id) => data.spells[id] && canDamage(data.spells[id]!, boss!));

  return (
    <header className="hud">
      <div className="hud-row">
        <span className="hud-zone">{zone?.name ?? game.currentZone}</span>
        <span>階級 {spell?.tier ?? '-'}</span>
        <label className="hud-spell">
          裝備
          <select value={game.equipped} onChange={(e) => runtime.equip(e.target.value)}>
            {game.learned.map((id) => (
              <option key={id} value={id}>{data.spells[id]?.name ?? id}</option>
            ))}
          </select>
        </label>
      </div>
      {efficiency < 1 && <div className="hud-note">越級：掉落效益 {Math.round(efficiency * 100)}%</div>}
      {stuck && <div className="hud-note warn">{BOSS_HINT}</div>}
    </header>
  );
}
