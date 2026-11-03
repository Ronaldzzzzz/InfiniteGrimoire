// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { GameState } from '../engine/model';
import { resolveSpell } from '../engine/spells';
import { placementOfSpell } from './CircleTable';
import { GrimoirePanel } from './GrimoirePanel';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

const CRAFTED = 'm:fire.2.----w.-----.bolt';
const FIRE4 = 'm:fire.4.--fff.-----.bolt';
const crafted = resolveSpell(CRAFTED, content)!;
const star = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

function setup(game: Partial<GameState>) {
  const rt = fakeRuntime(game);
  const loadPlacement = vi.fn();
  // what the app does with 放到牛皮紙上 (App.tsx `pick`)
  const onPick = vi.fn((id: string) => {
    const p = placementOfSpell(id, content);
    if (p) loadPlacement(p);
  });
  render(<GrimoirePanel runtime={rt} sync={{ action: vi.fn(async () => null) }} onPick={onPick} content={content} />);
  return { rt, loadPlacement, onPick };
}

describe('StarMap', () => {
  it('a veiled spell has no star until the veil lifts', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'] });
    const sync = { action: vi.fn(async () => null) };
    const ui = (veil: readonly string[] | null) => <GrimoirePanel runtime={rt} sync={sync} onPick={vi.fn()} content={content} veil={veil} />;
    const { rerender } = render(ui(['mana_bolt']));
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: new RegExp(`^${content.spells.fireball!.name}`) })).toBeNull();
    rerender(ui(null));
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(2);
    expect(star(content.spells.fireball!.name)).toBeTruthy();
  });

  it('draws only the learned spells: no fog, no empty places', () => {
    setup({ learned: ['mana_bolt', 'fireball', CRAFTED] });
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(3);
    expect(star(content.spells.fireball!.name)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(content.spells.inferno!.name) })).toBeNull();
    expect(screen.queryByText(/未學會/)).toBeNull();
    expect(screen.queryByLabelText('迷霧')).toBeNull();
  });

  it('a crafted star is a glowing star; a textbook one is an ink seal; no amber halo', () => {
    setup({ learned: ['mana_bolt', 'fireball', CRAFTED] });
    const c = star(crafted.name);
    expect(c.getAttribute('aria-label')).toBe(`${crafted.name}（自創）`);
    expect(c.querySelector('.star-glow')).toBeTruthy();
    expect(c.querySelector('.star-seal')).toBeNull();
    const named = star(content.spells.fireball!.name);
    expect(named.querySelector('.star-seal')).toBeTruthy();
    expect(named.querySelector('.star-glow')).toBeNull();
    expect(document.querySelector('.star-halo')).toBeNull();
  });

  it('no lines until a star is selected, then only that star\'s lines', () => {
    const a = 'm:fire.4.--fff.-----.bolt', b = 'm:fire.4.-f-ff.-----.bolt', c = 'm:fire.6.fffff.-----.bolt';
    setup({ learned: ['mana_bolt', a, b, c] });
    expect(document.querySelectorAll('.star-lines line')).toHaveLength(0);
    fireEvent.click(star(resolveSpell(a, content)!.name));
    expect(document.querySelectorAll('.star-lines line')).toHaveLength(2);
  });

  it('sector labels run 水 土 火 雷 風', () => {
    setup({ learned: ['mana_bolt'] });
    const labels = [...document.querySelectorAll('.star-grid text')].map((t) => t.textContent).filter((t) => /^[水土火雷風]$/.test(t ?? ''));
    expect(labels).toEqual(['水', '土', '火', '雷', '風']);
  });

  it('passives sit near the centre; depth passives (the retired depth cap) are hidden', () => {
    setup({ learned: ['mana_bolt'] });
    expect(screen.getByRole('button', { name: new RegExp(content.passives.ember_affinity!.name) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(content.passives.deep_insight!.name) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(content.passives.abyss_insight!.name) })).toBeNull();
  });

  it('a star opens a card with its magic circle, its stats, 裝備 and 放到牛皮紙上', () => {
    const { rt, loadPlacement } = setup({ learned: ['mana_bolt', CRAFTED] });
    fireEvent.click(star(crafted.name));
    fireEvent.click(screen.getByRole('button', { name: '詳情' }));
    const card = screen.getByRole('region', { name: '節點詳情' });
    expect(within(card).getByRole('img', { name: '這個魔法的魔法陣' })).toBeTruthy();
    expect(card.textContent).toContain('符文：射');
    expect(card.textContent).toContain('學派：');
    expect(card.textContent).toContain('自創');
    fireEvent.click(within(card).getByRole('button', { name: '裝備' }));
    expect(rt.equip).toHaveBeenCalledWith(CRAFTED);
    fireEvent.click(within(card).getByRole('button', { name: '放到牛皮紙上' }));
    expect(loadPlacement).toHaveBeenCalledWith(placementOfSpell(CRAFTED, content));
  });

  it('the bubble puts a named spell circle on the parchment too', () => {
    const { loadPlacement } = setup({ learned: ['mana_bolt', 'fireball'] });
    fireEvent.click(star(content.spells.fireball!.name));
    fireEvent.click(within(screen.getByRole('group', { name: '魔法操作' })).getByRole('button', { name: '放到牛皮紙上' }));
    expect(loadPlacement).toHaveBeenCalledWith(placementOfSpell('fireball', content));
  });

  it('learning a spell adds a star without moving the others', () => {
    const { rt } = setup({ learned: ['mana_bolt', 'fireball'] });
    const at = () => star(content.spells.fireball!.name).querySelector('.star-seal')!.getAttribute('x');
    const before = at();
    act(() => rt.set({ game: { learned: ['mana_bolt', 'fireball', CRAFTED, FIRE4] } }));
    expect(document.querySelectorAll('.grimoire-node.star')).toHaveLength(4);
    expect(at()).toBe(before);
  });

  it('does not re-render on drops, but does when a spell is learned', () => {
    const rt = fakeRuntime({ learned: ['mana_bolt', 'fireball'] });
    const onRender = vi.fn();
    render(
      <Profiler id="stars" onRender={onRender}>
        <GrimoirePanel runtime={rt} sync={{ action: vi.fn() }} onPick={vi.fn()} content={content} />
      </Profiler>,
    );
    const before = onRender.mock.calls.length;
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 9 } } }));
    expect(onRender.mock.calls.length).toBe(before);
    act(() => rt.set({ game: { learned: ['mana_bolt', 'fireball', CRAFTED] } }));
    expect(onRender.mock.calls.length).toBe(before + 1);
  });
});
