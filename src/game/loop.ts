import type { GameRuntime } from './runtime';
import type { SyncController } from './sync';

export function startLoop(runtime: GameRuntime, sync: SyncController): () => void {
  let last = performance.now();
  let raf = 0;
  const frame = (now: number): void => {
    runtime.advance(now - last);
    last = now;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const flush = (): void => void sync.uploadNow({ keepalive: true });
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush();
    else last = performance.now();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  };
}
