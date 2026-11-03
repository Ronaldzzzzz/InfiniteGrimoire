// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RingPicker, type WheelItem } from './RingPicker';

afterEach(cleanup);

const items: WheelItem[] = [
  { key: 'a', label: 'A', ariaLabel: 'A', enabled: true },
  { key: 'b', label: 'B', ariaLabel: 'B', enabled: false },
  { key: 'c', label: 'C', ariaLabel: 'C', enabled: true },
];

function setup() {
  const onPick = vi.fn(), onClose = vi.fn(), returnFocus = vi.fn();
  const { container } = render(<RingPicker at={{ x: 120, y: 120 }} title="選" items={items} onPick={onPick} onClose={onClose} returnFocus={returnFocus} />);
  return { onPick, onClose, returnFocus, container };
}

describe('RingPicker', () => {
  it('opens with focus on the first enabled item', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'A' }));
  });

  it('arrow keys walk the wheel and Escape returns focus to the slot', () => {
    const { onClose, returnFocus } = setup();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'C' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'A' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(returnFocus).toHaveBeenCalledTimes(1);
  });

  it('clicking outside closes', () => {
    const { onClose, container } = setup();
    fireEvent.click(container.querySelector('.ring-picker-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('picks an enabled item and shows 移除 only when given', () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'C' }));
    expect(onPick).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('button', { name: '移除' })).toBeNull();
  });
});
