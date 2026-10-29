import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { createRng } from '../engine/rng';
import { createInitialState } from '../engine/persist';
import { ApiError, AuthError, GmExpiredError, NetworkError, type ApiClient } from './api';
import * as battleMod from '../engine/combat';
import { STEP_MS } from '../engine/combat';
import { GameRuntime } from './runtime';
import { RETRY_MS, SyncController, UPLOAD_INTERVAL_MS } from './sync';

const server = { ...createInitialState(content), equipped: 'mana_bolt', clearedStages: { mist_meadow: 5 } };
function fakeApi(over: Partial<ApiClient> = {}): ApiClient {
  return {
    recentDiscoveries: vi.fn(),
    createGuest: vi.fn(),
    loadSave: vi.fn(),
    upload: vi.fn(async () => ({ kind: 'ok' as const, revision: 8 })),
    synthesize: vi.fn(),
    empower: vi.fn(),
    reveal: vi.fn(),
    unlockPassive: vi.fn(),
    stageClear: vi.fn(),
    login: vi.fn(),
    bind: vi.fn(),
    getAccount: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    gmLogin: vi.fn(),
    gmInventory: vi.fn(),
    gmZones: vi.fn(),
    gmResetPassword: vi.fn(),
    ...over,
  };
}
const mk = () => new GameRuntime(content, createInitialState(content), 7, createRng(1));

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
    const result = { kind: 'learned' as const, spellId: 'mana_bolt', crafted: false };
    const api = fakeApi({ synthesize: vi.fn(async () => ({ kind: 'ok' as const, result, state: server, revision: 10 })) });
    const sync = new SyncController(rt, api);
    expect(await sync.synthesize(['el:fire:1', 'el:fire:1'])).toEqual(result);
    expect(rt.getSnapshot().game).toBe(server);
    expect(rt.getSnapshot().revision).toBe(10);
    expect(api.synthesize).toHaveBeenCalledWith(expect.anything(), 7, ['el:fire:1', 'el:fire:1']);
  });
  it("sync.action('empower') adopts the server state", async () => {
    const rt = mk();
    const result = { kind: 'empowered' as const, level: 2 };
    const empowered = { ...server, levels: { mana_bolt: 2 } };
    const api = fakeApi({ empower: vi.fn(async () => ({ kind: 'ok' as const, result, state: empowered, revision: 10 })) });
    const sync = new SyncController(rt, api);
    expect(await sync.action('empower', { spellId: 'mana_bolt' })).toEqual(result);
    expect(api.empower).toHaveBeenCalledWith(expect.anything(), 7, 'mana_bolt');
    expect(rt.getSnapshot().game).toBe(empowered);
    expect(rt.getSnapshot().revision).toBe(10);
    expect(rt.getSnapshot().synthPending).toBe(false);
  });
  it('sends reveal and passive actions with their ids', async () => {
    const rt = mk();
    const api = fakeApi({
      reveal: vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'revealed' as const, region: 'outer' }, state: server, revision: 10 })),
      unlockPassive: vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'unlocked' as const }, state: server, revision: 11 })),
    });
    const sync = new SyncController(rt, api);
    expect(await sync.action('reveal', { keyItem: 'key:storm_heart' })).toEqual({ kind: 'revealed', region: 'outer' });
    expect(api.reveal).toHaveBeenCalledWith(expect.anything(), 7, 'key:storm_heart');
    expect(await sync.action('passive', { passiveId: 'ember_affinity' })).toEqual({ kind: 'unlocked' });
    expect(api.unlockPassive).toHaveBeenCalledWith(expect.anything(), 10, 'ember_affinity');
  });
  it('sends a stage-clear with its zone and stage', async () => {
    const rt = mk();
    const api = fakeApi({
      stageClear: vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'cleared' as const, loot: ['el:fire:1'] }, state: server, revision: 8 })),
    });
    const sync = new SyncController(rt, api);
    expect(await sync.action('stageClear', { zoneId: 'mist_meadow', stage: 1 })).toEqual({ kind: 'cleared', loot: ['el:fire:1'] });
    expect(api.stageClear).toHaveBeenCalledWith(expect.anything(), 7, 'mist_meadow', 1);
  });
  it('a rejected action keeps the state and reports the result', async () => {
    const rt = mk();
    const before = rt.getSnapshot().game;
    const result = { kind: 'rejected' as const, reason: 'insufficient' as const };
    const api = fakeApi({ empower: vi.fn(async () => ({ kind: 'refused' as const, result, state: server, revision: 7 })) });
    const sync = new SyncController(rt, api);
    expect(await sync.action('empower', { spellId: 'mana_bolt' })).toEqual(result);
    expect(rt.getSnapshot().game).toBe(before);
    expect(rt.getSnapshot().revision).toBe(7);
    expect(rt.getSnapshot().synthPending).toBe(false);
  });
  it('an audit-rejected action adopts the server state and returns null', async () => {
    const rt = mk();
    const api = fakeApi({ synthesize: vi.fn(async () => ({ kind: 'rejected' as const, state: server, revision: 12, reasons: ['too many'] })) });
    const sync = new SyncController(rt, api);
    expect(await sync.action('synthesize', { inputs: ['el:fire:1', 'el:fire:1'] })).toBeNull();
    expect(rt.getSnapshot().game).toBe(server);
    expect(rt.getSnapshot().revision).toBe(12);
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
  it('gm actions replace the state; an expired GM token is thrown without auth failure', async () => {
    const rt = mk();
    const gmInventory = vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'gm' as const }, state: server, revision: 10 }));
    const gmZones = vi.fn(async () => { throw new GmExpiredError(); });
    const sync = new SyncController(rt, fakeApi({ gmInventory, gmZones }));
    const onAuth = vi.fn();
    sync.onAuthError(onAuth);
    expect(await sync.action('gmInventory', { gmToken: 'g1', items: { 'el:fire:1': 2 } })).toEqual({ kind: 'gm' });
    expect(gmInventory).toHaveBeenCalledWith(expect.anything(), 7, 'g1', { 'el:fire:1': 2 });
    expect(rt.getSnapshot().game).toBe(server);
    await expect(sync.action('gmZones', { gmToken: 'g1', op: 'unlock_all' })).rejects.toBeInstanceOf(GmExpiredError);
    expect(gmZones).toHaveBeenCalledWith(expect.anything(), 10, 'g1', 'unlock_all');
    expect(onAuth).not.toHaveBeenCalled();
    expect(rt.getSnapshot().synthPending).toBe(false);
  });

  describe('stage claims', () => {
    const settled = { ...server, clearedStages: { mist_meadow: 1 }, lastClearAt: 99, inventory: { 'el:fire:1': 5 } };
    /** the runtime reports stage 1 cleared on its next step */
    const clearStage = (rt: GameRuntime) => {
      const spy = vi.spyOn(battleMod, 'stepBattle').mockImplementationOnce((game, battle) => ({
        game,
        battle: { ...battle, phase: 'done' },
        events: [{ type: 'stageCleared', zoneId: battle.zoneId, stage: battle.stage }],
      }));
      rt.advance(STEP_MS);
      spy.mockRestore();
    };
    afterEach(() => vi.restoreAllMocks());

    it('a stageCleared event claims the stage once', async () => {
      const rt = mk();
      const stageClear = vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'cleared' as const, loot: ['el:fire:1'] }, state: settled, revision: 10 }));
      const sync = new SyncController(rt, fakeApi({ stageClear }));
      sync.start();
      clearStage(rt);
      await vi.advanceTimersByTimeAsync(0);
      expect(stageClear).toHaveBeenCalledTimes(1);
      // the request describes the cleared stage even though the runtime already moved on
      const [sent, baseRevision, zoneId, stage] = stageClear.mock.calls[0] as unknown as [{ currentStage: number }, number, string, number];
      expect(sent.currentStage).toBe(1);
      expect([baseRevision, zoneId, stage]).toEqual([7, 'mist_meadow', 1]);
      const snap = rt.getSnapshot();
      expect(snap.game.clearedStages).toEqual({ mist_meadow: 1 });
      expect(snap.game.inventory).toEqual({ 'el:fire:1': 5 });
      expect(snap.game.currentStage).toBe(2); // local place kept
      expect(snap.battle.stage).toBe(2);
      expect(snap.revision).toBe(10);
      expect(snap.lastResult).toEqual({ kind: 'cleared', zoneId: 'mist_meadow', stage: 1, loot: ['el:fire:1'], pending: false, claimed: true });
      expect(snap.synthPending).toBe(false);
    });
    it('a 422 tooFast claim keeps the local state and does not retry', async () => {
      const rt = mk();
      const stageClear = vi.fn(async () => ({ kind: 'refused' as const, result: { kind: 'rejected' as const, reason: 'tooFast' as const }, state: server, revision: 8 }));
      const sync = new SyncController(rt, fakeApi({ stageClear }));
      sync.start();
      const before = rt.getSnapshot().game;
      clearStage(rt);
      await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
      expect(stageClear).toHaveBeenCalledTimes(1);
      const snap = rt.getSnapshot();
      expect(snap.game.clearedStages).toBe(before.clearedStages);
      expect(snap.revision).toBe(8);
      // the frontier stage was not settled: back on it, not one past it
      expect(snap.battle.stage).toBe(1);
      expect(snap.game.currentStage).toBe(1);
      expect(snap.lastResult).toEqual({ kind: 'cleared', zoneId: 'mist_meadow', stage: 1, loot: [], pending: false, claimed: false });
    });
    it('pending is true until the reply, then false with the server loot', async () => {
      const rt = mk();
      let reply!: (v: never) => void;
      const stageClear = vi.fn(() => new Promise((r) => (reply = r as never)));
      const sync = new SyncController(rt, fakeApi({ stageClear: stageClear as never }));
      sync.start();
      clearStage(rt);
      await vi.advanceTimersByTimeAsync(0);
      expect(rt.getSnapshot().lastResult).toMatchObject({ kind: 'cleared', pending: true, claimed: false });
      reply({ kind: 'ok', result: { kind: 'cleared', loot: ['el:fire:1'] }, state: settled, revision: 10 } as never);
      await vi.advanceTimersByTimeAsync(0);
      expect(rt.getSnapshot().lastResult).toMatchObject({ pending: false, claimed: true, loot: ['el:fire:1'] });
    });
    it('a lost claim on the frontier clamps back before the retried upload, which never exceeds highestPlayable', async () => {
      const rt = mk();
      const stageClear = vi.fn().mockRejectedValue(new NetworkError('x'));
      const upload = vi.fn(async () => ({ kind: 'ok' as const, revision: 9 }));
      const sync = new SyncController(rt, fakeApi({ stageClear, upload }));
      sync.start();
      clearStage(rt);
      expect(rt.getSnapshot().game.currentStage).toBe(2); // optimistic until the claim fails
      await vi.advanceTimersByTimeAsync(0);
      expect(rt.getSnapshot().game.currentStage).toBe(1);
      expect(rt.getSnapshot().battle.stage).toBe(1);
      expect(rt.getSnapshot().lastResult).toMatchObject({ pending: false, claimed: false, loot: [] });
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(upload).toHaveBeenCalledTimes(1);
      const sent = (upload.mock.calls[0] as unknown as [{ currentStage: number }])[0];
      expect(sent.currentStage).toBeLessThanOrEqual(1);
    });
    it('uploads clamp currentStage even while the claim is still waiting', async () => {
      const rt = mk();
      const upload = vi.fn(async () => ({ kind: 'ok' as const, revision: 9 }));
      const sync = new SyncController(rt, fakeApi({ upload, stageClear: vi.fn(() => new Promise(() => {})) as never }));
      sync.start();
      clearStage(rt);
      await sync.uploadNow();
      const sent = (upload.mock.calls[0] as unknown as [{ currentStage: number }])[0];
      expect(sent.currentStage).toBe(1);
    });
    it('a network error on claim goes offline and retries the upload like other actions', async () => {
      const rt = mk();
      const stageClear = vi.fn().mockRejectedValue(new NetworkError('x'));
      const upload = vi.fn(async () => ({ kind: 'ok' as const, revision: 9 }));
      const sync = new SyncController(rt, fakeApi({ stageClear, upload }));
      sync.start();
      clearStage(rt);
      await vi.advanceTimersByTimeAsync(0);
      expect(sync.status).toBe('offline');
      expect(rt.getSnapshot().paused).toBe(true);
      expect(stageClear).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(RETRY_MS);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(sync.status).toBe('online');
      expect(rt.getSnapshot().paused).toBe(false);
      expect(stageClear).toHaveBeenCalledTimes(1);
    });
    it('waits for another in-flight action instead of dropping the claim', async () => {
      const rt = mk();
      let finish!: (v: never) => void;
      const synthesize = vi.fn(() => new Promise((r) => (finish = r as never)));
      const stageClear = vi.fn(async () => ({ kind: 'ok' as const, result: { kind: 'cleared' as const, loot: [] }, state: settled, revision: 11 }));
      const sync = new SyncController(rt, fakeApi({ synthesize: synthesize as never, stageClear }));
      sync.start();
      const p = sync.synthesize(['el:fire:1', 'el:fire:1']);
      clearStage(rt);
      await vi.advanceTimersByTimeAsync(0);
      expect(stageClear).not.toHaveBeenCalled();
      finish({ kind: 'ok', result: { kind: 'dormant' }, state: server, revision: 10 } as never);
      await p;
      await vi.advanceTimersByTimeAsync(1000);
      expect(stageClear).toHaveBeenCalledTimes(1);
    });
  });
});
