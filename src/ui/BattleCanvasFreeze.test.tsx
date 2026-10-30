// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameRuntime } from '../game/runtime';
import { BattleCanvas } from './BattleCanvas';
import { fakeRuntime } from './test-runtime';

const frozen: boolean[] = [];
vi.mock('../render/assets', () => ({ loadOptionalTextures: async () => new Map() }));
vi.mock('../render/battle-view', () => ({
  BattleView: class {
    onFrame() { return () => {}; }
    handle() {}
    sync() {}
    destroy() {}
    setFrozen(f: boolean) { frozen.push(f); }
  },
}));
afterEach(() => {
  cleanup();
  frozen.length = 0;
  document.documentElement.classList.remove('away');
});

describe('BattleCanvas while away', () => {
  it('freezes the battle view and greys the whole page while away, and thaws on return', async () => {
    document.title = '無限魔導書';
    const rt = fakeRuntime();
    render(<BattleCanvas runtime={rt as unknown as GameRuntime} />);
    await act(async () => {});
    expect(frozen.at(-1)).toBe(false);
    expect(document.documentElement.classList.contains('away')).toBe(false);
    act(() => rt.set({ away: true }));
    expect(frozen.at(-1)).toBe(true);
    expect(document.documentElement.classList.contains('away')).toBe(true);
    expect(document.title).toBe('💤 離線收益中 - 無限魔導書');
    act(() => rt.set({ away: false }));
    expect(document.title).toBe('無限魔導書');
    expect(frozen.at(-1)).toBe(false);
    expect(document.documentElement.classList.contains('away')).toBe(false);
  });
});
