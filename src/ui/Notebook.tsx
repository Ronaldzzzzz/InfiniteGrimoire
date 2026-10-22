import { useState } from 'react';
import type { Content } from '../engine/model';
import { resolveSpell, spellAtLevel } from '../engine/spells';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { AffinityTag, ElementDots } from './DiscoveryBanner';
import { EmpowerPanel } from './EmpowerPanel';
import { empowerLabel } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

/** 「魔法筆記」: the crafted spells (not on the tree). Click a row to put it into the slots. */
export function Notebook({
  runtime,
  sync,
  content,
  onPick,
}: {
  runtime: RuntimeStore & Pick<GameRuntime, 'equip'>;
  sync: Pick<SyncController, 'action'>;
  content: Content;
  onPick: (spellId: string) => void;
}) {
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const levels = useRuntime(runtime, (s) => s.game.levels);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const pending = useRuntime(runtime, (s) => s.synthPending);
  const [open, setOpen] = useState<string | null>(null);

  const rows = learned.flatMap((id) => {
    const spell = resolveSpell(id, content);
    return spell && !spell.named ? [{ id, spell, level: Object.hasOwn(levels, id) ? levels[id]! : 1 }] : [];
  });
  if (rows.length === 0) {
    return <p className="muted notebook-empty">還沒有自創魔法。把魔法和元素、材料或另一個魔法放進合成槽，就能摸索出世上沒有記載的魔法。</p>;
  }

  return (
    <ul className="notebook">
      {rows.map(({ id, spell, level }) => {
        const isEquipped = equipped === id;
        return (
          <li key={id} className={`notebook-row ${isEquipped ? 'equipped' : ''}`}>
            <div className="notebook-main">
              <button type="button" className="notebook-pick" aria-label={`放進合成槽：${spell.name}`} onClick={() => onPick(id)}>
                <ElementDots elements={spell.elements} />
                <span className="notebook-name">{spell.name}</span>
              </button>
              <AffinityTag affinity={spell.affinity} />
              <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
              {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
              <span className="notebook-actions">
                <button type="button" disabled={isEquipped || pending} onClick={() => runtime.equip(id)}>
                  {isEquipped ? '裝備中' : '裝備'}
                </button>
                <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>強化…</button>
              </span>
            </div>
            <p className="notebook-desc muted">{spell.desc}</p>
            {open === id && <EmpowerPanel spellId={id} runtime={runtime} sync={sync} content={content} />}
          </li>
        );
      })}
    </ul>
  );
}
