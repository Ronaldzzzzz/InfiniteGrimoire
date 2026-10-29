import { createBattle, enterStage, STEP_MS, stepBattle, type BattleEvent, type BattleState } from '../engine/combat';
import { upgradeElement } from '../engine/inventory';
import type { Content, GameState } from '../engine/model';
import type { Rng } from '../engine/rng';
import { highestPlayable, stageCount } from '../engine/stages';
import type { ElementId, ItemId } from '../engine/types';
import { loadAutoAdvance, saveAutoAdvance } from './auto-advance';

export const MAX_CATCHUP_MS = 1000;

/** The last stage settlement or failure, for the stage-end notice; cleared on travel and on entering the boss. */
export type LastResult =
  /**
   * `pending`: the server has not answered the claim yet. After the answer `claimed` says whether the server
   * settled it (loot is the server's) or not (refused or lost: loot is empty, nothing was saved).
   */
  | { kind: 'cleared'; zoneId: string; stage: number; loot: ItemId[]; pending: boolean; claimed: boolean }
  | { kind: 'failed'; zoneId: string; stage: number; backTo: number };

export interface Snapshot {
  game: GameState;
  battle: BattleState;
  revision: number;
  paused: boolean;
  /** a server action (synthesis, empower, reveal, passive) is in flight; its reply replaces the game state */
  synthPending: boolean;
  /** after a clear, move on to the next stage (otherwise the same stage restarts) */
  autoAdvance: boolean;
  lastResult: LastResult | null;
}

export class GameRuntime {
  private snapshot: Snapshot;
  private leftoverMs = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(events: BattleEvent[]) => void>();

  constructor(
    private readonly content: Content,
    state: GameState,
    revision: number,
    private readonly rng: Rng,
  ) {
    this.snapshot = {
      game: state, battle: this.newBattle(state.currentZone, state.currentStage), revision, paused: false, synthPending: false,
      autoAdvance: loadAutoAdvance(), lastResult: null,
    };
  }

  /** A fresh stage on this runtime's content; a boss stage always waits at the door. */
  private newBattle(zoneId: string, stage: number): BattleState {
    return createBattle(zoneId, stage, { held: true, content: this.content });
  }

  getSnapshot(): Snapshot {
    return this.snapshot;
  }

  /** 0..1: how far the clock is into the next fixed step; renderers interpolate between steps with it. */
  stepAlpha(): number {
    if (this.snapshot.paused) return 0;
    return Math.min(1, this.leftoverMs / STEP_MS);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  onEvents(listener: (events: BattleEvent[]) => void): () => void {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of [...this.listeners]) l();
  }

  advance(elapsedMs: number): void {
    if (this.snapshot.paused || !(elapsedMs > 0)) return;
    this.leftoverMs += Math.min(elapsedMs, MAX_CATCHUP_MS);
    let { game, battle, lastResult } = this.snapshot;
    const events: BattleEvent[] = [];
    let steps = 0;
    while (this.leftoverMs >= STEP_MS) {
      this.leftoverMs -= STEP_MS;
      const r = stepBattle(game, battle, this.content, this.rng);
      game = r.game;
      battle = r.battle;
      events.push(...r.events);
      steps++;
      for (const e of r.events) {
        if (e.type !== 'stageCleared' && e.type !== 'stageFailed') continue;
        const next = this.afterStage(game, e);
        if (!next) continue;
        game = next.game;
        battle = next.battle;
        lastResult = next.lastResult;
      }
    }
    if (steps === 0) return;
    this.set({ game, battle, lastResult });
    if (events.length > 0) for (const l of [...this.eventListeners]) l(events);
  }

  /**
   * A stage ended: build the next one (auto-advance, or the same stage again) or send the player one stage
   * back after a failure. `currentStage` follows; the server settles a clear separately (SyncController).
   */
  private afterStage(game: GameState, e: Extract<BattleEvent, { type: 'stageCleared' | 'stageFailed' }>): { game: GameState; battle: BattleState; lastResult: LastResult } | null {
    const zone = this.content.zones.find((z) => z.id === e.zoneId);
    if (!zone) return null;
    if (e.type === 'stageCleared') {
      const next = this.snapshot.autoAdvance ? Math.min(e.stage + 1, stageCount(zone)) : e.stage;
      return {
        game: { ...game, currentStage: next },
        battle: this.newBattle(zone.id, next),
        lastResult: { kind: 'cleared', zoneId: zone.id, stage: e.stage, loot: [], pending: true, claimed: false },
      };
    }
    const backTo = Math.max(1, e.stage - 1);
    return {
      game: { ...game, currentStage: backTo },
      battle: this.newBattle(zone.id, backTo),
      lastResult: { kind: 'failed', zoneId: zone.id, stage: e.stage, backTo },
    };
  }

