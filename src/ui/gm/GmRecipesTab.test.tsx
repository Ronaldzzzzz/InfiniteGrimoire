// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../../engine/content';
import { fakeRuntime } from '../test-runtime';
import { GmRecipesTab } from './GmRecipesTab';

afterEach(cleanup);
const rows = () => screen.getAllByRole('row').slice(1); // skip the header

describe('GmRecipesTab', () => {
  it('lists every recipe and marks rare outcomes', () => {
    render(<GmRecipesTab runtime={fakeRuntime()} content={content} />);
    expect(rows()).toHaveLength(content.recipes.length);
    expect(screen.getAllByText('稀有').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/落空 → 自創魔法/).length).toBeGreaterThan(0);
  });

  it('filters by spell name, leaving one row for 焚世', () => {
    render(<GmRecipesTab runtime={fakeRuntime()} content={content} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '焚世' } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]!.textContent).toContain('焚世之焰 Lv.10');
    expect(rows()[0]!.textContent).toContain('2%');
    expect(rows()[0]!.textContent).toContain('98%');
  });

  it('filters by element name and by input name', () => {
    render(<GmRecipesTab runtime={fakeRuntime()} content={content} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '火' } });
    const fire = rows().length;
    expect(fire).toBeGreaterThan(1);
    expect(fire).toBeLessThan(content.recipes.length);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: content.spells.corona_scorch!.name } });
    expect(rows().some((r) => r.textContent!.includes('焚世之焰'))).toBe(true);
  });

  it('shows the fusion elements the GM state needs', () => {
    render(<GmRecipesTab runtime={fakeRuntime({ learned: ['mana_bolt', 'fireball', 'wind_blade'] })} content={content} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: content.spells.fireball!.name } });
    const row = rows().find((r) => r.textContent!.includes(content.spells.wind_blade!.name))!;
    expect(row.textContent).toMatch(/[初中高極神]階火/);
  });
});
