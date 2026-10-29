import { describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { createInitialState } from '../engine/persist';
import { ApiError, AuthError, createApiClient, GmExpiredError, RateLimitedError } from './api';
import { clientPasswordHash } from './password-hash';

// the real 300k-iteration hash takes ~0.2 s per call; the format and salt are the same at 1000
vi.mock('./password-hash', async (orig) => {
  const mod = await orig<typeof import('./password-hash')>();
  return { ...mod, clientPasswordHash: (u: string, p: string) => mod.clientPasswordHash(u, p, 1000) };
});
const sentBody = (f: ReturnType<typeof vi.fn>, i = 0) => (f.mock.calls[i] as unknown as [string, RequestInit])[1].body as string;

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('account api', () => {
  it('logs in and parses the save like createGuest', async () => {
    const state = createInitialState(content);
    const f = fakeFetch(200, { token: 't2', playerId: 'p', state, revision: 4 });
    const api = createApiClient(() => null, f as unknown as typeof fetch);
    expect(await api.login('mage_1', 'password1')).toEqual({ token: 't2', state, revision: 4 });
    expect(f).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'mage_1', password: await clientPasswordHash('mage_1', 'password1') }) }));
    expect(sentBody(f)).not.toContain('password1');
  });

  it('binds with the hash, never the password', async () => {
    const f = fakeFetch(200, { username: 'mage_1' });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.bind('mage_1', 'password1')).toEqual({ username: 'mage_1' });
    expect(JSON.parse(sentBody(f))).toEqual({ username: 'mage_1', password: await clientPasswordHash('mage_1', 'password1') });
    expect(sentBody(f)).not.toContain('password1');
  });

  it('changes the password with two hashes salted by the username', async () => {
    const f = fakeFetch(200, {});
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    await api.changePassword('mage_1', 'password1', 'password2');
    expect(JSON.parse(sentBody(f))).toEqual({
      current: await clientPasswordHash('mage_1', 'password1'),
      next: await clientPasswordHash('mage_1', 'password2'),
    });
    expect(sentBody(f)).not.toMatch(/password[12]/);
  });

  it('maps 403 / 409 to ApiError with the server code', async () => {
    const api403 = createApiClient(() => null, fakeFetch(403, { error: 'invalid_credentials' }) as unknown as typeof fetch);
    await expect(api403.login('mage_1', 'password1')).rejects.toMatchObject({ status: 403, code: 'invalid_credentials' });
    const api409 = createApiClient(() => 'tok', fakeFetch(409, { error: 'taken' }) as unknown as typeof fetch);
    const err = await api409.bind('mage_1', 'password1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('taken');
  });

  it('maps 429 to RateLimitedError with retryAfterSec', async () => {
    const api = createApiClient(() => null, fakeFetch(429, { error: 'rate_limited', retryAfterSec: 125 }) as unknown as typeof fetch);
    const err = await api.login('mage_1', 'password1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterSec).toBe(125);
  });

  it('still maps 401 to AuthError', async () => {
    const api = createApiClient(() => 'tok', fakeFetch(401, { error: 'unauthorized' }) as unknown as typeof fetch);
    await expect(api.getAccount()).rejects.toBeInstanceOf(AuthError);
  });

  it('reads account info and sends the other account calls', async () => {
    const f = fakeFetch(200, { displayName: 'Aria', username: null, sessions: 2 });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.getAccount()).toEqual({ displayName: 'Aria', username: null, sessions: 2 });
    await api.changePassword('mage_1', 'password1', 'password2');
    await api.logoutOthers();
    await api.logout();
    const paths = f.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(paths).toEqual(['/api/account', '/api/account/password', '/api/account/logout-others', '/api/logout']);
  });
});

