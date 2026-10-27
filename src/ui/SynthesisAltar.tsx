import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { fusionNeeds, rareStillHidden, SYNTH_SLOTS } from '../engine/crafting';
import type { Content } from '../engine/model';
import { GRADE_NAMES } from '../engine/types';
import type { ActionResult } from '../game/api';
import { COLORS } from '../render/palette';
import { describeInput, lookOf, revealOf, type AltarInput, type AltarLook, type Reveal } from './altar-data';
import { BANNER_MS, ElementDots } from './DiscoveryBanner';
import { ELEMENT_NAMES, empowerLabel, itemName, slotLabel, SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE, synthMessage } from './messages';
import { comboBlocker, loadLastCombo, saveLastCombo } from './last-combo';
import { useRuntime, type RuntimeStore } from './useGame';

/** A slot holds an inventory item (element or material) or a learned spell id. */
export type Slots = (string | null)[];
export const emptySlots = (): Slots => Array<string | null>(SYNTH_SLOTS).fill(null);
const isItem = (id: string): boolean => /^(el|mat):/.test(id);

/** Puts `id` into the first empty slot; unchanged when both are full. */
export function fillSlot(slots: Slots, id: string): Slots {
  const i = slots.indexOf(null);
  return i < 0 ? slots : slots.map((s, j) => (j === i ? id : s));
}

/** The fusion plays at least this long, so a quick reply still gets its moment. */
export const MIN_FUSE_MS = 800;
/** How long the result stays in the middle of the altar. */
export const REVEAL_MS = BANNER_MS;
const BOUNCE_MS = 400;
/** After a miss on a random recipe that can still give something unlearned: a nudge, never the answer. */
export const RETRY_HINT = '這個組合似乎還藏著別的可能……多試幾次，也許會有不一樣的結果。';

type Reply = ActionResult | null;
type Synth = { synthesize(inputs: string[]): Promise<Reply> };
interface Shown {
  seq: number;
  reveal: Reveal;
  spell: AltarInput | null;
  look: AltarLook | null;
}

/** Particles of one side: shapes and colours alternate; positions are fixed per index so re-renders don't jump. */
function Particles({ look }: { look: AltarLook }) {
  return (
    <>
      {Array.from({ length: look.particles }, (_, i) => {
        const shape = look.shapes[i % look.shapes.length]!;
        const color = look.secondary && i % 2 === 1 ? look.secondary : look.primary;
        const style = { '--c': color, '--i': i, '--x': `${12 + ((i * 53) % 76)}%`, '--y': `${18 + ((i * 37) % 64)}%` } as CSSProperties;
        return <span key={i} className={`p p-${shape}`} style={style} />;
      })}
    </>
  );
}

function sideInfo(input: AltarInput, stock: number): { name: string; meta: string[] } {
  if (input.kind === 'spell') return { name: input.name, meta: [`Lv.${input.tier}`, empowerLabel(input.level)].filter(Boolean) };
  if (input.kind === 'element') return { name: `${ELEMENT_NAMES[input.element]}・${GRADE_NAMES[input.grade - 1]}`, meta: [`×${stock}`] };
  return { name: input.name, meta: [`×${stock}`] };
}

function Side({ id, input, stock, locked, content, onTake }: {
  id: string | null;
  input: AltarInput | null;
  stock: number;
  locked: boolean;
  content: Content;
  onTake: () => void;
}) {
  if (!id) {
    return (
      <button type="button" className="altar-side empty" aria-label="空的合成位置" disabled>
        <span className="altar-orb" aria-hidden="true" />
        <span className="altar-meta">從技能樹或元素放入</span>
      </button>
    );
  }
  const look = input ? lookOf(input) : null;
  const info = input ? sideInfo(input, stock) : { name: slotLabel(id, content), meta: [] };
  const label = input ? input.name : info.name;
  const style = { '--c': look?.primary ?? COLORS.amber, '--c2': look?.secondary ?? look?.primary ?? COLORS.amber } as CSSProperties;
  return (
    <button type="button" className={`altar-side filled kind-${input?.kind ?? 'other'}`} aria-label={`取出${label}`} disabled={locked} onClick={onTake} style={style}>
      <span className="altar-fx" aria-hidden="true">
        {look?.halo && <span className="halo" />}
        <span className="altar-orb" />
        {look && <Particles look={look} />}
      </span>
      <span className="altar-label">
        {input?.kind === 'spell' && <ElementDots elements={input.elements} />}
        <span className="altar-name">{info.name}</span>
      </span>
      {info.meta.length > 0 && <span className="altar-meta">{info.meta.join(' · ')}</span>}
    </button>
  );
}

