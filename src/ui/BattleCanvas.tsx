import { useEffect, useRef } from 'react';
import { loadOptionalTextures } from '../render/assets';
import { BattleView } from '../render/battle-view';
import { gameData } from '../engine/data';
import type { GameRuntime } from '../game/runtime';

export function BattleCanvas({ runtime }: { runtime: GameRuntime }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void loadOptionalTextures(import.meta.env.BASE_URL).then((textures) => {
      if (cancelled) return;
      const view = new BattleView(host, gameData, textures);
      const offEvents = runtime.onEvents((events) => view.handle(events));
      const offFrame = view.onFrame(() => view.sync(runtime.getSnapshot(), runtime.stepAlpha()));
      cleanup = () => {
        offEvents();
        offFrame();
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
