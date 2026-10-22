import { content } from '../engine/content';
import type { SynthResult } from '../engine/crafting';
import type { EmpowerResult } from '../engine/empower';
import type { GameState } from '../engine/model';
import { parseState } from '../engine/persist';
import type { RevealResult, UnlockResult } from '../engine/tree';
import type { ItemId } from '../engine/types';
import { clientPasswordHash } from './password-hash';

export type UploadOutcome =
  | { kind: 'ok'; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number; reasons?: string[] };
export type ActionResult = SynthResult | EmpowerResult | RevealResult | UnlockResult;
/**
 * 'ok': the server applied the action. 'refused': the game rules said no (a 422 with a result); the server
 * wrote nothing and the local state stays. 'conflict' / 'rejected' (a 422 with audit reasons): adopt `state`.
 */
export type ActionOutcome =
  | { kind: 'ok' | 'refused'; result: ActionResult; state: GameState; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number; reasons?: string[] };

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
  synthesize(state: GameState, baseRevision: number, inputs: ItemId[]): Promise<ActionOutcome>;
  empower(state: GameState, baseRevision: number, spellId: string): Promise<ActionOutcome>;
  reveal(state: GameState, baseRevision: number, keyItem: ItemId): Promise<ActionOutcome>;
  unlockPassive(state: GameState, baseRevision: number, passiveId: string): Promise<ActionOutcome>;
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
  const s = parseState(raw, content);
  if (!s) throw new ApiError('invalid state from server', 0);
  return s;
}

function resultOf(body: Record<string, unknown>): ActionResult {
  const r = body.result;
  if (typeof r !== 'object' || r === null || typeof (r as { kind?: unknown }).kind !== 'string') {
    throw new ApiError('invalid result from server', 0);
  }
  return r as ActionResult;
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

  /** A server action: 200 applied, 409 conflict, 422 with `result` refused by the rules, 422 with `reasons` audit rejection. */
  async function action(path: string, body: Record<string, unknown>): Promise<ActionOutcome> {
    const { status, body: reply } = await request('POST', path, body, undefined, [409, 422]);
    const state = parseServerState(reply.state);
    const revision = revisionOf(reply);
    if (status === 409) return { kind: 'conflict', state, revision };
    if (status === 422 && reply.result === undefined) {
      const reasons = Array.isArray(reply.reasons) ? reply.reasons.filter((r): r is string => typeof r === 'string') : [];
      return { kind: 'rejected', state, revision, reasons };
    }
    return { kind: status === 422 ? 'refused' : 'ok', result: resultOf(reply), state, revision };
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
    synthesize: (state, baseRevision, inputs) => action('/api/synthesize', { state, baseRevision, inputs }),
    empower: (state, baseRevision, spellId) => action('/api/empower', { state, baseRevision, spellId }),
    reveal: (state, baseRevision, keyItem) => action('/api/reveal', { state, baseRevision, keyItem }),
    unlockPassive: (state, baseRevision, passiveId) => action('/api/passive', { state, baseRevision, passiveId }),
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
