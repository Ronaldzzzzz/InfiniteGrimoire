// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { craftedId, resolveSpell } from '../engine/spells';
import { Notebook } from './Notebook';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

const good = craftedId('fireball', 'wind_blade');
const bad = craftedId('fireball', 'water_wave');
const sync = () => ({ action: vi.fn(async () => null) });

describe('Notebook', () => {
  it('Notebook lists only crafted spells and picks into the slots', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball', good, bad], levels: { [good]: 3 } });
    const onPick = vi.fn();
    render(<Notebook runtime={rt} sync={sync()} content={content} onPick={onPick} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(screen.queryByText('火球')).toBeNull();
    const goodRow = rows.find((r) => r.textContent!.includes(resolveSpell(good, content)!.name))!;
    expect(goodRow.textContent).toContain('相性極佳');
    expect(goodRow.textContent).toContain('強化 +2');
    const badRow = rows.find((r) => r.textContent!.includes(resolveSpell(bad, content)!.name))!;
    expect(badRow.textContent).toContain('相性差');
    expect(badRow.textContent).not.toContain('強化 +');
    fireEvent.click(within(goodRow).getByRole('button', { name: new RegExp(`放進合成槽.*${resolveSpell(good, content)!.name}`) }));
    expect(onPick).toHaveBeenCalledWith(good);
    fireEvent.click(within(goodRow).getByRole('button', { name: '裝備' }));
    expect(rt.equip).toHaveBeenCalledWith(good);
    expect(within(goodRow).getByRole('button', { name: '裝備中' })).toBeTruthy();
  });

  it('opens the empower panel for a row and locks equipping while an action is in flight', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', good] }, true);
    render(<Notebook runtime={rt} sync={sync()} content={content} onPick={vi.fn()} />);
    expect((screen.getByRole('button', { name: '裝備' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '強化…' }));
    expect(screen.getByRole('region', { name: '強化' })).toBeTruthy();
  });

  it('says how to find crafted spells when there are none', () => {
    render(<Notebook runtime={fakeRuntime()} sync={sync()} content={content} onPick={vi.fn()} />);
    expect(screen.getByText(/還沒有自創魔法/)).toBeTruthy();
  });
});
