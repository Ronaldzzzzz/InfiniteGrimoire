import { useState } from 'react';
import { comboKey, SYNTH_SLOTS, type SynthResult } from '../engine/synthesis';
import type { GameData, ItemId } from '../engine/types';
import type { Snapshot } from '../game/runtime';
import { itemName, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';

export type Slots = (ItemId | null)[];
export const emptySlots = (): Slots => Array<ItemId | null>(SYNTH_SLOTS).fill(null);

function comboLabel(key: string): string {
  return key.split('+').map(itemName).join(' + ');
}

export function SynthesisPanel({
  snapshot,
  sync,
  data,
  slots,
  onSlotsChange,
}: {
  snapshot: Snapshot;
  sync: { synthesize(inputs: ItemId[]): Promise<SynthResult | null> };
  data: GameData;
  slots: Slots;
  onSlotsChange: (slots: Slots) => void;
}) {
  const [message, setMessage] = useState('');
  const { game, synthPending } = snapshot;

  const filled = slots.filter((s): s is ItemId => s !== null);
  const need = new Map<ItemId, number>();
  for (const id of filled) need.set(id, (need.get(id) ?? 0) + 1);
  const affordable = [...need].every(([id, n]) => (game.inventory[id] ?? 0) >= n);
  const canSynth = filled.length === SYNTH_SLOTS && affordable && !synthPending;

  const run = async (): Promise<void> => {
    if (!canSynth) return;
    const inputs = [...filled].sort();
    try {
      const result = await sync.synthesize(inputs);
      if (result) {
        setMessage(synthMessage(result, data));
        onSlotsChange(emptySlots());
      } else {
        // busy, offline, or the server sent its own state back (conflict / rejected)
        setMessage(SYNTH_RETRY_MESSAGE);
      }
    } catch {
      setMessage(SYNTH_ERROR_MESSAGE);
    }
  };

  const logEntries = Object.entries(game.synthesisLog);

  return (
    <section className="synthesis">
      <div className="slots">
        {slots.map((id, i) => (
          <button
            key={i}
            type="button"
            className={`slot ${id ? 'filled' : ''}`}
            disabled={!id}
            onClick={() => onSlotsChange(slots.map((s, j) => (j === i ? null : s)))}
          >
            {id ? itemName(id) : '空'}
          </button>
        ))}
      </div>
      <button type="button" className="primary" disabled={!canSynth} onClick={() => void run()}>
        {synthPending ? '嬗變中…' : '合成'}
      </button>
      <p className="synth-message" role="status">{message}</p>

      <h3>嘗試紀錄</h3>
      {logEntries.length === 0 && <p className="muted">還沒有嘗試過任何組合</p>}
      <ul className="synth-log">
        {logEntries.map(([key, entry]) => (
          <li key={key}>
            <div>
              {comboLabel(comboKey(key.split('+')))}　{entry.attempts} 次
              {entry.noReaction && <span className="tag">無反應</span>}
            </div>
            <div className="muted">
              {Object.entries(entry.results)
                .map(([r, n]) => `${r === 'none' ? '無反應' : (data.spells[r]?.name ?? r)} ${Math.round((n / entry.attempts) * 100)}%`)
                .join('、')}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
