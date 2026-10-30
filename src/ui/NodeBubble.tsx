import type { Content } from '../engine/model';
import { resolveSpell, spellAtLevel } from '../engine/spells';
import type { GameRuntime } from '../game/runtime';
import { placementOfSpell } from './CircleTable';
import { ElementDots } from './DiscoveryBanner';
import { empowerLabel } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

export type BubbleSelected = { kind: 'spell' | 'passive'; id: string } | null;

/** The small action bubble next to a clicked star (put its circle on the parchment, equip, details). */
export function NodeBubble({
  selected,
  runtime,
  content,
  position,
  onPick,
  onDetails,
  onClose,
}: {
  selected: BubbleSelected;
  runtime: RuntimeStore & Pick<GameRuntime, 'equip'>;
  content: Content;
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
  if (!selected || selected.kind !== 'spell' || !learned.includes(selected.id)) return null;
  const spell = resolveSpell(selected.id, content);
  if (!spell) return null;
  const level = Object.hasOwn(levels, spell.id) ? levels[spell.id]! : 1;
  const isEquipped = equipped === spell.id;
  const canPlace = placementOfSpell(spell.id, content) !== null;
  return (
    <div className="node-bubble" role="group" aria-label="魔法操作" style={{ left: position.left, top: position.top }}>
      <strong>
        <ElementDots elements={spell.elements} /> {spell.name}{' '}
        <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
        {!spell.named && <span className="crafted-tag">自創</span>}
        {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
      </strong>
      <div className="node-actions">
        {canPlace && (
          <button type="button" disabled={pending} onClick={() => { onPick(spell.id); onClose(); }}>放到牛皮紙上</button>
        )}
        <button type="button" disabled={isEquipped || pending} onClick={() => { runtime.equip(spell.id); onClose(); }}>
          {isEquipped ? '裝備中' : '裝備'}
        </button>
        <button type="button" onClick={onDetails}>詳情</button>
      </div>
    </div>
  );
}
