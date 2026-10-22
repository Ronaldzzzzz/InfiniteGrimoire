# 第二版 A：帳號綁定（帳號＋密碼）

- 日期：2026-10-21
- 狀態：設計已與使用者逐段確認（資料與 API、畫面與流程、測試與安全）。
- **2026-10-22 修訂【使用者決定】**：密碼雜湊改成「瀏覽器端 PBKDF2 ＋ 伺服器端 HMAC（pepper）」，取代伺服器端 PBKDF2 50,000 次。原因：伺服器端算 PBKDF2 會吃掉免費方案每個請求 10ms 的 CPU 上限，而且 5 萬次偏低。受影響的是第 2、4、6 節中標了「修訂」的部分。
- **安全性的程度【使用者決定】**：這是非營利的小型遊戲，安全性與防作弊做到合理即可，不追求滴水不漏。
- 上層規格：`docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md` 第 3 節（隱私）、4.11（帳號）、4.12（防作弊）。
- 第二版拆成子專案，依序做：**A 帳號綁定（本文件）→ B 稀有魔法發現紀錄 → C+D 排行榜與至尊稱號**。每個子專案各自走 spec → 計畫 → 實作。

標記說明：
- **【使用者決定】**：使用者明確選擇的部分。
- **【我的決定】**：設計者提出、使用者確認整段設計時沒有反對的部分。

---

## 1. 目的與範圍

**目的**：玩家換裝置或清掉瀏覽器資料時，進度不會消失；在另一台裝置上可以繼續玩同一份存檔。

**範圍**
- 遊客綁定「帳號＋密碼」。
- 用帳號和密碼登入，可以在多台裝置上同時登入。
- 改密碼、登出其他裝置、登出這台裝置。
- 限制登入嘗試次數，以及 `/api/guest` 的建立頻率。

**不做（留到之後）**
- **【使用者決定】** Google 登入。之後另開子專案，用 Google Identity Services 的 ID token，只存 `sub`。
- 修改顯示名稱、刪除帳號、忘記密碼（沒有 email，無法找回）。

**必須維持的規則**（上層規格與 AGENTS.md 第 6 節）
- 不收集、不儲存 email。
- token 和密碼都只存雜湊值；回應和 log 裡都不出現密碼或 token。
- 瀏覽器的 `localStorage` 只存登入 token，外加 2026-10-21 已同意的魔法排序偏好（`ig.spellSort`）。
- 遊客 token 只在收到 401 時清除。
- `tests/sim` 五條單一屬性路線 0 次被拒，worker 的對抗測試全部通過。
- 介面文字用繁體中文。
- **【使用者決定】** 只在本機驗證，**不部署**，等使用者另外指示才上線。

## 2. 決策摘要

| 項目 | 決定 | 來源 |
|---|---|---|
| 多裝置 | 每台裝置各自一個 session，可同時登入；同時遊玩時，和開兩個分頁一樣，以 409 取得伺服器最新存檔 | 【使用者決定】 |
| 有遊客進度的裝置登入別的帳號 | 先提醒（顯示名稱、已學魔法數），確認後捨棄這台裝置上的遊客進度 | 【使用者決定】 |
| Google 登入 | 這次不做 | 【使用者決定】 |
| Cloudflare 方案 | 免費方案 | 【使用者決定】 |
| 架構 | 新增 `sessions`、`credentials`、`login_failures` 表 | 【使用者決定】（方案一） |
| 密碼雜湊（修訂） | 瀏覽器端 PBKDF2-SHA256 300,000 次，伺服器端再做 HMAC-SHA256（pepper） | 【使用者決定】 |
| `/api/guest` 頻率限制 | 同一個 IP 每小時最多 10 個 | 【使用者決定】 |

**為什麼改成瀏覽器端雜湊（修訂）**：Workers 免費方案每個請求的 CPU 上限是 10ms。伺服器端 PBKDF2 5 萬次約 5ms，改密碼要算兩次，約 10ms，可能超時；而 5 萬次本身也偏低。改成在瀏覽器上算慢的那一段，伺服器只做一次 HMAC（不到 0.1ms）。次數定為 300,000：本機 600,000 次約 400ms，手機上會到 1～2 秒，這個遊戲不需要做到那麼重；300,000 次在桌機約 0.2 秒、手機約 0.5～1 秒。

