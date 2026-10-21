import type { ConnStatus } from '../game/sync';

export function OfflineOverlay({ status }: { status: ConnStatus }) {
  if (status !== 'offline') return null;
  return (
    <div className="offline-overlay" role="alert">
      <p>連線中斷，正在重新連線…</p>
    </div>
  );
}
