import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { NamedSpellDef, Spell } from '../engine/model';
import { blendForSpell, particleStyle, type ParticleShape } from '../render/element-fx';
import { COLORS } from '../render/palette';
import { ElementDots } from './DiscoveryBanner';
import { ELEMENT_NAMES } from './messages';

/** The reveal: gather (0–1 s), burst (1–2 s), then the title waits for 裝備 / 不裝備. */
const BURST_AT_MS = 1000;
const TITLE_AT_MS = 2000;
const BURST_PARTICLES = 44;
const GATHER_MOTES = 14;
const EMBERS = 18;

type Phase = 'gather' | 'burst' | 'title';

interface Mote {
  shape: ParticleShape;
  color: string;
  /** vertical drift in vh: fire floats up, earth and water fall (the element-fx language, scaled to the screen) */
  vy: number;
}

/** One mote per index, cycling through the spell's elements so a two-element spell shows both. */
function motesOf(spell: Spell, n: number): Mote[] {
  const els = spell.elements;
  return Array.from({ length: n }, (_, i) => {
    const el = els[i % Math.max(1, els.length)];
    if (!el) return { shape: 'spark', color: COLORS.element.none, vy: -4 };
    const style = particleStyle(el);
    return { shape: style.shape, color: style.color, vy: style.vy / 10 };
  });
}

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Where the altar sits, relative to the screen centre, so the orb can fly from it. */
function altarOffset(): { x: number; y: number } {
  const el = typeof document !== 'undefined' ? document.querySelector('.altar') : null;
  if (!el || typeof window === 'undefined') return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return { x: 0, y: 0 };
  return { x: r.left + r.width / 2 - window.innerWidth / 2, y: r.top + r.height / 2 - window.innerHeight / 2 };
}

/** A rare spell is a named one, so it carries its 殘卷 hint (most hints already start with 殘卷：). */
function hintText(spell: Spell): string | null {
  const hint = (spell as Partial<NamedSpellDef>).hint;
  if (!hint) return null;
  return hint.startsWith('殘卷：') ? hint : `殘卷：${hint}`;
}

/**
 * The full-screen reveal of a rare spell, over everything. A click in the first two phases jumps to the title,
 * the title waits for 裝備 / 不裝備 (a click elsewhere does nothing); under prefers-reduced-motion it starts on the title.
 * Pure CSS transforms and opacity, so the battle canvas keeps its frame rate.
 */
export function RareReveal({ spell, first, onChoose }: { spell: Spell; first: boolean; onChoose: (equip: boolean) => void }) {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(() => (reduced ? 'title' : 'gather'));
  const [origin] = useState(altarOffset);
  const [motes] = useState(() => ({ burst: motesOf(spell, BURST_PARTICLES), gather: motesOf(spell, GATHER_MOTES), embers: motesOf(spell, EMBERS) }));

  const choose = useRef(onChoose);
  useEffect(() => {
    choose.current = onChoose;
  }, [onChoose]);
  const ended = useRef(false);
  const finish = (equip: boolean): void => {
    if (ended.current) return;
    ended.current = true;
    choose.current(equip);
  };

  useEffect(() => {
    if (reduced) return;
    const ts = [
      setTimeout(() => setPhase((p) => (p === 'gather' ? 'burst' : p)), BURST_AT_MS),
      setTimeout(() => setPhase('title'), TITLE_AT_MS),
    ];
    return () => ts.forEach(clearTimeout);
  }, [reduced]);

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
  }, []);

  const advance = (): void => {
    if (phase !== 'title') setPhase('title');
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (phase === 'title') finish(false);
      else advance();
      return;
    }
    // Enter / Space on a focused button must reach the button's own click
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
  };
  const equipBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase === 'title') equipBtn.current?.focus();
  }, [phase]);

  const blend = blendForSpell(spell.elements);
  const style = {
    '--c': blend.primary,
    '--c2': blend.secondary ?? blend.primary,
    '--ox': `${origin.x}px`,
    '--oy': `${origin.y}px`,
  } as CSSProperties;
  const hint = hintText(spell);
  const names = spell.elements.map((e) => ELEMENT_NAMES[e]).join('');

  return (
    <div
      ref={root}
      className={`rare-reveal phase-${phase}${first ? ' first' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="稀有魔法"
      tabIndex={-1}
      onClick={advance}
      onKeyDown={onKey}
      style={style}
    >
      <div className="rr-dim" aria-hidden="true" />
      <div className="rr-stage" aria-hidden={phase !== 'title'}>
        {phase === 'gather' && (
          <>
            {motes.gather.map((m, i) => (
              <span
                key={i}
                className={`rr-mote p-${m.shape}`}
                style={{ '--c': m.color, '--a': `${(i * 360) / GATHER_MOTES + 9}deg`, '--i': i } as CSSProperties}
              />
            ))}
            <span className="rr-orb" />
            <span className="rr-ring" />
          </>
        )}
        {phase === 'burst' && (
          <>
            <span className="rr-rays" />
            <span className="rr-ring rr-ring-out" />
            <span className="rr-flash" />
            {motes.burst.map((m, i) => (
              <span
                key={i}
                className={`rr-p p-${m.shape}`}
                style={{
                  '--c': m.color,
                  '--a': `${(i * 137.5) % 360}deg`,
                  '--d': `${26 + ((i * 29) % 34)}vmax`,
                  '--vy': `${m.vy}vh`,
                  '--s': 0.8 + ((i * 7) % 5) * 0.25,
                  '--delay': `${(i % 6) * 25}ms`,
                } as CSSProperties}
              />
            ))}
          </>
        )}
        {phase === 'title' && (
          <>
            <span className="rr-glow" aria-hidden="true" />
            {!reduced &&
              motes.embers.map((m, i) => (
                <span
                  key={i}
                  className={`rr-ember p-${m.shape}`}
                  aria-hidden="true"
                  style={{
                    '--c': m.color,
                    '--x': `${8 + ((i * 53) % 84)}vw`,
                    // rising embers start low, falling ones high, so the drift crosses the screen instead of lining up
                    '--y': `${m.vy > 0 ? 6 + ((i * 37) % 30) : 62 + ((i * 37) % 32)}%`,
                    '--vy': `${m.vy === 0 ? -6 : m.vy}vh`,
                    '--delay': `${(i * 170) % 1400}ms`,
                  } as CSSProperties}
                />
              ))}
            <div className="rr-title">
              <div className="rr-kicker">{first ? '✦ 全服首次發現 ✦' : '✦ 稀有魔法！✦'}</div>
              <div className="rr-name">
                <ElementDots elements={spell.elements} /> {spell.name}
              </div>
              <div className="rr-meta">{[names, `Lv.${spell.tier}`, '稀有魔法'].filter(Boolean).join('・')}</div>
              {hint && <div className="rr-hint">{hint}</div>}
              <div className="rr-choice">
                <button type="button" ref={equipBtn} className="rr-equip" onClick={() => finish(true)}>裝備</button>
                <button type="button" className="rr-keep" onClick={() => finish(false)}>不裝備</button>
              </div>
            </div>
          </>
        )}
      </div>
      {phase !== 'title' && <span className="rr-skip" aria-hidden="true">點一下跳過</span>}
    </div>
  );
}
