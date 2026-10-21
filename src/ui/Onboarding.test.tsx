// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { Onboarding } from './Onboarding';

afterEach(cleanup);

function setup() {
  const result = { token: 't', state: createInitialState(gameData), revision: 1 };
  const api = { createGuest: vi.fn(async () => result) };
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
