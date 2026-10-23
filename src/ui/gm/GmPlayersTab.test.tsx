// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, GmExpiredError, type ApiClient } from '../../game/api';
import { GmPlayersTab } from './GmPlayersTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const api = { gmResetPassword: vi.fn(async (_t: string, _u: string, _p: string) => {}) };
  const onExpired = vi.fn();
  render(<GmPlayersTab ctx={{ token: 'g1', onExpired }} api={api as unknown as Pick<ApiClient, 'gmResetPassword'>} />);
  return { api, onExpired };
}
const reset = (name: string) => {
  fireEvent.change(screen.getByLabelText('玩家帳號名稱'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: '重設密碼' }));
};

describe('GmPlayersTab', () => {
  it('shows the plain temporary password it sent to the api once', async () => {
    const { api } = setup();
    reset('bob');
    const out = await screen.findByTestId('gm-temp-password');
    expect(out.textContent).toMatch(/^[A-Za-z2-9]{12}$/);
    expect(api.gmResetPassword).toHaveBeenCalledWith('g1', 'bob', out.textContent);
    expect(screen.getByRole('button', { name: '複製' })).toBeTruthy();
  });

  it('copies with the clipboard and selects the text when that fails', async () => {
    setup();
    const writeText = vi.fn(async (_s: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    reset('bob');
    const out = await screen.findByTestId('gm-temp-password');
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(out.textContent));
    await screen.findByText('已複製');

    writeText.mockRejectedValueOnce(new Error('denied'));
    const select = vi.spyOn(window.getSelection()!, 'selectAllChildren');
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(select).toHaveBeenCalledWith(out));
  });

  it('says the account does not exist on 404', async () => {
    const { api } = setup();
    api.gmResetPassword.mockRejectedValueOnce(new ApiError('x', 404, 'not_found'));
    reset('nobody');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('找不到這個帳號'));
    expect(screen.queryByTestId('gm-temp-password')).toBeNull();
  });

  it('refuses itself and GM accounts on 403 not_allowed', async () => {
    const { api } = setup();
    api.gmResetPassword.mockRejectedValueOnce(new ApiError('x', 403, 'not_allowed'));
    reset('aria');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('不能重設自己或 GM 帳號'));
  });

  it('calls onExpired on gm_expired', async () => {
    const { api, onExpired } = setup();
    api.gmResetPassword.mockRejectedValueOnce(new GmExpiredError());
    reset('bob');
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});
