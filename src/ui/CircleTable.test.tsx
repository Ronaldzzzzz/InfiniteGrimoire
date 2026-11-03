// @vitest-environment jsdom
import { createRef, Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Placement } from '../engine/circle';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { CircleTable, PROGRESS_MS, SIDE_NOTE_MIN, RARE_PROGRESS_MS, placementOfSpell, type CircleTableHandle } from './CircleTable';
import { SYNTH_ERROR_MESSAGE, SYNTH_RETRY_MESSAGE } from './messages';
import { fakeRuntime } from './test-runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FIREBALL = 'm:fire.2.----f.-----.bolt';

function setup(game: Partial<GameState> = {}, reply?: () => Promise<ActionResult | null>) {
  const rt = fakeRuntime({ inventory: { 'el:fire:1': 3, 'el:fire:2': 1, 'el:wind:1': 2 }, ...game });
  let resolve: (r: ActionResult | null) => void = () => {};
  let rejectReply: (e: unknown) => void = () => {};
  const synthesizeCircle = vi.fn(reply ?? (() => new Promise<ActionResult | null>((res, rej) => { resolve = res; rejectReply = rej; })));
  const onResult = vi.fn();
  const onCharging = vi.fn();
  const ref = createRef<CircleTableHandle>();
  const onRender = vi.fn();
  render(
    <Profiler id="parchment" onRender={onRender}>
      <CircleTable ref={ref} runtime={rt} sync={{ synthesizeCircle }} content={content} onResult={onResult} onCharging={onCharging} />
    </Profiler>,
  );
  return { rt, synthesizeCircle, onResult, onCharging, ref, onRender, reply: (r: ActionResult | null) => resolve(r), fail: (e: unknown) => rejectReply(e) };
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const dialogBtn = (name: string | RegExp) => within(screen.getByRole('dialog')).getByRole('button', { name });
/** an option like /^火・初階/ is the wheel's two steps (element, then grade); anything else is one click */
const choose = (slot: string | RegExp, option: string | RegExp) => {
  fireEvent.click(btn(slot));
  const m = typeof option === 'string' ? null : /^\^(.)・(.階)/.exec(option.source);
  if (m) {
    fireEvent.click(dialogBtn(m[1]!));
    fireEvent.click(dialogBtn(new RegExp(`^${m[2]}`)));
  } else fireEvent.click(dialogBtn(option));
};
/** core 初階火 + one ring-1 風 + 射: a tier-2 circle the starting player can draw */
const drawSmall = () => {
  choose(/^核心/, /^火・初階/);
  choose(/^一環 第1格/, /^風・初階/);
  choose(/^一環符文/, /^射/);
};
const synthButton = () => btn('合成') as HTMLButtonElement;
const flush = () => act(async () => {});

describe('CircleTable', () => {
  it('starts as an empty circle; 合成 waits for a core', () => {
    setup();
    expect(btn(/^核心：空/)).toBeTruthy();
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('先選核心元素')).toBeTruthy();
  });

  it('the parchment sits on a sheet with a fallback paper until the art loads', () => {
    setup();
    const sheet = document.querySelector('.parchment-sheet')!;
    expect(sheet).toBeTruthy();
    expect(sheet.classList.contains('has-art')).toBe(false);
    expect(sheet.querySelector('.parchment')).toBeTruthy();
    // zero-width lines (vertical/horizontal) must not be clipped away by the ink filter
    expect(document.querySelector('filter#ink-rough')!.getAttribute('filterUnits')).toBe('userSpaceOnUse');
  });

  it('shows the prediction (main element, effects, tier) without the form', () => {
    setup();
    drawSmall();
    const line = screen.getByLabelText('預測').textContent!;
    expect(line).toContain('火');
    expect(line).toContain('擊退');
    expect(line).toContain('約 Lv.2');
    for (const word of ['射', '魔彈', '飛刃', '鎖鏈', '形態']) expect(line).not.toContain(word);
    expect(synthButton().disabled).toBe(false);
  });

  describe('parchment layout (seal button and side notes)', () => {
    it('puts the seal button and its reason on the sheet, below the circle; 清空魔法陣 stays outside', () => {
      setup();
      const sheet = document.querySelector('.parchment-sheet')!;
      const go = btn('合成');
      expect(sheet.contains(go)).toBe(true);
      expect(sheet.querySelector('.parchment')!.contains(go)).toBe(false);
      expect(sheet.querySelector('.circle-why')!.textContent).toBe('先選核心元素');
      expect(sheet.contains(btn('清空魔法陣'))).toBe(false);
      expect(sheet.contains(document.querySelector('.synth-message'))).toBe(false);
    });

    it('the predict note shows the fail chance and the mismatch warning; the cost note marks a short element', () => {
      expect(SIDE_NOTE_MIN).toBe(150);
      setup();
      expect(document.querySelector('.circle-note.predict')).toBeTruthy();
      choose(/^核心/, /^火・初階/);
      choose(/^一環 第1格/, /^風・初階/);
      const predict = document.querySelector('.circle-note.predict')!;
      expect(predict.textContent).toMatch(/大失敗 \d+%/);
      expect(predict.textContent).toContain('迴路對不上');
      const cost = document.querySelector('.circle-note.cost')!;
      expect(within(cost as HTMLElement).getByText(/初階火/)).toBeTruthy();
      expect(cost.querySelectorAll('.short')).toHaveLength(0);
      cleanup();
      const rt = setup({ inventory: { 'el:fire:1': 3 } });
      choose(/^核心/, /^火・初階/);
      choose(/^一環 第1格/, /^火・初階/);
      act(() => { rt.rt.set({ game: { inventory: { 'el:fire:1': 1 } } }); });
      const short = document.querySelector('.circle-note.cost .short')!;
      expect(short.textContent).toContain('初階火');
      expect(short.textContent).toContain('1');
    });
  });

  it('draws only the open slots', () => {
    const slots = (re: RegExp) => screen.queryAllByRole('button', { name: re });
    setup({ circleTier: 2 });
    expect(slots(/^一環 第/)).toHaveLength(1);
    expect(slots(/^二環 第/)).toHaveLength(0);
    expect(document.querySelector('.guide')).toBeNull();
    cleanup();
    setup({ circleTier: 4 });
    expect(slots(/^一環 第/)).toHaveLength(3);
    cleanup();
    setup({ circleTier: 7 });
    expect(slots(/^一環 第/)).toHaveLength(5);
    expect(slots(/^二環 第/)).toHaveLength(1);
    expect(btn(/^二環 第1格/)).toBeTruthy();
  });

  it('shows a loaded node outside the default open slots', () => {
    const { ref } = setup({ circleTier: 3, inventory: { 'el:fire:1': 5, 'el:fire:2': 1 } });
    const loaded: Placement = {
      core: { element: 'fire', grade: 2 },
      ring1: [{ element: 'fire', grade: 1 }, null, { element: 'fire', grade: 1 }, null, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    };
    act(() => ref.current!.loadPlacement(loaded));
    expect(btn(/^一環 第1格：火/)).toBeTruthy();
    const mid = btn(/^一環 第2格：空/) as HTMLButtonElement;
    expect(mid.getAttribute('aria-disabled')).toBe('true');
    expect(btn(/^一環 第3格：火/)).toBeTruthy();
    expect(synthButton().disabled).toBe(false);
  });

  it('lowering the core greys extra slots without moving them', () => {
    setup({ circleTier: 6, inventory: { 'el:fire:1': 9, 'el:fire:2': 1, 'el:fire:3': 1 } });
    choose(/^核心/, /^火・中階/);
    for (const n of [1, 2, 3]) choose(new RegExp(`^一環 第${n}格`), /^火・初階/);
    const places = () => [1, 2, 3, 4, 5].map((n) => {
      const el = btn(new RegExp(`^一環 第${n}格`));
      return `${el.style.left}/${el.style.top}`;
    });
    const before = places();
    choose(/^核心/, /^火・初階/);
    expect(places()).toEqual(before);
    expect(btn(/^一環 第4格：空/).getAttribute('aria-label')).toContain('超過核心上限');
  });

  it('marks a clashing wire', () => {
    setup({ circleTier: 3, inventory: { 'el:fire:1': 3, 'el:water:1': 3, 'el:earth:1': 3 } });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^水・初階/);
    expect(document.querySelector('.wire.clash')).toBeTruthy();
    choose(/^一環 第1格/, /^土・初階/);
    expect(document.querySelector('.wire.clash')).toBeNull();
  });

  it('tapping a greyed slot shows its reason (phones have no hover) and opens no picker', () => {
    setup({ circleTier: 3 });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^火・初階/);
    fireEvent.click(btn(/^一環 第2格/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('超過核心上限');
    expect(btn(/^一環 第2格：空/)).toBeTruthy(); // still empty
  });

  it('the picker opens over the parchment with focus inside, and Escape closes it', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    const dialog = screen.getByRole('dialog', { name: '選擇核心元素' });
    expect(screen.getByRole('region', { name: '魔法陣' }).contains(dialog)).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tapping the core grows an element wheel in 相生 order', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    const dialog = screen.getByRole('dialog', { name: '選擇核心元素' });
    const items = [...dialog.querySelectorAll<HTMLButtonElement>('.ring-item')];
    expect(items.map((b) => b.textContent)).toEqual(['水', '土', '火', '雷', '風']);
    expect(items.map((b) => b.disabled)).toEqual([true, true, false, true, false]);
    expect(items[0]!.title).toBe('沒有這種元素');
  });

  it('picking an element then a grade places it', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    fireEvent.click(dialogBtn('火'));
    expect((dialogBtn('初階 ×3（上限 Lv.2）') as HTMLButtonElement).disabled).toBe(false);
    expect((dialogBtn('高階 ×0（上限 Lv.6）') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(dialogBtn('初階 ×3（上限 Lv.2）'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(btn(/^核心：火・初階（.*上限 Lv\.2）/)).toBeTruthy();
  });

  it('ring 2 greys grades below 高階', () => {
    setup({ circleTier: 10, inventory: { 'el:fire:1': 9, 'el:fire:3': 9, 'el:fire:5': 1 } });
    choose(/^核心/, /^火・神階/);
    for (let n = 1; n <= 5; n++) choose(new RegExp(`^一環 第${n}格`), /^火・初階/);
    fireEvent.click(btn(/^二環 第2格/));
    fireEvent.click(dialogBtn('火'));
    for (const name of [/^初階/, /^中階/]) {
      const b = dialogBtn(name) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(b.title).toBe('二環需要高階以上');
    }
    expect(within(screen.getByRole('dialog')).getByText('二環需要高階以上')).toBeTruthy();
    expect((dialogBtn(/^高階/) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a backdrop tap closes the wheel even on the grade step', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    fireEvent.click(dialogBtn('火'));
    fireEvent.click(document.querySelector('.ring-picker-backdrop')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape on the grade step goes back to the elements', () => {
    setup();
    fireEvent.click(btn(/^核心/));
    fireEvent.click(dialogBtn('火'));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '選擇核心元素' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables 合成 with the reason: 超過核心上限 after the core is lowered, 尚未開放 for a loaded circle', () => {
    const { ref } = setup({ circleTier: 4, inventory: { 'el:fire:1': 5, 'el:fire:2': 1, 'el:wind:1': 2 } });
    choose(/^核心/, /^火・中階/);
    choose(/^一環 第1格/, /^火・初階/);
    choose(/^一環 第2格/, /^火・初階/);
    choose(/^一環符文/, /^射/);
    expect(synthButton().disabled).toBe(false);
    choose(/^核心/, /^火・初階/);
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('超過核心上限')).toBeTruthy();

    const loaded: Placement = {
      core: { element: 'fire', grade: 3 },
      ring1: [{ element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, { element: 'fire', grade: 1 }, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    };
    act(() => ref.current!.loadPlacement(loaded));
    expect(btn(/^核心：火・高階/)).toBeTruthy();
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText('尚未開放')).toBeTruthy();
  });

  it('disables 合成 when the elements are short', () => {
    setup({ inventory: { 'el:fire:1': 1, 'el:wind:1': 0 } });
    choose(/^核心/, /^火・初階/);
    choose(/^一環 第1格/, /^火・初階/);
    choose(/^一環符文/, /^射/);
    expect(synthButton().disabled).toBe(true);
    expect(screen.getByText(/元素不足：初階火 ×2（持有 1）/)).toBeTruthy();
  });

  it('shows branch counts and marks a circuit that does not connect', () => {
    setup();
    drawSmall();
    // core 火 sends 1 per ring-1 node, 風 takes 2 in: the layer does not match
    expect(screen.getByText('迴路對不上：大失敗機率提高')).toBeTruthy();
    expect(btn(/^核心：火・初階/).getAttribute('aria-label')).toContain('出 1');
    expect(btn(/^一環 第1格：風・初階/).getAttribute('aria-label')).toContain('入 2');
    expect(document.querySelector('.ring-line.mismatch')).toBeTruthy();
  });

  it('keeps the circle on refusal', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(h.synthesizeCircle).toHaveBeenCalledWith({
      core: { element: 'fire', grade: 1 },
      ring1: [{ element: 'wind', grade: 1 }, null, null, null, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    });
    h.reply({ kind: 'rejected', reason: 'insufficient' });
    await flush();
    expect(screen.getByText('材料不足')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(btn(/^核心：火・初階/)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    expect(h.onResult).not.toHaveBeenCalled();
    expect(synthButton().disabled).toBe(false);
  });

  it('keeps the circle when the request fails or the save had to be synced', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.fail(new Error('boom'));
    await flush();
    expect(screen.getByText(SYNTH_ERROR_MESSAGE)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    fireEvent.click(synthButton());
    h.reply(null);
    await flush();
    expect(screen.getByText(SYNTH_RETRY_MESSAGE)).toBeTruthy();
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
  });

  it('a learned result shows after the 3 s progress ring, then hands the result on', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(screen.getByRole('progressbar', { name: '注入魔力' })).toBeTruthy();
    expect(document.querySelectorAll('.spark').length).toBeGreaterThan(0);
    h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS - 1));
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(h.onResult).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('火球');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(h.onResult).toHaveBeenCalledWith({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    // the circle stays on the parchment for another try
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
    expect(PROGRESS_MS).toBe(3000);
  });

  it('calls onCharging(true) before the request and onCharging(false) when the result is revealed', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
    await flush();
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('lifts the veil on refusal, error and unmount', async () => {
    const refused = setup();
    drawSmall();
    fireEvent.click(synthButton());
    refused.reply({ kind: 'rejected', reason: 'overCap' } as ActionResult);
    await flush();
    expect(refused.onCharging.mock.calls).toEqual([[true], [false]]);
    cleanup();

    const failed = setup();
    drawSmall();
    fireEvent.click(synthButton());
    failed.fail(new Error('boom'));
    await flush();
    expect(failed.onCharging.mock.calls).toEqual([[true], [false]]);
    cleanup();

    const gone = setup();
    drawSmall();
    fireEvent.click(synthButton());
    cleanup();
    expect(gone.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('a rare result keeps the veil for 5 s', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true]]);
    act(() => vi.advanceTimersByTime(RARE_PROGRESS_MS - PROGRESS_MS));
    expect(h.onCharging.mock.calls).toEqual([[true], [false]]);
  });

  it('a rare result keeps injecting for 5 s', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(screen.queryByRole('status', { name: '合成結果' })).toBeNull();
    expect(screen.getByRole('progressbar')).toBeTruthy();
    act(() => vi.advanceTimersByTime(RARE_PROGRESS_MS - PROGRESS_MS));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain(content.spells.worldfire!.name);
    expect(h.onResult).toHaveBeenCalledTimes(1);
    expect(RARE_PROGRESS_MS).toBe(5000);
  });

  it('a failed circle says so', async () => {
    vi.useFakeTimers();
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    h.reply({ kind: 'failed', form: 'bolt' });
    await flush();
    act(() => vi.advanceTimersByTime(PROGRESS_MS));
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('魔法陣崩解了');
  });

  describe('effects', () => {
    const start = async (h: ReturnType<typeof setup>) => {
      drawSmall();
      fireEvent.click(synthButton());
      return h;
    };
    const parch = () => document.querySelector('.parchment')!;

    it('a failed circle scorches the paper until the next placement', async () => {
      vi.useFakeTimers();
      const h = await start(setup());
      h.reply({ kind: 'failed', form: 'bolt' });
      await flush();
      act(() => vi.advanceTimersByTime(PROGRESS_MS));
      expect(parch().classList.contains('burnt')).toBe(true);
      fireEvent.click(btn('清空魔法陣'));
      expect(parch().classList.contains('burnt')).toBe(false);
    });

    it('success raises a light pillar briefly', async () => {
      vi.useFakeTimers();
      const h = await start(setup());
      h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
      await flush();
      act(() => vi.advanceTimersByTime(PROGRESS_MS));
      expect(parch().classList.contains('success')).toBe(true);
      expect(document.querySelector('.light-pillar')).toBeTruthy();
      act(() => vi.advanceTimersByTime(900));
      expect(parch().classList.contains('success')).toBe(false);
      expect(document.querySelector('.light-pillar')).toBeNull();
    });

    it('the rare charge darkens the page and shows a starfield', async () => {
      vi.useFakeTimers();
      const h = await start(setup());
      expect(document.querySelector('.rare-dim')).toBeNull();
      h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
      await flush();
      act(() => vi.advanceTimersByTime(PROGRESS_MS));
      expect(parch().classList.contains('rare')).toBe(true);
      expect(document.body.querySelector('.rare-dim')).toBeTruthy();
      expect(document.querySelectorAll('.starfield > *').length).toBe(20);
      act(() => vi.advanceTimersByTime(RARE_PROGRESS_MS - PROGRESS_MS));
      expect(parch().classList.contains('rare')).toBe(false);
      expect(document.querySelector('.rare-dim')).toBeNull();
      expect(document.querySelector('.starfield')).toBeNull();
    });

    it('removes the dim page when unmounted mid-charge', async () => {
      vi.useFakeTimers();
      const h = await start(setup());
      h.reply({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } });
      await flush();
      expect(document.querySelector('.rare-dim')).toBeTruthy();
      cleanup();
      expect(document.querySelector('.rare-dim')).toBeNull();
    });

    it('a circuit that stops matching shakes once', () => {
      vi.useFakeTimers();
      setup();
      choose(/^核心/, /^火・初階/);
      expect(parch().classList.contains('shake')).toBe(false);
      choose(/^一環 第1格/, /^風・初階/);
      expect(parch().classList.contains('shake')).toBe(true);
      act(() => vi.advanceTimersByTime(400));
      expect(parch().classList.contains('shake')).toBe(false);
      choose(/^核心/, /^火・中階/);
      expect(screen.getByText('迴路對不上：大失敗機率提高')).toBeTruthy();
      expect(parch().classList.contains('shake')).toBe(false);
    });

    it('charging lines light up in order, the core last', async () => {
      await start(setup());
      const ks = [...document.querySelectorAll<SVGElement>('.draw')].map((el) => Number(el.style.getPropertyValue('--k')));
      expect(ks.length).toBeGreaterThan(1);
      expect(ks.every((k) => Number.isFinite(k))).toBe(true);
      const core = Number((document.querySelector('.core-mark') as SVGElement).style.getPropertyValue('--k'));
      expect(core).toBe(Math.max(...ks));
      expect(new Set(ks).size).toBe(ks.length);
    });
  });

  it('nothing can be changed while injecting', async () => {
    const h = setup();
    drawSmall();
    fireEvent.click(synthButton());
    expect((btn(/^核心/) as HTMLButtonElement).disabled).toBe(true);
    act(() => h.ref.current!.placeItem('el:fire:1'));
    expect(btn(/^一環 第1格：風/)).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^一環 第/ })).toHaveLength(1);
  });

  it('placeItem puts an element into the core, then the first open ring slot', () => {
    const { ref } = setup({ circleTier: 4 });
    act(() => ref.current!.placeItem('el:fire:2'));
    expect(btn(/^核心：火・中階/)).toBeTruthy();
    act(() => ref.current!.placeItem('el:wind:1'));
    expect(btn(/^一環 第1格：風・初階/)).toBeTruthy();
  });

  it('draws a rune band only for an open ring', () => {
    setup();
    expect(btn('一環符文：空')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^二環符文/ })).toBeNull();
    cleanup();
    setup({ circleTier: 7 });
    expect(btn('一環符文：空')).toBeTruthy();
    expect(btn('二環符文：空')).toBeTruthy();
  });

  it('the band shows the chosen rune along the ring', () => {
    setup();
    choose(/^一環符文/, /^射/);
    const band = btn('一環符文：射');
    expect(band.querySelectorAll('[data-rune="bolt"]')).toHaveLength(12);
    expect(band.querySelector('textPath')).toBeNull();
    expect(band.textContent).toBe('');
    expect(band.classList.contains('rune-band')).toBe(true);
  });

  it('tapping the band grows the rune wheel; locked runes say 從魔王取得', () => {
    setup();
    fireEvent.click(btn(/^一環符文/));
    const dialog = screen.getByRole('dialog', { name: '選擇一環符文' });
    const items = within(dialog).getAllByRole('button').filter((b) => b.classList.contains('ring-item')) as HTMLButtonElement[];
    expect(items).toHaveLength(8);
    expect(items.filter((b) => !b.disabled).map((b) => b.textContent)).toEqual(['射']);
    for (const b of items.filter((x) => x.disabled)) expect(b.title).toBe('從魔王取得');
    const known = items.find((b) => !b.disabled)!;
    expect(known.querySelector('[data-rune="bolt"]')).toBeTruthy();
    expect(known.querySelector('.ring-item-name')!.textContent).toBe('射');
  });

  it('the band opens with the keyboard and is inert while injecting', async () => {
    const { reply } = setup();
    drawSmall();
    fireEvent.keyDown(btn('一環符文：射'), { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: '選擇一環符文' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(synthButton());
    fireEvent.click(btn('一環符文：射'));
    expect(screen.queryByRole('dialog')).toBeNull();
    void reply;
  });

  it('removes a node and clears the whole circle', () => {
    setup();
    drawSmall();
    choose(/^一環 第1格/, '移除');
    expect(btn(/^一環 第1格：空/)).toBeTruthy();
    fireEvent.click(btn('清空魔法陣'));
    expect(btn(/^核心：空/)).toBeTruthy();
    expect(btn(/^一環符文：空/)).toBeTruthy();
  });

  it('the parchment does not re-render on battle steps or drops it does not show', () => {
    const { rt, onRender } = setup();
    drawSmall();
    const before = onRender.mock.calls.length;
    act(() => rt.set({ battle: { ...rt.getSnapshot().battle, elapsedMs: 999 } as never }));
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 3, 'el:fire:2': 1, 'el:wind:1': 2, 'el:earth:1': 9 } } }));
    act(() => rt.set({ game: { clearedStages: { mist_meadow: 3 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    // a drop of an element on the circle does
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4, 'el:fire:2': 1, 'el:wind:1': 2, 'el:earth:1': 9 } } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
  });
});