## 3. 資料（migration `0003_accounts.sql`）

```sql
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players(id),
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_player ON sessions (player_id);

CREATE TABLE credentials (
  player_id     TEXT PRIMARY KEY REFERENCES players(id),
  username      TEXT NOT NULL,          -- 顯示用，保留玩家輸入的大小寫
  username_key  TEXT NOT NULL UNIQUE,   -- NFKC 正規化後轉小寫，用來比對
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE login_failures (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,                    -- 'u:<username_key>' 或 'ip:<ip>'
  at  INTEGER NOT NULL
);
CREATE INDEX idx_login_failures_key_at ON login_failures (key, at);

CREATE TABLE guest_creations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_guest_creations_ip_at ON guest_creations (ip, at);
```

**搬移既有 token**：
- 把每位玩家的 `players.token_hash` 寫進 `sessions`，`created_at` 和 `last_seen_at` 都用玩家的 `created_at`。現有遊客不需要重新登入。
- 接著重建 `players` 表，拿掉 `token_hash` 欄位。這個欄位是 `NOT NULL UNIQUE`，SQLite 不能直接刪除，所以做法是：建立新表 → 複製資料 → 刪除舊表 → 改名。整段在 `PRAGMA defer_foreign_keys = ON` 之下執行，因為 `saves` 有外鍵指向 `players`。

**其他細節**
- `last_seen_at` 只有在距離上次更新超過 1 小時時才寫入，減少 D1 寫入次數。
- 舊的 `login_failures` 和 `guest_creations` 紀錄，在寫入新紀錄時順便刪除超過 1 天的部分。
- 計算 IP 一律用 `CF-Connecting-IP` header。沒有這個 header 時（例如本機測試），用固定字串 `local`。

## 4. API

所有新 API 都是 JSON，錯誤回應格式沿用現有的 `{ error: string }`。

**401 只代表「token 無效」**：用戶端收到 401 會清掉 token（AGENTS.md 第 6 節的規則），所以「帳號或密碼錯誤」一律回 **403** `invalid_credentials`。否則在帳號對話框改密碼時輸錯舊密碼，玩家會被直接登出。

| 路徑 | 需登入 | 請求 | 成功回應 | 錯誤 |
|---|---|---|---|---|
| `POST /api/account/bind` | ✔ | `{ username, password }` | `200 { username }` | 400 格式不符、409 `taken`（帳號名稱已被使用）、409 `already_bound`（這個帳號已經綁定過） |
| `POST /api/login` | | `{ username, password }` | `200 { token, playerId, state, revision }`（和 `/api/guest` 相同格式） | 400 格式不符、403 `invalid_credentials`、429 `{ error: 'rate_limited', retryAfterSec }` |
| `GET /api/account` | ✔ | — | `200 { displayName, username: string \| null, sessions: number }` | 401 |
| `POST /api/account/password` | ✔ | `{ current, next }` | `200 {}`；刪除這個玩家**其他所有** session | 400、403 `invalid_credentials`（舊密碼錯誤，也算一次登入失敗）、409 `not_bound`、429 |
| `POST /api/account/logout-others` | ✔ | — | `200 { sessions: 1 }` | 401 |
| `POST /api/logout` | ✔ | — | `200 {}`；刪除這台裝置的 session | 409 `not_bound`（遊客不能登出） |
| `POST /api/guest`（既有） | | 不變 | 不變；改成寫入 `sessions` | 新增 429 `rate_limited`（同一個 IP 一小時內已建立 10 個） |

**驗證規則**
- **帳號名稱**：先做 NFKC 正規化並去掉前後空白，長度 3～20 個字。只允許 Unicode 字母、數字和底線（`^[\p{L}\p{N}_]{3,20}$`）。`username_key` 是正規化後轉小寫的結果。
- **密碼**：8～128 個字，不做其他組成規則。**（修訂）** 伺服器收不到密碼本身，所以長度只由瀏覽器檢查。
- **（修訂）送給伺服器的不是密碼**：表格中的 `password`、`current`、`next` 欄位都改成瀏覽器算出的雜湊值（見下方「密碼雜湊」），格式必須是 43 個字元的 base64url，否則回 400 `invalid_password`。
- 帳號名稱和遊戲內的顯示名稱是分開的。

