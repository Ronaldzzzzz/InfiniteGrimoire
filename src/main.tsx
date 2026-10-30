import { Profiler, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { content } from './engine/content';
import { createRng } from './engine/rng';
import type { GameState } from './engine/model';
import { createApiClient, type ApiClient } from './game/api';
import { classifyBootError } from './game/boot';
import { startLoop } from './game/loop';
import { watchPresence } from './game/presence';
import { AWAY_DELAY_MS } from './engine/offline';
import { GameRuntime } from './game/runtime';
import { readToken, TOKEN_KEY, writeToken } from './game/session';
import { SyncController } from './game/sync';
import { App } from './ui/App';
import { Onboarding } from './ui/Onboarding';
import { PerfMeter } from './ui/PerfMeter';
import { perfStats } from './ui/perf-stats';

type Loaded = { state: GameState; revision: number };
type Phase =
  | { kind: 'loading' }
  | { kind: 'onboarding' }
  | { kind: 'offline' }
  | { kind: 'ready'; runtime: GameRuntime; sync: SyncController };

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const clearToken = (): void => {
  try {
    storage()?.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};
const api: ApiClient = createApiClient(() => readToken(storage()));

function Boot() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const start = useCallback((loaded: Loaded) => {
    const runtime = new GameRuntime(content, loaded.state, loaded.revision, createRng(Date.now() >>> 0));
    setPhase({ kind: 'ready', runtime, sync: new SyncController(runtime, api) });
  }, []);

  const boot = useCallback(async () => {
    if (!readToken(storage())) return setPhase({ kind: 'onboarding' });
    setPhase({ kind: 'loading' });
    try {
      start(await api.loadSave());
    } catch (e) {
      if (classifyBootError(e) === 'auth') {
        clearToken();
        setPhase({ kind: 'onboarding' });
      } else setPhase({ kind: 'offline' });
    }
  }, [start]);

  useEffect(() => {
    void boot();
  }, [boot]);

  const ready = phase.kind === 'ready' ? phase : null;
  useEffect(() => {
    if (!ready) return;
    const { runtime, sync } = ready;
    // pay for closed time before the first periodic upload; a failed claim never blocks the game
    void sync.claimOffline();
    const stopSync = sync.start();
    const stopLoop = startLoop(runtime, sync);
    const stopPresence = watchPresence({
      delayMs: AWAY_DELAY_MS,
      onAway: () => void sync.goAway(),
      onReturn: () => void sync.claimOffline(),
    });
    const offAuth = sync.onAuthError(() => {
      clearToken();
      setPhase({ kind: 'onboarding' });
    });
    return () => {
      stopSync();
      stopLoop();
      stopPresence();
      offAuth();
    };
  }, [ready]);

  switch (phase.kind) {
    case 'loading':
      return <div className="screen-center"><p className="muted">載入中…</p></div>;
    case 'offline':
      return (
        <div className="screen-center">
          <p>需要連線才能遊玩</p>
          <button type="button" className="primary" onClick={() => void boot()}>重試</button>
        </div>
      );
    case 'onboarding':
      return (
        <Onboarding
          api={api}
          onDone={(r) => {
            if (!writeToken(storage(), r.token)) console.warn('could not persist token');
            start(r);
          }}
        />
      );
    case 'ready': {
      const app = (
        <App
          runtime={phase.runtime}
          sync={phase.sync}
          content={content}
          api={api}
          onSwitched={(r) => {
            if (!writeToken(storage(), r.token)) console.warn('could not persist token');
            start(r);
          }}
          onLoggedOut={() => {
            clearToken();
            setPhase({ kind: 'onboarding' });
          }}
        />
      );
      if (!import.meta.env.DEV) return app;
      return (
        <>
          <Profiler id="app" onRender={() => perfStats.commit(performance.now())}>
            {app}
          </Profiler>
          <PerfMeter />
        </>
      );
    }
  }
}

createRoot(document.getElementById('root')!).render(<Boot />);
