import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { content as defaultContent } from '../engine/content';
import type { Content } from '../engine/model';
import { visibleRegions } from '../engine/tree';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { COLORS, spellColor } from '../render/palette';
import { layoutGrimoire, layoutLightDark, polar, type FogBand } from './grimoire-layout';
import { NodeBubble } from './NodeBubble';
import { NodeCard } from './NodeCard';
import { BUBBLE_SIZE, bubblePlacement, HOME, panBy, viewBoxOf, wheelFactor, zoomAt, type View } from './tree-viewport';
import { useRuntime, type RuntimeStore } from './useGame';

const SIZE = 600;
const NODE_R = 16;
/** How long the fog of a region just revealed takes to clear (matches the CSS animation); the app clears `lifting` after it. */
export const FOG_LIFT_MS = 1200;
/** How long the "put into the altar" toast stays (the altar is out of view on narrow screens). */
export const PLACED_TOAST_MS = 1500;
const FLASH_MS = 600;

type Selected = { kind: 'spell' | 'passive'; id: string } | null;
type Runtime = RuntimeStore & Pick<GameRuntime, 'equip'>;
type Sync = Pick<SyncController, 'action'>;

/** The ring band of a fogged region, with question marks around it. */
function Fog({ band, lifting = false, columns = false }: { band: FogBand; lifting?: boolean; columns?: boolean }) {
  const { inner, outer } = band;
  if (columns) {
    // light/dark tree: a vertical strip on each side of the emblem (inner/outer are half-widths in x)
    const mid = (inner + outer) / 2;
    return (
      <g className={`fog ${lifting ? 'lifting' : ''}`} {...(lifting ? { 'aria-hidden': true } : { role: 'img', 'aria-label': '迷霧' })}>
        {[-1, 1].map((side) => (
          <g key={side}>
            <rect x={Math.min(side * inner, side * outer)} y={-110} width={outer - inner} height={220} rx={12} className="fog-band" />
            <text x={side * mid} y={6} textAnchor="middle" className="fog-mark">？</text>
          </g>
        ))}
      </g>
    );
  }
  const circle = (r: number, sweep: 0 | 1) =>
    r <= 0 ? '' : `M ${-r} 0 A ${r} ${r} 0 1 ${sweep} ${r} 0 A ${r} ${r} 0 1 ${sweep} ${-r} 0 Z`;
  const mid = (inner + outer) / 2;
  const marks = [0, 72, 144, 216, 288].map((deg) => polar(deg + 36, mid));
  return (
    <g className={`fog ${lifting ? 'lifting' : ''}`} {...(lifting ? { 'aria-hidden': true } : { role: 'img', 'aria-label': '迷霧' })}>
      <path d={`${circle(outer, 0)} ${circle(inner, 1)}`} fillRule="evenodd" className="fog-band" />
      {marks.map((m, i) => (
        <text key={i} x={m.x} y={m.y + 6} textAnchor="middle" className="fog-mark">？</text>
      ))}
    </g>
  );
}

