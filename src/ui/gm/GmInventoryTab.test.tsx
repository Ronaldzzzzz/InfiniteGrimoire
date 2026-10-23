// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../../engine/content';
import { GmExpiredError, type ActionResult } from '../../game/api';
import type { SyncController } from '../../game/sync';
import { fakeRuntime } from '../test-runtime';
import { GmInventoryTab } from './GmInventoryTab';

afterEach(cleanup);

function setup(reply: () => Promise<ActionResult | null> = async () => ({ kind: 'gm' })) {
  const runtime = fakeRuntime({ inventory: { 'el:fire:1': 5, 'mat:ember_core': 2 } });
  const action = vi.fn(reply);
  const sync = { action } as unknown as SyncController;
  const onExpired = vi.fn();
  render(<GmInventoryTab ctx={{ token: 'g1', onExpired }} sync={sync} runtime={runtime} content={content} />);
  return { runtime, action, onExpired };
}
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('GmInventoryTab', () => {
  it('lists the 25 element cells and every material and key item, held or not', () => {
    setup();
    expect(input('初階火').value).toBe('5');
    expect(input('神階水').value).toBe('0');
    expect(screen.getAllByRole('spinbutton')).toHaveLength(25 + Object.keys(content.materials).length + Object.keys(content.keyItems).length);
    for (const m of Object.values(content.materials)) expect(screen.getByLabelText(m.name)).toBeTruthy();
    for (const k of Object.values(content.keyItems)) expect(screen.getByLabelText(k.name)).toBeTruthy();
    expect(input(content.materials['mat:ember_core']!.name).value).toBe('2');
  });

  it('sends only the changed cells on 套用 and says 已套用', async () => {
    const { action } = setup();
    fireEvent.change(input('初階火'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: '中階風 ＋1' }));
    fireEvent.click(screen.getByRole('button', { name: '中階風 ＋1' }));
    fireEvent.click(screen.getByRole('button', { name: '中階雷 －1' })); // already 0: no change
    fireEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('已套用'));
    expect(action).toHaveBeenCalledWith('gmInventory', { gmToken: 'g1', items: { 'el:fire:1': 120, 'el:wind:2': 2 } });
  });

  it('clamps typed values to 0..999999 integers', async () => {
    const { action } = setup();
    fireEvent.change(input('初階火'), { target: { value: '1234567' } });
    fireEvent.change(input('初階風'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action).toHaveBeenCalledWith('gmInventory', { gmToken: 'g1', items: { 'el:fire:1': 999999 } });
  });

  it('disables 套用 while sending and when nothing changed', async () => {
    let done: (r: ActionResult | null) => void = () => {};
    setup(() => new Promise((r) => (done = r)));
    const apply = screen.getByRole('button', { name: '套用' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(input('初階火'), { target: { value: '9' } });
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect((screen.getByRole('button', { name: /處理中/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => done({ kind: 'gm' }));
    expect(screen.getByRole('status').textContent).toBe('已套用');
  });

  it('shows what the server state now holds after applying', async () => {
    const runtimeRef: { current: ReturnType<typeof fakeRuntime> | null } = { current: null };
    const { runtime } = setup(async () => {
      runtimeRef.current!.set({ game: { inventory: { 'el:fire:1': 7 } } });
      return { kind: 'gm' };
    });
    runtimeRef.current = runtime;
    fireEvent.change(input('初階火'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('已套用'));
    expect(input('初階火').value).toBe('7');
    expect(input(content.materials['mat:ember_core']!.name).value).toBe('0');
  });

  it('asks to retry when busy and calls onExpired on gm_expired', async () => {
    const { action, onExpired } = setup(async () => null);
    fireEvent.change(input('初階火'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('存檔已同步，請再試一次'));
    action.mockRejectedValueOnce(new GmExpiredError());
    fireEvent.click(screen.getByRole('button', { name: '套用' }));
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});
