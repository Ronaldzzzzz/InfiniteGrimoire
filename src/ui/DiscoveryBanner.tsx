import { useEffect, useRef, useState } from 'react';
import type { ElementId } from '../engine/types';
import type { Affinity, Spell } from '../engine/model';
import { COLORS } from '../render/palette';
import { AFFINITY_LABEL } from './messages';

export const BANNER_MS = 2600;

/** One dot per element (the neutral colour for element-less spells). */
export function ElementDots({ elements }: { elements: readonly ElementId[] }) {
  const colors = elements.length > 0 ? elements.map((e) => COLORS.element[e]) : [COLORS.element.none];
  return (
    <span className="dots" aria-hidden="true">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

export function AffinityTag({ affinity }: { affinity: Affinity }) {
  return <span className={`tag aff aff-${affinity}`}>{AFFINITY_LABEL[affinity]}</span>;
}

/** 「新發現！」 over the battle after a synthesis; gone after BANNER_MS, then `onDone`. */
export function DiscoveryBanner({ spell, isNew, onDone }: { spell: Spell | null; isNew: boolean; onDone: () => void }) {
  const [hidden, setHidden] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!spell) return;
    setHidden(false);
    const t = setTimeout(() => {
      setHidden(true);
      done.current();
    }, BANNER_MS);
    return () => clearTimeout(t);
  }, [spell, isNew]);

  if (!spell || hidden) return null;
  return (
    <div className={`discovery-banner aff-${spell.affinity}`} role="status" aria-label="新發現">
      <div className="discovery-kicker">{isNew ? '新發現！' : '已經會了'}</div>
      <div className="discovery-name">
        <ElementDots elements={spell.elements} /> {spell.name}
      </div>
      <div className="discovery-desc">
        <AffinityTag affinity={spell.affinity} /> {spell.desc}
      </div>
    </div>
  );
}
