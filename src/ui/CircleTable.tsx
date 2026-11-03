import { createPortal } from 'react-dom';
import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import {
  branches, circuitMismatches, GRADE_CAP, MAX_RING2, overcomes, parseCanonical, placementProblems, placementTier, relations,
  RING_FLOOR, RUNE_IDS, RUNE_NAMES, runesUnlocked, SLOTS,
} from '../engine/circle';
import type { CircleNode, Placement, RuneId } from '../engine/circle';
import { circleCost } from '../engine/circle-synth';
import type { Content } from '../engine/model';
import { ELEMENT_ORDER, elementItem, GRADE_NAMES, MAX_ELEMENT_GRADE, type ElementId, type ItemId } from '../engine/types';
import type { ActionResult } from '../game/api';
import { COLORS } from '../render/palette';
import { RuneIcon, RUNE_BAND_COUNT } from './RuneIcon';
import {
  CENTER, CIRCLE_PAIRS, circumference, openSlotCounts, PROGRESS_R, RING_R, RUNE_BAND_R, RUNE_WHEEL_R, shownPoint, shownSlots, sparkPoints, STAR_PAIRS, GRADE_WHEEL_R, VIEW, WHEEL_ORDER, type Pt,
} from './circle-draw';
import { RingPicker, type WheelItem } from './RingPicker';
import { ELEMENT_NAMES, itemName, spellLabel, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';
import { PARCHMENT_SRC, useArt } from './useArt';
import { useRuntime, type RuntimeStore } from './useGame';

/**
 * The magic circle parchment (spec 2026-10-30 sections 2.1, 3.5, 3.8): tap a slot to pick an element (or a ring's rune),
 * each placement is drawn on; 合成 injects mana for PROGRESS_MS (RARE_PROGRESS_MS when the result is rare) and then shows
 * the result. A refusal or a failed request keeps the circle as it was. Tap only, no drag.
 */
export const PROGRESS_MS = 3000;
export const RARE_PROGRESS_MS = 5000;
const SPARKS = 12;
/** the rare charge's stars: a fixed small set on a golden-angle spiral, not a particle system */
const STARS = Array.from({ length: 20 }, (_, i) => ({
  left: `${8 + ((i * 37) % 84)}%`, top: `${6 + ((i * 53) % 88)}%`, delay: `${((i * 0.37) % 1.6).toFixed(2)}s`,
}));

/** What the parent can do: put a whole circle on the parchment (star map, Task 6) or one element from the element table. */
export interface CircleTableHandle {
  loadPlacement(p: Placement): void;
  placeItem(itemId: ItemId): void;
}

type Sync = { synthesizeCircle(p: Placement): Promise<ActionResult | null> };
type Ring = 0 | 1;
interface Draft { core: CircleNode | null; rings: [(CircleNode | null)[], (CircleNode | null)[]]; runes: [RuneId | null, RuneId | null] }
/** `el` is the wheel's second step: the element already chosen, now picking its grade */
type Target = { kind: 'core'; el?: ElementId } | { kind: 'node'; ring: Ring; j: number; el?: ElementId } | { kind: 'rune'; ring: Ring };

const emptyRing = (): (CircleNode | null)[] => Array<CircleNode | null>(SLOTS).fill(null);
const emptyDraft = (): Draft => ({ core: null, rings: [emptyRing(), emptyRing()], runes: [null, null] });
const RING_NAME = ['一環', '二環'] as const;
const EFFECT_WORD: Record<ElementId, string> = { fire: '燃燒', wind: '擊退', water: '潮濕', earth: '緩速', thunder: '連鎖' };
export const MISMATCH_WARNING = '迴路對不上：大失敗機率提高';
const capOf = (grade: number) => GRADE_CAP[Math.min(Math.max(grade, 1), GRADE_CAP.length) - 1]!;
const nodeName = (x: CircleNode) => `${ELEMENT_NAMES[x.element]}・${GRADE_NAMES[x.grade - 1]}`;
const filled = (ring: (CircleNode | null)[]) => ring.filter((x) => x != null).length;
/** counts of 1000 and more as ×1.2k, so a wheel item's three lines fit on a phone */
const short = (n: number): string => (n >= 1000 ? `${Math.floor(n / 100) / 10}k` : String(n));
const filledIdx = (ring: (CircleNode | null)[]): number[] => ring.flatMap((x, j) => (x ? [j] : []));

const toPlacement = (d: Draft): Placement | null =>
  d.core ? { core: d.core, ring1: [...d.rings[0]], ring2: [...d.rings[1]], runes: [...d.runes] } : null;
const fromPlacement = (p: Placement): Draft => ({
  core: { ...p.core },
  rings: [[...p.ring1], [...p.ring2]].map((r) => Array.from({ length: SLOTS }, (_, j) => r[j] ?? null)) as Draft['rings'],
  runes: [p.runes[0] ?? null, p.runes[1] ?? null],
});

/** Why an empty slot cannot take a node now (null: it can). */
function slotBlock(d: Draft, ring: Ring, unlockedTier: number): string | null {
  if (!d.core) return '先選核心元素';
  if (ring === 1 && filled(d.rings[0]) < SLOTS) return '一環要先放滿五格才能放二環';
  if (ring === 1 && filled(d.rings[1]) >= MAX_RING2) return '二環最多只能放四格';
  const next = 1 + filled(d.rings[0]) + filled(d.rings[1]) + 1;
  if (next > capOf(d.core.grade)) return '超過核心上限';
  if (next > unlockedTier) return '尚未開放';
  return null;
}

/** The prediction line: main element, side effects (node elements), 相生／相剋 and the rough tier. Never the form. */
export function predictionOf(p: Placement): string {
  const n = new Map<ElementId, number>();
  for (const x of [...p.ring1, ...p.ring2]) if (x) n.set(x.element, (n.get(x.element) ?? 0) + 1);
  const effects = ELEMENT_ORDER.filter((e) => n.has(e)).map((e) => (n.get(e)! > 1 ? `${EFFECT_WORD[e]}×${n.get(e)}` : EFFECT_WORD[e]));
  const rel = relations(p);
  const parts = [`主屬性 ${ELEMENT_NAMES[p.core.element]}`];
  if (effects.length) parts.push(effects.join('、'));
  if (rel.generate.length) parts.push(`相生×${rel.generate.length}`);
  if (rel.overcome.length) parts.push(`相剋×${rel.overcome.length}`);
  parts.push(`約 Lv.${Math.min(placementTier(p), capOf(p.core.grade))}`);
  return parts.join('・');
}

/**
 * The circle a spell is drawn from (named spells by their `circle`, generated ones by their canonical id), with the lowest
 * grades that fit: the smallest core grade whose cap reaches the tier, ring 1 初階, ring 2 高階; each used ring gets the form's rune.
 */
export function placementOfSpell(spellId: string, content: Content): Placement | null {
  const named = Object.hasOwn(content.spells, spellId) ? content.spells[spellId] : undefined;
  const c = parseCanonical(named ? named.circle ?? '' : spellId);
  if (!c) return null;
  const coreGrade = GRADE_CAP.findIndex((cap) => cap >= c.tier) + 1;
  const ring = (r: (ElementId | null)[], i: Ring) => r.map((e) => (e ? { element: e, grade: RING_FLOOR[i] } : null));
  const ring1 = ring(c.ring1, 0), ring2 = ring(c.ring2, 1);
  return {
    core: { element: c.core, grade: coreGrade },
    ring1,
    ring2,
    runes: [filled(ring1) > 0 ? c.form : null, filled(ring2) > 0 ? c.form : null],
  };
}

interface Shown { kicker: string; name: string; tone: 'learned' | 'known' | 'failed' | 'rare' }

function shownOf(r: ActionResult, content: Content): Shown {
  if (r.kind === 'learned' || r.kind === 'known') {
    const rare = r.kind === 'learned' && 'rare' in r && r.rare;
    return { kicker: rare ? '✦ 稀有魔法 ✦' : r.kind === 'learned' ? '習得新魔法' : '已經會了', name: spellLabel(r.spellId, content), tone: rare ? 'rare' : r.kind };
  }
  return { kicker: '魔法陣崩解了……', name: '元素已經消耗', tone: 'failed' };
}

const isRare = (r: ActionResult, content: Content): boolean =>
  (r.kind === 'learned' || r.kind === 'known') && ((('rare' in r) && !!r.rare) || (Object.hasOwn(content.spells, r.spellId) && !!content.spells[r.spellId]!.rare));

function Line({ a, b, className, k }: { a: Pt; b: Pt; className: string; k: number }) {
  return <line className={`draw ${className}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} style={{ '--k': k } as CSSProperties} />;
}

export const CircleTable = memo(function CircleTable({
  runtime,
  sync,
  content,
  onResult,
  onCharging,
  ref,
}: {
  runtime: RuntimeStore;
  sync: Sync;
  content: Content;
  /** called with an applied result (learned / known / failed) when the progress ring has filled */
  onResult?: (r: ActionResult) => void;
  /** true when 合成 starts, false when the result is revealed (or refused, failed, unmounted) */
  onCharging?: (charging: boolean) => void;
  ref?: Ref<CircleTableHandle>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [target, setTarget] = useState<Target | null>(null);
  const [charging, setCharging] = useState<{ ms: number; rare: boolean } | null>(null);
  const [burnt, setBurnt] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [message, setMessage] = useState('');

  // narrow selectors, all strings or numbers so unrelated drops and battle steps do not re-render
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const unlockedTier = useRuntime(runtime, (s) => s.game.circleTier);
  const runesKey = useRuntime(runtime, (s) => runesUnlocked(s.game.defeatedBosses, content).join(','));
  const placement = toPlacement(draft);
  const cost = placement ? circleCost(placement) : [];
  const costKey = useRuntime(runtime, (s) => {
    const need = new Map<ItemId, number>();
    for (const id of cost) need.set(id, (need.get(id) ?? 0) + 1);
    return [...need].map(([id, n]) => `${id}:${n}:${Object.hasOwn(s.game.inventory, id) ? s.game.inventory[id]! : 0}`).join('|');
  });
  // the picker's counts: only while a node or core picker is open
  const pickerOpen = target !== null && target.kind !== 'rune';
  const heldKey = useRuntime(runtime, (s) =>
    pickerOpen
      ? ELEMENT_ORDER.flatMap((e) => Array.from({ length: MAX_ELEMENT_GRADE }, (_, g) => s.game.inventory[elementItem(e, g + 1)] ?? 0)).join(',')
      : '',
  );
  const runes = runesKey.split(',') as RuneId[];
  const busy = charging !== null || synthPending;

  const hasArt = useArt(PARCHMENT_SRC);
  const parchment = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);
  const later = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      if (alive.current) fn();
    }, ms);
    timers.current.add(t);
  };
  const latest = useRef({ onResult, onCharging, busy });
  useEffect(() => {
    latest.current = { onResult, onCharging, busy };
  }, [onResult, onCharging, busy]);
  // whether the parent was told we are charging, so unmounting mid-charge still lifts its veil
  const announced = useRef(false);
  const announce = (on: boolean): void => {
    if (announced.current === on) return;
    announced.current = on;
    latest.current.onCharging?.(on);
  };
  useEffect(() => () => {
    if (announced.current) {
      announced.current = false;
      latest.current.onCharging?.(false);
    }
  }, []);

  const edit = useCallback((next: (d: Draft) => Draft): void => {
    setDraft(next);
    setBurnt(false);
    setShown(null);
    setMessage('');
  }, []);

  useImperativeHandle(ref, () => ({
    loadPlacement(p: Placement) {
      if (latest.current.busy || runtime.getSnapshot().synthPending) return;
      setTarget(null);
      edit(() => fromPlacement(p));
    },
    placeItem(itemId: ItemId) {
      if (latest.current.busy || runtime.getSnapshot().synthPending) return;
      const m = /^el:([a-z]+):(\d)$/.exec(itemId);
      if (!m) return;
      const x: CircleNode = { element: m[1] as ElementId, grade: Number(m[2]) };
      const tier = runtime.getSnapshot().game.circleTier;
      setDraft((d) => {
        if (!d.core) return { ...d, core: x };
        for (const ring of [0, 1] as Ring[]) {
          if (x.grade < RING_FLOOR[ring]! || slotBlock(d, ring, tier)) continue;
          // an open slot as drawn (the ring-2 default indices are not 0..n), never merely the first empty rule index
          const j = shownSlots(ring, openSlotCounts(tier)[ring], filledIdx(d.rings[ring])).find((k) => d.rings[ring][k] == null);
          if (j === undefined) continue;
          const rings = [...d.rings] as Draft['rings'];
          rings[ring] = rings[ring].map((y, k) => (k === j ? x : y));
          return { ...d, rings };
        }
        return d;
      });
      setBurnt(false);
      setShown(null);
      setMessage('');
    },
  }), [edit, runtime]);

  const focusSlot = (t: Target): void => {
    const sel = t.kind === 'rune' ? `[data-rune="${t.ring}"]` : `[data-slot="${t.kind === 'core' ? 'core' : `${t.ring}-${t.j}`}"]`;
    parchment.current?.querySelector<HTMLElement | SVGElement>(sel)?.focus();
  };
  const setNode = (t: Target, x: CircleNode | null): void => {
    edit((d) => {
      if (t.kind === 'core') return { ...d, core: x };
      if (t.kind !== 'node') return d;
      const rings = [...d.rings] as Draft['rings'];
      rings[t.ring] = rings[t.ring].map((y, k) => (k === t.j ? x : y));
      // taking a ring-1 node out leaves ring 2 without its full ring 1: keep it (the reason shows), the player decides
      return { ...d, rings };
    });
    setTarget(null);
    focusSlot(t);
  };
  const setRune = (ring: Ring, r: RuneId | null): void => {
    edit((d) => {
      const next: Draft['runes'] = [...d.runes];
      next[ring] = r;
      return { ...d, runes: next };
    });
    setTarget(null);
    focusSlot({ kind: 'rune', ring });
  };

  // what blocks 合成, first reason only
  const problems = placement ? placementProblems(placement, { unlockedTier, runes }) : [];
  const short = costKey
    ? costKey.split('|').map((e) => {
        const [, id, need, held] = /^(.+):(\d+):(\d+)$/.exec(e)!;
        return { id: id!, need: Number(need), held: Number(held) };
      }).filter((e) => e.held < e.need)
    : [];
  const why = !placement
    ? '先選核心元素'
    : problems.length > 0
      ? synthMessage({ kind: 'rejected', reason: problems[0]! }, content)
      : short.length > 0
        ? `元素不足：${short.map((e) => `${itemName(e.id, content)} ×${e.need}（持有 ${e.held}）`).join('、')}`
        : null;

  const br = placement ? branches(placement) : null;
  const mismatch = placement
    ? (() => {
        const inner = circuitMismatches({ ...placement, ring2: emptyRing() });
        return [inner > 0, circuitMismatches(placement) - inner > 0] as const;
      })()
    : [false, false] as const;

  // the circuit just stopped matching: one 0.4 s shake (not again while it stays mismatched)
  const unmatched = mismatch[0] || mismatch[1];
  const wasUnmatched = useRef(false);
  useEffect(() => {
    if (unmatched && !wasUnmatched.current) {
      setShake(true);
      later(() => setShake(false), 400);
    }
    wasUnmatched.current = unmatched;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unmatched]);

  const run = async (): Promise<void> => {
    if (!placement || why || busy) return;
    const start = Date.now();
    setTarget(null);
    setShown(null);
    setMessage('');
    setBurnt(false);
    setSuccess(false);
    setCharging({ ms: PROGRESS_MS, rare: false });
    announce(true);
    let result: ActionResult | null;
    try {
      result = await sync.synthesizeCircle(placement);
    } catch {
      if (!alive.current) return;
      announce(false);
      setCharging(null);
      setMessage(SYNTH_ERROR_MESSAGE);
      return;
    }
    if (!alive.current) return;
    if (!result || result.kind === 'rejected' || (result.kind !== 'learned' && result.kind !== 'known' && result.kind !== 'failed')) {
      // nothing was spent: no reveal, the circle stays as drawn
      announce(false);
      setCharging(null);
      setMessage(result ? synthMessage(result, content) : SYNTH_RETRY_MESSAGE);
      return;
    }
    const applied = result;
    const total = isRare(applied, content) ? RARE_PROGRESS_MS : PROGRESS_MS;
    if (total !== PROGRESS_MS) setCharging({ ms: total, rare: true });
    later(() => {
      announce(false);
      setCharging(null);
      setShown(shownOf(applied, content));
      if (applied.kind === 'failed') setBurnt(true);
      else {
        setSuccess(true);
        later(() => setSuccess(false), 900);
      }
      latest.current.onResult?.(applied);
    }, Math.max(0, total - (Date.now() - start)));
  };

  // element colours on the circle, for the sparks and the progress ring
  const colours = placement
    ? [placement.core, ...placement.ring1, ...placement.ring2].filter((x): x is CircleNode => x != null).map((x) => COLORS.element[x.element])
    : [COLORS.rune];
  const centre: Pt = { x: CENTER, y: CENTER };
  const pos = (p: Pt): CSSProperties => ({ left: `${(p.x / VIEW) * 100}%`, top: `${(p.y / VIEW) * 100}%` });
  const ring1 = draft.rings[0], ring2 = draft.rings[1];
  const [open1, open2] = openSlotCounts(unlockedTier);
  const shown1 = shownSlots(0, open1, filledIdx(ring1));
  const shown2 = shownSlots(1, open2, filledIdx(ring2));
  const pt = (ring: Ring, j: number): Pt => shownPoint(ring, j, ring === 0 ? shown1 : shown2);

  // the order the lines light up while charging: nodes, ring-1 edges, star lines, ring-2 wires, core wires, the core last
  const nodeMarks = [...ring1.map((x, j) => [x, pt(0, j)] as const), ...ring2.map((x, j) => [x, pt(1, j)] as const)].flatMap(([x, p]) => (x ? [{ x, p }] : []));
  const edgePairs = CIRCLE_PAIRS.filter(([a, b]) => ring1[a] && ring1[b]);
  const starPairs = STAR_PAIRS.filter(([a, b]) => ring1[a] && ring1[b]);
  const outerJs = ring2.flatMap((x, j) => (x && ring1[j] ? [j] : []));
  const coreJs = draft.core ? ring1.flatMap((x, j) => (x ? [j] : [])) : [];
  const kEdge = nodeMarks.length, kStar = kEdge + edgePairs.length, kOuter = kStar + starPairs.length, kCore = kOuter + outerJs.length;
  const kLast = kCore + coreJs.length;
  const drawCount = kLast + (draft.core ? 1 : 0);

  const slotButton = (ring: Ring, j: number) => {
    const x = draft.rings[ring][j] ?? null;
    const block = x ? null : slotBlock(draft, ring, unlockedTier);
    const b = x && br ? (ring === 0 ? br.ring1[j] : br.ring2[j]) : null;
    const counts = b ? ('out' in b ? `入 ${b.in}・出 ${b.out}` : `入 ${b.in}`) : '';
    const label = `${RING_NAME[ring]} 第${j + 1}格：${x ? `${nodeName(x)}（${counts}）` : block ? `空（${block}）` : '空'}`;
    return (
      <button
        key={`${ring}-${j}`}
        type="button"
        className={`circle-slot ring${ring + 1}${x ? ' filled' : ''}${block ? ' blocked' : ''}`}
        data-slot={`${ring}-${j}`}
        style={{ ...pos(pt(ring, j)), ...(x ? { '--c': COLORS.element[x.element] } : {}) } as CSSProperties}
        aria-label={label}
        title={block ?? undefined}
        disabled={busy}
        aria-disabled={block !== null || undefined}
        // a greyed slot stays tappable so phones (no hover) can read why it cannot take a node
        onClick={() => {
          if (block) {
            setTarget(null);
            setMessage(block);
            return;
          }
          setTarget({ kind: 'node', ring, j });
        }}
      >
        {x ? <><span className="glyph">{ELEMENT_NAMES[x.element]}</span><span className="branch">{counts}</span></> : null}
      </button>
    );
  };

  const runeAt = (ring: Ring): Pt => ({ x: CENTER, y: CENTER - RING_R[ring] });
  const runeBand = (ring: Ring) => {
    const r = RUNE_BAND_R[ring];
    const chosen = draft.runes[ring];
    // the band starts between two slots (36 deg) so the seam never sits under a node; icons sit mid-way between 30 deg steps
    const a0 = (36 * Math.PI) / 180;
    const open = (): void => {
      if (busy) return;
      setMessage('');
      setTarget({ kind: 'rune', ring });
    };
    return (
      <g key={ring} className={`rune-band${chosen ? ' filled' : ''}${target?.kind === 'rune' && target.ring === ring ? ' lit' : ''}${busy ? ' busy' : ''}`}
        data-rune={ring} role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy || undefined}
        aria-label={`${RING_NAME[ring]}符文：${chosen ? RUNE_NAMES[chosen] : '空'}`}
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
        <circle className="hit" cx={CENTER} cy={CENTER} r={r} />
        <circle className="rune-dash" cx={CENTER} cy={CENTER} r={r} />
        {chosen && Array.from({ length: RUNE_BAND_COUNT }, (_, k) => {
          const a = a0 + ((k + 0.5) * 2 * Math.PI) / RUNE_BAND_COUNT;
          return (
            <g key={k} aria-hidden="true" transform={`translate(${(CENTER + r * Math.sin(a)).toFixed(2)} ${(CENTER - r * Math.cos(a)).toFixed(2)})`}>
              <RuneIcon id={chosen} size={14} />
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="parchment-panel">
      <div className={`parchment-sheet${hasArt ? ' has-art' : ''}${charging ? ' charging' : ''}${charging?.rare ? ' rare' : ''}`}>
      {charging?.rare && createPortal(<div className="rare-dim" aria-hidden="true" />, document.body)}
      <section ref={parchment} aria-label="魔法陣"
        className={`parchment${charging ? ' charging' : ''}${charging?.rare ? ' rare' : ''}${success ? ' success' : ''}${burnt ? ' burnt' : ''}${shake ? ' shake' : ''}`}
        style={{ '--dur': `${charging?.ms ?? PROGRESS_MS}ms`, '--n': drawCount } as CSSProperties}>
        <svg className="parchment-svg" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
          <defs>
            <filter id="ink-rough" filterUnits="userSpaceOnUse" x={0} y={0} width={VIEW} height={VIEW}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" />
            </filter>
          </defs>
          {shown1.length > 0 && <circle className={`ring-line${mismatch[0] ? ' mismatch' : ''}`} cx={CENTER} cy={CENTER} r={RING_R[0]} />}
          {shown2.length > 0 && <circle className={`ring-line outer${mismatch[1] ? ' mismatch' : ''}`} cx={CENTER} cy={CENTER} r={RING_R[1]} />}
          {coreJs.map((j, i) => (
            <Line key={`w${j}-${ring1[j]!.element}`} a={centre} b={pt(0, j)} k={kCore + i} className={`wire${overcomes(draft.core!.element, ring1[j]!.element) ? ' clash' : ''}`} />
          ))}
          {edgePairs.map(([a, b], i) => (
            <Line key={`c${a}-${ring1[a]!.element}${ring1[b]!.element}`} a={pt(0, a)} b={pt(0, b)} k={kEdge + i} className="edge" />
          ))}
          {starPairs.map(([a, b], i) => (
            <Line key={`s${a}-${ring1[a]!.element}${ring1[b]!.element}`} a={pt(0, a)} b={pt(0, b)} k={kStar + i} className="star" />
          ))}
          {outerJs.map((j, i) => (
            <Line key={`o${j}-${ring2[j]!.element}`} a={pt(0, j)} b={pt(1, j)} k={kOuter + i} className={`wire${overcomes(ring1[j]!.element, ring2[j]!.element) ? ' clash' : ''}`} />
          ))}
          {draft.core && (
            <circle key={`core-${draft.core.element}-${draft.core.grade}`} className="draw core-mark" cx={CENTER} cy={CENTER} r={16} pathLength={1}
              style={{ stroke: COLORS.element[draft.core.element], '--k': kLast } as CSSProperties} />
          )}
          {nodeMarks.map(({ x, p }, k) => (
            <circle key={`n${k}-${x.element}-${x.grade}`} className="draw node-mark" cx={p.x} cy={p.y} r={11} pathLength={1} style={{ stroke: COLORS.element[x.element], '--k': k } as CSSProperties} />
          ))}
          {charging && (
            <>
              <circle className="progress-track" cx={CENTER} cy={CENTER} r={PROGRESS_R} />
              <circle className="progress-fill" cx={CENTER} cy={CENTER} r={PROGRESS_R} strokeDasharray={circumference(PROGRESS_R)}
                style={{ '--len': circumference(PROGRESS_R), stroke: colours[0] } as CSSProperties} transform={`rotate(-90 ${CENTER} ${CENTER})`} />
              {sparkPoints(SPARKS).map((p, i) => (
                <circle key={i} className="spark" cx={p.x} cy={p.y} r={2.4} style={{ fill: colours[i % colours.length], '--i': i } as CSSProperties} />
              ))}
            </>
          )}
        </svg>
        <svg className="parchment-svg rune-svg" viewBox={`0 0 ${VIEW} ${VIEW}`}>
          {([0, 1] as Ring[]).filter((ring) => (ring === 0 ? shown1 : shown2).length > 0).map((ring) => runeBand(ring))}
        </svg>
        <button
          type="button"
          className={`circle-slot core${draft.core ? ' filled' : ''}`}
          data-slot="core"
          style={{ ...pos(centre), ...(draft.core ? { '--c': COLORS.element[draft.core.element] } : {}) } as CSSProperties}
          aria-label={draft.core ? `核心：${nodeName(draft.core)}（出 ${br?.core.out ?? 0}・上限 Lv.${capOf(draft.core.grade)}）` : '核心：空'}
          disabled={busy}
          onClick={() => setTarget({ kind: 'core' })}
        >
          {draft.core ? <><span className="glyph">{ELEMENT_NAMES[draft.core.element]}</span><span className="branch">出 {br?.core.out ?? 0}</span></> : <span className="muted">核心</span>}
        </button>
        {charging?.rare && (
          <div className="starfield" aria-hidden="true">
            {STARS.map((st, i) => <span key={i} style={{ left: st.left, top: st.top, animationDelay: st.delay }} />)}
          </div>
        )}
        {success && <div className="light-pillar" aria-hidden="true" />}
        {shown1.map((j) => slotButton(0, j))}
        {shown2.map((j) => slotButton(1, j))}
        {charging && <span className="sr-only" role="progressbar" aria-label="注入魔力" aria-valuemin={0} aria-valuemax={charging.ms} />}
        {shown && (
          <div className={`circle-result tone-${shown.tone}`} role="status" aria-label="合成結果" onClick={() => setShown(null)}>
            <span className="circle-kicker">{shown.kicker}</span>
            <span className="circle-result-name">{shown.name}</span>
          </div>
        )}
        {target && !busy && target.kind !== 'rune' && (
          <ElementWheel
            target={target}
            at={target.kind === 'core' ? centre : pt(target.ring, target.j)}
            draft={draft}
            held={heldKey ? heldKey.split(',').map(Number) : []}
            onNode={(x) => setNode(target, x)}
            onElement={(el) => setTarget({ ...target, el })}
            onBack={() => setTarget({ ...target, el: undefined })}
            onClose={() => setTarget(null)}
            returnFocus={() => focusSlot(target)}
          />
        )}
        {target && !busy && target.kind === 'rune' && (
          <RuneWheel
            at={runeAt(target.ring)}
            ring={target.ring}
            current={draft.runes[target.ring]}
            runes={runes}
            onRune={(r) => setRune(target.ring, r)}
            onClose={() => setTarget(null)}
            returnFocus={() => focusSlot(target)}
          />
        )}
      </section>
      </div>

      <div className="rune-row">
        <button type="button" className="circle-clear" disabled={busy} onClick={() => { setTarget(null); edit(emptyDraft); }}>清空魔法陣</button>
      </div>

      {placement && (
        <p className="circle-predict" aria-label="預測">{predictionOf(placement)}</p>
      )}
      {(mismatch[0] || mismatch[1]) && <p className="circle-warn">{MISMATCH_WARNING}</p>}
      <div className="circle-go-row">
        <button type="button" className="primary circle-go" disabled={why !== null || busy} onClick={() => void run()}>
          {busy ? '注入中…' : '合成'}
        </button>
        {why && <span className="circle-why">{why}</span>}
      </div>
      <p className="synth-message" role="status">{message}</p>
    </div>
  );
});

function ElementWheel({ target, at, draft, held, onNode, onElement, onBack, onClose, returnFocus }: {
  target: Exclude<Target, { kind: 'rune' }>;
  at: Pt;
  draft: Draft;
  held: number[];
  onNode: (x: CircleNode | null) => void;
  onElement: (e: ElementId) => void;
  onBack: () => void;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const current = target.kind === 'core' ? draft.core : draft.rings[target.ring][target.j] ?? null;
  const where = target.kind === 'core' ? '核心' : `${RING_NAME[target.ring]} 第${target.j + 1}格`;
  const countOf = (e: ElementId, g: number) => held[ELEMENT_ORDER.indexOf(e) * MAX_ELEMENT_GRADE + g - 1] ?? 0;
  const remove = current ? () => onNode(null) : undefined;
  const el = target.el;
  if (!el) {
    const items: WheelItem[] = WHEEL_ORDER.map((e) => {
      const has = Array.from({ length: MAX_ELEMENT_GRADE }, (_, g) => countOf(e, g + 1)).some((n) => n > 0);
      return { key: e, label: ELEMENT_NAMES[e], ariaLabel: ELEMENT_NAMES[e], enabled: has, on: current?.element === e, color: COLORS.element[e], title: has ? undefined : '沒有這種元素' };
    });
    return (
      <RingPicker at={at} title={target.kind === 'core' ? '選擇核心元素' : `選擇${where}的元素`} items={items}
        onPick={(k) => onElement(k as ElementId)} onRemove={remove} onClose={onClose} returnFocus={returnFocus} />
    );
  }
  const floor = target.kind === 'node' ? RING_FLOOR[target.ring]! : 1;
  const items: WheelItem[] = Array.from({ length: MAX_ELEMENT_GRADE }, (_, i) => {
    const grade = i + 1, n = countOf(el, grade), low = grade < floor;
    const cap = target.kind === 'core' ? `（上限 Lv.${capOf(grade)}）` : '';
    const ariaLabel = `${GRADE_NAMES[i]} ×${n}${cap}`;
    const label = `${GRADE_NAMES[i]}\n×${short(n)}${cap ? `\n≤Lv.${capOf(grade)}` : ''}`;
    return {
      key: String(grade), label, ariaLabel, enabled: n > 0 && !low, on: current?.element === el && current.grade === grade,
      color: COLORS.element[el], title: low ? '二環需要高階以上' : n > 0 ? undefined : '沒有這個階級',
    };
  });
  return (
    <RingPicker at={at} title={`選擇${where}的${ELEMENT_NAMES[el]}元素階級`} items={items}
      onPick={(k) => onNode({ element: el, grade: Number(k) })} onRemove={remove} onClose={onClose} onBack={onBack}
      radius={GRADE_WHEEL_R} note={floor > 1 ? '二環需要高階以上' : undefined} returnFocus={returnFocus} />
  );
}

function RuneWheel({ at, ring, current, runes, onRune, onClose, returnFocus }: {
  at: Pt;
  ring: Ring;
  current: RuneId | null;
  runes: RuneId[];
  onRune: (r: RuneId | null) => void;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const items: WheelItem[] = RUNE_IDS.map((r) => {
    const known = runes.includes(r);
    return {
      key: r,
      icon: <svg className="ring-item-icon" viewBox="-12 -12 24 24" aria-hidden="true"><RuneIcon id={known ? r : null} size={20} /></svg>,
      label: known ? RUNE_NAMES[r] : '',
      ariaLabel: known ? RUNE_NAMES[r] : '未取得的符文',
      enabled: known,
      on: r === current,
      title: known ? undefined : '從魔王取得',
    };
  });
  return (
    <RingPicker at={at} title={`選擇${RING_NAME[ring]}符文`} items={items} radius={RUNE_WHEEL_R}
      onPick={(k) => onRune(k as RuneId)} onRemove={current ? () => onRune(null) : undefined}
      onClose={onClose} returnFocus={returnFocus} note={runes.length < RUNE_IDS.length ? '未取得的符文從魔王取得' : undefined} />
  );
}
