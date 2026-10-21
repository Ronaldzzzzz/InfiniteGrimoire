### Task 9：瀏覽器執行層：GameRuntime、API client、同步

**Files:**
- Create: `src/game/runtime.ts`, `src/game/api.ts`, `src/game/session.ts`, `src/game/sync.ts`, `src/game/loop.ts`
- Test: `src/game/runtime.test.ts`, `src/game/sync.test.ts`, `src/game/session.test.ts`

**Interfaces:**
- Consumes：`stepBattle`、`upgradeElement`、`equipSpell`、`travel`、`createBattle`，以及 Task 8 的 API 格式。
- Produces：
```ts
// api.ts
export type UploadOutcome = { kind: 'ok'; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number; reasons?: string[] };
export type SynthOutcome = { kind: 'ok'; result: SynthResult; state: GameState; revision: number }
  | { kind: 'conflict' | 'rejected'; state: GameState; revision: number };
export class NetworkError extends Error {}
export interface ApiClient {
  createGuest(displayName: string): Promise<{ token: string; state: GameState; revision: number }>;
  loadSave(): Promise<{ state: GameState; revision: number }>;
  upload(state: GameState, baseRevision: number): Promise<UploadOutcome>;
  synthesize(state: GameState, baseRevision: number, inputs: ItemId[]): Promise<SynthOutcome>;
}
export function createApiClient(getToken: () => string | null, fetchImpl?: typeof fetch): ApiClient;
// fetch 失敗或回應 5xx 時丟 NetworkError；401 時丟 AuthError

// session.ts
export const TOKEN_KEY = 'infinite-grimoire.token';
export function readToken(storage: Storage | null): string | null;          // 例外時回傳 null
export function writeToken(storage: Storage | null, token: string): boolean;

// runtime.ts
export const MAX_CATCHUP_MS = 1000;
export interface Snapshot { game: GameState; battle: BattleState; revision: number; paused: boolean; synthPending: boolean }
export class GameRuntime {
  constructor(data: GameData, state: GameState, revision: number, rng: Rng);
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  onEvents(listener: (events: BattleEvent[]) => void): () => void;
  advance(elapsedMs: number): void;        // paused 時不做任何事
  setPaused(paused: boolean): void;
  replaceState(state: GameState, revision: number): void; // 套用伺服器版本，並重建 battle
  setRevision(revision: number): void;
  upgrade(element: ElementId, grade: number): boolean;
  equip(spellId: string): void;
  travel(zoneId: string): boolean;
  setSynthPending(pending: boolean): void;
}

// sync.ts
export const UPLOAD_INTERVAL_MS = 30_000;
export const RETRY_MS = 5_000;
export type ConnStatus = 'online' | 'offline';
export class SyncController {
  constructor(runtime: GameRuntime, api: ApiClient, timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval; setTimeout: typeof setTimeout });
  start(): () => void;                              // 每 UPLOAD_INTERVAL_MS 上傳一次
  uploadNow(opts?: { keepalive?: boolean }): Promise<void>;
  synthesize(inputs: ItemId[]): Promise<SynthResult | null>; // synthPending 期間呼叫回傳 null；斷線時也回傳 null
  readonly status: ConnStatus;
  onStatus(listener: (s: ConnStatus) => void): () => void;
}
// loop.ts
export function startLoop(runtime: GameRuntime, sync: SyncController): () => void;
// requestAnimationFrame 驅動 advance；visibilitychange 變成 hidden 和 pagehide 時呼叫 uploadNow({ keepalive: true })
```

**同步規則：**
- **上傳或合成結果：**
  - `ok`：更新 revision；合成時另外 `replaceState`。
  - `conflict` 或 `rejected`：`replaceState(server.state)`。
- **斷線：** 遇到 `NetworkError` 時：
  1. 狀態改為 `offline`，並 `setPaused(true)`。
  2. 每 `RETRY_MS` 重試一次上傳。
  3. 成功後狀態改回 `online`，並 `setPaused(false)`。

- [ ] **Step 1：寫失敗的測試**
  - **runtime：**
    - `advance clamps huge elapsed`：`advance(600000)` 最多跑 `MAX_CATCHUP_MS / STEP_MS` 步，而且執行時間 < 50ms（Review Focus 3）。
    - `leftover time carries over`
    - `paused runtime does not advance`
    - `replaceState rebuilds battle and notifies`
    - `getSnapshot stable when nothing changed`
  - **sync**（假的 `ApiClient` 加上 `vi.useFakeTimers`）：
    - `uploads every 30s with current revision`
    - `rejected upload replaces state`
    - `network error pauses runtime and retries every 5s until success then resumes`（Review Focus 1）
    - `synthesize while pending returns null and sends one request`
    - `synthesize ok applies server state and returns result`
  - **session：**
    - `readToken returns null when storage throws`
    - `writeToken returns false when setItem throws`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(game): runtime, api client and server sync with offline pause`

---

