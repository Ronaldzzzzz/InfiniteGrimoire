import { useState } from 'react';
import type { Content } from '../../engine/model';
import { ELEMENT_ORDER, GRADE_NAMES, MAX_ELEMENT_GRADE, elementItem, type ItemId } from '../../engine/types';
import type { SyncController } from '../../game/sync';
import type { GmContext } from '../GmWindow';
import { ELEMENT_NAMES, itemName } from '../messages';
import { useRuntime, type RuntimeStore } from '../useGame';
import { runGmAction } from './run-gm';

export const GM_ITEM_MAX = 999_999;
const GRADES = Array.from({ length: MAX_ELEMENT_GRADE }, (_, i) => i + 1);

const clamp = (n: number): number => (Number.isFinite(n) ? Math.min(GM_ITEM_MAX, Math.max(0, Math.trunc(n))) : 0);

type Props = { ctx: GmContext; sync: Pick<SyncController, 'action'>; runtime: RuntimeStore; content: Content };

/** Spec §5.1: set any element, material or key item count; 套用 sends every changed cell at once. */
export function GmInventoryTab({ ctx, sync, runtime, content }: Props) {
  // only this tab, only while the GM window shows it: the per-drop re-render is a small table
  const inventory = useRuntime(runtime, (s) => s.game.inventory);
  const [draft, setDraft] = useState<Record<ItemId, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const held = (id: ItemId): number => (Object.hasOwn(inventory, id) ? inventory[id]! : 0);
  const value = (id: ItemId): number => (Object.hasOwn(draft, id) ? draft[id]! : held(id));
  const set = (id: ItemId, n: number): void => {
    setMessage(null);
    setDraft((d) => ({ ...d, [id]: clamp(n) }));
  };
  const changed = Object.fromEntries(Object.entries(draft).filter(([id, n]) => n !== held(id)));
  const dirty = Object.keys(changed).length > 0;

  const apply = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const r = await runGmAction(ctx, () => sync.action('gmInventory', { gmToken: ctx.token, items: changed }), '已套用', content);
    if (r.ok) setDraft({});
    setMessage(r.message);
    setBusy(false);
  };

  const cell = (id: ItemId, label: string) => (
    <span className="gm-count">
      <button type="button" aria-label={`${label} －1`} disabled={busy} onClick={() => set(id, value(id) - 1)}>－</button>
      <input
        type="number"
        min={0}
        max={GM_ITEM_MAX}
        aria-label={label}
        value={value(id)}
        disabled={busy}
        onChange={(e) => set(id, Number(e.target.value))}
      />
      <button type="button" aria-label={`${label} ＋1`} disabled={busy} onClick={() => set(id, value(id) + 1)}>＋</button>
    </span>
  );
  const listed = (ids: ItemId[]) =>
    ids.map((id) => {
      const name = itemName(id, content);
      return (
        <li key={id}>
          <span className="gm-item-name">{name}</span>
          {cell(id, name)}
        </li>
      );
    });

  return (
    <div className="gm-inventory">
      <table className="gm-el-table">
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">屬性</span></th>
            {GRADES.map((g) => <th key={g} scope="col">{GRADE_NAMES[g - 1]}</th>)}
          </tr>
        </thead>
        <tbody>
          {ELEMENT_ORDER.map((el) => (
            <tr key={el}>
              <th scope="row" className={`el-${el}`}>{ELEMENT_NAMES[el]}</th>
              {GRADES.map((g) => <td key={g}>{cell(elementItem(el, g), itemName(elementItem(el, g), content))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <h4>素材</h4>
      <ul className="gm-item-list">{listed(Object.keys(content.materials).sort())}</ul>
      <h4>關鍵道具</h4>
      <ul className="gm-item-list">{listed(Object.keys(content.keyItems).sort())}</ul>
      <div className="gm-actions">
        <button type="button" className="primary" disabled={busy || !dirty} onClick={() => void apply()}>{busy ? '處理中…' : '套用'}</button>
        <span role="status" className="gm-status">{message}</span>
      </div>
    </div>
  );
}
