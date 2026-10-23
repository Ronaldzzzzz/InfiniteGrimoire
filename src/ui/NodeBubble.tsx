import type { Content } from '../engine/model';
import { spellAtLevel } from '../engine/spells';
import type { GameRuntime } from '../game/runtime';
import { ElementDots } from './DiscoveryBanner';
import { empowerLabel } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

export type BubbleSelected = { kind: 'spell' | 'passive'; id: string } | null;

/** The small action bubble next to a clicked spell node (put into the altar, equip, details). */
export function NodeBubble({
  selected,
  runtime,
  content,
  slotsFull,
  position,
  onPick,
  onDetails,
  onClose,
}: {
  selected: BubbleSelected;
  runtime: RuntimeStore & Pick<GameRuntime, 'equip'>;
  content: Content;
  slotsFull: boolean;
  position: { left: number; top: number };
  onPick: (spellId: string) => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  // narrow selectors: kills and drops change the game state several times a second
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const levels = useRuntime(runtime, (s) => s.game.levels);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const pending = useRuntime(runtime, (s) => s.synthPending);
  if (!selected || selected.kind !== 'spell') return null;
  const spell = content.spells[selected.id];
  if (!spell) return null;

  let body;
  if (!learned.includes(spell.id)) {
    body = (
      <>
        <strong>{spell.name}<span className="muted">（未學會）</span></strong>
        <p className="node-hint">殘卷：{spell.hint}</p>
      </>
    );
  } else {
    const level = Object.hasOwn(levels, spell.id) ? levels[spell.id]! : 1;
    const isEquipped = equipped === spell.id;
    body = (
      <>
        <strong>
          <ElementDots elements={spell.elements} /> {spell.name}{' '}
          <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
          {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
        </strong>
        <div className="node-actions">
          <button type="button" disabled={slotsFull} onClick={() => { onPick(spell.id); onClose(); }}>放入合成</button>
          <button type="button" disabled={isEquipped || pending} onClick={() => { runtime.equip(spell.id); onClose(); }}>
            {isEquipped ? '裝備中' : '裝備'}
          </button>
          <button type="button" onClick={onDetails}>詳情</button>
        </div>
      </>
    );
  }
  return (
    <div className="node-bubble" role="group" aria-label="魔法操作" style={{ left: position.left, top: position.top }}>
      {body}
    </div>
  );
}
