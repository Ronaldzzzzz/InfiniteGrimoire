import { useState } from 'react';
import { SYNTH_SLOTS } from '../engine/crafting';
import type { Content, GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { emptySlots, fillSlot, type Slots } from './SynthesisAltar';
import { SynthesisMatrix } from './SynthesisMatrix';
import { slotLabel, spellLabel, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';

const isItem = (id: string): boolean => /^(el|mat):/.test(id);

export function SynthesisPanel({
  game,
  synthPending,
  sync,
  content,
  slots,
  onSlotsChange,
  hint = null,
  onResult,
}: {
  game: GameState;
  synthPending: boolean;
  sync: { synthesize(inputs: string[]): Promise<ActionResult | null> };
  content: Content;
  slots: Slots;
  onSlotsChange: (slots: Slots) => void;
  hint?: string | null;
  /** called with every applied or refused result, after the reply has replaced the state */
  onResult?: (result: ActionResult) => void;
}) {
  const [message, setMessage] = useState('');

  const filled = slots.filter((s): s is string => s !== null);
  const need = new Map<string, number>();
  for (const id of filled) if (isItem(id)) need.set(id, (need.get(id) ?? 0) + 1);
  const affordable = [...need].every(([id, n]) => (Object.hasOwn(game.inventory, id) ? game.inventory[id]! : 0) >= n);
  const spellsKnown = filled.every((id) => isItem(id) || game.learned.includes(id));
  const canSynth = filled.length === SYNTH_SLOTS && affordable && spellsKnown && !synthPending;

  const run = async (): Promise<void> => {
    if (!canSynth) return;
    const inputs = [...filled].sort();
    try {
      const result = await sync.synthesize(inputs);
      if (result) {
        setMessage(synthMessage(result, content, inputs));
        // a refusal (e.g. the element grade is too low) spent nothing: keep the slots to adjust them
        if (result.kind !== 'rejected') onSlotsChange(emptySlots());
        onResult?.(result);
      } else {
        // busy, offline, or the server sent its own state back (conflict / audit rejection)
        setMessage(SYNTH_RETRY_MESSAGE);
      }
    } catch {
      setMessage(SYNTH_ERROR_MESSAGE);
    }
  };

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
            {id ? slotLabel(id, content) : '空'}
          </button>
        ))}
      </div>
      <select
        className="slot-spell"
        aria-label="放入魔法"
        value=""
        disabled={!slots.includes(null)}
        onChange={(e) => {
          if (e.target.value) onSlotsChange(fillSlot(slots, e.target.value));
        }}
      >
        <option value="">放入魔法…</option>
        {game.learned.map((id) => (
          <option key={id} value={id}>{spellLabel(id, content)}</option>
        ))}
      </select>
      <button type="button" className="primary" disabled={!canSynth} onClick={() => void run()}>
        {synthPending ? '嬗變中…' : '合成'}
      </button>
      <p className="synth-message" role="status">{message}</p>
      <div className="synth-hint" aria-label="殘卷線索" aria-live="polite">
        {hint ?? <span className="muted">在魔導書點未學會的魔法，殘卷線索會顯示在這裡</span>}
      </div>

      <h3>嘗試紀錄</h3>
      <SynthesisMatrix log={game.synthesisLog} content={content} onPickPair={(a, b) => onSlotsChange([a, b])} />
    </section>
  );
}
