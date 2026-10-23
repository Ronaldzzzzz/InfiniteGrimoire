import { useEffect, useState } from 'react';
import type { Content } from '../engine/model';
import { spellAtLevel } from '../engine/spells';
import { passiveRequirementMet } from '../engine/tree';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { AffinityTag, ElementDots } from './DiscoveryBanner';
import { EmpowerPanel } from './EmpowerPanel';
import type { BubbleSelected } from './NodeBubble';
import { empowerLabel, passiveRequirementLabel } from './messages';
import { runAction } from './run-action';
import { useRuntime, type RuntimeStore } from './useGame';

/** The floating details card: what a node is, its actions, and (for a learned spell) the empower section. */
export function NodeCard({
  selected,
  runtime,
  sync,
  content,
  slotsFull,
  onPick,
  onClose,
}: {
  selected: BubbleSelected;
  runtime: RuntimeStore & Pick<GameRuntime, 'equip'>;
  sync: Pick<SyncController, 'action'>;
  content: Content;
  slotsFull: boolean;
  onPick: (spellId: string) => void;
  onClose: () => void;
}) {
  // narrow selectors: kills and drops change the game state several times a second
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const levels = useRuntime(runtime, (s) => s.game.levels);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const passives = useRuntime(runtime, (s) => s.game.passives);
  const met = useRuntime(runtime, (s) => selected?.kind === 'passive' && passiveRequirementMet(s.game, selected.id, content));
  const pending = useRuntime(runtime, (s) => s.synthPending);
  const [message, setMessage] = useState('');
  useEffect(() => setMessage(''), [selected?.id]);
  if (!selected) return null;

  let body;
  if (selected.kind === 'spell') {
    const spell = content.spells[selected.id]!;
    if (!learned.includes(spell.id)) {
      body = (
        <>
          <h4>{spell.name}<span className="muted">（未學會）</span></h4>
          <p className="node-hint">殘卷：{spell.hint}</p>
        </>
      );
    } else {
      const level = Object.hasOwn(levels, spell.id) ? levels[spell.id]! : 1;
      const isEquipped = equipped === spell.id;
      body = (
        <>
          <h4>
            <ElementDots elements={spell.elements} /> {spell.name}{' '}
            <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
            {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
          </h4>
          <p><AffinityTag affinity={spell.affinity} /> {spell.desc}</p>
          <div className="node-actions">
            <button type="button" disabled={slotsFull} onClick={() => onPick(spell.id)}>放入合成</button>
            <button type="button" disabled={isEquipped || pending} onClick={() => runtime.equip(spell.id)}>
              {isEquipped ? '裝備中' : '裝備'}
            </button>
          </div>
          <EmpowerPanel spellId={spell.id} runtime={runtime} sync={sync} content={content} />
        </>
      );
    }
  } else {
    const p = content.passives[selected.id]!;
    const unlocked = passives.includes(p.id);
    const unlock = async (): Promise<void> => {
      setMessage((await runAction(() => sync.action('passive', { passiveId: p.id }), content)).message);
    };
    body = (
      <>
        <h4>{p.name}<span className="muted">（被動）</span></h4>
        <p>{p.desc}</p>
        <p className="muted">條件：{passiveRequirementLabel(p, content)}</p>
        {unlocked ? (
          <p className="node-done">已解鎖</p>
        ) : met ? (
          <button type="button" className="primary" disabled={pending} onClick={() => void unlock()}>解鎖</button>
        ) : (
          <p className="muted">尚未達成條件</p>
        )}
        {message && <p className="synth-message" role="status">{message}</p>}
      </>
    );
  }
  return (
    <section className="node-card" aria-label="節點詳情">
      <button type="button" className="node-card-close" aria-label="關閉詳情" onClick={onClose}>✕</button>
      {body}
    </section>
  );
}
