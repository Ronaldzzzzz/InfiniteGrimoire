import { useEffect, useState } from 'react';
import type { Content } from '../engine/model';
import { visibleRegions } from '../engine/tree';
import type { SyncController } from '../game/sync';
import { itemName } from './messages';
import { runAction } from './run-action';
import { useRuntime, type RuntimeStore } from './useGame';

/** How long the line under the key item buttons stays. */
export const KEY_MESSAGE_MS = 3000;

/** The glowing "use key item" buttons on the battle view. */
export function KeyItemBar({
  runtime,
  sync,
  content,
  onRevealed,
}: {
  runtime: RuntimeStore;
  sync: Pick<SyncController, 'action'>;
  content: Content;
  onRevealed: (region: string) => void;
}) {
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  // a joined string, so drops that don't add a usable key item don't re-render the bar
  const keyList = useRuntime(runtime, (s) => {
    const inv = s.game.inventory;
    const visible = visibleRegions({ revealed: s.game.revealed }, content);
    return Object.keys(inv)
      .filter((id) => inv[id]! > 0 && Object.hasOwn(content.keyItems, id) && !visible.has(content.keyItems[id]!.reveals))
      .join(',');
  });
  const keys = keyList ? keyList.split(',') : [];
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), KEY_MESSAGE_MS);
    return () => clearTimeout(t);
  }, [message]);

  const useKey = async (keyItem: string): Promise<void> => {
    const { result, message: text } = await runAction(() => sync.action('reveal', { keyItem }), content);
    setMessage(text);
    if (result?.kind === 'revealed') onRevealed(result.region);
  };

  if (keys.length === 0 && !message) return null;
  return (
    <div className="key-bar">
      {keys.map((id) => (
        <button key={id} type="button" className="key-use" disabled={synthPending} onClick={() => void useKey(id)}>
          <span>使用{itemName(id, content)}</span>
          <small className="key-desc">{content.keyItems[id]!.desc}</small>
        </button>
      ))}
      {message && <p className="key-message" role="status">{message}</p>}
    </div>
  );
}
