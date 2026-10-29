import { createBattle, STEP_MS, stepBattle, type BattleEvent, type BattleState } from '../engine/combat';
import { upgradeElement } from '../engine/inventory';
import type { Content, GameState } from '../engine/model';
import type { Rng } from '../engine/rng';
import type { ElementId } from '../engine/types';

export const MAX_CATCHUP_MS = 1000;

export interface Snapshot {
  game: GameState;
  battle: BattleState;
  revision: number;
  paused: boolean;
  /** a server action (synthesis, empower, reveal, passive) is in flight; its reply replaces the game state */
  synthPending: boolean;
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
    this.snapshot = { game: state, battle: createBattle(state.currentZone, state.currentStage), revision, paused: false, synthPending: false };
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
    let { game, battle } = this.snapshot;
    const events: BattleEvent[] = [];
    let steps = 0;
    while (this.leftoverMs >= STEP_MS) {
      this.leftoverMs -= STEP_MS;
      const r = stepBattle(game, battle, this.content, this.rng);
      game = r.game;
      battle = r.battle;
      events.push(...r.events);
      steps++;
    }
    if (steps === 0) return;
    this.set({ game, battle });
    if (events.length > 0) for (const l of [...this.eventListeners]) l(events);
  }

  setPaused(paused: boolean): void {
    if (this.snapshot.paused === paused) return;
    this.leftoverMs = 0;
    this.set({ paused });
  }

  /**
   * Adopts a server state (action result or upload conflict). The battle is client-side only and never
   * saved, so it keeps running unless the server's state is in another zone; kill progress lives in
   * `state.zoneKills`, which comes from the server either way.
   */
  replaceState(state: GameState, revision: number): void {
    const { battle } = this.snapshot;
    const sameZone = battle.zoneId === state.currentZone;
    if (!sameZone) this.leftoverMs = 0;
    this.set({ game: state, battle: sameZone ? battle : createBattle(state.currentZone, state.currentStage), revision });
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

  travel(zoneId: string): boolean {
    const g = this.snapshot.game;
    if (!g.unlockedZones.includes(zoneId)) return false;
    this.set({ game: { ...g, currentZone: zoneId }, battle: createBattle(zoneId, 1) });
    return true;
  }

  setSynthPending(pending: boolean): void {
    if (this.snapshot.synthPending === pending) return;
    this.set({ synthPending: pending });
  }
}
