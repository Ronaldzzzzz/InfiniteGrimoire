// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import { createInitialState } from '../engine/persist';
import type { GameRuntime, Snapshot } from '../game/runtime';
import type { ActionResult, ApiClient } from '../game/api';
import { craftedId, resolveSpell } from '../engine/spells';
import type { SyncController } from '../game/sync';
import { App } from './App';

vi.mock('./BattleCanvas', () => ({ BattleCanvas: () => null }));
afterEach(cleanup);

function setup(inventory: Record<string, number> = { 'el:fire:1': 3, 'el:wind:1': 1 }, learned = ['mana_bolt']) {
  const game = { ...createInitialState(content), inventory, learned };
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending: false };
  const runtime = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    equip: vi.fn(),
    travel: vi.fn(),
    upgrade: vi.fn(() => true),
  } as unknown as GameRuntime;
  let reply: (r: ActionResult | null) => void = () => {};
  const sync = {
    status: 'online',
    onStatus: () => () => {},
    synthesize: vi.fn(() => new Promise<ActionResult | null>((r) => (reply = r))),
    action: vi.fn(async () => null),
    uploadNow: vi.fn(async () => {}),
  } as unknown as SyncController;
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username: null, sessions: 1 })),
    bind: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  } as unknown as ApiClient;
  render(<App runtime={runtime} sync={sync} content={content} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
  return { runtime, sync, reply: (r: ActionResult | null) => reply(r) };
}

const slotTexts = () =>
  screen.getAllByRole('button').filter((b) => b.classList.contains('slot')).map((b) => b.textContent);

describe('App layout', () => {
  it('opens the account dialog from the top bar', async () => {
    setup();
    // the first full App render plus the mocked account lookup can pass 1 s when the suite runs under load
    const slow = { timeout: 5000 };
    fireEvent.click(await screen.findByRole('button', { name: /帳號.*未綁定/ }, slow));
    expect(await screen.findByRole('dialog', { name: '帳號' }, slow)).toBeTruthy();
  });

  it('has no synthesis / grimoire / map tabs', () => {
    setup();
    expect(screen.queryByRole('button', { name: '魔導書' })).toBeNull();
    expect(screen.queryByRole('button', { name: '地圖' })).toBeNull();
    // the grimoire column switches between the tree and the notebook
    expect(screen.getByRole('tab', { name: '技能樹' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '魔法筆記' }));
    expect(screen.getByText(/還沒有自創魔法/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '合成' })).toBeTruthy(); // the synth action button, not a tab
  });

  it('puts a clicked element cell into the first empty slot, then the next one', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    expect(slotTexts()).toEqual(['初階火', '空']);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(slotTexts()).toEqual(['初階火', '初階風']);
  });

  it('keeps the slots when an element is upgraded', () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '升階火' }));
    expect(runtime.upgrade).toHaveBeenCalledWith('fire', 1);
    expect(slotTexts()).toEqual(['初階火', '空']);
  });

  it('shows a locked spell hint next to the slots, and clears it when a learned spell is clicked', () => {
    setup();
    const hint = content.spells.fireball!.hint;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${content.spells.fireball!.name}（未學會）`) }));
    expect(screen.getByLabelText('殘卷線索').textContent).toContain(hint);
    fireEvent.click(screen.getByRole('button', { name: content.spells.mana_bolt!.name }));
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('also shows the hint in the grimoire node details (narrow screens stack the grimoire below the slots)', () => {
    setup();
    const hint = content.spells.fireball!.hint;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${content.spells.fireball!.name}（未學會）`) }));
    expect(screen.getByRole('group', { name: '魔法操作' }).textContent).toContain(hint);
  });

  it('a new synthesis result is equipped after the reply', async () => {
    const id = craftedId('fireball', 'wind_blade');
    const { runtime, reply } = setup({ 'el:fire:1': 3 }, ['mana_bolt', 'fireball', 'wind_blade']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.change(screen.getByRole('combobox', { name: '放入魔法' }), { target: { value: 'wind_blade' } });
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    expect(runtime.equip).not.toHaveBeenCalled();
    reply({ kind: 'learned', spellId: id, crafted: true });
    await waitFor(() => expect(runtime.equip).toHaveBeenCalledWith(id));
    const banner = screen.getByRole('status', { name: '新發現' });
    expect(banner.textContent).toContain('新發現！');
    expect(banner.textContent).toContain(resolveSpell(id, content)!.name);
  });

  it('a known result shows 已經會了 and does not re-equip', async () => {
    const { runtime, reply } = setup({ 'el:fire:1': 3 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    reply({ kind: 'duplicate', spellId: 'fireball', refunded: ['el:fire:1'] });
    await waitFor(() => expect(screen.getByRole('status', { name: '新發現' }).textContent).toContain('已經會了'));
    expect(runtime.equip).not.toHaveBeenCalled();
  });
});
