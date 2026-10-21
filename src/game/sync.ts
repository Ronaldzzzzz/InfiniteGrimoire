import type { SynthResult } from '../engine/synthesis';
import type { ItemId } from '../engine/types';
import { AuthError, NetworkError, type ApiClient } from './api';
import type { GameRuntime } from './runtime';

export const UPLOAD_INTERVAL_MS = 30_000;
export const RETRY_MS = 5_000;
export type ConnStatus = 'online' | 'offline';

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
  private inFlight = false;
  private retrying = false;
  private statusListeners = new Set<(s: ConnStatus) => void>();
  private authListeners = new Set<() => void>();

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

  start(): () => void {
    const id = this.timers.setInterval(() => void this.uploadNow(), UPLOAD_INTERVAL_MS);
    return () => this.timers.clearInterval(id);
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

  private scheduleRetry(): void {
    this.timers.setTimeout(() => void this.retry(), RETRY_MS);
  }

  private async retry(): Promise<void> {
    if (this.inFlight) return void this.scheduleRetry();
    const result = await this.doUpload();
    if (result === 'network') return this.scheduleRetry();
    this.retrying = false;
    if (result === 'auth') return;
    this.setStatus('online');
    this.runtime.setPaused(false);
  }

  /** Runs one upload. Never throws. */
  private async doUpload(opts?: { keepalive?: boolean }): Promise<'done' | 'network' | 'auth'> {
    this.inFlight = true;
    try {
      const { game, revision } = this.runtime.getSnapshot();
      const out = await this.api.upload(game, revision, opts);
      if (out.kind === 'ok') this.runtime.setRevision(out.revision);
      else this.runtime.replaceState(out.state, out.revision);
      return 'done';
    } catch (e) {
      if (e instanceof NetworkError) return 'network';
      if (e instanceof AuthError) {
        for (const l of [...this.authListeners]) l();
        return 'auth';
      }
      throw e;
    } finally {
      this.inFlight = false;
    }
  }

  async uploadNow(opts?: { keepalive?: boolean }): Promise<void> {
    if (this.inFlight || this.retrying || this.runtime.getSnapshot().synthPending) return;
    if ((await this.doUpload(opts)) === 'network') this.goOffline();
  }

  async synthesize(inputs: ItemId[]): Promise<SynthResult | null> {
    if (this.inFlight || this.retrying || this.runtime.getSnapshot().synthPending) return null;
    this.runtime.setSynthPending(true);
    try {
      const { game, revision } = this.runtime.getSnapshot();
      const out = await this.api.synthesize(game, revision, inputs);
      this.runtime.replaceState(out.state, out.revision);
      return out.kind === 'ok' ? out.result : null;
    } catch (e) {
      if (e instanceof NetworkError) this.goOffline();
      else if (e instanceof AuthError) for (const l of [...this.authListeners]) l();
      else throw e;
      return null;
    } finally {
      this.runtime.setSynthPending(false);
    }
  }
}
