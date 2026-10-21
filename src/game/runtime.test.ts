import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createRng } from '../engine/rng';
import { createInitialState } from '../engine/state';
import { STEP_MS } from '../engine/battle';
import * as battleMod from '../engine/battle';
import { GameRuntime, MAX_CATCHUP_MS } from './runtime';

const make = () => new GameRuntime(gameData, createInitialState(gameData), 3, createRng(1));

describe('GameRuntime', () => {
  it('advance clamps huge elapsed', () => {
    const rt = make();
    const spy = vi.spyOn(battleMod, 'stepBattle');
    const t0 = performance.now();
    rt.advance(600_000);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(MAX_CATCHUP_MS / STEP_MS);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
  it('leftover time carries over', () => {
    const rt = make();
    const spy = vi.spyOn(battleMod, 'stepBattle');
    rt.advance(STEP_MS - 10);
    expect(spy).toHaveBeenCalledTimes(0);
    rt.advance(20);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
  it('stepAlpha reports how far the clock is into the next step', () => {
    const rt = make();
    expect(rt.stepAlpha()).toBe(0);
    rt.advance(STEP_MS / 2);
    expect(rt.stepAlpha()).toBeCloseTo(0.5);
    rt.advance(STEP_MS * 0.75); // one step runs, 0.25 left over
    expect(rt.stepAlpha()).toBeCloseTo(0.25);
    rt.setPaused(true);
    expect(rt.stepAlpha()).toBe(0);
  });
  it('paused runtime does not advance', () => {
    const rt = make();
    const before = rt.getSnapshot();
    rt.setPaused(true);
    rt.advance(1000);
    expect(rt.getSnapshot().battle).toBe(before.battle);
    expect(rt.getSnapshot().paused).toBe(true);
    rt.setPaused(false);
    rt.advance(1000);
    expect(rt.getSnapshot().battle).not.toBe(before.battle);
  });
  it('replaceState rebuilds battle and notifies', () => {
    const rt = make();
    rt.advance(1000);
    const fn = vi.fn();
    rt.subscribe(fn);
    const s = { ...createInitialState(gameData), equipped: 'mana_bolt' };
    rt.replaceState(s, 9);
    const snap = rt.getSnapshot();
    expect(snap.revision).toBe(9);
    expect(snap.game).toBe(s);
    expect(snap.battle.monsters).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('getSnapshot stable when nothing changed', () => {
    const rt = make();
    expect(rt.getSnapshot()).toBe(rt.getSnapshot());
    const a = rt.getSnapshot();
    rt.advance(10);
    expect(rt.getSnapshot()).toBe(a);
    rt.setPaused(false);
    expect(rt.getSnapshot()).toBe(a);
  });
  it('upgrade, equip, travel and events', () => {
    const rt = make();
    expect(rt.upgrade('fire', 1)).toBe(false);
    expect(rt.travel('nope')).toBe(false);
    const zone = rt.getSnapshot().game.currentZone;
    expect(rt.travel(zone)).toBe(true);
    const evs: unknown[] = [];
    rt.onEvents((e) => evs.push(...e));
    for (let i = 0; i < 20; i++) rt.advance(1000);
    expect(evs.length).toBeGreaterThan(0);
  });
});
