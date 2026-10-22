// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { SynthLogEntry } from '../engine/model';
import { crossGradeEntries, matrixCell, SynthesisMatrix } from './SynthesisMatrix';

afterEach(cleanup);

const LOG: Record<string, SynthLogEntry> = {
  'el:fire:1+el:fire:1': { attempts: 3, results: { fireball: 3 }, noReaction: false },
  'el:fire:1+el:wind:1': { attempts: 1, results: { none: 1 }, noReaction: true },
  'el:fire:2+el:fire:2': { attempts: 4, results: { flame_burst: 3, overload: 1 }, noReaction: false },
  'el:fire:2+mat:ember_core': { attempts: 1, results: { none: 1 }, noReaction: true },
  'el:fire:2+fireball': { attempts: 1, results: { flame_burst: 1 }, noReaction: false },
  'el:fire:1+el:wind:2': { attempts: 2, results: { none: 2 }, noReaction: true },
};

describe('matrixCell', () => {
  it('is unknown for combinations never tried', () => {
    expect(matrixCell(LOG, 'el:wind:1', 'el:water:1', content)).toMatchObject({ attempts: 0, label: '？' });
  });

  it('shows the result, the same from either side of the table', () => {
    const a = matrixCell(LOG, 'el:fire:1', 'el:fire:1', content);
    expect(a).toMatchObject({ attempts: 3, label: '火球', more: 0 });
    expect(matrixCell(LOG, 'el:wind:1', 'el:fire:1', content).label).toBe('無反應');
    expect(matrixCell(LOG, 'el:fire:1', 'el:wind:1', content).label).toBe('無反應');
  });

  it('puts the most frequent result first and counts the others', () => {
    const c = matrixCell(LOG, 'el:fire:2', 'el:fire:2', content);
    expect(c.label).toBe('烈焰爆發');
    expect(c.more).toBe(1);
    expect(c.detail).toBe('烈焰爆發 75%、魔力過載 25%（試過 4 次）');
  });
});

describe('crossGradeEntries', () => {
  it('lists only tried combos that no grade table can show', () => {
    expect(crossGradeEntries(LOG).map((e) => e.key)).toEqual(['el:fire:1+el:wind:2', 'el:fire:2+fireball', 'el:fire:2+mat:ember_core']);
  });
});

describe('SynthesisMatrix', () => {
  it('shows a 5 × 5 table for the chosen grade, with ？ for untried cells', () => {
    render(<SynthesisMatrix log={LOG} content={content} onPickPair={() => {}} />);
    expect(screen.getAllByRole('row')).toHaveLength(6); // header + 5 elements
    expect(screen.getAllByRole('columnheader')).toHaveLength(6); // corner + 5 elements
    expect(screen.getByRole('button', { name: /^初階火 \+ 初階火：火球/ }).textContent).toContain('火球');
    expect(screen.getByRole('button', { name: /^初階風 \+ 初階水：未嘗試/ }).textContent).toContain('？');
  });

  it('switches grade, up to the fifth', () => {
    render(<SynthesisMatrix log={LOG} content={content} onPickPair={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '中階' }));
    expect(screen.getByRole('button', { name: /^中階火 \+ 中階火：烈焰爆發/ }).textContent).toContain('+1');
    fireEvent.click(screen.getByRole('button', { name: '神階' }));
    expect(screen.getByRole('button', { name: /^神階火 \+ 神階火：未嘗試/ })).toBeTruthy();
  });

  it('fills the slots with the pair and shows the details when a cell is clicked', () => {
    const onPickPair = vi.fn();
    render(<SynthesisMatrix log={LOG} content={content} onPickPair={onPickPair} />);
    fireEvent.click(screen.getByRole('button', { name: '中階' }));
    fireEvent.click(screen.getByRole('button', { name: /^中階火 \+ 中階火/ }));
    expect(onPickPair).toHaveBeenCalledWith('el:fire:2', 'el:fire:2');
    expect(screen.getByText('中階火 + 中階火：烈焰爆發 75%、魔力過載 25%（試過 4 次）')).toBeTruthy();
  });

  it('lists other attempts (cross-grade, materials, spells) below the table and picks them on click', () => {
    const onPickPair = vi.fn();
    render(<SynthesisMatrix log={LOG} content={content} onPickPair={onPickPair} />);
    fireEvent.click(screen.getByRole('button', { name: /初階火 \+ 中階風/ }));
    expect(onPickPair).toHaveBeenCalledWith('el:fire:1', 'el:wind:2');
    fireEvent.click(screen.getByRole('button', { name: /^中階火 \+ 火球：烈焰爆發/ }));
    expect(onPickPair).toHaveBeenCalledWith('el:fire:2', 'fireball');
    expect(screen.getByRole('button', { name: /^中階火 \+ 餘燼核心：無反應/ })).toBeTruthy();
  });
});
