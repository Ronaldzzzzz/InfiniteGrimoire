import type { GameState } from '../engine/state';
import type { GameData } from '../engine/types';
import type { GameRuntime } from '../game/runtime';

export function ZonePanel({ game, data, runtime }: { game: GameState; data: GameData; runtime: GameRuntime }) {
  return (
    <ul className="zones">
      {data.zones.map((z) => {
        const unlocked = game.unlockedZones.includes(z.id);
        const current = game.currentZone === z.id;
        return (
          <li key={z.id}>
            <button
              type="button"
              disabled={!unlocked || current}
              className={current ? 'current' : ''}
              onClick={() => runtime.travel(z.id)}
            >
              {unlocked ? '' : '🔒 '}
              {z.name}
              {current && '（目前）'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
