import { memo } from 'react';
import type { Content } from '../engine/model';
import type { Snapshot } from '../game/runtime';
import { bossAlive, useRuntime, type RuntimeStore } from './useGame';

/** The line under the DPS number: how many more kills until this zone's boss, or that it is here. */
export function bossCounterText(s: Snapshot, content: Content): string {
  if (bossAlive(s, content)) return '魔王現身！';
  const zone = content.zones.find((z) => z.id === s.game.currentZone);
  const left = zone ? Math.max(0, zone.killsForBoss - (s.game.zoneKills[zone.id] ?? 0)) : 0;
  return `魔王出現還差 ${left} 隻`;
}

export const BossCounter = memo(function BossCounter({ runtime, content }: { runtime: RuntimeStore; content: Content }) {
  // a string: kills that leave the number unchanged don't re-render
  const text = useRuntime(runtime, (s) => bossCounterText(s, content));
  return <div className="boss-counter" role="status" aria-label="魔王倒數">{text}</div>;
});
