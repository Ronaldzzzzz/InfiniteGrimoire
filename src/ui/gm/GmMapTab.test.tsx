// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../../engine/content';
import { GmExpiredError } from '../../game/api';
import type { SyncController } from '../../game/sync';
import { GmMapTab } from './GmMapTab';

afterEach(cleanup);

function setup() {
  const action = vi.fn(async () => ({ kind: 'gm' as const }));
  const onExpired = vi.fn();
  render(<GmMapTab ctx={{ token: 'g1', onExpired }} sync={{ action } as unknown as SyncController} content={content} />);
  return { action, onExpired };
}

describe('GmMapTab', () => {
  it.each([
    ['開放所有地點', 'unlock_all'],
    ['散開所有迷霧', 'reveal_all'],
    ['目前地點直達魔王關', 'boss_ready'],
  ])('%s sends op %s', async (label, op) => {
    const { action } = setup();
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(action).toHaveBeenCalledWith('gmZones', { gmToken: 'g1', op }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^已/));
  });

  it('calls onExpired when the GM token is gone', async () => {
    const { action, onExpired } = setup();
    action.mockRejectedValueOnce(new GmExpiredError());
    fireEvent.click(screen.getByRole('button', { name: '開放所有地點' }));
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});