  /** Fills in the loot the server settled for a clear, if that clear is still the one on display. */
  setStageLoot(zoneId: string, stage: number, loot: ItemId[]): void {
    const r = this.snapshot.lastResult;
    if (!r || r.kind !== 'cleared' || r.zoneId !== zoneId || r.stage !== stage) return;
    this.set({ lastResult: { ...r, loot, pending: false, claimed: true } });
  }

  /**
   * The claim for a cleared stage did not end in a settlement (refused, lost, offline, conflict). Progress
   * is server-owned, so a player who moved past the frontier goes back to the highest playable stage now,
   * before any upload can carry a currentStage the server would reject.
   */
  claimFailed(zoneId: string, stage: number): void {
    const r = this.snapshot.lastResult;
    const lastResult = r && r.kind === 'cleared' && r.zoneId === zoneId && r.stage === stage ? { ...r, loot: [], pending: false, claimed: false } : r;
    const g = this.snapshot.game;
    const zone = this.content.zones.find((z) => z.id === g.currentZone);
    const hp = zone ? highestPlayable(g, zone) : g.currentStage;
    if (g.currentStage <= hp) {
      if (lastResult !== r) this.set({ lastResult });
      return;
    }
    this.leftoverMs = 0;
    this.set({ game: { ...g, currentStage: hp }, battle: this.newBattle(g.currentZone, hp), lastResult });
  }

  /** The game state with currentStage clamped to what the server lets us play; this is what goes on the wire. */
  clampedGame(): GameState {
    const g = this.snapshot.game;
    const zone = this.content.zones.find((z) => z.id === g.currentZone);
    if (!zone) return g;
    const hp = highestPlayable(g, zone);
    return g.currentStage > hp ? { ...g, currentStage: hp } : g;
  }

  setAutoAdvance(on: boolean): void {
    saveAutoAdvance(on);
    if (this.snapshot.autoAdvance === on) return;
    this.set({ autoAdvance: on });
  }

  /** Leaves the door of a held boss stage. */
  enterBoss(): void {
    const { battle } = this.snapshot;
    const next = enterStage(battle);
    if (next === battle) return;
    this.set({ battle: next, lastResult: null });
  }

  setPaused(paused: boolean): void {
    if (this.snapshot.paused === paused) return;
    this.leftoverMs = 0;
    this.set({ paused });
  }

  /**
   * Adopts a server state (action result or upload conflict). The battle is client-side only and never
   * saved, so it keeps running unless the server's state is in another place (zone or stage); stage progress
   * lives in `state.clearedStages`, which comes from the server either way.
   */
  replaceState(state: GameState, revision: number): void {
    const { battle } = this.snapshot;
    const samePlace = battle.zoneId === state.currentZone && battle.stage === state.currentStage;
    if (samePlace) {
      this.set({ game: state, revision });
      return;
    }
    this.leftoverMs = 0;
    this.set({ game: state, battle: this.newBattle(state.currentZone, state.currentStage), revision, lastResult: null });
  }

  setRevision(revision: number): void {
    if (revision <= this.snapshot.revision) return;
    this.set({ revision });
  }

  upgrade(element: ElementId, grade: number): boolean {
    const g = this.snapshot.game;
    const inventory = upgradeElement(g.inventory, element, grade);
    if (!inventory) return false;
    this.set({ game: { ...g, inventory } });
    return true;
  }

  equip(spellId: string): void {
    const g = this.snapshot.game;
    if (g.equipped === spellId || !g.learned.includes(spellId)) return;
    this.set({ game: { ...g, equipped: spellId } });
  }

  /** Goes to a stage of an unlocked zone, up to the highest the server lets us play. Loot so far is kept; nothing is claimed. */
  travel(zoneId: string, stage: number): boolean {
    const g = this.snapshot.game;
    const zone = this.content.zones.find((z) => z.id === zoneId);
    if (!zone || !g.unlockedZones.includes(zoneId)) return false;
    if (!Number.isInteger(stage) || stage < 1 || stage > highestPlayable(g, zone)) return false;
    this.leftoverMs = 0;
    this.set({ game: { ...g, currentZone: zoneId, currentStage: stage }, battle: this.newBattle(zoneId, stage), lastResult: null });
    return true;
  }

  setSynthPending(pending: boolean): void {
    if (this.snapshot.synthPending === pending) return;
    this.set({ synthPending: pending });
  }
}
