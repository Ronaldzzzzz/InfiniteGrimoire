// @vitest-environment jsdom
import { memo, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameRuntime } from '../game/runtime';
import type { ActionResult, ApiClient } from '../game/api';
import { resolveSpell } from '../engine/spells';
import type { SyncController } from '../game/sync';
import { App } from './App';
import { fakeRuntime } from './test-runtime';

vi.mock('./BattleCanvas', () => ({ BattleCanvas: () => null }));
// jsdom has no WebGL: the parchment's particle layer is a no-op here
vi.mock('../render/circle-fx', () => ({ CircleFx: class { charge() {} hold() {} reveal() {} stop() {} destroy() {} } }));
// counts a render only when the props changed: the spy sits behind the same shallow comparison the real component has
const renders = vi.hoisted(() => ({ parchment: vi.fn(), keys: vi.fn() }));
vi.mock('./CircleTable', async (orig) => {
  const actual = await orig<typeof import('./CircleTable')>();
  return {
    ...actual,
    CircleTable: memo((props: ComponentProps<typeof actual.CircleTable>) => {
      renders.parchment();
      return <actual.CircleTable {...props} />;
    }),
  };
});
vi.mock('./KeyItemBar', async (orig) => {
  const actual = await orig<typeof import('./KeyItemBar')>();
  return {
    ...actual,
    KeyItemBar: memo((props: ComponentProps<typeof actual.KeyItemBar>) => {
      renders.keys();
      return <actual.KeyItemBar {...props} />;
    }),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(inventory: Record<string, number> = { 'el:fire:1': 3, 'el:wind:1': 1 }, learned = ['mana_bolt'], actionResult: ActionResult | null = null) {
  const fake = fakeRuntime({ inventory, learned });
  const runtime = Object.assign(fake, { travel: vi.fn(), upgrade: vi.fn(() => true) }) as unknown as GameRuntime;
  let reply: (r: ActionResult | null) => void = () => {};
  const sync = {
    status: 'online',
    onStatus: () => () => {},
    onOfflineReport: () => () => {},
    synthesizeCircle: vi.fn(() => new Promise<ActionResult | null>((r) => (reply = r))),
    action: vi.fn(async () => actionResult),
    uploadNow: vi.fn(async () => {}),
  } as unknown as SyncController;
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username: null, sessions: 1 })),
    recentDiscoveries: vi.fn(async () => []),
    bind: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  } as unknown as ApiClient;
  render(<App runtime={runtime} sync={sync} content={content} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
  return { runtime, sync, reply: (r: ActionResult | null) => reply(r), pending: (p: boolean) => act(() => fake.set({ synthPending: p })) };
}

/** core and ring-1 slot labels, e.g. ['核心：火・初階…', '一環 第1格：空…'] trimmed to the part before （ */
const circleTexts = () =>
  screen
    .getAllByRole('button')
    .filter((b) => b.classList.contains('circle-slot') && !b.classList.contains('ring2'))
    .map((b) => b.getAttribute('aria-label')!.replace(/（.*$/, ''));
const coreText = () => circleTexts()[0];
const addBolt = () => {
  fireEvent.click(screen.getByRole('button', { name: /^一環符文/ }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^射/ }));
};
/** presses 合成, answers it and lets the progress ring fill */
async function inject(reply: (r: ActionResult | null) => void, result: ActionResult, ms: number) {
  fireEvent.click(screen.getByRole('button', { name: '合成' }));
  reply(result);
  await act(async () => {});
  act(() => vi.advanceTimersByTime(ms));
}

const placeFromTree = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  fireEvent.click(within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放到牛皮紙上' }));
};

