import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { gameData } from '../engine/data';
import type { GameRuntime } from '../game/runtime';
import { COLORS, spellColor } from '../render/palette';
import { layoutGrimoire } from './grimoire-layout';
import { useRuntime, type RuntimeStore } from './useGame';

const SIZE = 600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const NODE_R = 16;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function GrimoirePanel({ runtime }: { runtime: RuntimeStore & Pick<GameRuntime, 'equip'> }) {
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const layout = useMemo(() => layoutGrimoire(Object.values(gameData.spells)), []);
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.spellId, n])), [layout]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const wasDrag = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const w = SIZE / zoom;
  const viewBox = `${pan.x - w / 2} ${pan.y - w / 2} ${w} ${w}`;

  const onWheel = (e: WheelEvent) => setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  const onDown = (e: PointerEvent) => {
    wasDrag.current = false;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const px = (svgRef.current?.getBoundingClientRect().width ?? SIZE) || SIZE;
    const k = w / px;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    wasDrag.current = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setPan((p) => ({ x: p.x - dx * k, y: p.y - dy * k }));
  };
  const onUp = () => {
    drag.current = null;
  };

  const activate = (id: string) => {
    if (learned.includes(id)) {
      setHint(null);
      runtime.equip(id);
    } else setHint(gameData.spells[id].hint);
  };

  return (
    <div className="grimoire">
      <div className="grimoire-controls">
        <button type="button" aria-label="放大" onClick={() => setZoom((z) => clamp(z * 1.25))}>＋</button>
        <button type="button" aria-label="縮小" onClick={() => setZoom((z) => clamp(z / 1.25))}>－</button>
      </div>
      <svg
        ref={svgRef}
        className="grimoire-svg"
        viewBox={viewBox}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <circle cx={0} cy={0} r={100} fill={COLORS.rune} opacity={0.08} />
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
          const spell = gameData.spells[n.spellId];
          const isLearned = learned.includes(n.spellId);
          const isEquipped = equipped === n.spellId;
          const color = spellColor(spell);
          return (
            <g
              key={n.spellId}
              role="button"
              tabIndex={0}
              aria-label={`${spell.name}${isLearned ? '' : '（未學會）'}`}
              className="grimoire-node"
              onClick={() => {
                if (!wasDrag.current) activate(n.spellId);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activate(n.spellId);
                }
              }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={NODE_R}
                fill={isLearned ? color : COLORS.bg}
                stroke={isEquipped ? COLORS.amber : color}
                strokeWidth={isEquipped ? 4 : 2}
              />
              <text x={n.x} y={n.y + NODE_R + 12} textAnchor="middle" fontSize={11} fill="#e6e9ef">
                {spell.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="grimoire-hint" role="status">{hint}</div>
    </div>
  );
}
