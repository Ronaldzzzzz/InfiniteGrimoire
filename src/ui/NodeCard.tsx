import { useEffect, useState } from 'react';
import { parseCanonical, RUNE_NAMES } from '../engine/circle';
import type { Content, Spell } from '../engine/model';
import { resolveSpell, spellAtLevel } from '../engine/spells';
import type { ElementId } from '../engine/types';
import { passiveRequirementMet } from '../engine/tree';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { COLORS } from '../render/palette';
import { CENTER, RING_R, slotPoint, starPath, VIEW } from './circle-draw';
import { placementOfSpell } from './CircleTable';
import { AffinityTag, ElementDots } from './DiscoveryBanner';
import { EmpowerPanel } from './EmpowerPanel';
import type { BubbleSelected } from './NodeBubble';
import { empowerLabel, passiveRequirementLabel } from './messages';
import { runAction } from './run-action';
import { SpellFactsView } from './SpellFactsView';
import { useRuntime, type RuntimeStore } from './useGame';

/** The magic circle a learned spell is made of (its own canonical circle, or the circle a named / rare spell names). */
export function CirclePreview({ spellId, content }: { spellId: string; content: Content }) {
  const named = Object.hasOwn(content.spells, spellId) ? content.spells[spellId] : undefined;
  const c = parseCanonical(named ? named.circle ?? '' : spellId);
  if (!c) return null;
  const node = (e: ElementId | null, ring: 0 | 1, j: number) => {
    if (!e) return null;
    const p = slotPoint(ring, j);
    return <circle key={`${ring}-${j}`} cx={p.x} cy={p.y} r={11} fill={COLORS.element[e]} stroke={COLORS.bg} strokeWidth={2} />;
  };
  return (
    <figure className="circle-preview">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="這個魔法的魔法陣">
        <circle cx={CENTER} cy={CENTER} r={RING_R[0]} fill="none" stroke="#3a4254" />
        {c.ring2.some((e) => e) && <circle cx={CENTER} cy={CENTER} r={RING_R[1]} fill="none" stroke="#3a4254" />}
        <path d={starPath()} fill="none" stroke="#3a4254" />
        {c.ring2.map((e, j) => e && c.ring1[j] && (() => {
          const a = slotPoint(0, j), b = slotPoint(1, j);
          return <line key={`w${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={COLORS.rune} strokeOpacity={0.5} />;
        })())}
        <circle cx={CENTER} cy={CENTER} r={16} fill={COLORS.element[c.core]} stroke={COLORS.amber} strokeWidth={2} />
        {c.ring1.map((e, j) => node(e, 0, j))}
        {c.ring2.map((e, j) => node(e, 1, j))}
      </svg>
      <figcaption className="muted">符文：{RUNE_NAMES[c.form]}</figcaption>
    </figure>
  );
}

/** The floating details card: what a node is, its actions, and (for a learned spell) the empower section. */
export function NodeCard({
  selected,
  runtime,
  sync,
  content,
  onPick,
  onClose,
}: {
  selected: BubbleSelected;
  runtime: RuntimeStore & Pick<GameRuntime, 'equip'>;
  sync: Pick<SyncController, 'action'>;
  content: Content;
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
    const spell = resolveSpell(selected.id, content);
    if (!spell || !learned.includes(selected.id)) return null;
    const level = Object.hasOwn(levels, spell.id) ? levels[spell.id]! : 1;
    const isEquipped = equipped === spell.id;
    const eqSpell = resolveSpell(equipped, content);
    const equippedVs = eqSpell ? { spell: eqSpell, level: Object.hasOwn(levels, equipped) ? levels[equipped]! : 1 } : null;
    const chant = (spell as Spell & { chant?: string }).chant;
    body = (
      <>
        <h4>
          <ElementDots elements={spell.elements} /> {spell.name}{' '}
          <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
          {!spell.named && <span className="crafted-tag">自創</span>}
          {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
        </h4>
        <CirclePreview spellId={spell.id} content={content} />
        <p><AffinityTag affinity={spell.affinity} /> {spell.desc}</p>
        <SpellFactsView spell={spell} level={level} chant={chant} versus={isEquipped ? null : equippedVs} />
        <div className="node-actions">
          {placementOfSpell(spell.id, content) && (
            <button type="button" disabled={pending} onClick={() => onPick(spell.id)}>放到牛皮紙上</button>
          )}
          <button type="button" disabled={isEquipped || pending} onClick={() => runtime.equip(spell.id)}>
            {isEquipped ? '裝備中' : '裝備'}
          </button>
        </div>
        <EmpowerPanel spellId={spell.id} runtime={runtime} sync={sync} content={content} />
      </>
    );
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
