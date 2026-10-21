import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { ConnStatus, SyncController } from '../game/sync';

export function useGame(runtime: GameRuntime): Snapshot {
  return useSyncExternalStore(
    (cb) => runtime.subscribe(cb),
    () => runtime.getSnapshot(),
  );
}

export function useConnStatus(sync: SyncController): ConnStatus {
  const [status, setStatus] = useState<ConnStatus>(sync.status);
  useEffect(() => {
    setStatus(sync.status);
    return sync.onStatus(setStatus);
  }, [sync]);
  return status;
}
