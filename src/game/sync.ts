import type { GameState } from '../engine/model';
import type { OfflineResult } from '../engine/offline';
import type { ItemId } from '../engine/types';
import { AuthError, NetworkError, type ActionOutcome, type ActionResult, type ApiClient } from './api';
import type { GameRuntime } from './runtime';

export const UPLOAD_INTERVAL_MS = 30_000;
export const RETRY_MS = 5_000;
/** Consecutive non-network, non-auth upload failures before the status becomes 'error'. */
export const ERROR_AFTER_FAILURES = 2;
/** 'error': the server is reachable but keeps refusing uploads, so progress may not be saved. */
export type ConnStatus = 'online' | 'offline' | 'error';
type UploadResult = 'done' | 'network' | 'auth' | 'error';

export interface ActionPayloads {
  synthesize: { inputs: ItemId[] };
  empower: { spellId: string };
  reveal: { keyItem: ItemId };
  passive: { passiveId: string };
  stageClear: { zoneId: string; stage: number };
  away: Record<string, never>;
  offline: Record<string, never>;
  gmInventory: { gmToken: string; items: Record<ItemId, number> };
  gmZones: { gmToken: string; op: 'unlock_all' | 'reveal_all' | 'boss_ready' };
}
export type OfflineReport = Extract<OfflineResult, { kind: 'offline' }>;
export type ActionKind = keyof ActionPayloads;

/** Lets a caller shape what an action sends and which of the returned state's client-owned fields to keep. */
interface ActionHooks {
  sendState?: (local: GameState) => GameState;
  adopt?: (server: GameState, local: GameState) => GameState;
}

/** Waits this long (at most CLAIM_TRIES times) when another server action is in flight. */
const CLAIM_WAIT_MS = 300;
const CLAIM_TRIES = 10;

interface Timers {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  setTimeout: typeof setTimeout;
}

// Resolve lazily so fake timers installed after import are honoured.
const defaultTimers: Timers = {
  setInterval: ((...a: Parameters<typeof setInterval>) => globalThis.setInterval(...a)) as typeof setInterval,
  clearInterval: ((...a: Parameters<typeof clearInterval>) => globalThis.clearInterval(...a)) as typeof clearInterval,
  setTimeout: ((...a: Parameters<typeof setTimeout>) => globalThis.setTimeout(...a)) as typeof setTimeout,
};

