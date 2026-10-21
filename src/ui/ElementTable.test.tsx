// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementTable, lowestUpgradableGrade } from './ElementTable';

afterEach(cleanup);

const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('lowestUpgradableGrade', () => {
  it('picks the lowest grade with at least 3, never the top grade', () => {
    expect(lowestUpgradableGrade({ 'el:fire:1': 3, 'el:fire:2': 5 }, 'fire')).toBe(1);
    expect(lowestUpgradableGrade({ 'el:fire:1': 2, 'el:fire:2': 3 }, 'fire')).toBe(2);
    expect(lowestUpgradableGrade({ 'el:fire:3': 9 }, 'fire')).toBeNull();
    expect(lowestUpgradableGrade({}, 'fire')).toBeNull();
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

  it('enables 升階 only when some grade below the top has 3, and upgrades the lowest one', () => {
    const onUpgrade = vi.fn();
    render(<ElementTable inventory={{ 'el:fire:1': 3, 'el:fire:2': 3, 'el:wind:1': 2, 'el:water:3': 5 }} onPick={() => {}} onUpgrade={onUpgrade} />);
    expect(btn('升階風').disabled).toBe(true);
    expect(btn('升階水').disabled).toBe(true);
    fireEvent.click(btn('升階火'));
    expect(onUpgrade).toHaveBeenCalledWith('fire', 1);
  });

  it('can lock 升階 while cells stay pickable', () => {
    const onPick = vi.fn();
    render(<ElementTable inventory={{ 'el:fire:1': 5 }} onPick={onPick} onUpgrade={() => {}} upgradeLocked />);
    expect(btn('升階火').disabled).toBe(true);
    fireEvent.click(btn('初階火 ×5'));
    expect(onPick).toHaveBeenCalledWith('el:fire:1');
  });

  it('always shows the mana crystal in the materials row', () => {
    const onPick = vi.fn();
    const { rerender } = render(<ElementTable inventory={{}} onPick={onPick} onUpgrade={() => {}} />);
    expect(btn('魔晶 ×0').disabled).toBe(true);
    rerender(<ElementTable inventory={{ 'mat:mana_crystal': 2 }} onPick={onPick} onUpgrade={() => {}} />);
    fireEvent.click(btn('魔晶 ×2'));
    expect(onPick).toHaveBeenCalledWith('mat:mana_crystal');
  });
});