export const SynthesisAltar = memo(function SynthesisAltar({
  runtime,
  sync,
  content,
  slots,
  onSlotsChange,
  hint = null,
  onResult,
}: {
  runtime: RuntimeStore;
  sync: Synth;
  content: Content;
  slots: Slots;
  onSlotsChange: (s: Slots) => void;
  hint?: string | null;
  /** called with every applied or refused result, after the reply has replaced the state */
  onResult?: (r: ActionResult) => void;
}) {
  // narrow selectors: only the pending flag and what concerns the two inputs (strings, so Object.is holds between drops)
  const synthPending = useRuntime(runtime, (s) => s.synthPending);
  const stockKey = useRuntime(runtime, (s) =>
    slots.map((id) => (id && isItem(id) && Object.hasOwn(s.game.inventory, id) ? s.game.inventory[id]! : 0)).join('|'),
  );
  const knownKey = useRuntime(runtime, (s) => slots.map((id) => (id && !isItem(id) && s.game.learned.includes(id) ? 1 : 0)).join('|'));
  const levelKey = useRuntime(runtime, (s) =>
    slots.map((id) => (id && !isItem(id) && Object.hasOwn(s.game.levels, id) ? s.game.levels[id]! : 1)).join('|'),
  );
  // the fusion cost of two spells, as `id:need:held` entries (empty unless both sides hold something)
  const needsKey = useRuntime(runtime, (s) => {
    if (slots.some((id) => id === null)) return '';
    const counts = new Map<string, number>();
    for (const id of fusionNeeds(s.game, slots as string[], content)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts]
      .map(([id, n]) => `${id}:${n}:${Object.hasOwn(s.game.inventory, id) ? s.game.inventory[id]! : 0}`)
      .join('|');
  });
  const extra = needsKey
    ? needsKey.split('|').map((e) => {
        const [, id, need, held] = /^(.+):(\d+):(\d+)$/.exec(e)!;
        return { id: id!, need: Number(need), held: Number(held) };
      })
    : [];
  const stock = stockKey.split('|').map(Number);
  const known = knownKey.split('|').map((k) => k === '1');
  const levelOf = levelKey.split('|').map(Number);

  // the last pressed 合成 (slot order); the blocker is a string so drops that don't change it don't re-render
  const [lastCombo, setLastCombo] = useState(loadLastCombo);
  const comboWhy = useRuntime(runtime, (s) => comboBlocker(lastCombo, s.game, content));
  const [fusing, setFusing] = useState(false);
  const [bounce, setBounce] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(false);

  // placing something new ends the reveal and clears the old message (a take-out or the reveal's own clear does not)
  const [prevSlots, setPrevSlots] = useState(slots);
  if (prevSlots !== slots) {
    setPrevSlots(slots);
    if (slots.some((s, i) => s !== null && s !== prevSlots[i])) {
      setShown(null);
      setMessage('');
      setRetry(false);
    }
  }

  const latest = useRef({ onSlotsChange, onResult });
  useEffect(() => {
    latest.current = { onSlotsChange, onResult };
  }, [onSlotsChange, onResult]);

  const alive = useRef(true);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seq = useRef(0);
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

  const inputs = slots.map((id, i) =>
    id ? describeInput(id, content, Object.fromEntries([[id, levelOf[i] ?? 1]])) : null,
  );
  const filled = slots.filter((s): s is string => s !== null);
  const need = new Map<string, number>();
  for (const id of filled) if (isItem(id)) need.set(id, (need.get(id) ?? 0) + 1);
  const affordable = [...need].every(([id, n]) => (stock[slots.indexOf(id)] ?? 0) >= n);
  const spellsKnown = slots.every((id, i) => id === null || isItem(id) || known[i]);
  const extraAffordable = extra.every((e) => e.held >= e.need);
  const canSynth = filled.length === SYNTH_SLOTS && affordable && extraAffordable && spellsKnown && !synthPending && !fusing;

  const stop = (text: string): void => {
    setFusing(false);
    setBounce(true);
    setMessage(text);
    later(() => setBounce(false), BOUNCE_MS);
  };

  const run = async (): Promise<void> => {
    if (!canSynth) return;
    const sorted = [...filled].sort();
    // remembered when 合成 is pressed, whatever the outcome (learned, duplicate, miss, refused, even a failed request)
    saveLastCombo(slots as string[]);
    setLastCombo([slots[0]!, slots[1]!]);
    // decided before the roll: whether a miss here could still have landed on something unlearned
    const hidden = rareStillHidden(runtime.getSnapshot().game, sorted, content);
    setRetry(false);
    setFusing(true);
    setBounce(false);
    setShown(null);
    setMessage('');

    let minDone = false;
    let waiting: (() => void) | null = null;
    later(() => {
      minDone = true;
      waiting?.();
    }, MIN_FUSE_MS);

    let result: Reply;
    try {
      result = await sync.synthesize(sorted);
    } catch {
      if (alive.current) stop(SYNTH_ERROR_MESSAGE);
      return;
    }
    if (!alive.current) return;
    if (!result) return stop(SYNTH_RETRY_MESSAGE);
    if (result.kind === 'rejected') {
      // a refusal spent nothing: keep both sides so the player can adjust them
      stop(synthMessage(result, content, sorted));
      latest.current.onResult?.(result);
      return;
    }

    const applied = result;
    const show = (): void => {
      if (!alive.current) return;
      const reveal = revealOf(applied, content, sorted);
      const spell = reveal?.spellId ? describeInput(reveal.spellId, content, runtime.getSnapshot().game.levels) : null;
      setFusing(false);
      latest.current.onSlotsChange(emptySlots());
      latest.current.onResult?.(applied);
      setMessage(reveal?.detail ?? synthMessage(applied, content, sorted));
      setRetry(hidden && (applied.kind === 'duplicate' || (applied.kind === 'learned' && applied.crafted)));
      if (reveal) {
        const n = ++seq.current;
        setShown({ seq: n, reveal, spell, look: spell ? lookOf(spell) : null });
        later(() => setShown((s) => (s?.seq === n ? null : s)), REVEAL_MS);
      }
    };
    if (minDone) show();
    else waiting = show;
  };

  const [left, right] = inputs;
  const looks = [left, right].map((x) => (x ? lookOf(x) : null));
  const frameStyle = {
    '--a': looks[0]?.primary ?? COLORS.rune,
    '--b': looks[1]?.primary ?? looks[0]?.secondary ?? COLORS.rune,
  } as CSSProperties;
  const r = shown?.reveal;

  return (
    <div className="altar-panel">
      <section className={`altar${fusing ? ' fusing' : ''}${bounce ? ' bounce' : ''}${shown ? ' revealing' : ''}`} aria-label="合成台" style={frameStyle}>
        {slots.map((id, i) => (
          <Side
            key={i}
            id={id}
            input={inputs[i] ?? null}
            stock={stock[i] ?? 0}
            locked={fusing}
            content={content}
            onTake={() => onSlotsChange(slots.map((s, j) => (j === i ? null : s)))}
          />
        ))}
        <span className="altar-divider" aria-hidden="true" />
        {fusing && <span className="altar-fuse" aria-hidden="true" />}
        <button type="button" className="altar-go" disabled={!canSynth} onClick={() => void run()}>
          {fusing || synthPending ? '嬗變中…' : '合成'}
        </button>
        {shown && r && (
          <div
            className={`altar-reveal tone-${r.tone}`}
            role="status"
            aria-label="合成結果"
            onClick={() => setShown(null)}
            style={{ '--c': shown.look?.primary ?? 'var(--a)', '--c2': shown.look?.secondary ?? 'var(--b)' } as CSSProperties}
          >
            <span className="altar-reveal-orb" aria-hidden="true" />
            <span className="altar-kicker">{r.kicker}</span>
            {shown.spell?.kind === 'spell' && (
              <>
                <span className="altar-reveal-name">
                  <ElementDots elements={shown.spell.elements} /> {shown.spell.name}
                </span>
                <span className="altar-meta">{[`Lv.${shown.spell.tier}`, empowerLabel(shown.spell.level)].filter(Boolean).join(' · ')}</span>
              </>
            )}
            {(r.tone === 'known' || r.tone === 'fizzle') && <span className="altar-reveal-detail">{r.detail}</span>}
          </div>
        )}
      </section>
      {extra.length > 0 && (
        <p className="altar-needs" aria-label="融合所需元素">
          另外需要：
          {extra.map((e, i) => (
            <span key={e.id}>
              {i > 0 && '、'}
              <span className={e.held >= e.need ? '' : 'short'}>
                {itemName(e.id, content)} ×{e.need}（持有 {e.held}）
              </span>
            </span>
          ))}
        </p>
      )}
      <button
        type="button"
        className="altar-putback"
        disabled={comboWhy !== null || synthPending || fusing}
        title={comboWhy ?? undefined}
        onClick={() => lastCombo && onSlotsChange([...lastCombo])}
      >
        放回上次組合
      </button>
      <p className="synth-message" role="status">{message}</p>
      {retry && <p className="synth-retry">{RETRY_HINT}</p>}
      <div className="synth-hint" aria-label="殘卷線索" aria-live="polite">
        {hint ?? <span className="muted">在魔導書點未學會的魔法，殘卷線索會顯示在這裡</span>}
      </div>
    </div>
  );
});
