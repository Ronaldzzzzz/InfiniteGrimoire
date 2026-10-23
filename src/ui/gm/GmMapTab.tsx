import { useState } from 'react';
import type { Content } from '../../engine/model';
import type { SyncController } from '../../game/sync';
import type { GmContext } from '../GmWindow';
import { runGmAction } from './run-gm';

type Op = 'unlock_all' | 'reveal_all' | 'boss_ready';
const OPS: { op: Op; label: string; done: string }[] = [
  { op: 'unlock_all', label: '開放所有地點', done: '已開放所有地點' },
  { op: 'reveal_all', label: '散開所有迷霧', done: '已散開所有迷霧' },
  { op: 'boss_ready', label: '目前地點差 1 隻出魔王', done: '已設定：目前地點差 1 隻出魔王' },
];

/** Spec §5.2: three one-click map edits on the GM's own save. */
export function GmMapTab({ ctx, sync, content }: { ctx: GmContext; sync: Pick<SyncController, 'action'>; content: Content }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (op: Op, done: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const r = await runGmAction(ctx, () => sync.action('gmZones', { gmToken: ctx.token, op }), done, content);
    setMessage(r.message);
    setBusy(false);
  };

  return (
    <div className="gm-map">
      {OPS.map(({ op, label, done }) => (
        <button key={op} type="button" disabled={busy} onClick={() => void run(op, done)}>{label}</button>
      ))}
      <span role="status" className="gm-status">{message}</span>
    </div>
  );
}
