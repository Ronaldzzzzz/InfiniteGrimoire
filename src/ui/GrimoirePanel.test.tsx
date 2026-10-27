// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { GrimoirePanel, PLACED_TOAST_MS } from './GrimoirePanel';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
if (typeof globalThis.PointerEvent === 'undefined') (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

const node = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

function setup(
  game: Partial<GameState> = {},
  synthPending = false,
  action = vi.fn(async (): Promise<ActionResult | null> => null),
  slotsFull = false,
) {
  const rt = fakeRuntime(game, synthPending);
  const onHint = vi.fn();
  const onPick = vi.fn();
  const sync = { action };
  const ui = (lifting: string | null) => (
    <GrimoirePanel runtime={rt} sync={sync} onHint={onHint} onPick={onPick} slotsFull={slotsFull} lifting={lifting} content={content} />
  );
  const { rerender } = render(ui(null));
  return { rt, onHint, onPick, sync, rerender: (lifting: string | null) => rerender(ui(lifting)) };
}

describe('GrimoirePanel', () => {
  it('clicking a learned spell opens a bubble: put into the altar, equip, details', () => {
    const { rt, onHint, onPick } = setup({ learned: ['mana_bolt', 'fireball'], levels: { fireball: 4 } });
    fireEvent.click(node(content.spells.fireball!.name));
    expect(onHint).toHaveBeenCalledWith(null);
    const bubble = screen.getByRole('group', { name: '魔法操作' });
    expect(bubble.textContent).toContain('強化 +3');
    fireEvent.click(within(bubble).getByRole('button', { name: '放入合成' }));
    expect(onPick).toHaveBeenCalledWith('fireball');
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
    fireEvent.click(node(content.spells.fireball!.name));
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(rt.equip).toHaveBeenCalledWith('fireball');
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
  });

  it('詳情 opens the floating card with the empower section inside it', () => {
    setup({ learned: ['mana_bolt', 'fireball'], levels: { fireball: 4 } });
    fireEvent.click(node(content.spells.fireball!.name));
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
    const card = screen.getByRole('region', { name: '節點詳情' });
    expect(card.closest('.tree-stage')).toBeTruthy();
    expect(card.textContent).toContain(content.spells.fireball!.desc);
    expect(within(card).getByRole('region', { name: '強化' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉詳情' }));
    expect(screen.queryByRole('region', { name: '節點詳情' })).toBeNull();
  });

  it('a locked spell bubble shows the hint and no buttons', () => {
    const { rt, onHint } = setup();
    fireEvent.click(node(`${content.spells.fireball!.name}（未學會）`));
    expect(onHint).toHaveBeenCalledWith('fireball');
    const bubble = screen.getByRole('group', { name: '魔法操作' });
    expect(bubble.textContent).toContain(content.spells.fireball!.hint);
    expect(within(bubble).queryByRole('button')).toBeNull();
    expect(rt.equip).not.toHaveBeenCalled();
  });

  it('放入合成 is disabled when the altar is full', () => {
    setup({ learned: ['mana_bolt', 'fireball'] }, false, undefined, true);
    fireEvent.click(node(content.spells.fireball!.name));
    expect((screen.getByRole('button', { name: '放入合成' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not equip while an action is in flight', () => {
    setup({ learned: ['mana_bolt', 'fireball'] }, true);
    fireEvent.click(node(content.spells.fireball!.name));
    expect((screen.getByRole('button', { name: '裝備' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('double-click puts a learned spell into the altar without a bubble, and the toast fades', () => {
    vi.useFakeTimers();
    try {
      const { onPick } = setup({ learned: ['mana_bolt', 'fireball'] });
      fireEvent.doubleClick(node(content.spells.fireball!.name));
      expect(onPick).toHaveBeenCalledWith('fireball');
      expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
      expect(screen.getByRole('status').textContent).toBe(`已放入合成台：${content.spells.fireball!.name}`);
      act(() => void vi.advanceTimersByTime(PLACED_TOAST_MS + 10));
      expect(screen.queryByText(/已放入合成台/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('double-click does nothing on a locked spell or when the altar is full', () => {
    const a = setup();
    fireEvent.doubleClick(node(`${content.spells.fireball!.name}（未學會）`));
    expect(a.onPick).not.toHaveBeenCalled();
    expect(screen.queryByText(/已放入合成台/)).toBeNull();
    cleanup();
    const b = setup({ learned: ['mana_bolt', 'fireball'] }, false, undefined, true);
    fireEvent.doubleClick(node(content.spells.fireball!.name));
    expect(b.onPick).not.toHaveBeenCalled();
    expect(screen.queryByText(/已放入合成台/)).toBeNull();
  });

  it('while a synthesis is pending, 放入合成 is disabled in the bubble and the card, and double-click does nothing', () => {
    const { onPick } = setup({ learned: ['mana_bolt', 'fireball'] }, true);
    fireEvent.doubleClick(node(content.spells.fireball!.name));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByText(/已放入合成台/)).toBeNull();
    fireEvent.click(node(content.spells.fireball!.name));
    expect((screen.getByRole('button', { name: '放入合成' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    expect((within(screen.getByLabelText('節點詳情')).getByRole('button', { name: '放入合成' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByText(/已放入合成台/)).toBeNull();
  });

  it('a drag that ends on a node opens nothing', () => {
    const { onPick } = setup({ learned: ['mana_bolt', 'fireball'] });
    const n = node(content.spells.fireball!.name);
    fireEvent.pointerDown(n, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(n, { clientX: 40, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(n, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.click(n);
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
    fireEvent.doubleClick(n);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a blank click or Esc closes bubble and card; a drag closes only the bubble', () => {
    setup({ learned: ['mana_bolt', 'fireball'] });
    const svg = document.querySelector('svg.grimoire-svg')!;
    const openBoth = () => {
      fireEvent.click(node(content.spells.fireball!.name));
      fireEvent.click(screen.getByRole('button', { name: '詳情' }));
      fireEvent.click(node(content.spells.mana_bolt!.name));
      expect(screen.getByRole('group', { name: '魔法操作' })).toBeTruthy();
      expect(screen.getByRole('region', { name: '節點詳情' })).toBeTruthy();
    };
    const noneOpen = () => {
      expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
      expect(screen.queryByRole('region', { name: '節點詳情' })).toBeNull();
    };
    openBoth();
    fireEvent.click(svg);
    noneOpen();
    openBoth();
    fireEvent.keyDown(document.querySelector('.grimoire')!, { key: 'Escape' });
    noneOpen();
    openBoth();
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
    expect(screen.getByRole('region', { name: '節點詳情' })).toBeTruthy();
    fireEvent.click(svg); // the click that ends a drag is not a blank click
    expect(screen.getByRole('region', { name: '節點詳情' })).toBeTruthy();
  });

  it('with the card open, clicking another spell switches the card and opens its bubble', () => {
    setup({ learned: ['mana_bolt', 'fireball'] });
    fireEvent.click(node(content.spells.fireball!.name));
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    fireEvent.click(node(content.spells.mana_bolt!.name));
    expect(screen.getByRole('region', { name: '節點詳情' }).textContent).toContain(content.spells.mana_bolt!.desc);
    expect(screen.getByRole('group', { name: '魔法操作' }).textContent).toContain(content.spells.mana_bolt!.name);
  });

  it('fogged regions show no nodes; once revealed the fog lifts and the nodes appear', () => {
    const inferno = content.spells.inferno!.name;
    const { rt, rerender } = setup({ inventory: {} });
    expect(screen.queryByRole('button', { name: new RegExp(inferno) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(content.passives.ember_affinity!.name) })).toBeNull();
    expect(screen.getAllByLabelText('迷霧').length).toBe(5);
    expect(screen.queryByRole('button', { name: /使用風暴之心/ })).toBeNull();
    act(() => rt.set({ game: { revealed: ['outer'] } }));
    rerender('outer');
    expect(screen.getByRole('button', { name: new RegExp(inferno) })).toBeTruthy();
    expect(screen.getAllByLabelText('迷霧').length).toBe(4);
    expect(document.querySelector('.fog.lifting')).toBeTruthy();
  });

  it('passive unlock button only when the requirement is met', async () => {
    const name = content.passives.ember_affinity!.name;
    const action = vi.fn(async (): Promise<ActionResult | null> => ({ kind: 'unlocked' }));
    const { rt } = setup({ revealed: ['outer'], inventory: { 'mat:ember_core': 4 } }, false, action);
    fireEvent.click(node(name));
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
    const detail = screen.getByRole('region', { name: '節點詳情' });
    expect(detail.textContent).toContain('需要 餘燼核心 ×5');
    expect(screen.queryByRole('button', { name: '解鎖' })).toBeNull();
    act(() => rt.set({ game: { inventory: { 'mat:ember_core': 5 } } }));
    fireEvent.click(screen.getByRole('button', { name: '解鎖' }));
    expect(action).toHaveBeenCalledWith('passive', { passiveId: 'ember_affinity' });
    await waitFor(() => expect(screen.getByText('被動已解鎖')).toBeTruthy());
    act(() => rt.set({ game: { passives: ['ember_affinity'] } }));
    expect(screen.queryByRole('button', { name: '解鎖' })).toBeNull();
    expect(screen.getByRole('region', { name: '節點詳情' }).textContent).toContain('已解鎖');
  });

  it('the tree, bubble and card do not re-render when only the inventory changes', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'], revealed: ['outer'], inventory: { 'el:fire:1': 1 } });
    const onRender = vi.fn();
    render(
      <Profiler id="grimoire" onRender={onRender}>
        <GrimoirePanel runtime={rt} sync={{ action: vi.fn() }} onHint={vi.fn()} onPick={vi.fn()} slotsFull={false} lifting={null} content={content} />
      </Profiler>,
    );
    fireEvent.click(node(content.spells.fireball!.name));
    fireEvent.click(screen.getByRole('button', { name: '詳情' })); // card + empower panel open
    fireEvent.click(node(content.spells.mana_bolt!.name)); // bubble open as well
    expect(screen.getByRole('group', { name: '魔法操作' })).toBeTruthy();
    fireEvent.click(node(content.spells.fireball!.name)); // bubble + card on fireball
    expect(screen.getByRole('region', { name: '強化' })).toBeTruthy();
    const before = onRender.mock.calls.length;
    // drops that touch neither a key item nor the empower cost (fireball 1->2 costs 4 初階火)
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 1, 'el:wind:1': 7, 'mat:mist_dew': 2 } } }));
    act(() => rt.set({ game: { zoneKills: { mist_meadow: 9 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    // ...but a drop the panel shows does
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4 } } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
  });

  it('the wheel zooms the tree and never scrolls the page', () => {
    setup();
    const svg = document.querySelector('svg.grimoire-svg')!;
    const before = svg.getAttribute('viewBox')!.split(' ').map(Number)[2]!;
    expect(fireEvent.wheel(svg, { deltaY: -100 })).toBe(false); // preventDefault was called
    expect(svg.getAttribute('viewBox')!.split(' ').map(Number)[2]).toBeCloseTo(before / 1.1);
  });

  it('dragging pans without re-rendering the tree, and the home button goes back', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt'] });
    const onRender = vi.fn();
    render(
      <Profiler id="grimoire" onRender={onRender}>
        <GrimoirePanel runtime={rt} sync={{ action: vi.fn() }} onHint={vi.fn()} onPick={vi.fn()} slotsFull={false} lifting={null} content={content} />
      </Profiler>,
    );
    const svg = document.querySelector('svg.grimoire-svg')!;
    const initial = svg.getAttribute('viewBox');
    const renders = onRender.mock.calls.length;
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(svg.getAttribute('viewBox')).not.toBe(initial);
    expect(onRender.mock.calls.length).toBe(renders);
    fireEvent.click(screen.getByRole('button', { name: '回到中心' }));
    expect(svg.getAttribute('viewBox')).toBe(initial);
  });

  it('the zoom buttons live inside the tree stage', () => {
    setup();
    expect(document.querySelector('.tree-stage button[aria-label="放大"]')).toBeTruthy();
    expect(document.querySelector('.tree-stage button[aria-label="回到中心"]')).toBeTruthy();
  });

  it('dragging scales by the shorter side of a non-square stage', () => {
    setup();
    const svg = document.querySelector('svg.grimoire-svg')!;
    svg.getBoundingClientRect = () => ({ width: 800, height: 400, x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, toJSON: () => ({}) });
    const [x0, , w] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number];
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 0, pointerId: 1 });
    const x1 = Number(svg.getAttribute('viewBox')!.split(' ')[0]);
    expect(x0 - x1).toBeCloseTo((40 * w) / 400);
  });
  it('the altar-full hint shows (bubble and card) only when the altar is actually full', () => {
    setup({ learned: ['mana_bolt', 'fireball'] }, false, undefined, true);
    fireEvent.click(node(content.spells.fireball!.name));
    expect(within(screen.getByRole('group', { name: '魔法操作' })).getByText('合成台已滿')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    expect(within(screen.getByLabelText('節點詳情')).getByText('合成台已滿')).toBeTruthy();
    cleanup();
    setup({ learned: ['mana_bolt', 'fireball'] }, true); // pending, altar not full
    fireEvent.click(node(content.spells.fireball!.name));
    expect(screen.queryByText('合成台已滿')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    expect(screen.queryByText('合成台已滿')).toBeNull();
  });

  it('wheel: zero delta changes nothing, a small delta zooms a little, a notch is x1.1', () => {
    setup();
    const svg = document.querySelector('svg.grimoire-svg')!;
    const w = () => svg.getAttribute('viewBox')!.split(' ').map(Number)[2]!;
    const w0 = w();
    expect(fireEvent.wheel(svg, { deltaY: 0 })).toBe(false);
    expect(w()).toBe(w0);
    fireEvent.wheel(svg, { deltaY: -4 });
    const w1 = w();
    expect(w1).toBeLessThan(w0);
    expect(w0 / w1).toBeLessThan(1.01);
    fireEvent.wheel(svg, { deltaY: -100 });
    expect(w1 / w()).toBeCloseTo(1.1, 2);
    fireEvent.wheel(svg, { deltaY: -100000 }); // a huge delta is clamped per event
    expect(w()).toBeGreaterThan(0);
  });

  it('wheel over the bubble zooms; over the card it scrolls the card instead', () => {
    setup({ learned: ['mana_bolt', 'fireball'] });
    const svg = document.querySelector('svg.grimoire-svg')!;
    const w = () => svg.getAttribute('viewBox')!.split(' ').map(Number)[2]!;
    fireEvent.click(node(content.spells.fireball!.name));
    const w0 = w();
    expect(fireEvent.wheel(screen.getByRole('group', { name: '魔法操作' }), { deltaY: -100 })).toBe(false);
    expect(w()).toBeLessThan(w0);
    expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull(); // moving the tree closes the bubble
    fireEvent.click(node(content.spells.fireball!.name));
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    const w1 = w();
    expect(fireEvent.wheel(screen.getByLabelText('節點詳情'), { deltaY: -100 })).toBe(true);
    expect(w()).toBe(w1);
  });

  it('a drag abandoned before 4px and released outside does not pan on the next move', () => {
    setup();
    const svg = document.querySelector('svg.grimoire-svg')!;
    const initial = svg.getAttribute('viewBox');
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(svg, { clientX: 1, clientY: 0, pointerId: 1, buttons: 1 });
    // released outside the svg: no pointerup arrives; the pointer comes back with no button
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 0, pointerId: 1, buttons: 0 });
    expect(svg.getAttribute('viewBox')).toBe(initial);
  });

  it('a blank click also clears the selection ring', () => {
    setup({ learned: ['mana_bolt', 'fireball'] });
    const n = node(content.spells.fireball!.name);
    fireEvent.click(n);
    expect(n.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(document.querySelector('svg.grimoire-svg')!);
    expect(n.getAttribute('aria-pressed')).toBe('false');
  });
});
