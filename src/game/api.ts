import { content } from '../engine/content';
import type { SynthResult } from '../engine/crafting';
import type { EmpowerResult } from '../engine/empower';
import type { GameState } from '../engine/model';
import { parseState } from '../engine/persist';
import type { OfflineResult } from '../engine/offline';
import type { StageClearResult } from '../engine/stage-clear';
import type { RevealResult, UnlockResult } from '../engine/tree';
import type { ItemId } from '../engine/types';
import { clientPasswordHash } from './password-hash';

export type UploadOutcome =
  | { kind: 'ok'; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number; reasons?: string[] };
/** 'gm': a GM edit to the GM's own save was applied. */
export type GmResult = { kind: 'gm' };
/** 'away': the server noted the player left. */
export type AwayResult = { kind: 'away' };
export type ActionResult = SynthResult | EmpowerResult | RevealResult | UnlockResult | StageClearResult | GmResult | AwayResult | OfflineResult;
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

/** 403 `gm_expired`: the short-lived GM token is gone. Not an AuthError: the player's own session is fine. */
export class GmExpiredError extends ApiError {
  constructor() {
    super('gm token expired', 403, 'gm_expired');
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

export interface Discovery {
  id: number;
  spellId: string;
  displayName: string;
  at: number;
  first: boolean;
}

export interface ApiClient {
  /** The newest rare discoveries (max 20, newest first); with `after`, only rows newer than that id. */
  recentDiscoveries(after?: number): Promise<Discovery[]>;
  createGuest(displayName: string): Promise<LoginResult>;
  loadSave(): Promise<{ state: GameState; revision: number }>;
  upload(state: GameState, baseRevision: number, opts?: { keepalive?: boolean }): Promise<UploadOutcome>;
  synthesize(state: GameState, baseRevision: number, inputs: ItemId[]): Promise<ActionOutcome>;
  empower(state: GameState, baseRevision: number, spellId: string): Promise<ActionOutcome>;
  reveal(state: GameState, baseRevision: number, keyItem: ItemId): Promise<ActionOutcome>;
  unlockPassive(state: GameState, baseRevision: number, passiveId: string): Promise<ActionOutcome>;
  /** The server settles a cleared stage: stage progress and the settlement loot. */
  stageClear(state: GameState, baseRevision: number, zoneId: string, stage: number): Promise<ActionOutcome>;
  /** Tells the server the player has been away from the page. */
  away(state: GameState, baseRevision: number): Promise<ActionOutcome>;
  /** Claims offline income for the time since the last away mark. */
  offline(state: GameState, baseRevision: number): Promise<ActionOutcome>;
  login(username: string, password: string): Promise<LoginResult>;
  bind(username: string, password: string): Promise<{ username: string }>;
  getAccount(): Promise<AccountInfo>;
  /** `username` is the account's name: the browser-side hash is salted with it. */
  changePassword(username: string, current: string, next: string): Promise<void>;
  logoutOthers(): Promise<void>;
  logout(): Promise<void>;
  /** `password` is plaintext; it is hashed here like `login`. */
  gmLogin(username: string, password: string): Promise<{ gmToken: string; expiresAt: number }>;
  gmInventory(state: GameState, baseRevision: number, gmToken: string, items: Record<ItemId, number>): Promise<ActionOutcome>;
  gmZones(state: GameState, baseRevision: number, gmToken: string, op: 'unlock_all' | 'reveal_all' | 'boss_ready'): Promise<ActionOutcome>;
  /** Hashes `tempPassword` salted with the target `username`. */
  gmResetPassword(gmToken: string, username: string, tempPassword: string): Promise<void>;
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
  const res = r as { kind: string; rare?: unknown };
  if (res.kind === 'learned' && res.rare !== undefined) {
    const rare = res.rare as { first?: unknown } | null;
    if (typeof rare !== 'object' || rare === null || typeof rare.first !== 'boolean') {
      throw new ApiError('invalid result from server', 0);
    }
  }
  return r as ActionResult;
}

function parseDiscoveries(raw: unknown): Discovery[] {
  if (!Array.isArray(raw)) throw new ApiError('invalid discoveries from server', 0);
  return raw.map((d) => {
    const o = d as Record<string, unknown> | null;
    if (
      typeof o !== 'object' || o === null ||
      typeof o.id !== 'number' || typeof o.spellId !== 'string' || typeof o.displayName !== 'string' ||
      typeof o.at !== 'number' || typeof o.first !== 'boolean'
    ) {
      throw new ApiError('invalid discoveries from server', 0);
    }
    return { id: o.id, spellId: o.spellId, displayName: o.displayName, at: o.at, first: o.first };
  });
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
    opts?: { keepalive?: boolean; gmToken?: string },
    accept: number[] = [],
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (opts?.gmToken) headers['X-GM-Token'] = opts.gmToken;
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
      if (res.status === 403 && code === 'gm_expired') throw new GmExpiredError();
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
  async function action(path: string, body: Record<string, unknown>, gmToken?: string): Promise<ActionOutcome> {
    const { status, body: reply } = await request('POST', path, body, gmToken ? { gmToken } : undefined, [409, 422]);
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
    async recentDiscoveries(after) {
      const { body } = await request('GET', after === undefined ? '/api/discoveries' : `/api/discoveries?after=${after}`);
      return parseDiscoveries(body.discoveries);
    },
    synthesize: (state, baseRevision, inputs) => action('/api/synthesize', { state, baseRevision, inputs }),
    empower: (state, baseRevision, spellId) => action('/api/empower', { state, baseRevision, spellId }),
    reveal: (state, baseRevision, keyItem) => action('/api/reveal', { state, baseRevision, keyItem }),
    unlockPassive: (state, baseRevision, passiveId) => action('/api/passive', { state, baseRevision, passiveId }),
    stageClear: (state, baseRevision, zoneId, stage) => action('/api/stage-clear', { state, baseRevision, zoneId, stage }),
    away: (state, baseRevision) => action('/api/away', { state, baseRevision }),
    offline: (state, baseRevision) => action('/api/offline', { state, baseRevision }),
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
    async gmLogin(username, password) {
      const { body } = await request('POST', '/api/gm/login', { username, password: await clientPasswordHash(username, password) });
      if (typeof body.gmToken !== 'string' || typeof body.expiresAt !== 'number') throw new ApiError('invalid gm login reply', 0);
      return { gmToken: body.gmToken, expiresAt: body.expiresAt };
    },
    gmInventory: (state, baseRevision, gmToken, items) => action('/api/gm/inventory', { state, baseRevision, items }, gmToken),
    gmZones: (state, baseRevision, gmToken, op) => action('/api/gm/zones', { state, baseRevision, op }, gmToken),
    async gmResetPassword(gmToken, username, tempPassword) {
      await request('POST', '/api/gm/reset-password', { username, password: await clientPasswordHash(username, tempPassword) }, { gmToken });
    },
  };
}
