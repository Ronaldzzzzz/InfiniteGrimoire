// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState, type GameState } from '../engine/state';
import { readSpellSort, SPELL_SORT_KEY, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { useState } from 'react';
import type { SpellSort } from './picker-data';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(gameData), learned: ['mana_bolt', 'explosion', 'fireball', 'fire_whirl'], equipped: 'fireball', ...patch };
}

function Harness({ g, onEquip }: { g: GameState; onEquip: (id: string) => void }) {
  const [sort, setSort] = useState<SpellSort>('element');
  return <SpellPicker game={g} data={gameData} sort={sort} onSortChange={setSort} onEquip={onEquip} />;
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));

describe('SpellPicker', () => {
  it('shows name and tier on the button and grouped rows with tier, pattern and attack', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    const button = screen.getByRole('button', { name: '裝備魔法' });
    expect(button.textContent).toContain('火球術');
    expect(button.textContent).toContain('Lv.2');
    fireEvent.click(button);
    expect(optionNames()).toEqual(['魔力彈', '火球術', '爆炎', '火焰旋風']);
    const row = screen.getByRole('option', { name: '爆炎' });
    expect(row.textContent).toContain('Lv.5');
    expect(row.textContent).toContain('擴散');
    expect(row.textContent).toContain('攻 80');
  });

  it('shows the effect marks for the current zone', () => {
    render(<Harness g={game({ currentZone: 'mist_meadow' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '爆炎' }).textContent).toContain('掉落 56%');
    cleanup();
    render(<Harness g={game({ currentZone: 'ash_volcano' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '魔力彈' }).textContent).toContain('對魔王無效');
  });

  it('switches to tier order with the header toggle', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('button', { name: /排序/ }));
    expect(optionNames()).toEqual(['火焰旋風', '爆炎', '火球術', '魔力彈']);
  });

  it('equips on click', () => {
    const onEquip = vi.fn();
    render(<Harness g={game()} onEquip={onEquip} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('option', { name: '爆炎' }));
    expect(onEquip).toHaveBeenCalledWith('explosion');
  });
});

describe('spell sort preference', () => {
  it('round-trips through localStorage and defaults to element', () => {
    expect(readSpellSort()).toBe('element');
    writeSpellSort('tier');
    expect(window.localStorage.getItem(SPELL_SORT_KEY)).toBe('tier');
    expect(readSpellSort()).toBe('tier');
  });

  it('falls back to the default when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSpellSort()).toBe('element');
    spy.mockRestore();
  });
});

describe('ZonePicker', () => {
  const g = game({ currentZone: 'thunder_gorge', unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'] });

  it('shows the current zone and tier range on the button', () => {
    render(<ZonePicker game={g} data={gameData} onTravel={() => {}} />);
    const button = screen.getByRole('button', { name: '選擇地點' });
    expect(button.textContent).toContain('雷鳴峽谷');
    expect(button.textContent).toContain('Lv.3');
  });

  it('lists boss, status and unlock text; locked and current zones are not selectable', () => {
    const onTravel = vi.fn();
    render(<ZonePicker game={g} data={gameData} onTravel={onTravel} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇地點' }));
    const locked = screen.getByRole('option', { name: '灰燼火山' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.textContent).toContain('擊敗暴風巨鵬後解鎖');
    expect(within(screen.getByRole('option', { name: '迷霧草原' })).getByText(/迷霧雄鹿/)).toBeTruthy();
    expect(screen.getByRole('option', { name: '迷霧草原' }).textContent).toContain('已擊敗魔王');
    fireEvent.click(locked);
    fireEvent.click(screen.getByRole('option', { name: '雷鳴峽谷' }));
    expect(onTravel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: '迷霧草原' }));
    expect(onTravel).toHaveBeenCalledWith('mist_meadow');
  });
});
