import type { Content } from '../engine/model';
import type { OfflineReport } from '../game/sync';
import { itemName } from './messages';

/** Several reports that arrive before the player closes the card become one: runs and loot add up, the latest stage wins. */
export function mergeReports(prev: OfflineReport | null, next: OfflineReport): OfflineReport {
  if (!prev) return next;
  const loot = { ...prev.loot };
  for (const [id, n] of Object.entries(next.loot)) loot[id] = (loot[id] ?? 0) + n;
  return { ...next, runs: prev.runs + next.runs, awayMs: prev.awayMs + next.awayMs, capped: prev.capped || next.capped, loot };
}

/** 「2 小時 5 分」; under an hour 「5 分」. */
export function awayLabel(awayMs: number): string {
  const minutes = Math.floor(awayMs / 60_000);
  const h = Math.floor(minutes / 60);
  return h >= 1 ? `${h} 小時 ${minutes % 60} 分` : `${minutes} 分`;
}

export function AwayReport({ report, content, onClose }: { report: OfflineReport; content: Content; onClose: () => void }) {
  const zone = content.zones.find((z) => z.id === report.zoneId);
  const loot = Object.entries(report.loot).filter(([, n]) => n > 0);
  return (
    <div className="away-report-backdrop">
      <div className="away-report" role="dialog" aria-label="離開期間的收穫">
        <h2>離開期間的收穫</h2>
        <p>離開 {awayLabel(report.awayMs)}</p>
        <p>在 {zone?.name ?? report.zoneId} {zone?.order ?? '?'}-{report.stage} 刷了 {Math.round(report.runs * 10) / 10} 次</p>
        {loot.length > 0 && (
          <ul className="away-loot">
            {loot.map(([id, n]) => <li key={id}>{itemName(id, content)} ×{n}</li>)}
          </ul>
        )}
        {report.capped && <p className="muted">已達上限（8 小時），超過的時間不計</p>}
        <button type="button" className="primary" onClick={onClose}>知道了</button>
      </div>
    </div>
  );
}