describe('discoveries api', () => {
  const row = { id: 3, spellId: 'x', displayName: 'Aria', at: 1000, first: false };

  it('fetches the feed, with and without ?after', async () => {
    const f = fakeFetch(200, { discoveries: [row] });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.recentDiscoveries()).toEqual([row]);
    await api.recentDiscoveries(7);
    const calls = f.mock.calls.map((c) => {
      const [path, init] = c as unknown as [string, RequestInit];
      return [path, init.method];
    });
    expect(calls).toEqual([['/api/discoveries', 'GET'], ['/api/discoveries?after=7', 'GET']]);
  });

  it('rejects malformed rows and maps 401 to AuthError', async () => {
    for (const bad of [{ ...row, id: '3' }, { ...row, first: 1 }, { ...row, displayName: null }, { ...row, at: 'x' }, { ...row, spellId: 5 }]) {
      const api = createApiClient(() => 'tok', fakeFetch(200, { discoveries: [bad] }) as unknown as typeof fetch);
      await expect(api.recentDiscoveries()).rejects.toBeInstanceOf(ApiError);
    }
    const notArray = createApiClient(() => 'tok', fakeFetch(200, { discoveries: {} }) as unknown as typeof fetch);
    await expect(notArray.recentDiscoveries()).rejects.toBeInstanceOf(ApiError);
    const unauth = createApiClient(() => 'tok', fakeFetch(401, {}) as unknown as typeof fetch);
    await expect(unauth.recentDiscoveries()).rejects.toBeInstanceOf(AuthError);
  });
});

describe('action api', () => {
  const state = createInitialState(content);

  it('posts each action with its id field', async () => {
    const f = fakeFetch(200, { result: { kind: 'empowered', level: 2 }, state, revision: 5 });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.empower(state, 4, 'mana_bolt')).toEqual({ kind: 'ok', result: { kind: 'empowered', level: 2 }, state, revision: 5 });
    await api.reveal(state, 4, 'key:storm_heart');
    await api.unlockPassive(state, 4, 'ember_affinity');
    await api.stageClear(state, 4, 'mist_meadow', 3);
    await api.synthesize(state, 4, ['el:fire:1', 'el:fire:1']);
    const calls = f.mock.calls.map((c) => {
      const [path, init] = c as unknown as [string, RequestInit];
      const { state: _s, ...rest } = JSON.parse(init.body as string) as Record<string, unknown>;
      return [path, rest];
    });
    expect(calls).toEqual([
      ['/api/empower', { baseRevision: 4, spellId: 'mana_bolt' }],
      ['/api/reveal', { baseRevision: 4, keyItem: 'key:storm_heart' }],
      ['/api/passive', { baseRevision: 4, passiveId: 'ember_affinity' }],
      ['/api/stage-clear', { baseRevision: 4, zoneId: 'mist_meadow', stage: 3 }],
      ['/api/synthesize', { baseRevision: 4, inputs: ['el:fire:1', 'el:fire:1'] }],
    ]);
  });

  it('tells a game-rule refusal (422 with result) from an audit rejection (422 with reasons)', async () => {
    const refused = createApiClient(() => 'tok', fakeFetch(422, { reason: 'rejected', result: { kind: 'rejected', reason: 'grade' }, state, revision: 4 }) as unknown as typeof fetch);
    expect(await refused.synthesize(state, 4, ['el:fire:1', 'fireball'])).toEqual({ kind: 'refused', result: { kind: 'rejected', reason: 'grade' }, state, revision: 4 });
    const audit = createApiClient(() => 'tok', fakeFetch(422, { reason: 'rejected', reasons: ['too many fire'], state, revision: 6 }) as unknown as typeof fetch);
    expect(await audit.empower(state, 4, 'mana_bolt')).toEqual({ kind: 'rejected', state, revision: 6, reasons: ['too many fire'] });
  });

  it('keeps the rare flag on a learned result and rejects a malformed one', async () => {
    const learned = { kind: 'learned', spellId: 'x', rare: { first: true } };
    const api = createApiClient(() => 'tok', fakeFetch(200, { result: learned, state, revision: 5 }) as unknown as typeof fetch);
    expect(await api.synthesize(state, 4, ['a', 'b'])).toMatchObject({ kind: 'ok', result: learned });
    const bad = createApiClient(() => 'tok', fakeFetch(200, { result: { kind: 'learned', spellId: 'x', rare: { first: 'yes' } }, state, revision: 5 }) as unknown as typeof fetch);
    await expect(bad.synthesize(state, 4, ['a', 'b'])).rejects.toBeInstanceOf(ApiError);
    const bad2 = createApiClient(() => 'tok', fakeFetch(200, { result: { kind: 'learned', spellId: 'x', rare: true }, state, revision: 5 }) as unknown as typeof fetch);
    await expect(bad2.synthesize(state, 4, ['a', 'b'])).rejects.toBeInstanceOf(ApiError);
  });

  it('maps 409 to a conflict with the server state', async () => {
    const api = createApiClient(() => 'tok', fakeFetch(409, { reason: 'conflict', state, revision: 9 }) as unknown as typeof fetch);
    expect(await api.reveal(state, 4, 'key:storm_heart')).toEqual({ kind: 'conflict', state, revision: 9 });
  });
});

