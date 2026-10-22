// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { Onboarding } from './Onboarding';

afterEach(cleanup);

function setup() {
  const result = { token: 't', state: createInitialState(gameData), revision: 1 };
  const api = { createGuest: vi.fn(async () => result), login: vi.fn(async () => result) };
  const onDone = vi.fn();
  render(<Onboarding api={api} onDone={onDone} />);
  const input = screen.getByLabelText('顯示名稱');
  const submit = () => fireEvent.click(screen.getByRole('button', { name: '開始冒險' }));
  return { api, onDone, input, submit, result };
}

describe('Onboarding', () => {
  it('does not submit an empty name', () => {
    const { api, input, submit } = setup();
    fireEvent.change(input, { target: { value: '   ' } });
    submit();
    expect(api.createGuest).not.toHaveBeenCalled();
  });

  it('does not submit a name over 16 characters', () => {
    const { api, input, submit } = setup();
    fireEvent.change(input, { target: { value: 'a'.repeat(17) } });
    submit();
    expect(api.createGuest).not.toHaveBeenCalled();
  });

  it('creates a guest with a valid name', async () => {
    const { api, onDone, input, submit, result } = setup();
    fireEvent.change(input, { target: { value: ' 艾莉亞 ' } });
    submit();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(result));
    expect(api.createGuest).toHaveBeenCalledWith('艾莉亞');
  });
});

describe('Onboarding login', () => {
  function openLogin() {
    const ctx = setup();
    fireEvent.click(screen.getByRole('button', { name: '已有帳號？登入' }));
    const user = screen.getByLabelText('帳號名稱');
    const pass = screen.getByLabelText('密碼');
    const submit = () => fireEvent.click(screen.getByRole('button', { name: '登入' }));
    return { ...ctx, user, pass, submitLogin: submit };
  }

  it('logs in with a username and password', async () => {
    const { api, onDone, user, pass, submitLogin, result } = openLogin();
    fireEvent.change(user, { target: { value: 'mage_1' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(result));
    expect(api.login).toHaveBeenCalledWith('mage_1', 'password1');
  });

  it('checks the format before calling the server', () => {
    const { api, user, pass, submitLogin } = openLogin();
    fireEvent.change(user, { target: { value: 'ab' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    expect(screen.getByRole('alert').textContent).toContain('3～20');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows the server errors in Chinese', async () => {
    const { api, user, pass, submitLogin } = openLogin();
    const { ApiError, RateLimitedError } = await import('../game/api');
    api.login.mockRejectedValueOnce(new ApiError('x', 403, 'invalid_credentials'));
    fireEvent.change(user, { target: { value: 'mage_1' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('帳號或密碼錯誤'));
    api.login.mockRejectedValueOnce(new RateLimitedError(61));
    submitLogin();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('嘗試次數過多，請 2 分鐘後再試'));
  });

  it('can go back to creating a new character', () => {
    openLogin();
    fireEvent.click(screen.getByRole('button', { name: '建立新角色' }));
    expect(screen.getByLabelText('顯示名稱')).toBeTruthy();
  });
});
