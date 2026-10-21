// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameRuntime } from '../game/runtime';
import { BattleCanvas } from './BattleCanvas';

vi.mock('../render/assets', () => ({ loadOptionalTextures: () => new Promise(() => {}) }));
vi.mock('../render/battle-view', () => ({ BattleView: class {} }));
afterEach(cleanup);

describe('BattleCanvas', () => {
  it('lets the .battle box decide the height (no min-height that would overflow a 25vh box)', () => {
    const { container } = render(<BattleCanvas runtime={{} as GameRuntime} />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.style.height).toBe('100%');
    expect(host.style.minHeight === '' || host.style.minHeight === '0px' || host.style.minHeight === '0').toBe(true);
  });
});
