import type { GameData } from '../engine/types';
import type { GameRuntime, Snapshot } from '../game/runtime';

export function ZonePanel({ snapshot, data, runtime }: { snapshot: Snapshot; data: GameData; runtime: GameRuntime }) {
  const { game } = snapshot;
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
