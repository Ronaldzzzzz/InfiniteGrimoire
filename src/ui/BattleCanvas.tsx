import { useEffect, useRef } from 'react';
import { loadOptionalTextures } from '../render/assets';
import { BattleView } from '../render/battle-view';
import { content } from '../engine/content';
import type { GameRuntime } from '../game/runtime';

/** The tab title while away, so a glance at the tab bar shows the game is earning offline. */
export const AWAY_TITLE = '💤 離線收益中 - 無限魔導書';

export function BattleCanvas({ runtime }: { runtime: GameRuntime }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void loadOptionalTextures(import.meta.env.BASE_URL).then((textures) => {
      if (cancelled) return;
      const view = new BattleView(host, content, textures);
      const offEvents = runtime.onEvents((events) => view.handle(events));
      const offFrame = view.onFrame(() => view.sync(runtime.getSnapshot(), runtime.stepAlpha()));
      // away: the strip stops dead (no scrolling, effects or motion) and the whole page turns grey
      let wasAway: boolean | null = null;
      const title = document.title;
      const applyAway = (): void => {
        const away = runtime.getSnapshot().away;
        if (away === wasAway) return; // the runtime notifies every step; act only on a change
        wasAway = away;
        view.setFrozen(away);
        document.documentElement.classList.toggle('away', away);
        document.title = away ? AWAY_TITLE : title;
      };
      applyAway();
      const offAway = runtime.subscribe(applyAway);
      cleanup = () => {
        offEvents();
        offFrame();
        offAway();
        document.documentElement.classList.remove('away');
        document.title = title;
        view.destroy();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [runtime]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />;
}
