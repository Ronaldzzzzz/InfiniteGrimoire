import type { SynthResult } from '../engine/synthesis';
import type { ItemId } from '../engine/types';
import { AuthError, NetworkError, type ApiClient } from './api';
import type { GameRuntime } from './runtime';

export const UPLOAD_INTERVAL_MS = 30_000;
export const RETRY_MS = 5_000;
/** Consecutive non-network, non-auth upload failures before the status becomes 'error'. */
export const ERROR_AFTER_FAILURES = 2;
/** 'error': the server is reachable but keeps refusing uploads, so progress may not be saved. */
export type ConnStatus = 'online' | 'offline' | 'error';
type UploadResult = 'done' | 'network' | 'auth' | 'error';

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
  private failures = 0;
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
        const { game, revision } = this.runtime.getSnapshot();
        const out = await this.api.upload(game, revision, opts);
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
    if (this.uploading || this.retrying || this.runtime.getSnapshot().synthPending) return;
    const result = await this.doUpload(opts);
    if (result === 'network') this.goOffline();
    else if (result !== 'auth') this.setStatus(this.reachableStatus(result));
  }

  async synthesize(inputs: ItemId[]): Promise<SynthResult | null> {
    if (this.retrying || this.runtime.getSnapshot().synthPending) return null;
    if (this.uploading) {
      await this.uploading;
      if (this.retrying || this.runtime.getSnapshot().synthPending) return null;
    }
    this.runtime.setSynthPending(true);
    try {
      const { game, revision } = this.runtime.getSnapshot();
      const out = await this.api.synthesize(game, revision, inputs);
      this.runtime.replaceState(out.state, out.revision);
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
}
