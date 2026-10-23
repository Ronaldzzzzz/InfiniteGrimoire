// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { GrimoirePanel } from './GrimoirePanel';
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

function setup(game: Partial<GameState> = {}, synthPending = false, action = vi.fn(async (): Promise<ActionResult | null> => null)) {
  const rt = fakeRuntime(game, synthPending);
  const onHint = vi.fn();
  const onPick = vi.fn();
  const sync = { action };
  render(<GrimoirePanel runtime={rt} sync={sync} onHint={onHint} onPick={onPick} content={content} />);
  return { rt, onHint, onPick, sync };
}

describe('GrimoirePanel', () => {
  it('a learned spell opens its details: put into the slots, equip, empower', () => {
    const { rt, onHint, onPick } = setup({ learned: ['mana_bolt', 'fireball'], levels: { fireball: 4 } });
    fireEvent.click(node(content.spells.fireball!.name));
    expect(onHint).toHaveBeenCalledWith(null);
    const detail = screen.getByRole('region', { name: '節點詳情' });
    expect(detail.textContent).toContain('強化 +3');
    expect(detail.textContent).toContain(content.spells.fireball!.desc);
    fireEvent.click(screen.getByRole('button', { name: '放進合成槽' }));
    expect(onPick).toHaveBeenCalledWith('fireball');
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(rt.equip).toHaveBeenCalledWith('fireball');
    expect(screen.getByRole('region', { name: '強化' })).toBeTruthy();
  });

  it('a locked spell shows its name and hint without equipping', () => {
    const { rt, onHint } = setup();
    fireEvent.click(node(`${content.spells.fireball!.name}（未學會）`));
    expect(onHint).toHaveBeenCalledWith('fireball');
    expect(screen.getByRole('region', { name: '節點詳情' }).textContent).toContain(content.spells.fireball!.hint);
    expect(screen.queryByRole('button', { name: '裝備' })).toBeNull();
    expect(rt.equip).not.toHaveBeenCalled();
  });

  it('does not equip while an action is in flight', () => {
    setup({ learned: ['mana_bolt', 'fireball'] }, true);
    fireEvent.click(node(content.spells.fireball!.name));
    expect((screen.getByRole('button', { name: '裝備' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('fogged regions show no nodes and a key item reveals them', async () => {
    const inferno = content.spells.inferno!.name;
    let rt: ReturnType<typeof fakeRuntime>;
    const action = vi.fn(async (): Promise<ActionResult | null> => {
      rt.set({ game: { revealed: ['outer'], inventory: {} } });
      return { kind: 'revealed', region: 'outer' };
    });
    ({ rt } = setup({ inventory: { 'key:storm_heart': 1 } }, false, action));
    expect(screen.queryByRole('button', { name: new RegExp(inferno) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(content.passives.ember_affinity!.name) })).toBeNull();
    expect(screen.getAllByLabelText('迷霧').length).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: '使用風暴之心' }));
    expect(action).toHaveBeenCalledWith('reveal', { keyItem: 'key:storm_heart' });
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(inferno) })).toBeTruthy());
    expect(screen.getAllByLabelText('迷霧').length).toBe(3);
    expect(document.querySelector('.fog.lifting')).toBeTruthy();
    expect(screen.getByText('迷霧散開了')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '使用風暴之心' })).toBeNull();
  });

  it('passive unlock button only when the requirement is met', async () => {
    const name = content.passives.ember_affinity!.name;
    const action = vi.fn(async (): Promise<ActionResult | null> => ({ kind: 'unlocked' }));
    const { rt } = setup({ revealed: ['outer'], inventory: { 'mat:ember_core': 4 } }, false, action);
    fireEvent.click(node(name));
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

  it('the tree and its open details do not re-render when only the inventory changes', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'], revealed: ['outer'], inventory: { 'el:fire:1': 1 } });
    const onRender = vi.fn();
    render(
      <Profiler id="grimoire" onRender={onRender}>
        <GrimoirePanel runtime={rt} sync={{ action: vi.fn() }} onHint={vi.fn()} onPick={vi.fn()} content={content} />
      </Profiler>,
    );
    fireEvent.click(node(content.spells.fireball!.name)); // details + empower panel open
    const before = onRender.mock.calls.length;
    // drops that touch neither a key item nor the empower cost (fireball 1->2 costs 4 初階火)
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 1, 'el:wind:1': 7, 'mat:mist_dew': 2 } } }));
    act(() => rt.set({ game: { zoneKills: { mist_meadow: 9 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    // ...but a drop the panel shows does
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4 } } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 4, 'key:thunder_eye': 1 } } }));
    expect(screen.getByRole('button', { name: '使用大鵬之眼' })).toBeTruthy();
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
        <GrimoirePanel runtime={rt} sync={{ action: vi.fn() }} onHint={vi.fn()} onPick={vi.fn()} content={content} />
      </Profiler>,
    );
    const svg = document.querySelector('svg.grimoire-svg')!;
    const initial = svg.getAttribute('viewBox');
    const renders = onRender.mock.calls.length;
    fireEvent.pointerDown(svg, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 0, pointerId: 1 });
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
    fireEvent.pointerMove(svg, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 40, clientY: 0, pointerId: 1 });
    const x1 = Number(svg.getAttribute('viewBox')!.split(' ')[0]);
    expect(x0 - x1).toBeCloseTo((40 * w) / 400);
  });
});