describe('App layout', () => {
  it('the normal game screen shows no GM text and no GM button', async () => {
    setup();
    await screen.findByRole('button', { name: /帳號.*未綁定/ }, { timeout: 5000 }); // after the account lookup settles
    expect(document.body.textContent).not.toMatch(/GM/);
    expect(screen.queryByRole('button', { name: /GM/ })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'GM 工具' })).toBeNull();
  });

  it('an in-tab account switch (new runtime) reloads the account and drops the GM token', async () => {
    const accounts = [
      { displayName: 'GM', username: 'gm_one', sessions: 1 },
      { displayName: 'Other', username: 'other_mage', sessions: 1 },
    ];
    let current = 0;
    const api = {
      getAccount: vi.fn(async () => accounts[current]),
      recentDiscoveries: vi.fn(async () => []),
      gmLogin: vi.fn(async () => ({ gmToken: 'g1', expiresAt: Date.now() + 600_000 })),
      gmResetPassword: vi.fn(async () => {}),
    } as unknown as ApiClient;
    const sync = { status: 'online', onStatus: () => () => {}, onOfflineReport: () => () => {}, action: vi.fn(), uploadNow: vi.fn(async () => {}) } as unknown as SyncController;
    const runtimeA = fakeRuntime() as unknown as GameRuntime;
    const { rerender } = render(<App runtime={runtimeA} sync={sync} content={content} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect((screen.getByLabelText('帳號名稱') as HTMLInputElement).value).toBe('gm_one'));
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '驗證' }));
    expect(await screen.findByRole('tab', { name: '玩家' })).toBeTruthy();

    current = 1;
    const runtimeB = fakeRuntime() as unknown as GameRuntime;
    rerender(<App runtime={runtimeB} sync={sync} content={content} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
    await waitFor(() => expect((screen.getByLabelText('帳號名稱') as HTMLInputElement).value).toBe('other_mage'));
    expect(screen.queryByRole('tab', { name: '玩家' })).toBeNull();
    expect(screen.getByRole('button', { name: '驗證' })).toBeTruthy();
    expect(api.getAccount).toHaveBeenCalledTimes(2);
  });

  it('a new runtime drops the veil', () => {
    const FW = 'm:fire.2.----w.-----.bolt';
    const sync = { status: 'online', onStatus: () => () => {}, onOfflineReport: () => () => {}, synthesizeCircle: vi.fn(() => new Promise(() => {})), action: vi.fn(), uploadNow: vi.fn(async () => {}) } as unknown as SyncController;
    const api = { getAccount: vi.fn(async () => ({ displayName: 'A', username: null, sessions: 1 })), recentDiscoveries: vi.fn(async () => []) } as unknown as ApiClient;
    const a = fakeRuntime({ inventory: { 'el:fire:1': 3, 'el:wind:1': 1 }, learned: ['mana_bolt'] }) as unknown as GameRuntime;
    const ui = (rt: GameRuntime) => <App runtime={rt} sync={sync} content={content} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />;
    const { rerender } = render(ui(a));
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    addBolt();
    fireEvent.click(screen.getByRole('button', { name: '合成' }));
    expect(sync.synthesizeCircle).toHaveBeenCalled();
    // the veil is up: the star map shows only what was learned before the charge
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(1);
    const b = fakeRuntime({ learned: ['mana_bolt', FW] }) as unknown as GameRuntime;
    rerender(ui(b));
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(2);
  });

  it('puts the battle strip after the main panels, with a stage bar and without the old boss counter', () => {
    setup();
    const strip = document.querySelector('.battle-strip')!;
    const main = document.querySelector('.main')!;
    expect(strip).toBeTruthy();
    expect(main.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(strip as HTMLElement).getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText(/魔王出現還差/)).toBeNull();
  });

  it('the parchment and the key item bar do not re-render when only unrelated inventory changes', () => {
    const { runtime } = setup();
    const parchment = renders.parchment.mock.calls.length;
    const keys = renders.keys.mock.calls.length;
    act(() => (runtime as unknown as ReturnType<typeof fakeRuntime>).set({ game: { inventory: { 'el:fire:1': 3, 'el:wind:1': 1, 'el:earth:1': 5 } } }));
    expect(renders.parchment.mock.calls.length).toBe(parchment);
    expect(renders.keys.mock.calls.length).toBe(keys);
  });

  it('opens the account dialog from the top bar', async () => {
    setup();
    // the first full App render plus the mocked account lookup can pass 1 s when the suite runs under load
    const slow = { timeout: 5000 };
    fireEvent.click(await screen.findByRole('button', { name: /帳號.*未綁定/ }, slow));
    expect(await screen.findByRole('dialog', { name: '帳號' }, slow)).toBeTruthy();
  });

  it('has no synthesis / grimoire / map tabs; the parchment replaces the altar', () => {
    setup();
    expect(screen.queryByRole('button', { name: '魔導書' })).toBeNull();
    expect(screen.queryByRole('button', { name: '地圖' })).toBeNull();
    expect(screen.getByRole('tab', { name: '星圖' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '魔法筆記' }));
    expect(screen.getByText(/還沒有自創魔法/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '合成' })).toBeTruthy(); // the synth action button, not a tab
    expect(screen.getByRole('region', { name: '魔法陣' })).toBeTruthy();
    expect(document.querySelector('.altar')).toBeNull();
  });

  it('switches between the star map and the notebook without clearing the circle; the old tree tabs are gone', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    for (const name of ['魔法筆記', '星圖']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(screen.getByRole('tab', { name }).getAttribute('aria-selected')).toBe('true');
      expect(coreText()).toBe('核心：火・初階');
    }
    expect(screen.queryByRole('tab', { name: '五元素' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '光與暗' })).toBeNull();
    expect(screen.getByRole('group', { name: '魔導書星圖' })).toBeTruthy();
  });

  it('puts a clicked element cell into the core, then the first open ring slot', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    expect(coreText()).toBe('核心：火・初階');
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(circleTexts()[1]).toBe('一環 第1格：風・初階');
  });

  it('keeps the circle when an element is upgraded', () => {
    const { runtime } = setup();
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階火升成中階火' }));
    expect(runtime.upgrade).toHaveBeenCalledWith('fire', 1);
    expect(coreText()).toBe('核心：火・初階');
  });

  it('放到牛皮紙上 on a spell puts its circle on the parchment', () => {
    setup({ 'el:fire:1': 3 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    fireEvent.click(within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放到牛皮紙上' }));
    expect(coreText()).toBe('核心：火・初階');
    expect(circleTexts()[2]).toBe('一環 第5格：火・初階');
    expect(screen.getByRole('button', { name: '一環符文：射' })).toBeTruthy();
  });

  const FIREWIND = 'm:fire.2.----w.-----.bolt';
  async function learnCircle() {
    vi.useFakeTimers();
    const h = setup({ 'el:fire:1': 3, 'el:wind:1': 1 }, ['mana_bolt']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    addBolt();
    await inject(h.reply, { kind: 'learned', spellId: FIREWIND, form: 'bolt' }, 3000);
    expect(screen.getByText(`裝備「${resolveSpell(FIREWIND, content)!.name}」？`)).toBeTruthy();
    return { ...h, id: FIREWIND };
  }

  it('a new circle spell is not auto-equipped; the toast asks, and 裝備 equips', async () => {
    const { runtime, sync, id } = await learnCircle();
    expect(sync.synthesizeCircle).toHaveBeenCalledWith({
      core: { element: 'fire', grade: 1 },
      ring1: [{ element: 'wind', grade: 1 }, null, null, null, null],
      ring2: [null, null, null, null, null],
      runes: ['bolt', null],
    });
    expect(runtime.equip).not.toHaveBeenCalled();
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain(resolveSpell(id, content)!.name);
    act(() => (runtime as unknown as { set: (p: unknown) => void }).set({ game: { learned: ['mana_bolt', id] } }));
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(runtime.equip).toHaveBeenCalledWith(id);
  });

  it('the toast expires after 3 s without equipping', async () => {
    const { runtime, id } = await learnCircle();
    act(() => vi.advanceTimersByTime(3100));
    expect(screen.queryByText(`裝備「${resolveSpell(id, content)!.name}」？`)).toBeNull();
    expect(runtime.equip).not.toHaveBeenCalled();
  });

  it('pressing 裝備 after the save lost that spell does not equip', async () => {
    const { runtime } = await learnCircle();
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(runtime.equip).not.toHaveBeenCalled();
  });

  it('a known result shows 已經會了, with no toast and no equip', async () => {
    vi.useFakeTimers();
    const { runtime, reply } = setup({ 'el:fire:1': 3 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    addBolt();
    await inject(reply, { kind: 'known', spellId: 'fireball', form: 'bolt' }, 3000);
    expect(screen.getByRole('status', { name: '合成結果' }).textContent).toContain('已經會了');
    expect(runtime.equip).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '裝備' })).toBeNull();
  });

  it('a rare result plays the reveal after 5 s; 裝備 equips once and the next queued reveal follows', async () => {
    vi.useFakeTimers();
    const { runtime, reply } = setup({ 'el:fire:1': 3 }, ['mana_bolt', 'worldfire', 'moontide']);
    const fire = () => screen.getByRole('button', { name: '初階火 ×3' });
    fireEvent.click(fire());
    fireEvent.click(fire());
    addBolt();
    await inject(reply, { kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } }, 3000);
    expect(screen.queryByRole('dialog', { name: '稀有魔法' })).toBeNull(); // still injecting
    act(() => vi.advanceTimersByTime(2000));
    const first = screen.getByRole('dialog', { name: '稀有魔法' });
    expect(runtime.equip).not.toHaveBeenCalled();
    expect(screen.queryByRole('status', { name: '新發現' })).toBeNull();

    // a second rare result arrives while the first is still playing
    await inject(reply, { kind: 'learned', spellId: 'moontide', form: 'bolt', rare: { first: false } }, 5000);
    expect(screen.getAllByRole('dialog', { name: '稀有魔法' })).toHaveLength(1);
    fireEvent.click(first); // to the title
    expect(first.textContent).toContain('焚世之焰');
    expect(first.textContent).toContain('全服首次發現');
    fireEvent.click(first); // background: still open
    expect(screen.getByRole('dialog', { name: '稀有魔法' })).toBe(first);
    fireEvent.click(screen.getByRole('button', { name: '裝備' }));
    expect(runtime.equip).toHaveBeenCalledTimes(1);
    expect(runtime.equip).toHaveBeenCalledWith('worldfire');
    const second = screen.getByRole('dialog', { name: '稀有魔法' });
    fireEvent.click(second);
    expect(second.textContent).toContain('滄溟月潮');
    expect(second.textContent).toContain('✦ 稀有魔法！✦');
    fireEvent.click(screen.getByRole('button', { name: '不裝備' }));
    expect(runtime.equip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: '稀有魔法' })).toBeNull();
    expect(screen.queryByRole('status', { name: '新發現' })).toBeNull();
  });

  it('while a circle is pending, element cells and 放到牛皮紙上 change nothing', () => {
    const { pending } = setup({ 'el:fire:1': 3, 'el:wind:1': 1 }, ['mana_bolt', 'fireball']);
    fireEvent.click(screen.getByRole('button', { name: '初階火 ×3' }));
    pending(true);
    fireEvent.click(screen.getByRole('button', { name: '初階風 ×1' }));
    expect(circleTexts()[1]).toBe('一環 第1格：空');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect((within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放到牛皮紙上' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(screen.getByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) }));
    expect(circleTexts()[1]).toBe('一環 第1格：空');
  });

  it('has no 放入魔法 combobox and no 嘗試紀錄 heading any more', () => {
    setup();
    expect(screen.queryByRole('combobox', { name: '放入魔法' })).toBeNull();
    expect(screen.queryByText('嘗試紀錄')).toBeNull();
  });
});