describe('gm api', () => {
  const hdr = (f: ReturnType<typeof vi.fn>) => ((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>);
  it('logs in with the hash, never the password', async () => {
    const f = fakeFetch(200, { gmToken: 'g1', expiresAt: 99 });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.gmLogin('gm_1', 'password1')).toEqual({ gmToken: 'g1', expiresAt: 99 });
    expect(f).toHaveBeenCalledWith('/api/gm/login', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(sentBody(f))).toEqual({ username: 'gm_1', password: await clientPasswordHash('gm_1', 'password1') });
    expect(sentBody(f)).not.toContain('password1');
  });
  it('sends inventory edits with X-GM-Token and parses the outcome', async () => {
    const state = createInitialState(content);
    const f = fakeFetch(200, { result: { kind: 'gm' }, state, revision: 6 });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    const out = await api.gmInventory(state, 5, 'g1', { 'el:fire:1': 3 });
    expect(out).toEqual({ kind: 'ok', result: { kind: 'gm' }, state, revision: 6 });
    expect(f).toHaveBeenCalledWith('/api/gm/inventory', expect.anything());
    expect(hdr(f)['X-GM-Token']).toBe('g1');
    expect(hdr(f).Authorization).toBe('Bearer tok');
    expect(JSON.parse(sentBody(f))).toEqual({ state, baseRevision: 5, items: { 'el:fire:1': 3 } });
  });
  it('sends zone ops and maps 409 to a conflict', async () => {
    const state = createInitialState(content);
    const f = fakeFetch(409, { state, revision: 9 });
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    expect(await api.gmZones(state, 5, 'g1', 'boss_ready')).toEqual({ kind: 'conflict', state, revision: 9 });
    expect(f).toHaveBeenCalledWith('/api/gm/zones', expect.anything());
    expect(hdr(f)['X-GM-Token']).toBe('g1');
    expect(JSON.parse(sentBody(f)).op).toBe('boss_ready');
  });
  it('resets a password with the hash salted by the target username', async () => {
    const f = fakeFetch(200, {});
    const api = createApiClient(() => 'tok', f as unknown as typeof fetch);
    await api.gmResetPassword('g1', 'mage_2', 'temp-pass-1');
    expect(f).toHaveBeenCalledWith('/api/gm/reset-password', expect.anything());
    expect(hdr(f)['X-GM-Token']).toBe('g1');
    expect(JSON.parse(sentBody(f))).toEqual({ username: 'mage_2', password: await clientPasswordHash('mage_2', 'temp-pass-1') });
    expect(sentBody(f)).not.toContain('temp-pass-1');
  });
  it('maps 403 gm_expired to GmExpiredError, not AuthError', async () => {
    const api = createApiClient(() => 'tok', fakeFetch(403, { error: 'gm_expired' }) as unknown as typeof fetch);
    const err = await api.gmInventory(createInitialState(content), 0, 'g1', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GmExpiredError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(AuthError);
  });
});
