import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { ApiError, AuthError, createApiClient, RateLimitedError } from './api';
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
    const state = createInitialState(gameData);
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