export const GrimoirePanel = memo(function GrimoirePanel({
  runtime,
  sync,
  onHint,
  onPick,
  slotsFull,
  lifting,
  content = defaultContent,
  tree = 'elements',
}: {
  runtime: Runtime;
  sync: Sync;
  onHint: (spellId: string | null) => void;
  onPick: (spellId: string) => void;
  slotsFull: boolean;
  /** The region whose fog is lifting right now (set by the app after a key item is used). */
  lifting: string | null;
  content?: Content;
  /** Which tree to draw: the five elements (rings) or light and dark (left and right). */
  tree?: 'elements' | 'lightdark';
}) {
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const revealed = useRuntime(runtime, (s) => s.game.revealed);
  const passives = useRuntime(runtime, (s) => s.game.passives);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  // while a synthesis is in flight nothing may be placed either (and no toast or flash may suggest it was)
  const noPlace = slotsFull || synthPending;
  const visible = useMemo(() => visibleRegions({ revealed }, content), [content, revealed]);
  const lightDark = tree === 'lightdark';
  const layout = useMemo(
    () => lightDark
      ? layoutLightDark(Object.values(content.spells), visible, content.regions)
      : layoutGrimoire(Object.values(content.spells), visible, Object.values(content.passives), content.regions),
    [content, visible, lightDark],
  );
  // every region's band, for the fog that is lifting off a region just revealed
  const allBands = useMemo(
    () => (lightDark
      ? layoutLightDark(Object.values(content.spells), new Set(), content.regions)
      : layoutGrimoire(Object.values(content.spells), new Set(), Object.values(content.passives), content.regions)).fog,
    [content, lightDark],
  );
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const [selected, setSelected] = useState<Selected>(null);
  const [bubble, setBubble] = useState<{ left: number; top: number } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const wasDrag = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), PLACED_TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  // the view grows with the tree so revealed rings fit without zooming out
  const maxR = layout.nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.y)), 0);
  const base = Math.max(SIZE, 2 * (maxR + 50));
  // the view lives in a ref: zooming and dragging only rewrite the viewBox attribute, never re-render the tree
  const viewRef = useRef<View>(HOME);
  const baseRef = useRef(base);
  baseRef.current = base;
  const applyView = () => svgRef.current?.setAttribute('viewBox', viewBoxOf(viewRef.current, baseRef.current));
  useLayoutEffect(applyView, [base]);
  /** Moving the tree detaches the bubble from its node, so it closes (the card stays). */
  const onGesture = () => setBubble(null);

  const zoomBy = (factor: number, p?: { x: number; y: number }) => {
    const v = viewRef.current;
    viewRef.current = zoomAt(v, factor, p ?? { x: v.x, y: v.y });
    applyView();
  };
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const h = (e: globalThis.WheelEvent) => {
      // the floating card scrolls on its own
      if ((e.target as Element | null)?.closest?.('.node-card')) return;
      e.preventDefault();
      if (e.deltaY === 0) return;
      onGesture();
      const m = svgRef.current?.getScreenCTM?.()?.inverse();
      const p = m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m) : undefined;
      zoomBy(wheelFactor(e.deltaY, e.deltaMode, stage.clientHeight || SIZE), p && { x: p.x, y: p.y });
    };
    stage.addEventListener('wheel', h, { passive: false });
    return () => stage.removeEventListener('wheel', h);
  });

  const onDown = (e: PointerEvent) => {
    wasDrag.current = false;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // the button was released outside the svg, so no pointerup reached us
    if (e.buttons === 0) {
      drag.current = null;
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      d.moved = true;
      wasDrag.current = true;
      onGesture();
      // capture only once it is a drag, so a plain click still reaches the node
      svgRef.current?.setPointerCapture?.(d.id);
    }
    // the square viewBox is fitted into the (possibly non-square) svg: pixels per unit = min(width, height) / w
    const rect = svgRef.current?.getBoundingClientRect();
    const px = (rect ? Math.min(rect.width, rect.height) : 0) || SIZE;
    const k = baseRef.current / viewRef.current.zoom / px;
    d.x = e.clientX;
    d.y = e.clientY;
    viewRef.current = panBy(viewRef.current, -dx * k, -dy * k);
    applyView();
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) svgRef.current?.releasePointerCapture?.(d.id);
  };

  /** Where the bubble goes: the node's place on screen, relative to the stage. */
  const bubbleAt = (id: string) => {
    const n = pos.get(id);
    const size = learned.includes(id) ? BUBBLE_SIZE.learned : BUBBLE_SIZE.locked;
    const svg = svgRef.current;
    const stage = stageRef.current;
    const m = svg?.getScreenCTM?.();
    const r = stage?.getBoundingClientRect();
    if (!n || !m || !r) return bubblePlacement({ x: 0, y: 0 }, { w: r?.width || 600, h: r?.height || 600 }, size);
    const p = new DOMPoint(n.x, n.y).matrixTransform(m);
    return bubblePlacement({ x: p.x - r.left, y: p.y - r.top }, { w: r.width, h: r.height }, size);
  };
  const activate = (kind: 'spell' | 'passive', id: string) => {
    setSelected({ kind, id });
    onHint(kind === 'spell' && !learned.includes(id) ? id : null);
    if (kind === 'spell') setBubble(bubbleAt(id));
    else {
      setBubble(null);
      setCardOpen(true);
    }
  };
  const place = (id: string) => {
    if (synthPending) return;
    onPick(id);
    setToast(`已放入合成台：${content.spells[id]?.name ?? id}`);
  };
  const doubleActivate = (id: string) => {
    if (wasDrag.current || noPlace || !learned.includes(id)) return;
    place(id);
    setBubble(null);
    setFlash(id);
  };
  const closeAll = () => {
    setBubble(null);
    setCardOpen(false);
    setSelected(null);
  };

  const liftBand = lifting ? allBands.find((b) => b.region === lifting) : undefined;

  return (
    <div className="grimoire" onKeyDown={(e) => { if (e.key === 'Escape') closeAll(); }}>
      <div className="tree-stage" ref={stageRef}>
      <div className="grimoire-controls">
        <button type="button" aria-label="放大" onClick={() => { onGesture(); zoomBy(1.25); }}>＋</button>
        <button type="button" aria-label="縮小" onClick={() => { onGesture(); zoomBy(1 / 1.25); }}>－</button>
        <button type="button" aria-label="回到中心" onClick={() => { onGesture(); viewRef.current = HOME; applyView(); }}>⌖</button>
      </div>
      <svg
        ref={svgRef}
        className="grimoire-svg"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (!wasDrag.current && !(e.target as Element).closest('.grimoire-node')) closeAll();
        }}
      >
        {lightDark ? (
          <g className="lightdark-emblem" aria-hidden="true">
            <circle cx={0} cy={0} r={40} fill="none" stroke="#3a3350" strokeWidth={2} />
            <path d="M 0 -36 A 36 36 0 0 0 0 36 Z" fill={COLORS.amber} opacity={0.85} />
            <path d="M 0 -36 A 36 36 0 0 1 0 36 Z" fill="#3b1f5c" opacity={0.95} />
          </g>
        ) : (
          <circle cx={0} cy={0} r={100} fill={COLORS.rune} opacity={0.08} />
        )}
        {layout.fog.map((b) => (
          <Fog key={b.region} band={b} columns={lightDark} />
        ))}
        {liftBand && <Fog key={`lift-${liftBand.region}`} band={liftBand} lifting columns={lightDark} />}
        {layout.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const lit = learned.includes(e.from) && learned.includes(e.to);
          return (
            <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lit ? COLORS.rune : '#2a3140'} strokeWidth={2} />
          );
        })}
        {layout.nodes.map((n) => {
          const isSpell = n.kind === 'spell';
          const name = isSpell ? content.spells[n.id]!.name : content.passives[n.id]!.name;
          const on = isSpell ? learned.includes(n.id) : passives.includes(n.id);
          const isEquipped = isSpell && equipped === n.id;
          const isSelected = selected?.id === n.id;
          const color = isSpell ? spellColor(content.spells[n.id]!) : COLORS.amber;
          const label = isSpell ? `${name}${on ? '' : '（未學會）'}` : `${name}（被動${on ? '' : '，未解鎖'}）`;
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={isSelected}
              className={`grimoire-node ${n.region === lifting ? 'node-appear' : ''} ${flash === n.id ? 'node-flash' : ''}`}
              onClick={() => {
                if (!wasDrag.current) activate(n.kind, n.id);
              }}
              onDoubleClick={() => {
                if (isSpell) doubleActivate(n.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(n.kind, n.id);
                }
              }}
            >
              {isSpell ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={NODE_R}
                  fill={on ? color : COLORS.bg}
                  stroke={isEquipped || isSelected ? COLORS.amber : color}
                  strokeWidth={isEquipped || isSelected ? 4 : 2}
                />
              ) : (
                <rect
                  x={n.x - 12}
                  y={n.y - 12}
                  width={24}
                  height={24}
                  transform={`rotate(45 ${n.x} ${n.y})`}
                  fill={on ? COLORS.amber : COLORS.bg}
                  stroke={isSelected ? COLORS.rune : COLORS.amber}
                  strokeWidth={isSelected ? 4 : 2}
                />
              )}
              <text x={n.x} y={n.y + NODE_R + 12} textAnchor="middle" fontSize={11} fill="#e6e9ef">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      {bubble && (
        <NodeBubble
          selected={selected}
          runtime={runtime}
          content={content}
          slotsFull={slotsFull}
          position={bubble}
          onPick={place}
          onDetails={() => { setBubble(null); setCardOpen(true); }}
          onClose={() => setBubble(null)}
        />
      )}
      {cardOpen && (
        <NodeCard selected={selected} runtime={runtime} sync={sync} content={content} slotsFull={slotsFull} onPick={place} onClose={() => setCardOpen(false)} />
      )}
      {toast && <p className="tree-toast only-narrow" role="status">{toast}</p>}
      </div>
    </div>
  );
});
