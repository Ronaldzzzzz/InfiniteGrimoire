// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import { createInitialState } from '../engine/persist';
import { readSpellSort, SPELL_SORT_KEY, SpellPicker, writeSpellSort, ZonePicker } from './pickers';
import { useState } from 'react';
import type { SpellSort } from './picker-data';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createInitialState(content), learned: ['mana_bolt', 'flame_burst', 'fireball', 'fire_tornado'], equipped: 'fireball', ...patch };
}

function Harness({ g, onEquip }: { g: GameState; onEquip: (id: string) => void }) {
  const [sort, setSort] = useState<SpellSort>('element');
  return <SpellPicker game={g} content={content} sort={sort} onSortChange={setSort} onEquip={onEquip} />;
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));

describe('SpellPicker', () => {
  it('shows name and tier on the button and grouped rows with tier, shape and attack', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    const button = screen.getByRole('button', { name: '裝備魔法' });
    expect(button.textContent).toContain('火球');
    expect(button.textContent).toContain('Lv.2');
    fireEvent.click(button);
    expect(optionNames()).toEqual(['魔力彈', '火球', '烈焰爆發', '火焰龍捲']);
    const row = screen.getByRole('option', { name: '烈焰爆發' });
    expect(row.textContent).toContain('Lv.3');
    expect(row.textContent).toContain('飛彈');
    expect(row.textContent).toContain('攻 25');
  });

  it('shows the effect marks for the current zone', () => {
    render(<Harness g={game({ currentZone: 'mist_meadow' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '火焰龍捲' }).textContent).toContain('掉落 75%');
    cleanup();
    render(<Harness g={game({ currentZone: 'thunder_gorge' })} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    expect(screen.getByRole('option', { name: '魔力彈' }).textContent).toContain('對魔王無效');
  });

  it('switches to tier order with the header toggle', () => {
    render(<Harness g={game()} onEquip={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('button', { name: /排序/ }));
    expect(optionNames()).toEqual(['火焰龍捲', '烈焰爆發', '火球', '魔力彈']);
  });

  it('equips on click', () => {
    const onEquip = vi.fn();
    render(<Harness g={game()} onEquip={onEquip} />);
    fireEvent.click(screen.getByRole('button', { name: '裝備魔法' }));
    fireEvent.click(screen.getByRole('option', { name: '烈焰爆發' }));
    expect(onEquip).toHaveBeenCalledWith('flame_burst');
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
  const g = game({ currentZone: 'mist_meadow', currentStage: 1, unlockedZones: ['mist_meadow'], clearedStages: { mist_meadow: 2 } });

  it('shows the current zone and stage on the button', () => {
    render(<ZonePicker game={g} content={content} onTravel={() => {}} />);
    const button = screen.getByRole('button', { name: '選擇地點' });
    expect(button.textContent).toContain('迷霧草原');
    expect(button.textContent).toContain('1-1');
  });

  it('lists stages: only up to one past the cleared ones, and not the stage you are on, are selectable', () => {
    const onTravel = vi.fn();
    render(<ZonePicker game={g} content={content} onTravel={onTravel} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇地點' }));
    const stage = (n: number) => screen.getByRole('option', { name: `迷霧草原 1-${n}` });
    expect(stage(1).getAttribute('aria-disabled')).toBe('true');
    expect(stage(3).getAttribute('aria-disabled')).toBe('false');
    expect(stage(4).getAttribute('aria-disabled')).toBe('true');
    expect(stage(10).textContent).toContain('魔王關');
    fireEvent.click(stage(4));
    fireEvent.click(stage(1));
    expect(onTravel).not.toHaveBeenCalled();
    fireEvent.click(stage(2));
    expect(onTravel).toHaveBeenCalledWith('mist_meadow', 2);
  });

  it('shows a locked zone as one disabled row with its unlock text', () => {
    const onTravel = vi.fn();
    render(<ZonePicker game={g} content={content} onTravel={onTravel} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇地點' }));
    const locked = screen.getByRole('option', { name: '雷鳴峽谷' });
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.textContent).toContain('擊敗迷霧雄鹿後解鎖');
    fireEvent.click(locked);
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('opens another unlocked zone at its first stage', () => {
    const onTravel = vi.fn();
    const cleared = game({ currentZone: 'thunder_gorge', currentStage: 1, unlockedZones: ['mist_meadow', 'thunder_gorge'], defeatedBosses: ['mist_stag'], clearedStages: { mist_meadow: 10 } });
    render(<ZonePicker game={cleared} content={content} onTravel={onTravel} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇地點' }));
    fireEvent.click(screen.getByRole('option', { name: '迷霧草原 1-10' }));
    expect(onTravel).toHaveBeenCalledWith('mist_meadow', 10);
  });
});