describe('placementOfSpell', () => {
  it('rebuilds the circle of a named or generated spell with the lowest grades that fit', () => {
    expect(placementOfSpell('fireball', content)).toEqual({
      core: { element: 'fire', grade: 1 },
      ring1: [null, null, null, null, { element: 'fire', grade: 1 }],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    });
    const p = placementOfSpell('m:water.4.--aae.-----.ring', content)!;
    expect(p.core).toEqual({ element: 'water', grade: 2 });
    expect(p.runes).toEqual(['ring', null]);
    expect(placementOfSpell('nope', content)).toBeNull();
  });

  describe('final fix wave', () => {
    it('placeItem puts a ring-2 element into an open slot, not the first rule index', () => {
      const { ref } = setup({ circleTier: 8, inventory: { 'el:fire:4': 1, 'el:fire:1': 5, 'el:fire:3': 2 } });
      act(() => ref.current!.placeItem('el:fire:4'));
      for (let n = 0; n < 5; n++) act(() => ref.current!.placeItem('el:fire:1'));
      act(() => ref.current!.placeItem('el:fire:3'));
      expect(document.querySelectorAll('[data-slot^="1-"]')).toHaveLength(2);
      expect(document.querySelector('[data-slot="1-1"]')!.classList.contains('filled')).toBe(true);
      expect(document.querySelector('[data-slot="1-0"]')).toBeNull();
    });

    it('ring 2 says ring 1 must be full first', () => {
      setup({ circleTier: 7 });
      choose(/^核心/, /^火・初階/);
      fireEvent.click(btn(/^二環 第1格/));
      expect(screen.getByRole('status', { name: '' }).textContent).toBe('一環要先放滿五格才能放二環');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('the grade wheel shows short text but keeps the full label for readers', () => {
      setup({ inventory: { 'el:fire:1': 1200 } });
      fireEvent.click(btn(/^核心/));
      fireEvent.click(dialogBtn('火'));
      const item = dialogBtn('初階 ×1200（上限 Lv.2）');
      expect(item.textContent).toBe('初階\n×1.2k\n≤Lv.2');
    });

    it('returns focus to the slot after a pick and after a grade-step close', () => {
      setup();
      choose(/^核心/, /^火・初階/);
      expect(document.activeElement).toBe(document.querySelector('[data-slot="core"]'));
      fireEvent.click(btn(/^核心/));
      fireEvent.click(dialogBtn('火'));
      fireEvent.click(dialogBtn('關閉'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(document.querySelector('[data-slot="core"]'));
      choose(/^一環 第1格/, /^風・初階/);
      expect(document.activeElement).toBe(document.querySelector('[data-slot="0-0"]'));
      choose(/^一環符文/, /^射/);
      expect(document.activeElement).toBe(document.querySelector('[data-rune="0"]'));
    });

    it('explains locked runes with a visible note', () => {
      setup();
      fireEvent.click(btn(/^一環符文/));
      expect(within(screen.getByRole('dialog')).getByText('未取得的符文從魔王取得')).toBeTruthy();
    });

    it('shows a locked rune as 「？」, disabled, without its name', () => {
      setup();
      fireEvent.click(btn(/^一環符文/));
      const dlg = within(screen.getByRole('dialog'));
      const locked = dlg.getAllByRole('button', { name: '未取得的符文' });
      expect(locked.length).toBeGreaterThan(0);
      for (const b of locked) {
        expect(b.textContent).toBe('？');
        expect(b.querySelector('[data-rune="locked"]')).toBeTruthy();
        expect((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true').toBe(true);
      }
      expect(dlg.queryByRole('button', { name: /^刃/ })).toBeNull();
    });

    it('re-synthesising right after a success drops the success glow at once', async () => {
      vi.useFakeTimers();
      const h = setup();
      drawSmall();
      fireEvent.click(synthButton());
      h.reply({ kind: 'learned', spellId: FIREBALL, form: 'bolt' });
      await flush();
      act(() => vi.advanceTimersByTime(PROGRESS_MS));
      expect(document.querySelector('.parchment')!.classList.contains('success')).toBe(true);
      fireEvent.click(synthButton());
      expect(document.querySelector('.parchment')!.classList.contains('success')).toBe(false);
      expect(document.querySelector('.parchment')!.classList.contains('charging')).toBe(true);
    });

    it('the rune band icons are hidden from readers and start away from the 12 o clock seam', () => {
      setup();
      choose(/^一環符文/, /^射/);
      const band = btn('一環符文：射');
      const first = band.querySelector('[data-rune="bolt"]')!.parentElement!;
      expect(first.getAttribute('aria-hidden')).toBe('true');
      const [, sx] = /translate\(([\d.]+) ([\d.]+)\)/.exec(first.getAttribute('transform')!)!;
      expect(Math.abs(Number(sx) - 200)).toBeGreaterThan(1);
    });
  });
});
