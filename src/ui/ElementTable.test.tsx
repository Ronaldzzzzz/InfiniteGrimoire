// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementTable, upgradeCount } from './ElementTable';

afterEach(cleanup);

const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('upgradeCount', () => {
  it('is 1 when the grade holds its cost (3, 10, 30, 100), or every upgrade it can afford with all; never the top grade', () => {
    expect(upgradeCount({ 'el:fire:1': 3 }, 'fire', 1, false)).toBe(1);
    expect(upgradeCount({ 'el:fire:1': 2 }, 'fire', 1, false)).toBe(0);
    expect(upgradeCount({ 'el:fire:1': 31 }, 'fire', 1, true)).toBe(10);
    expect(upgradeCount({ 'el:fire:2': 25 }, 'fire', 2, true)).toBe(2);
    expect(upgradeCount({ 'el:fire:3': 29 }, 'fire', 3, true)).toBe(0);
    expect(upgradeCount({ 'el:fire:5': 999 }, 'fire', 5, true)).toBe(0);
    expect(upgradeCount({}, 'fire', 1, false)).toBe(0);
  });
});

describe('ElementTable', () => {
  it('renders every element × grade cell, dimming (disabling) empty ones', () => {
    render(<ElementTable inventory={{ 'el:fire:1': 24 }} onPick={() => {}} onUpgrade={() => {}} />);
    expect(btn('初階火 ×24').disabled).toBe(false);
    expect(btn('中階火 ×0').disabled).toBe(true);
    expect(btn('高階水 ×0').disabled).toBe(true);
    expect(screen.getAllByRole('row')).toHaveLength(7); // header + 5 elements + materials
  });

  it('sizes the name column from the header row (table-layout: fixed reads the first row)', () => {
    const { container } = render(<ElementTable inventory={{}} onPick={() => {}} onUpgrade={() => {}} />);
    expect(container.querySelector('thead th')!.classList.contains('el-name')).toBe(true);
  });

  it('picks the item when a cell is clicked', () => {
    const onPick = vi.fn();
    render(<ElementTable inventory={{ 'el:thunder:2': 3 }} onPick={onPick} onUpgrade={() => {}} />);
    fireEvent.click(btn('中階雷 ×3'));
    expect(onPick).toHaveBeenCalledWith('el:thunder:2');
  });

  it('puts an arrow between neighbouring grades, enabled only when the left one holds its cost', () => {
    render(<ElementTable inventory={{ 'el:fire:1': 3, 'el:fire:2': 9, 'el:water:3': 30 }} onPick={() => {}} onUpgrade={() => {}} />);
    expect(btn('初階火升成中階火').disabled).toBe(false);
    expect(btn('中階火升成高階火').disabled).toBe(true);
    expect(btn('高階水升成極階水').disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /神階火升成/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^升階/ })).toBeNull(); // the old one-per-row button is gone
  });

  it('upgrades exactly the grade whose arrow is clicked, even when a lower grade could also upgrade', () => {
    const onUpgrade = vi.fn();
    render(<ElementTable inventory={{ 'el:fire:1': 3, 'el:fire:2': 10 }} onPick={() => {}} onUpgrade={onUpgrade} />);
    fireEvent.click(btn('中階火升成高階火'));
    expect(onUpgrade).toHaveBeenCalledWith('fire', 2, 1);
  });

  it('Shift-click upgrades as many as the grade can afford', () => {
    const onUpgrade = vi.fn();
    render(<ElementTable inventory={{ 'el:earth:1': 31 }} onPick={() => {}} onUpgrade={onUpgrade} />);
    fireEvent.click(btn('初階土升成中階土'), { shiftKey: true });
    expect(onUpgrade).toHaveBeenCalledWith('earth', 1, 10);
  });

  it('can lock the arrows while cells stay pickable', () => {
    const onPick = vi.fn();
    render(<ElementTable inventory={{ 'el:fire:1': 5 }} onPick={onPick} onUpgrade={() => {}} upgradeLocked />);
    expect(btn('初階火升成中階火').disabled).toBe(true);
    fireEvent.click(btn('初階火 ×5'));
    expect(onPick).toHaveBeenCalledWith('el:fire:1');
  });

  it('lists the materials in stock and picks them', () => {
    const onPick = vi.fn();
    const { rerender } = render(<ElementTable inventory={{}} onPick={onPick} onUpgrade={() => {}} />);
    expect(screen.getByText('尚無素材')).toBeTruthy();
    rerender(<ElementTable inventory={{ 'mat:ember_core': 2 }} onPick={onPick} onUpgrade={() => {}} />);
    fireEvent.click(btn('餘燼核心 ×2'));
    expect(onPick).toHaveBeenCalledWith('mat:ember_core');
  });

  it('ElementTable shows five grades and the escalating cost', () => {
    render(<ElementTable inventory={{ 'el:fire:5': 1 }} onPick={() => {}} onUpgrade={() => {}} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(1, 6)).toEqual(['初階3→1', '中階10→1', '高階30→1', '極階100→1', '神階']);
    expect(btn('極階水 ×0').disabled).toBe(true);
    expect(btn('神階火 ×1').disabled).toBe(false);
  });
});
