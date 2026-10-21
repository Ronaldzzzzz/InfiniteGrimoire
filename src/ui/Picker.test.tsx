// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Picker, type PickerItem } from './Picker';

afterEach(cleanup);

const ITEMS: PickerItem[] = [
  { key: 'a', label: 'Alpha', content: 'Alpha', group: 'G1', selected: true },
  { key: 'b', label: 'Beta', content: 'Beta', group: 'G1', disabled: true },
  { key: 'c', label: 'Gamma', content: 'Gamma', group: 'G2' },
];

function setup(items = ITEMS) {
  const onSelect = vi.fn();
  const utils = render(
    <div>
      <span>outside</span>
      <Picker buttonLabel="選擇" buttonContent="Alpha" items={items} onSelect={onSelect} header={<button type="button">排序</button>} />
    </div>,
  );
  const open = () => fireEvent.click(screen.getByRole('button', { name: '選擇' }));
  return { onSelect, open, ...utils };
}

describe('Picker', () => {
  it('is closed until the button is clicked, then lists options with group headings', () => {
    const { open } = setup();
    expect(screen.queryByRole('listbox')).toBeNull();
    open();
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('G1')).toBeTruthy();
    expect(screen.getByText('G2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '選擇' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('selects an enabled option on click and closes', () => {
    const { open, onSelect } = setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ignores clicks on disabled options', () => {
    const { open, onSelect } = setup();
    open();
    fireEvent.click(screen.getByRole('option', { name: 'Beta' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('moves with arrow keys skipping disabled options and selects with Enter', () => {
    const { open, onSelect } = setup();
    open();
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('closes on Escape and on a pointer press outside, but not inside the header', () => {
    const { open } = setup();
    open();
    fireEvent.pointerDown(screen.getByRole('button', { name: '排序' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    open();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stays open with the same active option when items are re-rendered', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Picker buttonLabel="選擇" buttonContent="x" items={ITEMS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '選擇' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    rerender(<Picker buttonLabel="選擇" buttonContent="x" items={ITEMS.map((i) => ({ ...i }))} onSelect={onSelect} />);
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('c');
  });
});