export class SyncController {
  private _status: ConnStatus = 'online';
  private uploading: Promise<unknown> | null = null;
  private retrying = false;
  /** set by start()'s stop function: after an account switch this controller must not upload again */
  private stopped = false;
  private failures = 0;
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private authListeners = new Set<() => void>();
  private offlineListeners = new Set<(r: OfflineReport) => void>();
  /** stage claims run one at a time, in the order the stages were cleared */
  private claims: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly runtime: GameRuntime,
    private readonly api: ApiClient,
    private readonly timers: Timers = defaultTimers,
  ) {}

  get status(): ConnStatus {
    return this._status;
  }

  onStatus(listener: (s: ConnStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => void this.statusListeners.delete(listener);
  }

  onAuthError(listener: () => void): () => void {
    this.authListeners.add(listener);
    return () => void this.authListeners.delete(listener);
  }

  onOfflineReport(cb: (r: OfflineReport) => void): () => void {
    this.offlineListeners.add(cb);
    return () => void this.offlineListeners.delete(cb);
  }

  /** Tells the server the player has been away. Never throws; a failure is ignored (the next claim just pays less). */
  async goAway(): Promise<void> {
    try {
      await this.action('away', {});
    } catch (e) {
      console.warn('away failed:', e instanceof Error ? e.message : 'unknown error');
    }
  }

  /** Claims offline income. Never throws, so a failed claim cannot block the game. */
  async claimOffline(): Promise<OfflineResult | null> {
    try {
      const result = await this.action('offline', {});
      if (result?.kind === 'offline') for (const l of [...this.offlineListeners]) l(result);
      return result?.kind === 'offline' || result?.kind === 'none' ? result : null;
    } catch (e) {
      console.warn('offline claim failed:', e instanceof Error ? e.message : 'unknown error');
      return null;
    }
  }

  start(): () => void {
    this.stopped = false;
    const id = this.timers.setInterval(() => void this.uploadNow(), UPLOAD_INTERVAL_MS);
    const unsubscribeEvents = this.runtime.onEvents((events) => {
      if (this.stopped) return;
      for (const e of events) if (e.type === 'stageCleared') void this.claimStage(e.zoneId, e.stage);
    });
    return () => {
      this.stopped = true;
      unsubscribeEvents();
      this.timers.clearInterval(id);
    };
  }

  private setStatus(s: ConnStatus): void {
    if (this._status === s) return;
    this._status = s;
    for (const l of [...this.statusListeners]) l(s);
  }

  private goOffline(): void {
    this.setStatus('offline');
    this.runtime.setPaused(true);
    if (this.retrying) return;
    this.retrying = true;
    this.scheduleRetry();
  }

  /** Records a non-network upload result and returns the status the server is reachable with. */
  private reachableStatus(result: 'done' | 'error'): ConnStatus {
    this.failures = result === 'done' ? 0 : this.failures + 1;
    return this.failures >= ERROR_AFTER_FAILURES ? 'error' : 'online';
  }

  private scheduleRetry(): void {
    this.timers.setTimeout(() => void this.retry(), RETRY_MS);
  }

  private async retry(): Promise<void> {
    if (this.uploading) {
      await this.uploading;
      if (!this.retrying) return;
    }
    if (this.stopped) {
      this.retrying = false;
      return;
    }
    const result = await this.doUpload();
    if (result === 'network') return this.scheduleRetry();
    this.retrying = false;
    if (result === 'auth') return; // stay paused; UI returns to onboarding
    // done, or a non-network error (server is reachable): resume
    this.setStatus(this.reachableStatus(result));
    this.runtime.setPaused(false);
  }

  /** Runs one upload. Never throws. */
  private doUpload(opts?: { keepalive?: boolean }): Promise<UploadResult> {
    const run = async (): Promise<UploadResult> => {
      try {
        const { revision } = this.runtime.getSnapshot();
        const out = await this.api.upload(this.runtime.clampedGame(), revision, opts);
        if (out.kind === 'ok') this.runtime.setRevision(out.revision);
        else this.runtime.replaceState(out.state, out.revision);
        return 'done';
      } catch (e) {
        if (e instanceof NetworkError) return 'network';
        if (e instanceof AuthError) {
          this.notifyAuth();
          return 'auth';
        }
        console.warn('upload failed:', e instanceof Error ? e.message : 'unknown error');
        return 'error';
      }
    };
    const p = run().finally(() => {
      this.uploading = null;
    });
    this.uploading = p;
    return p;
  }

  private notifyAuth(): void {
    for (const l of [...this.authListeners]) l();
  }

  async uploadNow(opts?: { keepalive?: boolean }): Promise<void> {
    if (this.stopped || this.uploading || this.retrying || this.runtime.getSnapshot().synthPending) return;
    const result = await this.doUpload(opts);
    if (result === 'network') this.goOffline();
    else if (result !== 'auth') this.setStatus(this.reachableStatus(result));
  }

  /**
   * Runs a server action on the current state. Applied: adopts the returned state and returns the result.
   * Refused by the game rules (kind 'rejected'): the server wrote nothing, so the local state stays and the
   * result is returned for the UI to explain. Conflict / audit rejection: adopts the server state, returns
   * null. Busy, offline or auth failure: null. Other errors are thrown.
   */
  async action<K extends ActionKind>(kind: K, payload: ActionPayloads[K], hooks: ActionHooks = {}): Promise<ActionResult | null> {
    if (this.retrying || this.runtime.getSnapshot().synthPending) return null;
    if (this.uploading) {
      await this.uploading;
      if (this.retrying || this.runtime.getSnapshot().synthPending) return null;
    }
    this.runtime.setSynthPending(true);
    try {
      const { revision } = this.runtime.getSnapshot();
      const game = this.runtime.clampedGame();
      const out = await this.send(kind, payload, hooks.sendState ? hooks.sendState(game) : game, revision);
      if (out.kind === 'refused') {
        this.runtime.setRevision(out.revision);
        return out.result;
      }
      const adopt = hooks.adopt && out.kind === 'ok' ? hooks.adopt(out.state, this.runtime.getSnapshot().game) : out.state;
      this.runtime.replaceState(adopt, out.revision);
      return out.kind === 'ok' ? out.result : null;
    } catch (e) {
      if (e instanceof NetworkError) this.goOffline();
      else if (e instanceof AuthError) this.notifyAuth();
      else throw e;
      return null;
    } finally {
      this.runtime.setSynthPending(false);
    }
  }

  private send(kind: ActionKind, payload: ActionPayloads[ActionKind], game: GameState, revision: number): Promise<ActionOutcome> {
    switch (kind) {
      case 'synthesize':
        return this.api.synthesize(game, revision, (payload as ActionPayloads['synthesize']).inputs);
      case 'empower':
        return this.api.empower(game, revision, (payload as ActionPayloads['empower']).spellId);
      case 'reveal':
        return this.api.reveal(game, revision, (payload as ActionPayloads['reveal']).keyItem);
      case 'passive':
        return this.api.unlockPassive(game, revision, (payload as ActionPayloads['passive']).passiveId);
      case 'stageClear': {
        const p = payload as ActionPayloads['stageClear'];
        return this.api.stageClear(game, revision, p.zoneId, p.stage);
      }
      case 'away':
        return this.api.away(game, revision);
      case 'offline':
        return this.api.offline(game, revision);
      case 'gmInventory': {
        const p = payload as ActionPayloads['gmInventory'];
        return this.api.gmInventory(game, revision, p.gmToken, p.items);
      }
      case 'gmZones': {
        const p = payload as ActionPayloads['gmZones'];
        return this.api.gmZones(game, revision, p.gmToken, p.op);
      }
    }
  }

  /**
   * Asks the server to settle a cleared stage. The request carries the state as it was when the stage
   * ended (current place = the cleared stage, which the audit measures against server progress); the
   * runtime has already moved on, so the reply keeps the local place. A refusal (422) keeps the local
   * state and is not retried. Claims run one at a time and wait for other in-flight actions.
   */
  claimStage(zoneId: string, stage: number): Promise<ActionResult | null> {
    const attempt = async (): Promise<ActionResult | null> => {
      for (let i = 0; i < CLAIM_TRIES; i++) {
        if (this.stopped || this.retrying) return null;
        if (!this.runtime.getSnapshot().synthPending) {
          const result = await this.action('stageClear', { zoneId, stage }, {
            sendState: (g) => ({ ...g, currentZone: zoneId, currentStage: stage }),
            adopt: (server, local) => ({ ...server, currentZone: local.currentZone, currentStage: local.currentStage }),
          });
          if (result?.kind === 'cleared') this.runtime.setStageLoot(zoneId, stage, result.loot);
          return result;
        }
        await new Promise<void>((resolve) => this.timers.setTimeout(resolve, CLAIM_WAIT_MS));
      }
      return null;
    };
    const run = async (): Promise<ActionResult | null> => {
      let result: ActionResult | null = null;
      try {
        result = await attempt();
      } finally {
        if (result?.kind !== 'cleared') this.runtime.claimFailed(zoneId, stage);
      }
      return result;
    };
    const p = this.claims.then(run, run);
    this.claims = p.catch(() => undefined);
    return p;
  }

  synthesize(inputs: ItemId[]): Promise<ActionResult | null> {
    return this.action('synthesize', { inputs });
  }
}
