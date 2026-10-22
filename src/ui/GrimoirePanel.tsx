import { memo, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { content as defaultContent } from '../engine/content';
import type { Content } from '../engine/model';
import { spellAtLevel } from '../engine/spells';
import { passiveRequirementMet, visibleRegions } from '../engine/tree';
import type { ActionResult } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { COLORS, spellColor } from '../render/palette';
import { AffinityTag, ElementDots } from './DiscoveryBanner';
import { EmpowerPanel } from './EmpowerPanel';
import { layoutGrimoire, polar, type FogBand } from './grimoire-layout';
import { empowerLabel, itemName, passiveRequirementLabel, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';
import { useRuntime, type RuntimeStore } from './useGame';

const SIZE = 600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const NODE_R = 16;
/** How long the fog of a region just revealed takes to clear (matches the CSS animation). */
export const FOG_LIFT_MS = 1200;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type Selected = { kind: 'spell' | 'passive'; id: string } | null;
type Runtime = RuntimeStore & Pick<GameRuntime, 'equip'>;
type Sync = Pick<SyncController, 'action'>;

/** Runs a server action and turns its outcome into the line shown under the buttons. */
async function runAction(run: () => Promise<ActionResult | null>, content: Content): Promise<{ result: ActionResult | null; message: string }> {
  try {
    const result = await run();
    return { result, message: result ? synthMessage(result, content) : SYNTH_RETRY_MESSAGE };
  } catch {
    return { result: null, message: SYNTH_ERROR_MESSAGE };
  }
}

/** The ring band of a fogged region, with question marks around it. */
function Fog({ band, lifting = false }: { band: FogBand; lifting?: boolean }) {
  const { inner, outer } = band;
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
  content = defaultContent,
}: {
  runtime: Runtime;
  sync: Sync;
  onHint: (spellId: string | null) => void;
  onPick: (spellId: string) => void;
  content?: Content;
}) {
  const learned = useRuntime(runtime, (s) => s.game.learned);
  const equipped = useRuntime(runtime, (s) => s.game.equipped);
  const revealed = useRuntime(runtime, (s) => s.game.revealed);
  const passives = useRuntime(runtime, (s) => s.game.passives);
  const inventory = useRuntime(runtime, (s) => s.game.inventory);
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const visible = useMemo(() => visibleRegions({ revealed }, content), [content, revealed]);
  const layout = useMemo(
    () => layoutGrimoire(Object.values(content.spells), visible, Object.values(content.passives), content.regions),
    [content, visible],
  );
  // every region's band, for the fog that is lifting off a region just revealed
  const allBands = useMemo(
    () => layoutGrimoire(Object.values(content.spells), new Set(), Object.values(content.passives), content.regions).fog,
    [content],
  );
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<Selected>(null);
  const [lifting, setLifting] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState('');
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const wasDrag = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!lifting) return;
    const t = setTimeout(() => setLifting(null), FOG_LIFT_MS);
    return () => clearTimeout(t);
  }, [lifting]);

  // the view grows with the tree so revealed rings fit without zooming out
  const maxR = layout.nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.y)), 0);
  const w = Math.max(SIZE, 2 * (maxR + 50)) / zoom;
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

  const activate = (kind: 'spell' | 'passive', id: string) => {
    setSelected({ kind, id });
    onHint(kind === 'spell' && !learned.includes(id) ? id : null);
  };

  const keys = Object.keys(inventory).filter(
    (id) => inventory[id]! > 0 && Object.hasOwn(content.keyItems, id) && !visible.has(content.keyItems[id]!.reveals),
  );
  const useKey = async (keyItem: string): Promise<void> => {
    const { result, message } = await runAction(() => sync.action('reveal', { keyItem }), content);
    setKeyMessage(message);
    if (result?.kind === 'revealed') setLifting(result.region);
  };
  const liftBand = lifting ? allBands.find((b) => b.region === lifting) : undefined;

  return (
    <div className="grimoire">
      {keys.length > 0 && (
        <div className="key-items">
          {keys.map((id) => (
            <button key={id} type="button" className="key-use" title={content.keyItems[id]!.desc} disabled={synthPending} onClick={() => void useKey(id)}>
              使用{itemName(id, content)}
            </button>
          ))}
        </div>
      )}
      {keyMessage && <p className="synth-message" role="status">{keyMessage}</p>}
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
        {layout.fog.map((b) => (
          <Fog key={b.region} band={b} />
        ))}
        {liftBand && <Fog key={`lift-${liftBand.region}`} band={liftBand} lifting />}
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
              className={`grimoire-node ${n.region === lifting ? 'node-appear' : ''}`}
              onClick={() => {
                if (!wasDrag.current) activate(n.kind, n.id);
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
      <NodeDetail selected={selected} runtime={runtime} sync={sync} content={content} onPick={onPick} />
    </div>
  );
});

function NodeDetail({
  selected,
  runtime,
  sync,
  content,
  onPick,
}: {
  selected: Selected;
  runtime: Runtime;
  sync: Sync;
  content: Content;
  onPick: (spellId: string) => void;
}) {
  const game = useRuntime(runtime, (s) => s.game);
  const pending = useRuntime(runtime, (s) => s.synthPending);
  const [message, setMessage] = useState('');
  useEffect(() => setMessage(''), [selected?.id]);

  let body;
  if (!selected) body = <p className="muted">點技能樹上的節點查看詳情；未學會的魔法會顯示殘卷線索。</p>;
  else if (selected.kind === 'spell') {
    const spell = content.spells[selected.id]!;
    if (!game.learned.includes(spell.id)) {
      body = (
        <>
          <h4>{spell.name}<span className="muted">（未學會）</span></h4>
          <p className="node-hint">殘卷：{spell.hint}</p>
        </>
      );
    } else {
      const level = Object.hasOwn(game.levels, spell.id) ? game.levels[spell.id]! : 1;
      const isEquipped = game.equipped === spell.id;
      body = (
        <>
          <h4>
            <ElementDots elements={spell.elements} /> {spell.name}{' '}
            <span className="spell-row-tier">Lv.{spellAtLevel(spell, level).tier}</span>
            {level > 1 && <span className="empower-tag">{empowerLabel(level)}</span>}
          </h4>
          <p><AffinityTag affinity={spell.affinity} /> {spell.desc}</p>
          <div className="node-actions">
            <button type="button" onClick={() => onPick(spell.id)}>放進合成槽</button>
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
    const unlocked = game.passives.includes(p.id);
    const met = passiveRequirementMet(game, p.id, content);
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
    <section className="node-detail" aria-label="節點詳情">
      {body}
    </section>
  );
}
