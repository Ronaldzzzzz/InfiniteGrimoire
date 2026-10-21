// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import type { SynthLogEntry } from '../engine/state';
import { crossGradeEntries, matrixCell, SynthesisMatrix } from './SynthesisMatrix';

afterEach(cleanup);

const LOG: Record<string, SynthLogEntry> = {
  'el:fire:1+el:fire:1': { attempts: 3, results: { fireball: 3 }, noReaction: false },
  'el:fire:1+el:wind:1': { attempts: 1, results: { none: 1 }, noReaction: true },
  'el:fire:2+el:fire:2': { attempts: 4, results: { flame_burst: 3, explosion: 1 }, noReaction: false },
  'el:fire:2+mat:mana_crystal': { attempts: 1, results: { explosion: 1 }, noReaction: false },
  'el:fire:1+el:wind:2': { attempts: 2, results: { none: 2 }, noReaction: true },
};

describe('matrixCell', () => {
  it('is unknown for combinations never tried', () => {
    expect(matrixCell(LOG, 'el:wind:1', 'el:water:1', gameData)).toMatchObject({ attempts: 0, label: '？' });
  });

  it('shows the result, the same from either side of the table', () => {
    const a = matrixCell(LOG, 'el:fire:1', 'el:fire:1', gameData);
    expect(a).toMatchObject({ attempts: 3, label: '火球術', more: 0 });
    expect(matrixCell(LOG, 'el:wind:1', 'el:fire:1', gameData).label).toBe('無反應');
    expect(matrixCell(LOG, 'el:fire:1', 'el:wind:1', gameData).label).toBe('無反應');
  });

  it('puts the most frequent result first and counts the others', () => {
    const c = matrixCell(LOG, 'el:fire:2', 'el:fire:2', gameData);
    expect(c.label).toBe('烈焰術');
    expect(c.more).toBe(1);
    expect(c.detail).toBe('烈焰術 75%、爆炎 25%（試過 4 次）');
  });
});

describe('crossGradeEntries', () => {
  it('lists only tried combos that no grade table can show', () => {
    expect(crossGradeEntries(LOG).map((e) => e.key)).toEqual(['el:fire:1+el:wind:2']);
  });
});

describe('SynthesisMatrix', () => {
  it('shows a 5 × 6 table for the chosen grade, with ？ for untried cells', () => {
    render(<SynthesisMatrix log={LOG} data={gameData} onPickPair={() => {}} />);
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5 elements
    expect(screen.getByRole('button', { name: /^初階火 \+ 初階火：火球術/ }).textContent).toContain('火球術');
    expect(screen.getByRole('button', { name: /^初階風 \+ 初階水：未嘗試/ }).textContent).toContain('？');
    expect(screen.getByRole('button', { name: /^初階火 \+ 魔晶/ })).toBeTruthy();
  });

  it('switches grade', () => {
    render(<SynthesisMatrix log={LOG} data={gameData} onPickPair={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '中階' }));
    expect(screen.getByRole('button', { name: /^中階火 \+ 中階火：烈焰術/ }).textContent).toContain('+1');
    expect(screen.getByRole('button', { name: /^中階火 \+ 魔晶：爆炎/ })).toBeTruthy();
  });

  it('fills the slots with the pair and shows the details when a cell is clicked', () => {
    const onPickPair = vi.fn();
    render(<SynthesisMatrix log={LOG} data={gameData} onPickPair={onPickPair} />);
    fireEvent.click(screen.getByRole('button', { name: '中階' }));
    fireEvent.click(screen.getByRole('button', { name: /^中階火 \+ 中階火/ }));
    expect(onPickPair).toHaveBeenCalledWith('el:fire:2', 'el:fire:2');
    expect(screen.getByText('中階火 + 中階火：烈焰術 75%、爆炎 25%（試過 4 次）')).toBeTruthy();
  });

  it('lists cross-grade attempts below the table and picks them on click', () => {
    const onPickPair = vi.fn();
    render(<SynthesisMatrix log={LOG} data={gameData} onPickPair={onPickPair} />);
    fireEvent.click(screen.getByRole('button', { name: /初階火 \+ 中階風/ }));
    expect(onPickPair).toHaveBeenCalledWith('el:fire:1', 'el:wind:2');
  });
});
