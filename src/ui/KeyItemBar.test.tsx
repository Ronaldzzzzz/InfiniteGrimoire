// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import type { ActionResult } from '../game/api';
import { KEY_MESSAGE_MS, KeyItemBar } from './KeyItemBar';
import { fakeRuntime } from './test-runtime';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(game: Partial<GameState>, synthPending = false, action = vi.fn(async (): Promise<ActionResult | null> => null)) {
  const rt = fakeRuntime(game, synthPending);
  const onRevealed = vi.fn();
  render(<KeyItemBar runtime={rt} sync={{ action }} content={content} onRevealed={onRevealed} />);
  return { rt, onRevealed, action };
}

describe('KeyItemBar', () => {
  it('uses a key item: reveals, tells the app, shows a message that fades, and the button goes away', async () => {
    vi.useFakeTimers();
    let rt: ReturnType<typeof fakeRuntime>;
    const action = vi.fn(async (): Promise<ActionResult | null> => {
      rt.set({ game: { revealed: ['outer'], inventory: {} } });
      return { kind: 'revealed', region: 'outer' };
    });
    let onRevealed: ReturnType<typeof vi.fn>;
    ({ rt, onRevealed } = setup({ inventory: { 'key:storm_heart': 1 } }, false, action));
    const button = screen.getByRole('button', { name: /使用風暴之心/ });
    expect(button.textContent).toContain(content.keyItems['key:storm_heart']!.desc);
    await act(async () => { fireEvent.click(button); });
    expect(action).toHaveBeenCalledWith('reveal', { keyItem: 'key:storm_heart' });
    expect(onRevealed).toHaveBeenCalledWith('outer');
    expect(screen.getByText('迷霧散開了')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /使用風暴之心/ })).toBeNull();
    act(() => { vi.advanceTimersByTime(KEY_MESSAGE_MS); });
    expect(screen.queryByText('迷霧散開了')).toBeNull();
  });

  it('is disabled while a synthesis is pending', () => {
    setup({ inventory: { 'key:storm_heart': 1 } }, true);
    expect((screen.getByRole('button', { name: /使用風暴之心/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not re-render for drops that add no usable key item', () => {
    const rt = fakeRuntime({ inventory: { 'el:fire:1': 1 } });
    const onRender = vi.fn();
    render(
      <Profiler id="keys" onRender={onRender}>
        <KeyItemBar runtime={rt} sync={{ action: vi.fn() }} content={content} onRevealed={vi.fn()} />
      </Profiler>,
    );
    const before = onRender.mock.calls.length;
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 5, 'mat:mist_dew': 2 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 5, 'key:thunder_eye': 1 } } }));
    expect(screen.getByRole('button', { name: /使用大鵬之眼/ })).toBeTruthy();
  });
});
