import { useState } from 'react';
import { empowerCost } from '../engine/empower';
import type { Content } from '../engine/model';
import { MAX_SPELL_LEVEL, resolveSpell, spellAtLevel } from '../engine/spells';
import type { ItemId } from '../engine/types';
import type { SyncController } from '../game/sync';
import { empowerLabel, itemName, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

/** Feeds elements to a learned spell (server action 'empower'); locked like synthesis while any action runs. */
export function EmpowerPanel({
  spellId,
  runtime,
  sync,
  content,
}: {
  spellId: string;
  runtime: RuntimeStore;
  sync: Pick<SyncController, 'action'>;
  content: Content;
}) {
  const levels = useRuntime(runtime, (s) => s.game.levels);
  const inventory = useRuntime(runtime, (s) => s.game.inventory);
  const pending = useRuntime(runtime, (s) => s.synthPending);
  const [message, setMessage] = useState('');
  const spell = resolveSpell(spellId, content);
  if (!spell) return null;
  const level = Object.hasOwn(levels, spellId) ? levels[spellId]! : 1;
  const have = (id: ItemId) => (Object.hasOwn(inventory, id) ? inventory[id]! : 0);

  let body;
  if (level >= MAX_SPELL_LEVEL) body = <p className="muted">已經強化到最高等級</p>;
  else if (spell.elements.length === 0) body = <p className="muted">無屬性魔法不能強化</p>;
  else {
    const cost = new Map<ItemId, number>();
    for (const id of empowerCost(spell, level)) cost.set(id, (cost.get(id) ?? 0) + 1);
    const enough = [...cost].every(([id, n]) => have(id) >= n);
    const now = spellAtLevel(spell, level), next = spellAtLevel(spell, level + 1);
    const run = async (): Promise<void> => {
      try {
        const result = await sync.action('empower', { spellId });
        setMessage(result ? synthMessage(result, content) : SYNTH_RETRY_MESSAGE);
      } catch {
        setMessage(SYNTH_ERROR_MESSAGE);
      }
    };
    body = (
      <>
        <p>
          下一級：{empowerLabel(level + 1)}
          <span className="muted">（攻擊 {Math.round(now.attack)} → {Math.round(next.attack)}{next.tier > now.tier ? `，Lv.${next.tier}` : ''}）</span>
        </p>
        <ul className="empower-cost">
          {[...cost].map(([id, n]) => (
            <li key={id} className={have(id) >= n ? '' : 'short'}>
              {itemName(id, content)} ×{n}
              <span className="muted">（持有 {have(id)}）</span>
            </li>
          ))}
        </ul>
        <button type="button" className="primary" disabled={!enough || pending} onClick={() => void run()}>
          {pending ? '強化中…' : '強化'}
        </button>
      </>
    );
  }

  return (
    <section className="empower" aria-label="強化">
      <h4>強化</h4>
      <p className="empower-level">{level > 1 ? `目前：${empowerLabel(level)}` : '尚未強化'}</p>
      {body}
      <p className="synth-message" role="status">{message}</p>
    </section>
  );
}
