import { describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { createRng } from '../engine/rng';
import { createInitialState } from '../engine/persist';
import { STEP_MS } from '../engine/combat';
import * as battleMod from '../engine/combat';
import { stageCount } from '../engine/stages';
import { GameRuntime, MAX_CATCHUP_MS } from './runtime';

const make = () => new GameRuntime(content, createInitialState(content), 3, createRng(1));

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
  it('replaceState in the same zone keeps the battle going and notifies', () => {
    const rt = make();
    rt.advance(1000);
    rt.advance(1000); // past the first spawn
    const battle = rt.getSnapshot().battle;
    expect(battle.foes.length).toBeGreaterThan(0);
    const fn = vi.fn();
    rt.subscribe(fn);
    const s = { ...createInitialState(content), equipped: 'mana_bolt' };
    rt.replaceState(s, 9);
    const snap = rt.getSnapshot();
    expect(snap.revision).toBe(9);
    expect(snap.game).toBe(s);
    expect(snap.battle).toBe(battle);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('replaceState into another zone rebuilds the battle', () => {
    const rt = make();
    rt.advance(1000);
    rt.advance(1000);
    const other = content.zones[1]!.id;
    const s = { ...createInitialState(content), currentZone: other, unlockedZones: [content.zones[0]!.id, other] };
    rt.replaceState(s, 9);
    const snap = rt.getSnapshot();
    expect(snap.battle.zoneId).toBe(other);
    expect(snap.battle.foes).toEqual([]);
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
    expect(rt.travel('nope', 1)).toBe(false);
    const zone = rt.getSnapshot().game.currentZone;
    expect(rt.travel(zone, 1)).toBe(true);
    const evs: unknown[] = [];
    rt.onEvents((e) => evs.push(...e));
    for (let i = 0; i < 20; i++) rt.advance(1000);
    expect(evs.length).toBeGreaterThan(0);
  });

  describe('stage flow', () => {
    const zone = content.zones[0]!;
    const last = stageCount(zone);
    const at = (stage: number, over: Partial<ReturnType<typeof createInitialState>> = {}) => {
      const g = { ...createInitialState(content), currentStage: stage, clearedStages: { [zone.id]: stage - 1 }, ...over };
      return new GameRuntime(content, g, 3, createRng(1));
    };
    /** the next step reports the given stage event */
    const endNext = (type: 'stageCleared' | 'stageFailed') => {
      const spy = vi.spyOn(battleMod, 'stepBattle').mockImplementationOnce((game, battle) => ({
        game,
        battle: { ...battle, phase: type === 'stageCleared' ? 'done' : 'failed' },
        events: [{ type, zoneId: battle.zoneId, stage: battle.stage }],
      }));
      return spy;
    };

    it('after stageCleared, auto-advance on moves to the next stage', () => {
      const rt = at(2);
      rt.setAutoAdvance(true);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      const s = rt.getSnapshot();
      expect(s.battle.stage).toBe(3);
      expect(s.game.currentStage).toBe(3);
      expect(s.lastResult).toEqual({ kind: 'cleared', zoneId: zone.id, stage: 2, loot: [], pending: true, claimed: false });
      spy.mockRestore();
    });
    it('auto-advance off restarts the same stage', () => {
      const rt = at(2);
      rt.setAutoAdvance(false);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      expect(rt.getSnapshot().battle.stage).toBe(2);
      expect(rt.getSnapshot().battle.phase).toBe('walk');
      spy.mockRestore();
      rt.setAutoAdvance(true);
    });
    it('auto-advance stops at the boss stage held; enterBoss starts it', () => {
      const rt = at(last - 1);
      rt.setAutoAdvance(true);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      expect(rt.getSnapshot().battle.stage).toBe(last);
      expect(rt.getSnapshot().battle.phase).toBe('held');
      rt.enterBoss();
      expect(rt.getSnapshot().battle.phase).toBe('walk');
      expect(rt.getSnapshot().lastResult).toBeNull();
      spy.mockRestore();
    });
    it('stageFailed sends the player back one stage', () => {
      const rt = at(last);
      const spy = endNext('stageFailed');
      rt.advance(STEP_MS);
      const s = rt.getSnapshot();
      expect(s.game.currentStage).toBe(last - 1);
      expect(s.battle.stage).toBe(last - 1);
      expect(s.lastResult).toEqual({ kind: 'failed', zoneId: zone.id, stage: last, backTo: last - 1 });
      spy.mockRestore();
    });
    it('auto-advance past the last stage repeats it', () => {
      const rt = at(last);
      rt.setAutoAdvance(true);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      expect(rt.getSnapshot().battle.stage).toBe(last);
      expect(rt.getSnapshot().battle.phase).toBe('held');
      spy.mockRestore();
    });
    it('after a boss kill, auto-advance moves to the next unlocked zone at its highest playable stage', () => {
      const next = content.zones.find((z) => z.order === zone.order + 1)!;
      const rt = at(last, { unlockedZones: [zone.id, next.id], defeatedBosses: [zone.bossId] });
      rt.setAutoAdvance(true);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      const s = rt.getSnapshot();
      expect(s.game.currentZone).toBe(next.id);
      expect(s.game.currentStage).toBe(1);
      expect(s.battle.zoneId).toBe(next.id);
      expect(s.battle.stage).toBe(1);
      expect(s.battle.phase).toBe('walk');
      expect(s.lastResult).toEqual({ kind: 'cleared', zoneId: zone.id, stage: last, loot: [], pending: true, claimed: false });
      spy.mockRestore();
      // a later kill goes to where the player had got to in the next zone
      const again = at(last, { unlockedZones: [zone.id, next.id], defeatedBosses: [zone.bossId], clearedStages: { [zone.id]: last, [next.id]: 4 } });
      const spy2 = endNext('stageCleared');
      again.advance(STEP_MS);
      expect(again.getSnapshot().game.currentZone).toBe(next.id);
      expect(again.getSnapshot().battle.stage).toBe(5);
      spy2.mockRestore();
    });
    it('after the last zone\'s boss, auto-advance repeats the boss stage held', () => {
      const final = content.zones.reduce((a, b) => (b.order > a.order ? b : a));
      const fl = stageCount(final);
      const g = {
        ...createInitialState(content), currentZone: final.id, currentStage: fl,
        unlockedZones: content.zones.map((z) => z.id), clearedStages: { [final.id]: fl - 1 },
      };
      const rt = new GameRuntime(content, g, 3, createRng(1));
      rt.setAutoAdvance(true);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      const s = rt.getSnapshot();
      expect(s.game.currentZone).toBe(final.id);
      expect(s.battle.stage).toBe(fl);
      expect(s.battle.phase).toBe('held');
      spy.mockRestore();
    });
    it('after a boss kill with auto-advance off, the boss stage repeats held', () => {
      const next = content.zones.find((z) => z.order === zone.order + 1)!;
      const rt = at(last, { unlockedZones: [zone.id, next.id], defeatedBosses: [zone.bossId] });
      rt.setAutoAdvance(false);
      const spy = endNext('stageCleared');
      rt.advance(STEP_MS);
      const s = rt.getSnapshot();
      expect(s.game.currentZone).toBe(zone.id);
      expect(s.battle.stage).toBe(last);
      expect(s.battle.phase).toBe('held');
      spy.mockRestore();
      rt.setAutoAdvance(true);
    });
    it('travel mid-stage keeps loot and does not claim', () => {
      const rt = at(3);
      const inv = { ...rt.getSnapshot().game.inventory, 'fire:1': 4 };
      rt.replaceState({ ...rt.getSnapshot().game, inventory: inv }, 3);
      const claimed = vi.fn();
      rt.onEvents((e) => e.forEach((x) => x.type === 'stageCleared' && claimed()));
      expect(rt.travel(zone.id, 1)).toBe(true);
      expect(rt.getSnapshot().game.inventory).toEqual(inv);
      expect(rt.getSnapshot().battle.stage).toBe(1);
      expect(claimed).not.toHaveBeenCalled();
    });
    it('travel rejects a stage beyond highestPlayable or a locked zone', () => {
      const rt = at(2);
      expect(rt.travel(zone.id, 3)).toBe(false);
      expect(rt.travel(zone.id, 0)).toBe(false);
      expect(rt.travel(content.zones[1]!.id, 1)).toBe(false);
      expect(rt.getSnapshot().battle.stage).toBe(2);
    });
    it('travel to the boss stage is held', () => {
      const rt = at(1, { clearedStages: { [zone.id]: last - 1 } });
      expect(rt.travel(zone.id, last)).toBe(true);
      expect(rt.getSnapshot().battle.phase).toBe('held');
    });
    it('replaceState into another stage rebuilds the battle', () => {
      const rt = at(2);
      rt.replaceState({ ...rt.getSnapshot().game, currentStage: 1 }, 5);
      expect(rt.getSnapshot().battle.stage).toBe(1);
    });
  });
});