**登入嘗試限制**
- 同一個 `u:<username_key>` 在 15 分鐘內失敗 5 次，就回 429，直到最舊的那次失敗超過 15 分鐘。
- 同一個 `ip:<ip>` 在 15 分鐘內失敗 20 次，也回 429。
- 兩者任一達到上限，就**不再驗證密碼**，直接回 429。
- 登入成功不會清除失敗紀錄（避免攻擊者夾雜正確密碼來重置計數）。

**不透露帳號是否存在**
- 帳號不存在和密碼錯誤，錯誤代碼都是 `invalid_credentials`。
- **（修訂）** 伺服器端只做一次 HMAC，帳號存在與否的回應時間本來就幾乎相同，不再需要假雜湊。

**密碼雜湊（修訂）**
- **瀏覽器端**：`PBKDF2-SHA256(密碼, salt, 300,000 次)`，輸出 32 bytes，以 base64url 傳送（43 個字元）。
  - salt 用固定公式：`"infinite-grimoire:v1:" + username_key`，不需要另外向伺服器要。每個帳號的 salt 不同；帳號名稱不能改，salt 也不會變。
  - 程式放在 `src/game/`（瀏覽器執行層），不放 `src/engine/`。
- **伺服器端**：存 `hmac-sha256$v1$<HMAC-SHA256(pepper, 瀏覽器雜湊) 的 base64url>`，用常數時間比對。
  - pepper 是 Cloudflare 的 secret `PASSWORD_PEPPER`，不放進資料庫。本機開發用 `.dev.vars`（不進 git）。
  - 沒設定 pepper 時，綁定、登入、改密碼一律回 500，不會用空的鑰匙存雜湊。
  - pepper 一旦上線就不能更換，換了所有帳號都無法登入。
- 不做自動升級次數。以後要提高次數，再另外設計（salt 裡的 `v1` 留給那時使用）。
- 已知取捨：salt 事先可知，攻擊者能針對特定帳號預先計算；但沒有 pepper 就無法驗證猜測的結果。

**Session**
- 登入成功或建立遊客時，產生新的隨機 token（沿用 `newToken()`），只把 SHA-256 雜湊存進 `sessions`。
- 驗證身分時用 token 雜湊查 `sessions`，再找到玩家。

## 5. 畫面與流程【使用者決定】

**開始畫面（Onboarding）**
- 保留「輸入顯示名稱 → 開始冒險」，下方加「已有帳號？登入」，切換到登入表單（帳號名稱、密碼）。
- 這台裝置上還沒有進度，所以這裡登入不需要提醒。

**頂列「帳號」按鈕**
- 遊客：按鈕上顯示「未綁定」小標籤。
- 點開是對話框：

| 狀態 | 內容 |
|---|---|
| 遊客 | 為什麼要綁定；綁定表單（帳號名稱、密碼、確認密碼），上方寫明「沒有 email，忘記密碼無法找回」；下方有「登入其他帳號」 |
| 已綁定 | 帳號名稱、登入中的裝置數；改密碼（舊密碼、新密碼、確認新密碼）；「登出其他裝置」；「登出這台裝置」 |

- 對話框可以用 Esc、點背景或關閉按鈕關掉，開啟時焦點移到對話框內。

**切換帳號**
- 遊客按「登入其他帳號」，先顯示確認：「這台裝置上未綁定的進度（名稱 ○○、已學 N 個魔法）登入後將無法取回」。確認後才顯示登入表單。
- 已綁定的玩家可以直接切換，因為登出後還能用帳號找回進度。

**登入、登出之後**
- **登入成功**：寫入新的 token，用 `main.tsx` 現有的 `start(loaded)` 以新存檔重新開始，舊的同步與遊戲迴圈會隨之停止。
- **登出這台裝置**：
  1. 先嘗試上傳一次存檔（`sync.uploadNow()`）。
  2. 再呼叫 `/api/logout`。
  3. 清掉 token，回到開始畫面。
  - 如果第 2 步因為網路失敗，就不清掉 token，並顯示錯誤，讓玩家重試。
- **改密碼成功**：目前這台繼續遊戲。其他裝置下次連線收到 401，依現有規則清掉 token、回到開始畫面。

