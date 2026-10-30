// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../../engine/content';
import { GmRecipesTab } from './GmRecipesTab';

afterEach(cleanup);
const rows = () => screen.getAllByRole('row').slice(1); // skip the header
const circles = Object.values(content.spells).filter((s) => s.circle).length;

describe('GmRecipesTab', () => {
  it('lists every textbook circle and marks rare spells', () => {
    render(<GmRecipesTab content={content} />);
    expect(rows()).toHaveLength(circles);
    expect(screen.getAllByText('稀有').length).toBe(Object.values(content.spells).filter((s) => s.rare).length);
  });

  it('filters by spell name, leaving one row for 焚世', () => {
    render(<GmRecipesTab content={content} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '焚世' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain('焚世之焰 Lv.10');
    expect(rows()[0]!.textContent).toContain('2%');
    expect(rows()[0]!.textContent).toContain('核心火');
  });

  it('filters by element name', () => {
    render(<GmRecipesTab content={content} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '雷' } });
    const n = rows().length;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(circles);
  });
});
