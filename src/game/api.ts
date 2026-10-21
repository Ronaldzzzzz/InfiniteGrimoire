import { gameData } from '../engine/data';
import { parseState } from '../engine/save';
import type { GameState } from '../engine/state';
import type { SynthResult } from '../engine/synthesis';
import type { ItemId } from '../engine/types';

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
  ) {
    super(message);
  }
}

export interface ApiClient {
  createGuest(displayName: string): Promise<{ token: string; state: GameState; revision: number }>;
  loadSave(): Promise<{ state: GameState; revision: number }>;
  upload(state: GameState, baseRevision: number, opts?: { keepalive?: boolean }): Promise<UploadOutcome>;
  synthesize(state: GameState, baseRevision: number, inputs: ItemId[]): Promise<SynthOutcome>;
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
    if (!res.ok && !accept.includes(res.status)) throw new ApiError(`request failed ${res.status}`, res.status);
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
  };
}
