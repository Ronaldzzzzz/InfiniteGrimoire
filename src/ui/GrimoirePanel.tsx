import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { content as defaultContent } from '../engine/content';
import type { Content, Spell } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { placementOfSpell } from './CircleTable';
import { NodeBubble } from './NodeBubble';
import { NodeCard } from './NodeCard';
import { StarMap, type StarMapLayout } from './StarMap';
import { layoutPassives, layoutStars, starEdges, tierRadius, visiblePassives } from './star-layout';
import { BUBBLE_SIZE, bubblePlacement, HOME, panBy, viewBoxOf, wheelFactor, zoomAt, type View } from './tree-viewport';
import { useRuntime, type RuntimeStore } from './useGame';

const SIZE = 600;
/** How long the "put on the parchment" toast stays (the parchment is out of view on narrow screens). */
export const PLACED_TOAST_MS = 1500;
const FLASH_MS = 600;

type Selected = { kind: 'spell' | 'passive'; id: string } | null;
type Runtime = RuntimeStore & Pick<GameRuntime, 'equip'>;
type Sync = Pick<SyncController, 'action'>;

/** The grimoire: a star map of the learned spells (spec 2026-10-30 section 2.8), zoomed and dragged without React state. */
export const GrimoirePanel = memo(function GrimoirePanel({
  runtime,
  sync,
  onPick,
  content = defaultContent,
}: {
  runtime: Runtime;
  sync: Sync;
  /** Puts a learned spell's circle on the parchment. */
  onPick: (spellId: string) => void;
  content?: Content;
}) {
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const passives = useRuntime(runtime, (s) => s.game.passives);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const passiveAt = useMemo(() => {
    const list = visiblePassives(content);
    const at = layoutPassives(list);
    return list.map((p) => ({ passive: p, at: at.get(p.id)! }));
  }, [content]);
  const layout = useMemo((): StarMapLayout => {
    const spells = learned.map((id) => resolveSpell(id, content)).filter((s): s is Spell => s !== null);
    const stars = layoutStars(spells, passiveAt.map((p) => p.at));
    const maxTier = Math.max(2, ...spells.map((s) => s.tier));
    const far = Math.max(tierRadius(maxTier), ...[...stars.values()].map((s) => s.radius));
    return {
      stars: spells.map((spell) => ({ id: spell.id, spell, star: stars.get(spell.id)! })),
      edges: starEdges(spells.map((s) => s.id), content),
      passives: passiveAt,
      maxTier,
      outer: far + 36,
    };
  }, [learned, content, passiveAt]);
  const pos = useMemo(() => new Map([
    ...layout.stars.map((s) => [s.id, s.star] as const),
    ...layout.passives.map((p) => [p.passive.id, p.at] as const),
  ]), [layout]);
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

  // the view grows with the map so the outermost stars and the sector labels fit without zooming out
  const base = Math.max(SIZE, 2 * (layout.outer + 24));
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

  /** Where the bubble goes: the star's place on screen, relative to the stage. */
  const bubbleAt = (id: string) => {
    const n = pos.get(id);
    const size = BUBBLE_SIZE.learned;
    const svg = svgRef.current;
    const stage = stageRef.current;
    const m = svg?.getScreenCTM?.();
    const r = stage?.getBoundingClientRect();
    if (!n || !m || !r) return bubblePlacement({ x: 0, y: 0 }, { w: r?.width || 600, h: r?.height || 600 }, size);
    const p = new DOMPoint(n.x, n.y).matrixTransform(m);
    return bubblePlacement({ x: p.x - r.left, y: p.y - r.top }, { w: r.width, h: r.height }, size);
  };
  const activate = (kind: 'spell' | 'passive', id: string) => {
    if (wasDrag.current) return;
    setSelected({ kind, id });
    if (kind === 'spell') setBubble(bubbleAt(id));
    else {
      setBubble(null);
      setCardOpen(true);
    }
  };
  const place = (id: string) => {
    if (synthPending || !placementOfSpell(id, content)) return;
    onPick(id);
    setToast(`已擺到牛皮紙上：${resolveSpell(id, content)?.name ?? id}`);
  };
  const doubleActivate = (id: string) => {
    if (wasDrag.current || synthPending || !learned.includes(id) || !placementOfSpell(id, content)) return;
    place(id);
    setBubble(null);
    setFlash(id);
  };
  const closeAll = () => {
    setBubble(null);
    setCardOpen(false);
    setSelected(null);
  };

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
        role="group"
        aria-label="魔導書星圖"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (!wasDrag.current && !(e.target as Element).closest('.grimoire-node')) closeAll();
        }}
      >
        <StarMap layout={layout} equipped={equipped} unlocked={passives} selected={selected?.id ?? null} flash={flash}
          onActivate={activate} onDouble={doubleActivate} />
      </svg>
      {bubble && (
        <NodeBubble
          selected={selected}
          runtime={runtime}
          content={content}
          position={bubble}
          onPick={place}
          onDetails={() => { setBubble(null); setCardOpen(true); }}
          onClose={() => setBubble(null)}
        />
      )}
      {cardOpen && (
        <NodeCard selected={selected} runtime={runtime} sync={sync} content={content} onPick={place} onClose={() => setCardOpen(false)} />
      )}
      {toast && <p className="tree-toast only-narrow" role="status">{toast}</p>}
      </div>
    </div>
  );
});
