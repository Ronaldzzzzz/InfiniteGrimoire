import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createRng } from '../engine/rng';
import { createInitialState } from '../engine/state';
import { ApiError, AuthError, NetworkError, type ApiClient } from './api';
import { GameRuntime } from './runtime';
import { RETRY_MS, SyncController, UPLOAD_INTERVAL_MS } from './sync';

const server = { ...createInitialState(gameData), equipped: 'mana_bolt', zoneKills: { x: 5 } };
function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    createGuest: vi.fn(),
    loadSave: vi.fn(),
    upload: vi.fn(async () => ({ kind: 'ok' as const, revision: 8 })),
    synthesize: vi.fn(),
    login: vi.fn(),
    bind: vi.fn(),
    getAccount: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    ...over,
  };
}
const mk = () => new GameRuntime(gameData, createInitialState(gameData), 7, createRng(1));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SyncController', () => {
  it('uploads every 30s with current revision', async () => {
    const rt = mk();
    const api = fakeApi();
    const sync = new SyncController(rt, api);
    const stop = sync.start();
    await vi.advanceTimersByTimeAsync(UPLOAD_INTERVAL_MS);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.upload).toHaveBeenCalledWith(rt.getSnapshot().game, 7, undefined);
    expect(rt.getSnapshot().revision).toBe(8);
    await vi.advanceTimersByTimeAsync(UPLOAD_INTERVAL_MS);
    expect((api.upload as ReturnType<typeof vi.fn>).mock.calls[1][1]).toBe(8);
    stop();
    await vi.advanceTimersByTimeAsync(UPLOAD_INTERVAL_MS * 2);
    expect(api.upload).toHaveBeenCalledTimes(2);
  });
  it('rejected upload replaces state', async () => {
    const rt = mk();
    const api = fakeApi({ upload: vi.fn(async () => ({ kind: 'rejected' as const, state: server, revision: 12 })) });
    const sync = new SyncController(rt, api);
    await sync.uploadNow();
    expect(rt.getSnapshot().game).toBe(server);
    expect(rt.getSnapshot().revision).toBe(12);
  });
  it('network error pauses runtime and retries every 5s until success then resumes', async () => {
    const rt = mk();
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new NetworkError('x'))
      .mockRejectedValueOnce(new NetworkError('x'))
      .mockResolvedValue({ kind: 'ok', revision: 9 });
    const sync = new SyncController(rt, fakeApi({ upload }));
    const statuses: string[] = [];
    sync.onStatus((s) => statuses.push(s));
    await sync.uploadNow();
    expect(sync.status).toBe('offline');
    expect(rt.getSnapshot().paused).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(sync.status).toBe('offline');
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(sync.status).toBe('online');
    expect(rt.getSnapshot().paused).toBe(false);
    expect(rt.getSnapshot().revision).toBe(9);
    expect(statuses).toEqual(['offline', 'online']);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(upload).toHaveBeenCalledTimes(3);
  });
  it('stopping the controller also stops the offline retry chain', async () => {
    // a switched-away controller must never upload its old state with the new account's token
    const rt = mk();
    const upload = vi.fn().mockRejectedValueOnce(new NetworkError('x')).mockResolvedValue({ kind: 'ok', revision: 9 });
    const sync = new SyncController(rt, fakeApi({ upload }));
    const stop = sync.start();
    await sync.uploadNow();
    expect(sync.status).toBe('offline');
    stop();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3 + UPLOAD_INTERVAL_MS);
    expect(upload).toHaveBeenCalledTimes(1);
    await sync.uploadNow();
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('synthesize while pending returns null and sends one request', async () => {
    const rt = mk();
    let resolve!: (v: never) => void;
    const synthesize = vi.fn(() => new Promise((r) => (resolve = r as never)));
    const api = fakeApi({ synthesize: synthesize as never });
    const sync = new SyncController(rt, api);
    const p1 = sync.synthesize(['el:fire:1', 'el:fire:1']);
    expect(rt.getSnapshot().synthPending).toBe(true);
    expect(await sync.synthesize(['el:fire:1', 'el:fire:1'])).toBeNull();
    expect(synthesize).toHaveBeenCalledTimes(1);
    await sync.uploadNow();
    expect(api.upload).not.toHaveBeenCalled();
    resolve({ kind: 'ok', result: { kind: 'dormant' }, state: server, revision: 10 } as never);
    await p1;
    expect(rt.getSnapshot().synthPending).toBe(false);
  });
  it('synthesize ok applies server state and returns result', async () => {
    const rt = mk();
    const result = { kind: 'learned' as const, spellId: 'mana_bolt' };
    const api = fakeApi({ synthesize: vi.fn(async () => ({ kind: 'ok' as const, result, state: server, revision: 10 })) });
    const sync = new SyncController(rt, api);
    expect(await sync.synthesize(['el:fire:1', 'el:fire:1'])).toEqual(result);
    expect(rt.getSnapshot().game).toBe(server);
    expect(rt.getSnapshot().revision).toBe(10);
    expect(api.synthesize).toHaveBeenCalledWith(expect.anything(), 7, ['el:fire:1', 'el:fire:1']);
  });
  it('synthesize while offline returns null; conflict replaces state', async () => {
    const rt = mk();
    const api = fakeApi({
      upload: vi.fn(async () => {
        throw new NetworkError('x');
      }),
      synthesize: vi.fn(async () => ({ kind: 'conflict' as const, state: server, revision: 11 })),
    });
    const sync = new SyncController(rt, api);
    await sync.uploadNow();
    expect(await sync.synthesize(['el:fire:1', 'el:fire:1'])).toBeNull();
    expect(api.synthesize).not.toHaveBeenCalled();
    const rt2 = mk();
    const s2 = new SyncController(rt2, api);
    expect(await s2.synthesize(['el:fire:1', 'el:fire:1'])).toBeNull();
    expect(rt2.getSnapshot().revision).toBe(11);
  });
  it('AuthError reaches onAuthError listeners', async () => {
    const api = fakeApi({
      upload: vi.fn(async () => {
        throw new AuthError('401');
      }),
    });
    const sync = new SyncController(mk(), api);
    const fn = vi.fn();
    sync.onAuthError(fn);
    await sync.uploadNow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('ApiError during retry resumes the game', async () => {
    const rt = mk();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const upload = vi.fn().mockRejectedValueOnce(new NetworkError('x')).mockRejectedValueOnce(new ApiError('bad', 400));
    const sync = new SyncController(rt, fakeApi({ upload }));
    await sync.uploadNow();
    expect(rt.getSnapshot().paused).toBe(true);
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sync.status).toBe('online');
    expect(rt.getSnapshot().paused).toBe(false);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(upload).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('AuthError during retry notifies onAuthError and stops retrying', async () => {
    const rt = mk();
    const upload = vi.fn().mockRejectedValueOnce(new NetworkError('x')).mockRejectedValueOnce(new AuthError('401'));
    const sync = new SyncController(rt, fakeApi({ upload }));
    const fn = vi.fn();
    sync.onAuthError(fn);
    await sync.uploadNow();
    await vi.advanceTimersByTimeAsync(RETRY_MS * 4);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('synthesize waits for in-flight upload then uses new revision', async () => {
    const rt = mk();
    let resolveUp!: (v: { kind: 'ok'; revision: number }) => void;
    const upload = vi.fn(() => new Promise<{ kind: 'ok'; revision: number }>((r) => (resolveUp = r)));
    const result = { kind: 'dormant' as const };
    const synthesize = vi.fn(async () => ({ kind: 'ok' as const, result, state: server, revision: 20 }));
    const sync = new SyncController(rt, fakeApi({ upload, synthesize }));
    const up = sync.uploadNow();
    const syn = sync.synthesize(['el:fire:1', 'el:fire:1']);
    await Promise.resolve();
    expect(synthesize).not.toHaveBeenCalled();
    resolveUp({ kind: 'ok', revision: 8 });
    await up;
    expect(await syn).toEqual(result);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith(expect.anything(), 8, ['el:fire:1', 'el:fire:1']);
  });
  it('two consecutive non-network upload failures set status error; a success clears it', async () => {
    const rt = mk();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('bad', 400))
      .mockRejectedValueOnce(new ApiError('bad', 400))
      .mockResolvedValue({ kind: 'ok', revision: 9 });
    const sync = new SyncController(rt, fakeApi({ upload }));
    const statuses: string[] = [];
    sync.onStatus((s) => statuses.push(s));
    await sync.uploadNow();
    expect(sync.status).toBe('online');
    await sync.uploadNow();
    expect(sync.status).toBe('error');
    expect(rt.getSnapshot().paused).toBe(false);
    await sync.uploadNow();
    expect(sync.status).toBe('online');
    expect(statuses).toEqual(['error', 'online']);
    warn.mockRestore();
  });
  it('failures separated by a success, or auth errors, do not set error', async () => {
    const rt = mk();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('bad', 400))
      .mockResolvedValueOnce({ kind: 'ok', revision: 9 })
      .mockRejectedValueOnce(new ApiError('bad', 400))
      .mockRejectedValueOnce(new AuthError('401'));
    const sync = new SyncController(rt, fakeApi({ upload }));
    for (let i = 0; i < 4; i++) await sync.uploadNow();
    expect(sync.status).toBe('online');
    warn.mockRestore();
  });
  it('an error during the offline retry counts toward the error status', async () => {
    const rt = mk();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('bad', 400))
      .mockRejectedValueOnce(new NetworkError('x'))
      .mockRejectedValueOnce(new ApiError('bad', 400));
    const sync = new SyncController(rt, fakeApi({ upload }));
    await sync.uploadNow();
    await sync.uploadNow();
    expect(sync.status).toBe('offline');
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sync.status).toBe('error');
    expect(rt.getSnapshot().paused).toBe(false);
    warn.mockRestore();
  });
  it('setRevision ignores lower revisions', () => {
    const rt = mk();
    rt.setRevision(2);
    expect(rt.getSnapshot().revision).toBe(7);
  });
});
