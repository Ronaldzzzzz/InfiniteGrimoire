// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { ApiError, NetworkError } from '../game/api';
import { AccountDialog } from './AccountDialog';

afterEach(cleanup);

function setup(username: string | null) {
  const loginResult = { token: 't2', state: createInitialState(gameData), revision: 1 };
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username, sessions: 2 })),
    bind: vi.fn(async (u: string) => ({ username: u })),
    changePassword: vi.fn(async () => {}),
    logoutOthers: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    login: vi.fn(async () => loginResult),
  };
  const props = {
    onClose: vi.fn(),
    onAccountChange: vi.fn(),
    onSwitched: vi.fn(),
    onLoggedOut: vi.fn(),
    beforeLogout: vi.fn(async () => {}),
  };
  render(<AccountDialog api={api} displayName="Aria" learnedCount={3} {...props} />);
  return { api, loginResult, ...props };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AccountDialog (guest)', () => {
  it('binds an account after checking the form', async () => {
    const { api, onAccountChange } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    type('帳號名稱', 'aria_1');
    type('密碼', 'password1');
    type('確認密碼', 'password2');
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    expect(screen.getByRole('alert').textContent).toBe('兩次輸入的密碼不一致');
    expect(api.bind).not.toHaveBeenCalled();
    type('確認密碼', 'password1');
    api.getAccount.mockResolvedValueOnce({ displayName: 'Aria', username: 'aria_1', sessions: 1 });
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    await waitFor(() => expect(onAccountChange).toHaveBeenCalledWith({ displayName: 'Aria', username: 'aria_1', sessions: 1 }));
    expect(api.bind).toHaveBeenCalledWith('aria_1', 'password1');
    expect(await screen.findByText('aria_1')).toBeTruthy();
  });

  it('shows the taken error', async () => {
    const { api } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    api.bind.mockRejectedValueOnce(new ApiError('x', 409, 'taken'));
    type('帳號名稱', 'aria_1');
    type('密碼', 'password1');
    type('確認密碼', 'password1');
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('這個帳號名稱已被使用'));
  });

  it('warns before switching to another account, then logs in', async () => {
    const { api, onSwitched, loginResult } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    fireEvent.click(screen.getByRole('button', { name: '登入其他帳號' }));
    expect(screen.getByText(/Aria/).textContent).toContain('已學 3 個魔法');
    expect(screen.getByText(/無法取回/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '我了解，繼續登入' }));
    type('帳號名稱', 'other_1');
    type('密碼', 'password1');
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith(loginResult));
    expect(api.login).toHaveBeenCalledWith('other_1', 'password1');
  });
});

describe('AccountDialog (bound)', () => {
  it('shows the account and changes the password', async () => {
    const { api } = setup('aria_1');
    expect(await screen.findByText('aria_1')).toBeTruthy();
    expect(screen.getByText(/2 台裝置/)).toBeTruthy();
    type('目前密碼', 'password1');
    type('新密碼', 'password2');
    type('確認新密碼', 'password2');
    fireEvent.click(screen.getByRole('button', { name: '更改密碼' }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('password1', 'password2'));
    expect(await screen.findByText('密碼已更新，其他裝置已登出')).toBeTruthy();
  });

  it('logs out other devices', async () => {
    const { api } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.click(screen.getByRole('button', { name: '登出其他裝置' }));
    await waitFor(() => expect(api.logoutOthers).toHaveBeenCalled());
    expect(api.getAccount).toHaveBeenCalledTimes(2);
  });

  it('uploads, then logs out this device', async () => {
    const { api, beforeLogout, onLoggedOut } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.click(screen.getByRole('button', { name: '登出這台裝置' }));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
    expect(beforeLogout).toHaveBeenCalled();
    expect(beforeLogout.mock.invocationCallOrder[0]!).toBeLessThan(api.logout.mock.invocationCallOrder[0]!);
  });

  it('keeps the session when logout fails on the network', async () => {
    const { api, onLoggedOut } = setup('aria_1');
    await screen.findByText('aria_1');
    api.logout.mockRejectedValueOnce(new NetworkError('down'));
    fireEvent.click(screen.getByRole('button', { name: '登出這台裝置' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('連線異常，請稍後再試'));
    expect(onLoggedOut).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