**錯誤訊息**
| 情況 | 訊息 |
|---|---|
| 409 `taken` | 這個帳號名稱已被使用 |
| 403 `invalid_credentials` | 帳號或密碼錯誤 |
| 429 `rate_limited` | 嘗試次數過多，請 N 分鐘後再試（N 由 `retryAfterSec` 無條件進位） |
| 格式不符 | 在欄位旁即時提示：帳號名稱的長度或字元、密碼長度、兩次密碼不一致 |
| 網路錯誤 | 連線異常，請稍後再試（對話框內顯示，不觸發斷線遮罩） |

**（修訂）** 瀏覽器端雜湊在手機上約需 0.5～1 秒：送出期間按鈕顯示「處理中…」並停用。

**API 用戶端**：`src/game/api.ts` 新增 `login`、`bind`、`getAccount`、`changePassword`、`logoutOthers`、`logout`，沿用現有的 `NetworkError`、`AuthError`、`ApiError`。429 改成帶有 `retryAfterSec` 的錯誤型別。

## 6. 測試【我的決定】

**伺服器**（`createApp` + `MemoryStore`）
- 綁定：成功；帳號名稱已被使用（大小寫不同、全形半形不同都算同一個）；已綁定再綁；格式不符。
- 登入：成功時建立新的 session，舊裝置的 token 仍然有效；密碼錯誤和帳號不存在回傳相同的錯誤代碼。
- 嘗試次數限制：同帳號第 6 次、同 IP 第 21 次失敗後回 429；超過 15 分鐘後恢復；登入成功不清除失敗紀錄；達到上限時不驗證密碼。
- 改密碼：其他 session 回 401，目前這台仍可用；舊密碼錯誤回 403 並算一次失敗。
- 登出：遊客回 409；已綁定的玩家登出後，這個 token 回 401；「登出其他裝置」只留下目前這台。
- `/api/guest`：同一個 IP 一小時內第 11 次回 429。
- 雜湊（修訂）：瀏覽器端相同的帳號與密碼算出相同結果，帳號名稱大小寫或全形半形不同也算出相同結果，密碼不同結果就不同；伺服器端格式正確、驗證正確、pepper 不同就驗證失敗、沒有 pepper 時回 500；送來的不是 43 字元 base64url 時回 400。

**資料庫層（新增）**
- 目前 `D1Store` 的 SQL 沒有自動化測試。這次用 Node 內建的 `node:sqlite` 包一個和 D1 相同介面的小轉接器（`prepare/bind/first/all/run/batch`）。
- `node:sqlite` 從 Node 22.13 起不需要實驗旗標，所以專案的 Node 最低版本要從「22」改成「22.13」（`package.json` 的 `engines` 與 AGENTS.md）。
- 依序套用 0001→0003 的 migration，驗證：
  - migration 前建立的遊客，migration 後仍能用原本的 token 讀到存檔。
  - `players` 已經沒有 `token_hash`，外鍵仍然完整。
  - `D1Store` 的新方法和 `MemoryStore` 的行為一致（同一組測試對兩者各跑一次）。

**介面**（Testing Library + jsdom）
- 開始畫面切換到登入表單、登入成功時呼叫 `onDone`。
- 帳號對話框的遊客、已綁定兩種狀態。
- 遊客「登入其他帳號」的確認提醒內容。
- 表單即時檢查；409、401、429 的錯誤訊息。

**完成標準**（在本機用 `npm run dev` 驗證）
1. 遊客綁定帳號後，用另一個無痕視窗以帳號登入，進度完整。
2. 兩個視窗同時登入，都能繼續玩。
3. 其中一邊改密碼後，另一邊下次連線被登出，回到開始畫面，用新密碼可以再登入。
4. 連續輸錯密碼 5 次後，出現「嘗試次數過多」。
5. `npm test`、`npm run build` 通過；`tests/sim` 五條路線 0 次被拒。

## 7. 之後的子專案會用到的部分

- **Google 登入**：新增 `oauth_identities(provider, subject, player_id)` 表，登入後同樣建立 `sessions`。帳號對話框加上「綁定 Google」。
- **B 發現紀錄 / C+D 排行**：公開顯示的是**顯示名稱**，不是帳號名稱，所以帳號名稱不會外流。
