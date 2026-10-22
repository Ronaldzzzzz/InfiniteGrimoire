// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattle } from '../engine/combat';
import { content } from '../engine/content';
import type { Content } from '../engine/model';
import { createInitialState } from '../engine/persist';
import type { GameRuntime, Snapshot } from '../game/runtime';
import { GrimoirePanel } from './GrimoirePanel';

afterEach(cleanup);

function fakeRuntime(synthPending = false, revealed: string[] = []) {
  const game = { ...createInitialState(content), revealed };
  const snapshot: Snapshot = { game, battle: createBattle(game.currentZone), revision: 1, paused: false, synthPending };
  return { getSnapshot: () => snapshot, subscribe: () => () => {}, equip: vi.fn() };
}

describe('GrimoirePanel', () => {
  it('equips a learned spell on click and clears the hint', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(content.spells.mana_bolt.name) }));
    expect(rt.equip).toHaveBeenCalledWith('mana_bolt');
    expect(onHint).toHaveBeenCalledWith(null);
  });

  it('reports the locked spell for its hint without equipping', () => {
    const rt = fakeRuntime();
    const onHint = vi.fn();
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(content.spells.fireball.name) }));
    expect(onHint).toHaveBeenCalledWith('fireball');
    expect(rt.equip).not.toHaveBeenCalled();
  });

  it('does not equip while a synthesis is in flight', () => {
    const rt = fakeRuntime(true);
    render(<GrimoirePanel runtime={rt as unknown as GameRuntime} onHint={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(content.spells.mana_bolt.name) }));
    expect(rt.equip).not.toHaveBeenCalled();
  });

  it('fogged nodes are not drawn until their region is revealed', () => {
    const fogged: Content = {
      ...content,
      spells: { ...content.spells, fire_tornado: { ...content.spells.fire_tornado!, node: { region: 'outer', ring: 4, angle: 36 } } },
    };
    const name = new RegExp(content.spells.fire_tornado!.name);
    render(<GrimoirePanel runtime={fakeRuntime() as unknown as GameRuntime} onHint={vi.fn()} content={fogged} />);
    expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(content.spells.fireball!.name) })).toBeTruthy();
    cleanup();
    render(<GrimoirePanel runtime={fakeRuntime(false, ['outer']) as unknown as GameRuntime} onHint={vi.fn()} content={fogged} />);
    expect(screen.getByRole('button', { name })).toBeTruthy();
  });
});
