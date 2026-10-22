import { gameData } from '../engine/data';
import { parseState } from '../engine/save';
import type { GameState } from '../engine/state';
import type { SynthResult } from '../engine/synthesis';
import type { ItemId } from '../engine/types';
import { clientPasswordHash } from './password-hash';

export type UploadOutcome =
  | { kind: 'ok'; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number; reasons?: string[] };
export type SynthOutcome =
  | { kind: 'ok'; result: SynthResult; state: GameState; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number };

export class NetworkError extends Error {}
export class AuthError extends Error {}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** the server's `{ error }` code, e.g. 'taken' or 'invalid_credentials' */
    readonly code?: string,
  ) {
    super(message);
  }
}

export class RateLimitedError extends ApiError {
  constructor(readonly retryAfterSec: number) {
    super('rate limited', 429, 'rate_limited');
  }
}

export type LoginResult = { token: string; state: GameState; revision: number };
export interface AccountInfo {
  displayName: string;
  username: string | null;
  sessions: number;
}

export interface ApiClient {
  createGuest(displayName: string): Promise<LoginResult>;
  loadSave(): Promise<{ state: GameState; revision: number }>;
  upload(state: GameState, baseRevision: number, opts?: { keepalive?: boolean }): Promise<UploadOutcome>;
  synthesize(state: GameState, baseRevision: number, inputs: ItemId[]): Promise<SynthOutcome>;
  login(username: string, password: string): Promise<LoginResult>;
  bind(username: string, password: string): Promise<{ username: string }>;
  getAccount(): Promise<AccountInfo>;
  /** `username` is the account's name: the browser-side hash is salted with it. */
  changePassword(username: string, current: string, next: string): Promise<void>;
  logoutOthers(): Promise<void>;
  logout(): Promise<void>;
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

function parseServerState(raw: unknown): GameState {
  const s = parseState(raw, gameData);
  if (!s) throw new ApiError('invalid state from server', 0);
  return s;
}

function revisionOf(body: Record<string, unknown>): number {
  if (typeof body.revision !== 'number') throw new ApiError('invalid revision from server', 0);
  return body.revision;
}

export function createApiClient(getToken: () => string | null, fetchImpl?: typeof fetch): ApiClient {
  async function request(
    method: string,
    path: string,
    body?: unknown,
    opts?: { keepalive?: boolean },
    accept: number[] = [],
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await (fetchImpl ?? fetch)(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        ...(opts?.keepalive ? { keepalive: true } : {}),
      });
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : 'network error');
    }
    if (res.status === 401) throw new AuthError('unauthorized');
    if (res.status >= 500) throw new NetworkError(`server error ${res.status}`);
    if (!res.ok && !accept.includes(res.status)) {
      let code: string | undefined;
      let retryAfterSec = 60;
      try {
        const b = (await res.json()) as Record<string, unknown>;
        if (typeof b.error === 'string') code = b.error;
        if (typeof b.retryAfterSec === 'number') retryAfterSec = b.retryAfterSec;
      } catch {
        // no readable body: keep the status only
      }
      if (res.status === 429) throw new RateLimitedError(retryAfterSec);
      throw new ApiError(`request failed ${res.status}`, res.status, code);
    }
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      throw new NetworkError('unreadable response');
    }
    if (typeof parsed !== 'object' || parsed === null) throw new ApiError('invalid response', res.status);
    return { status: res.status, body: parsed as Record<string, unknown> };
  }

  return {
    async createGuest(displayName) {
      const { body } = await request('POST', '/api/guest', { displayName });
      if (typeof body.token !== 'string') throw new ApiError('invalid token from server', 0);
      return { token: body.token, state: parseServerState(body.state), revision: revisionOf(body) };
    },
    async loadSave() {
      const { body } = await request('GET', '/api/save');
      return { state: parseServerState(body.state), revision: revisionOf(body) };
    },
    async upload(state, baseRevision, opts) {
      const { status, body } = await request('PUT', '/api/save', { state, baseRevision }, opts, [409, 422]);
      if (status === 409 || status === 422) {
        const out: UploadOutcome = {
          kind: status === 409 ? 'conflict' : 'rejected',
          state: parseServerState(body.state),
          revision: revisionOf(body),
        };
        if (Array.isArray(body.reasons)) out.reasons = body.reasons.filter((r): r is string => typeof r === 'string');
        return out;
      }
      return { kind: 'ok', revision: revisionOf(body) };
    },
    async synthesize(state, baseRevision, inputs) {
      const { status, body } = await request('POST', '/api/synthesize', { state, baseRevision, inputs }, undefined, [409, 422]);
      const next = parseServerState(body.state);
      const revision = revisionOf(body);
      if (status === 409) return { kind: 'conflict', state: next, revision };
      if (status === 422) return { kind: 'rejected', state: next, revision };
      return { kind: 'ok', result: body.result as SynthResult, state: next, revision };
    },
    async login(username, password) {
      const { body } = await request('POST', '/api/login', { username, password: await clientPasswordHash(username, password) });
      if (typeof body.token !== 'string') throw new ApiError('invalid token from server', 0);
      return { token: body.token, state: parseServerState(body.state), revision: revisionOf(body) };
    },
    async bind(username, password) {
      const { body } = await request('POST', '/api/account/bind', { username, password: await clientPasswordHash(username, password) });
      if (typeof body.username !== 'string') throw new ApiError('invalid bind reply', 0);
      return { username: body.username };
    },
    async getAccount() {
      const { body } = await request('GET', '/api/account');
      if (typeof body.displayName !== 'string' || typeof body.sessions !== 'number') throw new ApiError('invalid account reply', 0);
      return { displayName: body.displayName, username: typeof body.username === 'string' ? body.username : null, sessions: body.sessions };
    },
    async changePassword(username, current, next) {
      const [c, n] = await Promise.all([clientPasswordHash(username, current), clientPasswordHash(username, next)]);
      await request('POST', '/api/account/password', { current: c, next: n });
    },
    async logoutOthers() {
      await request('POST', '/api/account/logout-others', {});
    },
    async logout() {
      await request('POST', '/api/logout', {});
    },
  };
}
