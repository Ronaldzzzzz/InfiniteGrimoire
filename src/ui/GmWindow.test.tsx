// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { ApiError, GmExpiredError, RateLimitedError, type ApiClient } from '../game/api';
import type { GameRuntime } from '../game/runtime';
import type { SyncController } from '../game/sync';
import { GmWindow } from './GmWindow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
beforeEach(() => localStorage.clear());

function setup(username: string | null = 'aria') {
  const api = { gmLogin: vi.fn(async () => ({ gmToken: 'g1', expiresAt: Date.now() + 600_000 })) };
  render(
    <GmWindow
      api={api as unknown as ApiClient}
      sync={{} as SyncController}
      runtime={{} as GameRuntime}
      content={content}
      username={username}
    />,
  );
  return { api };
}
const toggle = () => fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true, shiftKey: true });
const dialog = () => screen.queryByRole('dialog', { name: 'GM 工具' });
async function login() {
  toggle();
  fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: '驗證' }));
}

describe('GmWindow', () => {
  it('renders nothing by default', () => {
    const { container } = render(<div />);
    setup();
    expect(dialog()).toBeNull();
    expect(screen.queryByRole('button', { name: /GM/ })).toBeNull();
    expect(container.textContent).not.toMatch(/GM/);
  });

  it('toggles with Ctrl+Shift+backquote only', () => {
    setup();
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
    expect(dialog()).toBeNull();
    toggle();
    expect(dialog()).toBeTruthy();
    toggle();
    expect(dialog()).toBeNull();
  });

  it('opens by itself with ?gm', () => {
    window.history.replaceState(null, '', '/?gm');
    setup();
    expect(dialog()).toBeTruthy();
  });

  it('prefills the username and shows a failure message', async () => {
    const { api } = setup('aria');
    api.gmLogin.mockRejectedValueOnce(new ApiError('x', 403, 'invalid_credentials'));
    await login();
    expect((screen.getByLabelText('帳號名稱') as HTMLInputElement).value).toBe('aria');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('帳號或密碼錯誤'));
    expect(api.gmLogin).toHaveBeenCalledWith('aria', 'pw');
  });

  it('asks to retry later when rate limited', async () => {
    const { api } = setup();
    api.gmLogin.mockRejectedValueOnce(new RateLimitedError(30));
    await login();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/稍後再試/));
  });

  it('shows the four tabs after login and keeps the token out of localStorage', async () => {
    setup();
    await login();
    for (const name of ['元素', '地圖', '配方表', '玩家']) {
      expect(await screen.findByRole('tab', { name })).toBeTruthy();
    }
    expect(JSON.stringify({ ...localStorage })).not.toContain('g1');
  });

  it('returns to the login form when the token expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    setup();
    toggle();
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '驗證' }));
    });
    expect(screen.getByRole('tab', { name: '元素' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(700_000);
    });
    expect(screen.getByRole('alert').textContent).toBe('GM 驗證已過期，請重新驗證');
    expect(screen.getByRole('button', { name: '驗證' })).toBeTruthy();
  });

  it('treats GmExpiredError as an expired token', async () => {
    const { api } = setup();
    api.gmLogin.mockRejectedValueOnce(new GmExpiredError());
    await login();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('GM 驗證已過期，請重新驗證'));
  });

  it('survives a throwing localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setup();
    toggle();
    expect(dialog()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(dialog()).toBeTruthy();
  });

  it('writes the position to ig.gmWindow when dragged', () => {
    setup();
    toggle();
    const bar = screen.getByTestId('gm-titlebar');
    fireEvent.pointerDown(bar, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 160, clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 160, clientY: 130, pointerId: 1 });
    const saved = JSON.parse(localStorage.getItem('ig.gmWindow') ?? 'null');
    expect(typeof saved.x).toBe('number');
    expect(typeof saved.y).toBe('number');
  });

  it('minimises, remembers it, and closes with the close button', () => {
    setup();
    toggle();
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(JSON.parse(localStorage.getItem('ig.gmWindow') ?? '{}').min).toBe(true);
    expect(screen.queryByLabelText('密碼')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(dialog()).toBeNull();
  });
});
