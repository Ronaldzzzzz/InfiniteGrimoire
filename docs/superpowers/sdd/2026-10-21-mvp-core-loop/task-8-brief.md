### Task 8：伺服器 API（遊客帳號、存檔、合成）

**Files:**
- Create: `migrations/0001_init.sql`, `worker/store.ts`, `worker/d1-store.ts`, `worker/auth.ts`, `worker/crypto-rng.ts`
- Modify: `worker/app.ts`, `worker/index.ts`
- Test: `worker/app.test.ts`, `worker/auth.test.ts`

**Interfaces:**
- Consumes：`parseState`、`validateUpload`、`synthesize`、`createInitialState`、`gameData`。
- Produces：
```ts
// store.ts
export interface PlayerRow { id: string; displayName: string; tokenHash: string; createdAt: number; suspicious: boolean }
export interface SaveRow { playerId: string; state: string; revision: number; savedAt: number; prevState: string | null; prevSavedAt: number | null }
export interface Store {
  createPlayer(p: PlayerRow, initialState: string, now: number): Promise<void>;
  findPlayerByTokenHash(hash: string): Promise<PlayerRow | null>;
  getSave(playerId: string): Promise<SaveRow | null>;
  /** revision 等於 baseRevision 時，把目前存檔移到 prev，寫入新存檔並讓 revision+1；不一致時回傳 false */
  commitSave(playerId: string, baseRevision: number, state: string, now: number): Promise<boolean>;
  touchSave(playerId: string, now: number): Promise<void>;          // 只更新 savedAt（新 session 的基準時間）
  recordRejection(playerId: string, now: number, reasons: string[]): Promise<number>; // 回傳 24 小時內的拒絕次數
  markSuspicious(playerId: string): Promise<void>;
  recordSynthesis(playerId: string, now: number, combo: string, result: string): Promise<void>;
}
export class MemoryStore implements Store { /* 測試用 */ }
// auth.ts
export function newToken(): string;                       // 32 bytes base64url
export function hashToken(token: string): Promise<string>; // SHA-256 hex
// crypto-rng.ts
export function createCryptoRng(): Rng;
// app.ts
export interface AppDeps { store: Store; now: () => number; rng: () => Rng; data: GameData }
export const SUSPICIOUS_REJECTIONS_24H = 5;
```

**D1 schema（`0001_init.sql`）：**
- `players(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, suspicious INTEGER NOT NULL DEFAULT 0)`
- `saves(player_id TEXT PRIMARY KEY REFERENCES players(id), state TEXT NOT NULL, revision INTEGER NOT NULL, saved_at INTEGER NOT NULL, prev_state TEXT, prev_saved_at INTEGER)`
- `rejections(id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, at INTEGER NOT NULL, reasons TEXT NOT NULL)`，並在 `(player_id, at)` 上建立索引。
- `synth_events(id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, at INTEGER NOT NULL, combo TEXT NOT NULL, result TEXT NOT NULL)`

`D1Store.commitSave` 用 `UPDATE saves SET prev_state = state, prev_saved_at = saved_at, state = ?, revision = revision + 1, saved_at = ? WHERE player_id = ? AND revision = ?`，再用 `meta.changes === 1` 判斷是否成功。

**API**（除了 `POST /api/guest` 之外，都需要 `Authorization: Bearer <token>`；沒帶或無效時回 401）：

| 方法 / 路徑 | 請求 | 回應 |
|---|---|---|
| `POST /api/guest` | `{ displayName }`，去掉前後空白後 1～16 字 | 201 `{ token, playerId, state, revision }`；名稱不合規則回 400 |
| `GET /api/save` | — | 200 `{ state, revision }`，並呼叫 `touchSave(now)` |
| `PUT /api/save` | `{ state, baseRevision }` | 200 `{ revision }`；409 `{ reason: 'conflict', state, revision }`；422 `{ reason: 'rejected', reasons, state, revision }`；400 表示格式錯誤 |
| `POST /api/synthesize` | `{ state, baseRevision, inputs }` | 先用和 `PUT /api/save` 相同的規則驗證 `state`，通過後用 `deps.rng()` 呼叫 `synthesize`，寫入結果並記錄 `synth_events`。200 `{ result, state, revision }`；409、422、400 的意義和 `PUT` 相同 |

- 422 的流程：先呼叫 `recordRejection`；回傳的次數 ≥ `SUSPICIOUS_REJECTIONS_24H` 時，再呼叫 `markSuspicious`。回應中附上伺服器目前的存檔，讓瀏覽器退回。
- `elapsedMs` 一律用 `deps.now() − save.savedAt` 計算。

- [ ] **Step 1：寫失敗的測試**（`app.test.ts`，使用 `MemoryStore`、可控制的 `now` 和固定種子的 `rng`）
  - `guest creates player and returns initial state`
  - `guest rejects empty or 17-char name`
  - `requests without token get 401`
  - `GET save touches savedAt`
  - `valid upload advances revision`
  - `stale baseRevision returns 409 with current state`
  - `concurrent synthesize with same baseRevision`（Review Focus 2）：同時送出兩個請求，結果一個 200、一個 409；第二個不會扣材料，存檔裡的背包只少一次。
  - `tampered upload returns 422 and keeps old save`
  - `five rejections in 24h marks suspicious`
  - `synthesize learns spell server-side`：上傳的 `state` 背包裡有兩個 `el:thunder:1`，回應的 `result.kind` 是 `learned`，`state.learned` 包含 `thunder_bolt`。
  - `synthesize ignores client-claimed learned spells`：`state` 自己加了 `lightning` → 422。
  - `auth.test.ts`：`hashToken` 對相同輸入產生相同結果；`newToken` 長度 ≥ 43，兩次產生的結果不同。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作 `MemoryStore`、`D1Store`、`auth`、`crypto-rng` 和路由。`worker/index.ts` 用 `D1Store(env.DB)`、`Date.now` 和 `createCryptoRng` 組合出 app，`/api/*` 以外的請求交給 `env.ASSETS`。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run db:migrate:local && npm run dev`，再用 curl 走一遍：`POST /api/guest` → `GET /api/save` → `PUT /api/save`，每一步都要得到預期的回應。
- [ ] **Step 6：Commit**：`feat(worker): guest accounts, validated saves and server-rolled synthesis`

---

