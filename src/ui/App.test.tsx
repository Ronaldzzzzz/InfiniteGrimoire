// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameRuntime } from '../game/runtime';
import type { ActionResult, ApiClient } from '../game/api';
import { craftedId, resolveSpell } from '../engine/spells';
import type { SyncController } from '../game/sync';
import { App } from './App';
import { fakeRuntime } from './test-runtime';

vi.mock('./BattleCanvas', () => ({ BattleCanvas: () => null }));
afterEach(cleanup);

function setup(inventory: Record<string, number> = { 'el:fire:1': 3, 'el:wind:1': 1 }, learned = ['mana_bolt'], actionResult: ActionResult | null = null) {
  const fake = fakeRuntime({ inventory, learned });
  const runtime = Object.assign(fake, { travel: vi.fn(), upgrade: vi.fn(() => true) }) as unknown as GameRuntime;
  let reply: (r: ActionResult | null) => void = () => {};
  const sync = {
    status: 'online',
    onStatus: () => () => {},
    synthesize: vi.fn(() => new Promise<ActionResult | null>((r) => (reply = r))),
    action: vi.fn(async () => actionResult),
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
  return { runtime, sync, reply: (r: ActionResult | null) => reply(r), pending: (p: boolean) => act(() => fake.set({ synthPending: p })) };
}

const slotTexts = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.classList.contains('altar-side'))
    .map((b) => b.querySelector('.altar-name')?.textContent ?? '空');

const placeFromTree = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  fireEvent.click(within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放入合成' }));
};

describe('App layout', () => {
  it('using a key item from the battle view switches back to the tree tab', async () => {
    setup({ 'key:storm_heart': 1 }, ['mana_bolt'], { kind: 'revealed', region: 'outer' });
    fireEvent.click(screen.getByRole('tab', { name: '魔法筆記' }));
    expect(screen.getByRole('tab', { name: '魔法筆記' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /使用風暴之心/ }));
    await waitFor(() => expect(screen.getByRole('tab', { name: '技能樹' }).getAttribute('aria-selected')).toBe('true'));
  });

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
    expect(slotTexts()).toEqual(['火・初階', '空']);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(slotTexts()).toEqual(['火・初階', '風・初階']);
  });

  it('keeps the slots when an element is upgraded', () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '升階火' }));
    expect(runtime.upgrade).toHaveBeenCalledWith('fire', 1);
    expect(slotTexts()).toEqual(['火・初階', '空']);
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
    placeFromTree(content.spells.wind_blade!.name);
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    expect(runtime.equip).not.toHaveBeenCalled();
    reply({ kind: 'learned', spellId: id, crafted: true });
    await waitFor(() => expect(runtime.equip).toHaveBeenCalledWith(id), { timeout: 3000 });
    const banner = screen.getByRole('status', { name: '合成結果' });
    expect(banner.textContent).toContain('自創魔法！');
    expect(banner.textContent).toContain(resolveSpell(id, content)!.name);
  });

  it('a known result shows 已經會了 and does not re-equip', async () => {
    const { runtime, reply } = setup({ 'el:fire:1': 3 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    reply({ kind: 'duplicate', spellId: 'fireball', refunded: ['el:fire:1'] });
    await waitFor(() => expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('已經會了'), { timeout: 3000 });
    expect(runtime.equip).not.toHaveBeenCalled();
  });

  it('while the synthesis is pending nothing can be placed; after the reveal both sides are empty', async () => {
    const { runtime, sync, reply, pending } = setup({ 'el:fire:1': 3, 'el:wind:1': 1 }, ['mana_bolt', 'fireball', 'wind_blade']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    placeFromTree(content.spells.wind_blade!.name);
    expect(slotTexts()).toEqual(['火・初階', content.spells.wind_blade!.name]);
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    expect(sync.synthesize).toHaveBeenCalled();
    pending(true);
    // element cell, bubble button and double-click all do nothing (and no toast)
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect((within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放入合成' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect(slotTexts()).toEqual(['火・初階', content.spells.wind_blade!.name]);
    expect(screen.queryByText(`已放入合成台：${content.spells.fireball!.name}`)).toBeNull();
    pending(false);
    reply({ kind: 'learned', spellId: craftedId('fireball', 'wind_blade'), crafted: true });
    await waitFor(() => expect(slotTexts()).toEqual(['空', '空']), { timeout: 3000 });
    expect(runtime.equip).toHaveBeenCalled();
  });

  it('while pending with an empty side left, element cells and the tree still place nothing', () => {
    const { pending } = setup({ 'el:fire:1': 3, 'el:wind:1': 1 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    pending(true);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(slotTexts()).toEqual(['火・初階', '空']);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect((within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放入合成' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect(slotTexts()).toEqual(['火・初階', '空']);
    expect(screen.queryByText(/已放入合成台/)).toBeNull();
  });

  it('has no 放入魔法 combobox and no 嘗試紀錄 heading any more', () => {
    setup();
    expect(screen.queryByRole('combobox', { name: '放入魔法' })).toBeNull();
    expect(screen.queryByText('嘗試紀錄')).toBeNull();
  });
});
