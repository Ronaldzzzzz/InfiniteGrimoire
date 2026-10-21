import { createBattle, STEP_MS, stepBattle, type BattleEvent, type BattleState } from '../engine/battle';
import { upgradeElement } from '../engine/inventory';
import type { Rng } from '../engine/rng';
import { equipSpell, travel, type GameState } from '../engine/state';
import type { ElementId, GameData } from '../engine/types';

export const MAX_CATCHUP_MS = 1000;

export interface Snapshot {
  game: GameState;
  battle: BattleState;
  revision: number;
  paused: boolean;
  synthPending: boolean;
}

export class GameRuntime {
  private snapshot: Snapshot;
  private leftoverMs = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(events: BattleEvent[]) => void>();

  constructor(
    private readonly data: GameData,
    state: GameState,
    revision: number,
    private readonly rng: Rng,
  ) {
    this.snapshot = { game: state, battle: createBattle(state.currentZone), revision, paused: false, synthPending: false };
  }

  getSnapshot(): Snapshot {
    return this.snapshot;
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
      const r = stepBattle(game, battle, this.data, this.rng);
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

  replaceState(state: GameState, revision: number): void {
    this.leftoverMs = 0;
    this.set({ game: state, battle: createBattle(state.currentZone), revision });
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
    const next = equipSpell(this.snapshot.game, spellId);
    if (next !== this.snapshot.game) this.set({ game: next });
  }

  travel(zoneId: string): boolean {
    const next = travel(this.snapshot.game, zoneId);
    if (!next) return false;
    this.set({ game: next, battle: createBattle(zoneId) });
    return true;
  }

  setSynthPending(pending: boolean): void {
    if (this.snapshot.synthPending === pending) return;
    this.set({ synthPending: pending });
  }
}
