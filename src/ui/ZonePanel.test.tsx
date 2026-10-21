// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import type { GameRuntime } from '../game/runtime';
import { ZonePanel } from './ZonePanel';

afterEach(cleanup);

describe('ZonePanel', () => {
  it('disables the current zone and locked zones, enables other unlocked zones', () => {
    const [z0, z1, z2] = gameData.zones;
    const game = { ...createInitialState(gameData), unlockedZones: [z0!.id, z1!.id], currentZone: z1!.id };
    const runtime = { travel: vi.fn() } as unknown as GameRuntime;
    render(<ZonePanel game={game} data={gameData} runtime={runtime} />);
    const btn = (name: string) => screen.getByRole('button', { name: new RegExp(name) }) as HTMLButtonElement;
    expect(btn(z0!.name).disabled).toBe(false);
    expect(btn(z1!.name).disabled).toBe(true);
    expect(btn(z2!.name).disabled).toBe(true);
  });
});
