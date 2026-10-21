# 第二版 A：帳號綁定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓遊客綁定「帳號＋密碼」，在任何裝置用帳號登入取回同一份存檔；支援多裝置同時登入、改密碼、登出其他裝置與登出這台裝置；限制登入嘗試次數與 `/api/guest` 建立頻率。

**Architecture:** 伺服器把「一位玩家一個 token」改成 `sessions` 表（每台裝置一列，只存 token 的 SHA-256），新增 `credentials`（帳號名稱與 PBKDF2 密碼雜湊）、`login_failures`、`guest_creations`。`Store` 介面擴充，`MemoryStore` 與 `D1Store` 共用同一組「契約測試」，D1 版用 Node 內建 `node:sqlite` 包成的 D1 轉接器跑真正的 SQL 與 migration。帳號名稱與密碼的格式規則放在 `src/engine/account-rules.ts`，伺服器與瀏覽器共用。前端新增登入表單、帳號對話框，登入或登出後沿用 `main.tsx` 的啟動流程。

**Tech Stack:** TypeScript 7、Hono 4、Cloudflare Workers + D1、WebCrypto（PBKDF2-SHA256）、React 19、Vitest 5 + Testing Library（jsdom）、`node:sqlite`（只在測試用）。

**Spec:** `docs/superpowers/specs/2026-10-21-v2a-accounts-design.md`（上層：`docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md` 第 3、4.11、4.12 節）

## Global Constraints

- **不部署**、不建立遠端 D1、不執行 `wrangler deploy` 或 `--remote` 指令。只在本機驗證（使用者 2026-10-21 指示，等使用者另外說才上線）。
- **不 push**：每次 push 都要先問使用者；這個環境的 shell 推不上 GitHub，使用者會自己執行 `! git push`。
- 不收集、不儲存 email。token 與密碼只存雜湊；回應與 `console` 輸出不得包含密碼或 token。
- 401 只代表「token 無效」（用戶端收到 401 會清掉 token）；帳號或密碼錯誤一律 **403** `invalid_credentials`。
- 帳號名稱：NFKC 正規化並去掉前後空白後，3～20 個字，只允許 `\p{L}`、`\p{N}`、`_`；比對用小寫（`username_key`）。密碼 8～128 個字。
- PBKDF2-SHA256，**50,000** 次迭代，salt 16 bytes，hash 32 bytes；格式 `pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>`；常數時間比對。
- 登入限制：同一 `u:<username_key>` 15 分鐘內失敗 5 次、同一 `ip:<ip>` 15 分鐘內失敗 20 次 → 429 `{ error: 'rate_limited', retryAfterSec }`；達到上限時不驗證密碼；登入成功不清除失敗紀錄。
- `/api/guest`：同一個 IP 1 小時內最多 10 個，第 11 個回 429。
- IP 取自 `CF-Connecting-IP` header，沒有時用 `local`。
- `last_seen_at` 距上次更新超過 1 小時才寫入。`login_failures`、`guest_creations` 寫入新紀錄時順便刪除超過 1 天的舊紀錄。
- 遊客 token 只在 401 時清除；其他錯誤保留 token 並讓玩家重試。
- `localStorage` 只存 token 與既有的 `ig.spellSort`。
- `tests/sim` 五條路線 0 次被拒；worker 對抗測試全部通過；`npm test`、`npm run build` 每個任務結束都要通過。
- 介面文字繁體中文。
- `src/engine/` 不得使用 DOM、React、Pixi、Workers API。
- Commit 訊息 Conventional Commits（英文），結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（或執行者所用 agent 的對應標記）。不要直接 commit 到 `main`。
- 這個 repo 在 Windows 上 `core.autocrlf=true`：用腳本改檔時以 LF 寫回（例如 Python `open(..., newline='\n')`）。

## Review Focus

1. **兩個人同時搶同一個帳號名稱**：只能有一位成功，另一位拿到 409 `taken`，不能變成 500。由 Task 3 的契約測試（`createCredentials` 對 `username_key` 唯一）在 MemoryStore 與 D1 兩邊都驗證。
2. **被限制時輸入正確密碼**：仍然回 429，不能透露密碼是否正確（避免當作猜密碼的判斷依據）。Task 6 測試。
3. **改密碼後的其他裝置**：舊 token 回 401，用戶端依既有規則清掉 token 回到開始畫面；目前這台繼續可用。Task 7 測試伺服器端，Task 11 在瀏覽器驗證。
4. **已有玩家的資料庫套用 migration 0003**：既有 token 仍然有效、存檔還在、外鍵完整。Task 4 用真正的 SQLite 驗證。
5. **登出失敗或遊客登出**：遊客回 409 `not_bound` 且 token 保留；登出時網路錯誤，token 不清除並顯示錯誤。Task 7、Task 10 測試。

---

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/engine/account-rules.ts` | 新增 | 帳號名稱正規化與檢查、密碼長度檢查（伺服器與瀏覽器共用） |
| `worker/auth.ts` | 修改 | export `toBase64Url`，新增 `fromBase64Url` |
| `worker/password.ts` | 新增 | PBKDF2 雜湊、驗證、是否需要升級、假雜湊 |
| `worker/store.ts` | 修改 | `Store` 介面擴充（sessions、credentials、限制紀錄）；`MemoryStore` 實作 |
| `worker/store-contract.ts` | 新增 | `describeStoreContract()`：MemoryStore 與 D1Store 共用的行為測試 |
| `worker/store.test.ts` | 新增 | 對 MemoryStore 跑契約測試 |
| `migrations/0003_accounts.sql` | 新增 | sessions、credentials、login_failures、guest_creations；搬移 token；重建 players |
| `worker/d1-store.ts` | 修改 | 新方法的 SQL |
| `tests/d1/d1-shim.ts` | 新增 | 用 `node:sqlite` 實作 D1 介面子集，套用 migrations |
| `tests/d1/d1-store.test.ts` | 新增 | 對 D1Store 跑契約測試；migration 搬移測試 |
| `worker/app.ts` | 修改 | session 驗證、guest 頻率限制、bind/login/account/password/logout API |
| `worker/app.test.ts` | 修改 | 既有斷言改用 sessions；新增帳號 API 測試 |
| `src/game/api.ts` | 修改 | `ApiError.code`、`RateLimitedError`、6 個新方法 |
| `src/game/api.test.ts` | 新增 | 新方法與錯誤對應 |
| `src/ui/messages.ts` | 修改 | 帳號相關訊息 |
| `src/ui/Onboarding.tsx` | 修改 | 「已有帳號？登入」模式 |
| `src/ui/AccountDialog.tsx` | 新增 | 帳號對話框（遊客／已綁定兩種狀態、切換帳號確認） |
| `src/ui/TopBar.tsx` | 修改 | 「帳號」按鈕與「未綁定」標籤 |
| `src/ui/App.tsx` | 修改 | 取得帳號狀態、開關對話框、切換與登出的回呼 |
| `src/main.tsx` | 修改 | 把 `api` 與切換、登出回呼傳給 App |
| `src/ui/App.css` | 修改 | 對話框與帳號按鈕樣式 |
| `package.json`、`AGENTS.md` | 修改 | Node 最低版本 22.13；交接紀錄 |

---

### Task 1: 帳號名稱與密碼規則（共用）

**Files:**
- Create: `src/engine/account-rules.ts`
- Create: `src/engine/account-rules.test.ts`

**Interfaces:**
- Produces: `USERNAME_MIN = 3`、`USERNAME_MAX = 20`、`PASSWORD_MIN = 8`、`PASSWORD_MAX = 128`；`normalizeUsername(raw: string): string`；`usernameKey(raw: string): string`；`type UsernameProblem = 'length' | 'chars'`；`usernameProblem(raw: string): UsernameProblem | null`；`passwordProblem(pw: string): 'length' | null`

- [ ] **Step 1: 寫失敗的測試**

`src/engine/account-rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { normalizeUsername, passwordProblem, usernameKey, usernameProblem } from './account-rules';

describe('username rules', () => {
  it('normalizes full-width forms and trims', () => {
    expect(normalizeUsername('  Ａｂｃ_１ ')).toBe('Abc_1');
    expect(usernameKey('  Ａｂｃ_１ ')).toBe('abc_1');
    expect(usernameKey('ABC_1')).toBe(usernameKey('abc_1'));
  });

  it('accepts letters (any script), digits and underscore, 3-20 characters', () => {
    expect(usernameProblem('艾莉亞')).toBeNull();
    expect(usernameProblem('mage_01')).toBeNull();
    expect(usernameProblem('a'.repeat(20))).toBeNull();
  });

  it('rejects bad lengths and characters', () => {
    expect(usernameProblem('ab')).toBe('length');
    expect(usernameProblem('a'.repeat(21))).toBe('length');
    expect(usernameProblem('a b c')).toBe('chars');
    expect(usernameProblem('a-b-c')).toBe('chars');
    expect(usernameProblem('mage@x')).toBe('chars');
  });
});

describe('password rules', () => {
  it('accepts 8-128 characters', () => {
    expect(passwordProblem('1234567')).toBe('length');
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('x'.repeat(128))).toBeNull();
    expect(passwordProblem('x'.repeat(129))).toBe('length');
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/engine/account-rules.test.ts`
Expected: FAIL（`Cannot find module './account-rules'`）

- [ ] **Step 3: 實作**

`src/engine/account-rules.ts`：

```ts
/** Account name / password rules shared by the worker and the browser (no DOM, no Workers APIs). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const USERNAME_CHARS = /^[\p{L}\p{N}_]+$/u;

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFKC').trim();
}

/** Comparison key: names that differ only by case or full/half width are the same account. */
export function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

export type UsernameProblem = 'length' | 'chars';

export function usernameProblem(raw: string): UsernameProblem | null {
  const name = normalizeUsername(raw);
  const len = [...name].length;
  if (len < USERNAME_MIN || len > USERNAME_MAX) return 'length';
  if (!USERNAME_CHARS.test(name)) return 'chars';
  return null;
}

export function passwordProblem(pw: string): 'length' | null {
  const len = [...pw].length;
  return len < PASSWORD_MIN || len > PASSWORD_MAX ? 'length' : null;
}
```

- [ ] **Step 4: 執行測試與 build**

Run: `npx vitest run src/engine/account-rules.test.ts && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add src/engine/account-rules.ts src/engine/account-rules.test.ts
git commit -m "feat(engine): shared username and password rules"
```

---

### Task 2: 密碼雜湊

**Files:**
- Modify: `worker/auth.ts`
- Create: `worker/password.ts`
- Create: `worker/password.test.ts`

**Interfaces:**
- Produces: `worker/auth.ts` 的 `toBase64Url(bytes: Uint8Array): string`（改為 export）與 `fromBase64Url(s: string): Uint8Array`；`worker/password.ts` 的 `PBKDF2_ITERATIONS = 50_000`、`hashPassword(password: string, iterations?: number): Promise<string>`、`verifyPassword(password: string, stored: string): Promise<boolean>`、`needsRehash(stored: string): boolean`、`DUMMY_HASH: string`

- [ ] **Step 1: 寫失敗的測試**

`worker/password.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, needsRehash, PBKDF2_ITERATIONS, verifyPassword } from './password';

describe('password hashing', () => {
  it('uses the versioned pbkdf2 format with a random salt', async () => {
    const a = await hashPassword('correct horse');
    expect(a).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$[A-Za-z0-9_-]{22}\\$[A-Za-z0-9_-]{43}$`));
    expect(a).not.toBe(await hashPassword('correct horse'));
    expect(a).not.toContain('correct horse');
  });

  it('verifies the right password only', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('correct horsf', h)).toBe(false);
  });

  it('verifies older, weaker hashes and flags them for rehash', async () => {
    const old = await hashPassword('correct horse', 1000);
    expect(await verifyPassword('correct horse', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash(await hashPassword('correct horse'))).toBe(false);
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'nope')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$abc$AAAA$AAAA')).toBe(false);
    expect(needsRehash('nope')).toBe(true);
  });

  it('the dummy hash is well-formed and matches nothing', async () => {
    expect(needsRehash(DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
    expect(await verifyPassword('password1', DUMMY_HASH)).toBe(false);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run worker/password.test.ts`
Expected: FAIL（`Cannot find module './password'`）

- [ ] **Step 3: 實作**

`worker/auth.ts`：把 `function toBase64Url` 改成 `export function toBase64Url`，並在其後加入：

```ts
export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}
```

`worker/password.ts`：

```ts
import { fromBase64Url, toBase64Url } from './auth';

/**
 * PBKDF2-SHA256 via WebCrypto. 50k iterations ≈ 5 ms of CPU, which fits the Workers free plan's
 * 10 ms limit (100k ≈ 10 ms would not reliably). Hashes carry their iteration count so they can be
 * upgraded on the next successful login.
 */
export const PBKDF2_ITERATIONS = 50_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = 'pbkdf2-sha256';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

function parse(stored: string): { iterations: number; salt: Uint8Array; hash: Uint8Array } | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  try {
    const salt = fromBase64Url(parts[2]!);
    const hash = fromBase64Url(parts[3]!);
    if (salt.length !== SALT_BYTES || hash.length !== HASH_BYTES) return null;
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  return constantTimeEqual(await derive(password, parsed.salt, parsed.iterations), parsed.hash);
}

export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.iterations < PBKDF2_ITERATIONS;
}

/** Verified against when the username does not exist, so the response time matches a wrong password. */
export const DUMMY_HASH = `${PREFIX}$${PBKDF2_ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;
```

- [ ] **Step 4: 執行測試與 build**

Run: `npx vitest run worker/password.test.ts worker/auth.test.ts && npm run build`
Expected: PASS；build 成功

- [ ] **Step 5: Commit**

```bash
git add worker/auth.ts worker/password.ts worker/password.test.ts
git commit -m "feat(worker): pbkdf2 password hashing with versioned format"
```

---

### Task 3: Store 介面擴充與 MemoryStore；API 改用 sessions

**Files:**
- Modify: `worker/store.ts`
- Create: `worker/store-contract.ts`
- Create: `worker/store.test.ts`
- Modify: `worker/app.ts`（`/api/guest` 與 `auth` middleware）
- Modify: `worker/app.test.ts`（`creates player and returns initial state`）

**Interfaces:**
- Consumes: 既有 `Store`、`SaveRow`、`AnchorWrite`
- Produces（`worker/store.ts`）：
  - `PlayerRow` **移除** `tokenHash`：`{ id: string; displayName: string; createdAt: number; suspicious: boolean }`
  - `CredentialsRow { playerId: string; username: string; usernameKey: string; passwordHash: string; createdAt: number; updatedAt: number }`
  - `type BindResult = 'ok' | 'taken' | 'already_bound'`
  - `RateWindow { count: number; oldest: number | null }`
  - `Store` 新增／變更：
    - `createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void>`
    - `getPlayer(id: string): Promise<PlayerRow | null>`
    - `findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null>`（取代 `findPlayerByTokenHash`）
    - `createSession(hash: string, playerId: string, now: number): Promise<void>`
    - `touchSession(hash: string, now: number): Promise<void>`
    - `deleteSession(hash: string): Promise<void>`
    - `deleteOtherSessions(playerId: string, keepHash: string): Promise<void>`
    - `countSessions(playerId: string): Promise<number>`
    - `findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null>`
    - `findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null>`
    - `createCredentials(row: CredentialsRow): Promise<BindResult>`
    - `updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void>`
    - `recordLoginFailure(keys: string[], now: number): Promise<void>`
    - `loginFailures(key: string, since: number): Promise<RateWindow>`
    - `recordGuestCreation(ip: string, now: number): Promise<void>`
    - `guestCreations(ip: string, since: number): Promise<RateWindow>`
  - `worker/store-contract.ts`：`describeStoreContract(name: string, make: () => Promise<Store>): void`
  - `worker/app.ts`：`SESSION_TOUCH_MS = 3_600_000`；Hono `Variables` 新增 `sessionHash: string`

- [ ] **Step 1: 寫失敗的契約測試**

`worker/store-contract.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { CredentialsRow, PlayerRow, Store } from './store';

const DAY = 24 * 60 * 60 * 1000;
const player = (id: string): PlayerRow => ({ id, displayName: `name-${id}`, createdAt: 1000, suspicious: false });
const cred = (playerId: string, key: string): CredentialsRow => ({
  playerId,
  username: key.toUpperCase(),
  usernameKey: key,
  passwordHash: `hash-${playerId}`,
  createdAt: 2000,
  updatedAt: 2000,
});

/** Behaviour every Store must share (run against MemoryStore and against D1Store on real SQLite). */
export function describeStoreContract(name: string, make: () => Promise<Store>): void {
  describe(`${name} store contract`, () => {
    it('creates a player with its first session and save', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{"v":1}', 1000);
      expect(await s.getPlayer('p1')).toEqual(player('p1'));
      expect(await s.findPlayerBySession('h1')).toEqual({ player: player('p1'), lastSeenAt: 1000 });
      expect(await s.findPlayerBySession('nope')).toBeNull();
      expect((await s.getSave('p1'))?.state).toBe('{"v":1}');
    });

    it('manages several sessions per player', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{}', 1000);
      await s.createSession('h2', 'p1', 1500);
      await s.createSession('h3', 'p1', 1600);
      expect(await s.countSessions('p1')).toBe(3);
      await s.touchSession('h2', 9000);
      expect((await s.findPlayerBySession('h2'))?.lastSeenAt).toBe(9000);
      await s.deleteOtherSessions('p1', 'h2');
      expect(await s.countSessions('p1')).toBe(1);
      expect(await s.findPlayerBySession('h1')).toBeNull();
      await s.deleteSession('h2');
      expect(await s.countSessions('p1')).toBe(0);
    });

    it('binds credentials once per player and once per username key', async () => {
      const s = await make();
      await s.createPlayer(player('p1'), 'h1', '{}', 1000);
      await s.createPlayer(player('p2'), 'h2', '{}', 1000);
      expect(await s.createCredentials(cred('p1', 'mage'))).toBe('ok');
      expect(await s.createCredentials(cred('p2', 'mage'))).toBe('taken');
      expect(await s.createCredentials(cred('p1', 'other'))).toBe('already_bound');
      expect(await s.findCredentialsByKey('mage')).toEqual(cred('p1', 'mage'));
      expect(await s.findCredentialsByPlayer('p1')).toEqual(cred('p1', 'mage'));
      expect(await s.findCredentialsByPlayer('p2')).toBeNull();
      await s.updatePasswordHash('p1', 'new-hash', 3000);
      expect(await s.findCredentialsByKey('mage')).toMatchObject({ passwordHash: 'new-hash', updatedAt: 3000 });
    });

    it('counts login failures in a window and prunes day-old ones', async () => {
      const s = await make();
      await s.recordLoginFailure(['u:mage', 'ip:1.2.3.4'], 1000);
      await s.recordLoginFailure(['u:mage'], 2000);
      expect(await s.loginFailures('u:mage', 0)).toEqual({ count: 2, oldest: 1000 });
      expect(await s.loginFailures('u:mage', 1500)).toEqual({ count: 1, oldest: 2000 });
      expect(await s.loginFailures('ip:1.2.3.4', 0)).toEqual({ count: 1, oldest: 1000 });
      expect(await s.loginFailures('u:none', 0)).toEqual({ count: 0, oldest: null });
      await s.recordLoginFailure(['u:other'], 2000 + DAY + 1);
      expect(await s.loginFailures('u:mage', 0)).toEqual({ count: 0, oldest: null });
    });

    it('counts guest creations per ip in a window and prunes day-old ones', async () => {
      const s = await make();
      await s.recordGuestCreation('1.2.3.4', 1000);
      await s.recordGuestCreation('1.2.3.4', 2000);
      await s.recordGuestCreation('5.6.7.8', 2000);
      expect(await s.guestCreations('1.2.3.4', 0)).toEqual({ count: 2, oldest: 1000 });
      expect(await s.guestCreations('1.2.3.4', 1500)).toEqual({ count: 1, oldest: 2000 });
      await s.recordGuestCreation('9.9.9.9', 2000 + DAY + 1);
      expect(await s.guestCreations('1.2.3.4', 0)).toEqual({ count: 0, oldest: null });
    });
  });
}
```

`worker/store.test.ts`：

```ts
import { describeStoreContract } from './store-contract';
import { MemoryStore } from './store';

describeStoreContract('MemoryStore', async () => new MemoryStore());
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run worker/store.test.ts`
Expected: FAIL（`createPlayer` 參數不符、`getPlayer is not a function` 等）

- [ ] **Step 3: 改 Store 介面與 MemoryStore**

`worker/store.ts`：
- `PlayerRow` 拿掉 `tokenHash` 欄位。
- 在 `AnchorWrite` 之後加入：

```ts
export interface CredentialsRow {
  playerId: string;
  username: string;
  /** NFKC + lowercase; unique */
  usernameKey: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}

export type BindResult = 'ok' | 'taken' | 'already_bound';

/** Events in a time window: how many, and the oldest one's time (for Retry-After). */
export interface RateWindow {
  count: number;
  oldest: number | null;
}
```

- `Store` 介面：把 `createPlayer` 與 `findPlayerByTokenHash` 兩行換成：

```ts
  /** Creates the player, its first session and its initial save. */
  createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void>;
  getPlayer(id: string): Promise<PlayerRow | null>;
  findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null>;
  createSession(hash: string, playerId: string, now: number): Promise<void>;
  touchSession(hash: string, now: number): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  deleteOtherSessions(playerId: string, keepHash: string): Promise<void>;
  countSessions(playerId: string): Promise<number>;
  findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null>;
  findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null>;
  /** 'taken' when another player has the username key; 'already_bound' when this player has credentials. */
  createCredentials(row: CredentialsRow): Promise<BindResult>;
  updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void>;
  /** Also deletes failures older than a day. */
  recordLoginFailure(keys: string[], now: number): Promise<void>;
  loginFailures(key: string, since: number): Promise<RateWindow>;
  /** Also deletes records older than a day. */
  recordGuestCreation(ip: string, now: number): Promise<void>;
  guestCreations(ip: string, since: number): Promise<RateWindow>;
```

- `MemoryStore`：新增欄位並改寫／新增方法：

```ts
  sessions = new Map<string, { playerId: string; createdAt: number; lastSeenAt: number }>();
  credentials = new Map<string, CredentialsRow>(); // by playerId
  loginFailureLog: { key: string; at: number }[] = [];
  guestCreationLog: { ip: string; at: number }[] = [];

  async createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void> {
    this.players.set(p.id, { ...p });
    this.sessions.set(sessionHash, { playerId: p.id, createdAt: now, lastSeenAt: now });
    this.saves.set(p.id, {
      playerId: p.id,
      state: initialState,
      revision: 0,
      savedAt: now,
      prevState: null,
      prevSavedAt: null,
      anchorState: initialState,
      anchorAt: now,
    });
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const p = this.players.get(id);
    return p ? { ...p } : null;
  }

  async findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null> {
    const s = this.sessions.get(hash);
    const p = s ? this.players.get(s.playerId) : undefined;
    return s && p ? { player: { ...p }, lastSeenAt: s.lastSeenAt } : null;
  }

  async createSession(hash: string, playerId: string, now: number): Promise<void> {
    this.sessions.set(hash, { playerId, createdAt: now, lastSeenAt: now });
  }

  async touchSession(hash: string, now: number): Promise<void> {
    const s = this.sessions.get(hash);
    if (s) s.lastSeenAt = now;
  }

  async deleteSession(hash: string): Promise<void> {
    this.sessions.delete(hash);
  }

  async deleteOtherSessions(playerId: string, keepHash: string): Promise<void> {
    for (const [h, s] of this.sessions) if (s.playerId === playerId && h !== keepHash) this.sessions.delete(h);
  }

  async countSessions(playerId: string): Promise<number> {
    return [...this.sessions.values()].filter((s) => s.playerId === playerId).length;
  }

  async findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null> {
    for (const c of this.credentials.values()) if (c.usernameKey === usernameKey) return { ...c };
    return null;
  }

  async findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null> {
    const c = this.credentials.get(playerId);
    return c ? { ...c } : null;
  }

  async createCredentials(row: CredentialsRow): Promise<BindResult> {
    if (this.credentials.has(row.playerId)) return 'already_bound';
    if (await this.findCredentialsByKey(row.usernameKey)) return 'taken';
    this.credentials.set(row.playerId, { ...row });
    return 'ok';
  }

  async updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void> {
    const c = this.credentials.get(playerId);
    if (c) this.credentials.set(playerId, { ...c, passwordHash, updatedAt: now });
  }

  async recordLoginFailure(keys: string[], now: number): Promise<void> {
    this.loginFailureLog = this.loginFailureLog.filter((f) => f.at >= now - DAY_MS);
    for (const key of keys) this.loginFailureLog.push({ key, at: now });
  }

  async loginFailures(key: string, since: number): Promise<RateWindow> {
    return windowOf(this.loginFailureLog.filter((f) => f.key === key && f.at >= since).map((f) => f.at));
  }

  async recordGuestCreation(ip: string, now: number): Promise<void> {
    this.guestCreationLog = this.guestCreationLog.filter((g) => g.at >= now - DAY_MS);
    this.guestCreationLog.push({ ip, at: now });
  }

  async guestCreations(ip: string, since: number): Promise<RateWindow> {
    return windowOf(this.guestCreationLog.filter((g) => g.ip === ip && g.at >= since).map((g) => g.at));
  }
```

在 `const DAY_MS` 之後加入：

```ts
function windowOf(times: number[]): RateWindow {
  return { count: times.length, oldest: times.length > 0 ? Math.min(...times) : null };
}
```

刪除 `findPlayerByTokenHash`。

- [ ] **Step 4: API 改用 sessions**

`worker/app.ts`：
- `type Env = { Variables: { player: PlayerRow } };` 改成 `type Env = { Variables: { player: PlayerRow; sessionHash: string } };`
- 在 `ANCHOR_ADVANCE_MS` 之後加入：

```ts
/** A session's last_seen_at is written at most this often. */
export const SESSION_TOUCH_MS = 60 * 60 * 1000;
```

- `/api/guest` 裡建立玩家的部分改成：

```ts
    const token = newToken();
    const t = now();
    const player: PlayerRow = { id: crypto.randomUUID(), displayName: name, createdAt: t, suspicious: false };
    const state = createInitialState(data);
    await store.createPlayer(player, await hashToken(token), serialize(state), t);
    return c.json({ token, playerId: player.id, state, revision: 0 }, 201);
```

- `auth` middleware 換成：

```ts
  async function auth(c: Ctx, next: () => Promise<void>) {
    const m = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '');
    if (!m) return c.json({ error: 'unauthorized' }, 401);
    const hash = await hashToken(m[1]!);
    const found = await store.findPlayerBySession(hash);
    if (!found) return c.json({ error: 'unauthorized' }, 401);
    const t = now();
    if (t - found.lastSeenAt >= SESSION_TOUCH_MS) await store.touchSession(hash, t);
    c.set('player', found.player);
    c.set('sessionHash', hash);
    await next();
  }
```

`worker/app.test.ts` 的 `creates player and returns initial state`：
- import 加上 `import { hashToken } from './auth';`
- 把 `expect(store.players.get(body.playerId)?.tokenHash).not.toBe(body.token);` 換成：

```ts
    expect(store.sessions.get(await hashToken(body.token))?.playerId).toBe(body.playerId);
    expect([...store.sessions.keys()]).not.toContain(body.token);
```

並在 `describe('auth', ...)` 內新增：

```ts
  it('touches last_seen_at at most once an hour', async () => {
    const { body } = await guest();
    const hash = await hashToken(body.token);
    clock += 10 * 60 * 1000;
    await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(store.sessions.get(hash)?.lastSeenAt).toBe(1_000_000);
    clock += 60 * 60 * 1000;
    await app.request('/api/save', { headers: { authorization: `Bearer ${body.token}` } });
    expect(store.sessions.get(hash)?.lastSeenAt).toBe(clock);
  });
```

- [ ] **Step 5: 執行測試**

Run: `npx vitest run worker && npm test && npm run build`
Expected: 全部 PASS（`worker/d1-store.ts` 這時還沒改，build 會失敗在型別：`D1Store` 沒有實作新方法。**本任務暫時讓 D1Store 編得過**：在 `D1Store` 加上新方法的空殼，每個都 `throw new Error('not implemented: Task 4')`，`createPlayer` 改成新簽章並同樣丟錯；Task 4 會換成真正的 SQL。）

- [ ] **Step 6: Commit**

```bash
git add worker/store.ts worker/store-contract.ts worker/store.test.ts worker/app.ts worker/app.test.ts worker/d1-store.ts
git commit -m "feat(worker): sessions per device and account storage in the Store interface"
```

---

### Task 4: Migration 0003、D1Store 與真正的 SQLite 測試

**Files:**
- Create: `migrations/0003_accounts.sql`
- Modify: `worker/d1-store.ts`
- Create: `tests/d1/d1-shim.ts`
- Create: `tests/d1/d1-store.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `Store`、`describeStoreContract`
- Produces: `tests/d1/d1-shim.ts` 的 `createD1(): { d1: D1Database; raw: DatabaseSync }`、`applyMigrations(raw: DatabaseSync, files?: string[]): void`、`MIGRATIONS: string[]`（依檔名排序）

`tests/` 不在任何 tsconfig 的 `include` 內（和 `tests/sim` 一樣），所以不需要 `@types/node`；vitest 執行時由 esbuild 去掉型別。`node:sqlite` 需要 Node ≥ 22.13（Task 11 更新 `engines`）。

- [ ] **Step 1: 寫 D1 轉接器**

`tests/d1/d1-shim.ts`：

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
export const MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

type Value = string | number | null;

class Stmt {
  constructor(
    private readonly raw: DatabaseSync,
    private readonly sql: string,
    private readonly params: Value[] = [],
  ) {}
  bind(...params: Value[]): Stmt {
    return new Stmt(this.raw, this.sql, params);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.raw.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const rows = this.raw.prepare(this.sql).all(...this.params) as Record<string, unknown>[];
    return { results: rows.map((r) => ({ ...r }) as T), success: true, meta: {} };
  }
  runSync(): { success: true; meta: { changes: number; last_row_id: number } } {
    const r = this.raw.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    return this.runSync();
  }
}

/** The subset of D1Database that D1Store uses, on top of a real in-memory SQLite. */
export function createD1(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys
  const d1 = {
    prepare: (sql: string) => new Stmt(raw, sql),
    batch: async (stmts: Stmt[]) => {
      raw.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.runSync());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    exec: async (sql: string) => {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return { d1: d1 as unknown as D1Database, raw };
}

/** Applies migration files in order, each in its own transaction (like `wrangler d1 migrations apply`). */
export function applyMigrations(raw: DatabaseSync, files: string[] = MIGRATIONS): void {
  for (const f of files) {
    raw.exec('BEGIN');
    try {
      raw.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
      raw.exec('COMMIT');
    } catch (e) {
      raw.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
```

- [ ] **Step 2: 寫失敗的測試**

`tests/d1/d1-store.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { describeStoreContract } from '../../worker/store-contract';
import { D1Store } from '../../worker/d1-store';
import { applyMigrations, createD1, MIGRATIONS } from './d1-shim';

describeStoreContract('D1Store (sqlite)', async () => {
  const { d1, raw } = createD1();
  applyMigrations(raw);
  return new D1Store(d1);
});

describe('migration 0003', () => {
  it('keeps existing guests logged in and their saves intact', async () => {
    const { d1, raw } = createD1();
    const before = MIGRATIONS.filter((f) => f < '0003');
    applyMigrations(raw, before);
    raw.prepare('INSERT INTO players (id, display_name, token_hash, created_at, suspicious) VALUES (?, ?, ?, ?, 0)').run('p1', 'Old', 'h-old', 1234);
    raw.prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 3, 5000, ?, 5000)').run('p1', '{"v":1}', '{"v":1}');

    applyMigrations(raw, MIGRATIONS.filter((f) => f >= '0003'));

    const store = new D1Store(d1);
    expect(await store.findPlayerBySession('h-old')).toEqual({
      player: { id: 'p1', displayName: 'Old', createdAt: 1234, suspicious: false },
      lastSeenAt: 1234,
    });
    expect((await store.getSave('p1'))?.revision).toBe(3);
    const cols = raw.prepare("SELECT name FROM pragma_table_info('players')").all().map((r) => (r as { name: string }).name);
    expect(cols).not.toContain('token_hash');
    expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
```

- [ ] **Step 3: 執行，確認失敗**

Run: `npx vitest run tests/d1`
Expected: FAIL（`migration ... ` 找不到 0003 的資料表，或 D1Store 丟出 `not implemented: Task 4`）

- [ ] **Step 4: 寫 migration**

`migrations/0003_accounts.sql`：

```sql
-- v2 A: accounts. One session per device (replaces players.token_hash), username + password
-- credentials, and rate-limit logs for logins and guest creation.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  player_id    TEXT NOT NULL REFERENCES players(id),
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_player ON sessions (player_id);

-- existing guests keep their token
INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at)
  SELECT token_hash, id, created_at, created_at FROM players;

-- drop players.token_hash (NOT NULL UNIQUE cannot be dropped in place): rebuild the table
CREATE TABLE players_new (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  suspicious   INTEGER NOT NULL DEFAULT 0
);
INSERT INTO players_new (id, display_name, created_at, suspicious)
  SELECT id, display_name, created_at, suspicious FROM players;
DROP TABLE players;
ALTER TABLE players_new RENAME TO players;

CREATE TABLE credentials (
  player_id     TEXT PRIMARY KEY REFERENCES players(id),
  username      TEXT NOT NULL,
  username_key  TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE login_failures (
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
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

如果 Step 6 的 `PRAGMA foreign_key_check` 或 `DROP TABLE players` 在 SQLite 上報外鍵錯誤，**不要關掉外鍵**；改用 Cloudflare 文件的同一做法確認 `PRAGMA defer_foreign_keys = ON` 在同一個交易內（`applyMigrations` 以 `BEGIN` 包住），並在帳本記一條 Ruling。

- [ ] **Step 5: 實作 D1Store**

`worker/d1-store.ts`：
- import 改成 `import type { AnchorWrite, BindResult, CredentialsRow, PlayerRow, RateWindow, SaveRow, Store } from './store';`
- `PlayerDb` 拿掉 `token_hash`；新增：

```ts
interface CredentialsDb {
  player_id: string;
  username: string;
  username_key: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

const toPlayer = (r: PlayerDb): PlayerRow => ({
  id: r.id,
  displayName: r.display_name,
  createdAt: r.created_at,
  suspicious: r.suspicious === 1,
});

const toCredentials = (r: CredentialsDb): CredentialsRow => ({
  playerId: r.player_id,
  username: r.username,
  usernameKey: r.username_key,
  passwordHash: r.password_hash,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
```

- 刪除 `findPlayerByTokenHash` 與 Task 3 的空殼，實作：

```ts
  async createPlayer(p: PlayerRow, sessionHash: string, initialState: string, now: number): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('INSERT INTO players (id, display_name, created_at, suspicious) VALUES (?, ?, ?, ?)')
        .bind(p.id, p.displayName, p.createdAt, p.suspicious ? 1 : 0),
      this.db
        .prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
        .bind(sessionHash, p.id, now, now),
      this.db
        .prepare('INSERT INTO saves (player_id, state, revision, saved_at, anchor_state, anchor_at) VALUES (?, ?, 0, ?, ?, ?)')
        .bind(p.id, initialState, now, initialState, now),
    ]);
  }

  async getPlayer(id: string): Promise<PlayerRow | null> {
    const r = await this.db.prepare('SELECT * FROM players WHERE id = ?').bind(id).first<PlayerDb>();
    return r ? toPlayer(r) : null;
  }

  async findPlayerBySession(hash: string): Promise<{ player: PlayerRow; lastSeenAt: number } | null> {
    const r = await this.db
      .prepare(
        'SELECT p.id, p.display_name, p.created_at, p.suspicious, s.last_seen_at FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?',
      )
      .bind(hash)
      .first<PlayerDb & { last_seen_at: number }>();
    return r ? { player: toPlayer(r), lastSeenAt: r.last_seen_at } : null;
  }

  async createSession(hash: string, playerId: string, now: number): Promise<void> {
    await this.db
      .prepare('INSERT INTO sessions (token_hash, player_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
      .bind(hash, playerId, now, now)
      .run();
  }

  async touchSession(hash: string, now: number): Promise<void> {
    await this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, hash).run();
  }

  async deleteSession(hash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  }

  async deleteOtherSessions(playerId: string, keepHash: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE player_id = ? AND token_hash <> ?').bind(playerId, keepHash).run();
  }

  async countSessions(playerId: string): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE player_id = ?').bind(playerId).first<{ n: number }>();
    return r?.n ?? 0;
  }

  async findCredentialsByKey(usernameKey: string): Promise<CredentialsRow | null> {
    const r = await this.db.prepare('SELECT * FROM credentials WHERE username_key = ?').bind(usernameKey).first<CredentialsDb>();
    return r ? toCredentials(r) : null;
  }

  async findCredentialsByPlayer(playerId: string): Promise<CredentialsRow | null> {
    const r = await this.db.prepare('SELECT * FROM credentials WHERE player_id = ?').bind(playerId).first<CredentialsDb>();
    return r ? toCredentials(r) : null;
  }

  async createCredentials(row: CredentialsRow): Promise<BindResult> {
    if (await this.findCredentialsByPlayer(row.playerId)) return 'already_bound';
    try {
      await this.db
        .prepare(
          'INSERT INTO credentials (player_id, username, username_key, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(row.playerId, row.username, row.usernameKey, row.passwordHash, row.createdAt, row.updatedAt)
        .run();
      return 'ok';
    } catch (e) {
      // a concurrent bind can still lose the race on either unique column
      const msg = e instanceof Error ? e.message : String(e);
      if (/UNIQUE constraint failed: credentials\.player_id/.test(msg)) return 'already_bound';
      if (/UNIQUE constraint failed/.test(msg)) return 'taken';
      throw e;
    }
  }

  async updatePasswordHash(playerId: string, passwordHash: string, now: number): Promise<void> {
    await this.db
      .prepare('UPDATE credentials SET password_hash = ?, updated_at = ? WHERE player_id = ?')
      .bind(passwordHash, now, playerId)
      .run();
  }

  async recordLoginFailure(keys: string[], now: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM login_failures WHERE at < ?').bind(now - DAY_MS),
      ...keys.map((k) => this.db.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)').bind(k, now)),
    ]);
  }

  async loginFailures(key: string, since: number): Promise<RateWindow> {
    const r = await this.db
      .prepare('SELECT COUNT(*) AS n, MIN(at) AS oldest FROM login_failures WHERE key = ? AND at >= ?')
      .bind(key, since)
      .first<{ n: number; oldest: number | null }>();
    return { count: r?.n ?? 0, oldest: r?.oldest ?? null };
  }

  async recordGuestCreation(ip: string, now: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM guest_creations WHERE at < ?').bind(now - DAY_MS),
      this.db.prepare('INSERT INTO guest_creations (ip, at) VALUES (?, ?)').bind(ip, now),
    ]);
  }

  async guestCreations(ip: string, since: number): Promise<RateWindow> {
    const r = await this.db
      .prepare('SELECT COUNT(*) AS n, MIN(at) AS oldest FROM guest_creations WHERE ip = ? AND at >= ?')
      .bind(ip, since)
      .first<{ n: number; oldest: number | null }>();
    return { count: r?.n ?? 0, oldest: r?.oldest ?? null };
  }
```

- [ ] **Step 6: 執行測試**

Run: `npx vitest run tests/d1 worker && npm test && npm run build`
Expected: 全部 PASS（`node:sqlite` 會印一行 ExperimentalWarning，屬正常）

- [ ] **Step 7: 本機 D1 套用 migration**

Run: `npm run db:migrate:local`
Expected: `0003_accounts.sql` 套用成功（只動本機 `.wrangler/`，**不要**加 `--remote`）

- [ ] **Step 8: Commit**

```bash
git add migrations/0003_accounts.sql worker/d1-store.ts tests/d1/
git commit -m "feat(db): migration 0003 for sessions and credentials, tested on real sqlite"
```

---

### Task 5: `/api/guest` 頻率限制

**Files:**
- Modify: `worker/app.ts`
- Modify: `worker/app.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `recordGuestCreation`、`guestCreations`
- Produces: `GUEST_LIMIT_PER_HOUR = 10`；`clientIp(c: Ctx): string`；`rateLimited(c: Ctx, retryAfterSec: number): Response`（回 `429 { error: 'rate_limited', retryAfterSec }`，秒數至少 1）

- [ ] **Step 1: 寫失敗的測試**

`worker/app.test.ts`，在 `describe('POST /api/guest', ...)` 內新增：

```ts
  it('allows 10 guests per ip per hour', async () => {
    const make = (ip: string) =>
      app.request('/api/guest', { ...json({ displayName: 'Mage' }), headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip } });
    for (let i = 0; i < 10; i++) expect((await make('1.2.3.4')).status).toBe(201);
    const blocked = await make('1.2.3.4');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBe(3600);
    expect((await make('5.6.7.8')).status).toBe(201);
    clock += 60 * 60 * 1000;
    expect((await make('1.2.3.4')).status).toBe(201);
  });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run worker/app.test.ts -t "10 guests"`
Expected: FAIL（第 11 個回 201）

- [ ] **Step 3: 實作**

`worker/app.ts`：在 `SESSION_TOUCH_MS` 之後加入：

```ts
export const GUEST_LIMIT_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

/** Client IP for rate limits: Cloudflare's header, or 'local' in tests and `wrangler dev` without it. */
function clientIp(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? 'local';
}

function rateLimited(c: Ctx, retryAfterSec: number): Response {
  return c.json({ error: 'rate_limited', retryAfterSec: Math.max(1, Math.ceil(retryAfterSec)) }, 429);
}
```

`/api/guest` 在名稱檢查之後、`newToken()` 之前加入：

```ts
    const ip = clientIp(c);
    const t0 = now();
    const recent = await store.guestCreations(ip, t0 - HOUR_MS);
    if (recent.count >= GUEST_LIMIT_PER_HOUR && recent.oldest !== null) {
      return rateLimited(c, (recent.oldest + HOUR_MS - t0) / 1000);
    }
```

並在 `await store.createPlayer(...)` 之後加入 `await store.recordGuestCreation(ip, t);`。（`const t = now();` 保留；`t0` 只用在檢查。）

- [ ] **Step 4: 執行測試**

Run: `npx vitest run worker && npm test && npm run build`
Expected: 全部 PASS（包含 `tests/sim`：每條路線只建立 1 個遊客）

- [ ] **Step 5: Commit**

```bash
git add worker/app.ts worker/app.test.ts
git commit -m "feat(worker): limit guest creation to 10 per ip per hour"
```

---

### Task 6: 綁定與登入 API

**Files:**
- Modify: `worker/app.ts`
- Modify: `worker/app.test.ts`

**Interfaces:**
- Consumes: Task 1 `normalizeUsername`、`usernameKey`、`usernameProblem`、`passwordProblem`；Task 2 `hashPassword`、`verifyPassword`、`needsRehash`、`DUMMY_HASH`；Task 3 store 方法；Task 5 `clientIp`、`rateLimited`
- Produces: `LOGIN_WINDOW_MS = 15 * 60 * 1000`、`USER_FAIL_LIMIT = 5`、`IP_FAIL_LIMIT = 20`；`POST /api/account/bind`、`POST /api/login`；`readCredentials(body)` 內部函式

- [ ] **Step 1: 寫失敗的測試**

`worker/app.test.ts` 檔尾新增：

```ts
describe('accounts: bind and login', () => {
  const authed = (token: string): RequestInit => ({ headers: { authorization: `Bearer ${token}` } });
  const bind = (token: string, username: string, password: string) =>
    app.request('/api/account/bind', json({ username, password }, token));
  const login = (username: string, password: string, ip = '1.1.1.1') =>
    app.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ username, password }),
    });

  it('binds a guest and logs in from another device, keeping both sessions', async () => {
    const { body: g } = await guest('Aria');
    const res = await bind(g.token, ' Ａｒｉａ_1 ', 'correct horse');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: 'Aria_1' });
    const cred = store.credentials.get(g.playerId)!;
    expect(cred.usernameKey).toBe('aria_1');
    expect(cred.passwordHash).not.toContain('correct horse');

    const lr = await login('ARIA_1', 'correct horse');
    expect(lr.status).toBe(200);
    const lb = (await lr.json()) as { token: string; playerId: string; state: GameState; revision: number };
    expect(lb.playerId).toBe(g.playerId);
    expect(lb.token).not.toBe(g.token);
    expect(lb.revision).toBe(0);
    expect(lb.state).toEqual(createInitialState(gameData));
    expect((await app.request('/api/save', authed(g.token))).status).toBe(200);
    expect((await app.request('/api/save', authed(lb.token))).status).toBe(200);
  });

  it('rejects taken names (case and width insensitive), double binds and bad input', async () => {
    const { body: a } = await guest('A');
    const { body: b } = await guest('B');
    expect((await bind(a.token, 'mage_1', 'password1')).status).toBe(200);
    const taken = await bind(b.token, 'ＭＡＧＥ_1', 'password1');
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'taken' });
    const again = await bind(a.token, 'other', 'password1');
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_bound' });
    expect((await bind(b.token, 'ab', 'password1')).status).toBe(400);
    expect((await bind(b.token, 'a-b-c', 'password1')).status).toBe(400);
    expect((await bind(b.token, 'mage_2', 'short')).status).toBe(400);
    expect((await app.request('/api/account/bind', json({ username: 'x_y_z', password: 'password1' }))).status).toBe(401);
  });

  it('answers a wrong password and an unknown name the same way (403)', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    const wrong = await login('mage_1', 'password2');
    const unknown = await login('nobody', 'password2');
    expect(wrong.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect(await wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(await unknown.json()).toEqual({ error: 'invalid_credentials' });
    expect((await login('ab', 'password1')).status).toBe(400);
  });

  it('locks a name after 5 failures in 15 minutes, even for the right password', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    for (let i = 0; i < 5; i++) expect((await login('mage_1', 'nope-nope', `9.9.9.${i}`)).status).toBe(403);
    const blocked = await login('mage_1', 'password1', '8.8.8.8');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterSec: number };
    expect(body.error).toBe('rate_limited');
    expect(body.retryAfterSec).toBeGreaterThan(0);
    expect(body.retryAfterSec).toBeLessThanOrEqual(900);
    clock += 15 * 60 * 1000 + 1;
    expect((await login('mage_1', 'password1', '8.8.8.8')).status).toBe(200);
  });

  it('a success does not reset the failure count', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    for (let i = 0; i < 4; i++) await login('mage_1', 'nope-nope');
    expect((await login('mage_1', 'password1')).status).toBe(200);
    expect((await login('mage_1', 'nope-nope')).status).toBe(403);
    expect((await login('mage_1', 'password1')).status).toBe(429);
  });

  it('locks an ip after 20 failures across names', async () => {
    for (let i = 0; i < 20; i++) expect((await login(`name_${i}`, 'nope-nope', '7.7.7.7')).status).toBe(403);
    expect((await login('name_x', 'nope-nope', '7.7.7.7')).status).toBe(429);
    expect((await login('name_x', 'nope-nope', '6.6.6.6')).status).toBe(403);
  });

  it('upgrades a weaker stored hash on login', async () => {
    const { body: g } = await guest();
    await bind(g.token, 'mage_1', 'password1');
    const { hashPassword } = await import('./password');
    store.credentials.get(g.playerId)!.passwordHash = await hashPassword('password1', 1000);
    expect((await login('mage_1', 'password1')).status).toBe(200);
    expect(store.credentials.get(g.playerId)!.passwordHash).toMatch(/^pbkdf2-sha256\$50000\$/);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run worker/app.test.ts -t "accounts: bind and login"`
Expected: FAIL（404，路由不存在）

- [ ] **Step 3: 實作**

`worker/app.ts` import 新增：

```ts
import { normalizeUsername, passwordProblem, usernameKey, usernameProblem } from '../src/engine/account-rules';
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from './password';
```

常數（在 `GUEST_LIMIT_PER_HOUR` 之後）：

```ts
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const USER_FAIL_LIMIT = 5;
export const IP_FAIL_LIMIT = 20;
```

在 `createApp` 內、`auth` 之後加入：

```ts
  app.use('/api/account/*', auth);
  app.use('/api/logout', auth);

  function readCredentials(body: Record<string, unknown>): { username: string; password: string } {
    const username = typeof body.username === 'string' ? body.username : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (usernameProblem(username)) throw new HttpError(400, 'invalid_username');
    if (passwordProblem(password)) throw new HttpError(400, 'invalid_password');
    return { username, password };
  }

  /** Seconds until the oldest counted failure leaves the window, or null when no limit is hit. */
  async function loginBlocked(limits: [key: string, limit: number][], t: number): Promise<number | null> {
    let retry: number | null = null;
    for (const [key, limit] of limits) {
      const w = await store.loginFailures(key, t - LOGIN_WINDOW_MS);
      if (w.count >= limit && w.oldest !== null) retry = Math.max(retry ?? 0, (w.oldest + LOGIN_WINDOW_MS - t) / 1000);
    }
    return retry;
  }

  app.post('/api/account/bind', async (c) => {
    const { username, password } = readCredentials(await readJson(c));
    const player = c.get('player');
    const t = now();
    const result = await store.createCredentials({
      playerId: player.id,
      username: normalizeUsername(username),
      usernameKey: usernameKey(username),
      passwordHash: await hashPassword(password),
      createdAt: t,
      updatedAt: t,
    });
    if (result !== 'ok') return c.json({ error: result }, 409);
    return c.json({ username: normalizeUsername(username) });
  });

  app.post('/api/login', async (c) => {
    const { username, password } = readCredentials(await readJson(c));
    const key = usernameKey(username);
    const ip = clientIp(c);
    const t = now();
    const retry = await loginBlocked([[`u:${key}`, USER_FAIL_LIMIT], [`ip:${ip}`, IP_FAIL_LIMIT]], t);
    if (retry !== null) return rateLimited(c, retry);
    const cred = await store.findCredentialsByKey(key);
    // always run one PBKDF2 so an unknown name takes as long as a wrong password
    const matches = await verifyPassword(password, cred?.passwordHash ?? DUMMY_HASH);
    if (!cred || !matches) {
      await store.recordLoginFailure([`u:${key}`, `ip:${ip}`], t);
      return c.json({ error: 'invalid_credentials' }, 403);
    }
    const player = await store.getPlayer(cred.playerId);
    const save = await store.getSave(cred.playerId);
    if (!player || !save) return c.json({ error: 'internal error' }, 500);
    if (needsRehash(cred.passwordHash)) await store.updatePasswordHash(player.id, await hashPassword(password), t);
    const token = newToken();
    await store.createSession(await hashToken(token), player.id, t);
    return c.json({ token, playerId: player.id, state: JSON.parse(save.state), revision: save.revision });
  });
```

`HttpError` 的 `message` 會成為 `{ error }` 的值，所以 400 回應是 `{ error: 'invalid_username' }` 或 `{ error: 'invalid_password' }`。

- [ ] **Step 4: 執行測試**

Run: `npx vitest run worker && npm test && npm run build`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add worker/app.ts worker/app.test.ts
git commit -m "feat(worker): bind username/password and log in with per-name and per-ip limits"
```

---

### Task 7: 帳號資訊、改密碼、登出 API

**Files:**
- Modify: `worker/app.ts`
- Modify: `worker/app.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `loginBlocked`、`readCredentials` 以外的同層 helper；Task 3 store 方法
- Produces: `GET /api/account`、`POST /api/account/password`、`POST /api/account/logout-others`、`POST /api/logout`（見 spec 第 4 節表格）

- [ ] **Step 1: 寫失敗的測試**

`worker/app.test.ts` 檔尾新增：

```ts
describe('accounts: info, password and logout', () => {
  const get = (path: string, token: string) => app.request(path, { headers: { authorization: `Bearer ${token}` } });
  const post = (path: string, token: string, body: unknown = {}) => app.request(path, json(body, token));
  async function boundGuest() {
    const { body: g } = await guest('Aria');
    await post('/api/account/bind', g.token, { username: 'aria_1', password: 'password1' });
    const lr = await app.request('/api/login', json({ username: 'aria_1', password: 'password1' }));
    const second = ((await lr.json()) as { token: string }).token;
    return { g, second };
  }

  it('reports display name, username and session count', async () => {
    const { body: g } = await guest('Aria');
    expect(await (await get('/api/account', g.token)).json()).toEqual({ displayName: 'Aria', username: null, sessions: 1 });
    const { g: b, second } = await boundGuest();
    expect(await (await get('/api/account', second)).json()).toEqual({ displayName: 'Aria', username: 'aria_1', sessions: 2 });
    expect(b.token).not.toBe(second);
  });

  it('changes the password and logs out the other devices only', async () => {
    const { g, second } = await boundGuest();
    const res = await post('/api/account/password', second, { current: 'password1', next: 'password2' });
    expect(res.status).toBe(200);
    expect((await get('/api/save', g.token)).status).toBe(401);
    expect((await get('/api/save', second)).status).toBe(200);
    expect((await app.request('/api/login', json({ username: 'aria_1', password: 'password2' }))).status).toBe(200);
    expect((await app.request('/api/login', json({ username: 'aria_1', password: 'password1' }))).status).toBe(403);
  });

  it('a wrong current password is 403 (not 401) and counts as a failure', async () => {
    const { second } = await boundGuest();
    for (let i = 0; i < 5; i++) {
      expect((await post('/api/account/password', second, { current: 'nope-nope', next: 'password2' })).status).toBe(403);
    }
    expect((await post('/api/account/password', second, { current: 'password1', next: 'password2' })).status).toBe(429);
    expect((await get('/api/save', second)).status).toBe(200);
  });

  it('refuses password change and logout for guests', async () => {
    const { body: g } = await guest();
    const pw = await post('/api/account/password', g.token, { current: 'password1', next: 'password2' });
    expect(pw.status).toBe(409);
    expect(await pw.json()).toEqual({ error: 'not_bound' });
    const out = await post('/api/logout', g.token);
    expect(out.status).toBe(409);
    expect(await out.json()).toEqual({ error: 'not_bound' });
    expect((await get('/api/save', g.token)).status).toBe(200);
  });

  it('logs out this device, or all the others', async () => {
    const { g, second } = await boundGuest();
    const others = await post('/api/account/logout-others', second);
    expect(await others.json()).toEqual({ sessions: 1 });
    expect((await get('/api/save', g.token)).status).toBe(401);
    expect((await post('/api/logout', second)).status).toBe(200);
    expect((await get('/api/save', second)).status).toBe(401);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run worker/app.test.ts -t "accounts: info"`
Expected: FAIL（404）

- [ ] **Step 3: 實作**

`worker/app.ts`，在 `/api/login` 之後加入：

```ts
  app.get('/api/account', async (c) => {
    const player = c.get('player');
    const cred = await store.findCredentialsByPlayer(player.id);
    return c.json({ displayName: player.displayName, username: cred?.username ?? null, sessions: await store.countSessions(player.id) });
  });

  app.post('/api/account/password', async (c) => {
    const body = await readJson(c);
    const current = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.next === 'string' ? body.next : '';
    if (passwordProblem(next)) throw new HttpError(400, 'invalid_password');
    const player = c.get('player');
    const cred = await store.findCredentialsByPlayer(player.id);
    if (!cred) return c.json({ error: 'not_bound' }, 409);
    const ip = clientIp(c);
    const t = now();
    const retry = await loginBlocked([[`u:${cred.usernameKey}`, USER_FAIL_LIMIT], [`ip:${ip}`, IP_FAIL_LIMIT]], t);
    if (retry !== null) return rateLimited(c, retry);
    if (!(await verifyPassword(current, cred.passwordHash))) {
      await store.recordLoginFailure([`u:${cred.usernameKey}`, `ip:${ip}`], t);
      return c.json({ error: 'invalid_credentials' }, 403);
    }
    await store.updatePasswordHash(player.id, await hashPassword(next), t);
    await store.deleteOtherSessions(player.id, c.get('sessionHash'));
    return c.json({});
  });

  app.post('/api/account/logout-others', async (c) => {
    const player = c.get('player');
    await store.deleteOtherSessions(player.id, c.get('sessionHash'));
    return c.json({ sessions: await store.countSessions(player.id) });
  });

  app.post('/api/logout', async (c) => {
    const player = c.get('player');
    // a guest without credentials could never get this progress back
    if (!(await store.findCredentialsByPlayer(player.id))) return c.json({ error: 'not_bound' }, 409);
    await store.deleteSession(c.get('sessionHash'));
    return c.json({});
  });
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run worker && npm test && npm run build`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add worker/app.ts worker/app.test.ts
git commit -m "feat(worker): account info, password change and logout endpoints"
```

---

### Task 8: 用戶端 API

**Files:**
- Modify: `src/game/api.ts`
- Create: `src/game/api.test.ts`

**Interfaces:**
- Produces:
  - `ApiError` 新增第三個參數 `readonly code?: string`（伺服器 `{ error }` 的值）
  - `class RateLimitedError extends ApiError { readonly retryAfterSec: number }`
  - `type LoginResult = { token: string; state: GameState; revision: number }`（與 `createGuest` 相同）
  - `interface AccountInfo { displayName: string; username: string | null; sessions: number }`
  - `ApiClient` 新增：`login(username, password): Promise<LoginResult>`、`bind(username, password): Promise<{ username: string }>`、`getAccount(): Promise<AccountInfo>`、`changePassword(current, next): Promise<void>`、`logoutOthers(): Promise<void>`、`logout(): Promise<void>`

- [ ] **Step 1: 寫失敗的測試**

`src/game/api.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { ApiError, AuthError, createApiClient, RateLimitedError } from './api';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('account api', () => {
  it('logs in and parses the save like createGuest', async () => {
    const state = createInitialState(gameData);
    const f = fakeFetch(200, { token: 't2', playerId: 'p', state, revision: 4 });
    const api = createApiClient(() => null, f as unknown as typeof fetch);
    expect(await api.login('mage_1', 'password1')).toEqual({ token: 't2', state, revision: 4 });
    expect(f).toHaveBeenCalledWith('/api/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'mage_1', password: 'password1' }) }));
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
    await api.changePassword('password1', 'password2');
    await api.logoutOthers();
    await api.logout();
    const paths = f.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(paths).toEqual(['/api/account', '/api/account/password', '/api/account/logout-others', '/api/logout']);
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/game/api.test.ts`
Expected: FAIL（`api.login is not a function`、`RateLimitedError` 不存在）

- [ ] **Step 3: 實作**

`src/game/api.ts`：
- `ApiError` 改成：

```ts
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
```

- `ApiClient` 介面新增：

```ts
  login(username: string, password: string): Promise<LoginResult>;
  bind(username: string, password: string): Promise<{ username: string }>;
  getAccount(): Promise<AccountInfo>;
  changePassword(current: string, next: string): Promise<void>;
  logoutOthers(): Promise<void>;
  logout(): Promise<void>;
```

`createGuest` 的回傳型別改寫成 `Promise<LoginResult>`。

- `request` 內，把
  `if (!res.ok && !accept.includes(res.status)) throw new ApiError(`request failed ${res.status}`, res.status);`
  換成：

```ts
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
```

- 回傳物件新增：

```ts
    async login(username, password) {
      const { body } = await request('POST', '/api/login', { username, password });
      if (typeof body.token !== 'string') throw new ApiError('invalid token from server', 0);
      return { token: body.token, state: parseServerState(body.state), revision: revisionOf(body) };
    },
    async bind(username, password) {
      const { body } = await request('POST', '/api/account/bind', { username, password });
      if (typeof body.username !== 'string') throw new ApiError('invalid bind reply', 0);
      return { username: body.username };
    },
    async getAccount() {
      const { body } = await request('GET', '/api/account');
      if (typeof body.displayName !== 'string' || typeof body.sessions !== 'number') throw new ApiError('invalid account reply', 0);
      return { displayName: body.displayName, username: typeof body.username === 'string' ? body.username : null, sessions: body.sessions };
    },
    async changePassword(current, next) {
      await request('POST', '/api/account/password', { current, next });
    },
    async logoutOthers() {
      await request('POST', '/api/account/logout-others', {});
    },
    async logout() {
      await request('POST', '/api/logout', {});
    },
```

- [ ] **Step 4: 執行測試**

Run: `npx vitest run src/game && npm test && npm run build`
Expected: 全部 PASS（`sync.test.ts` 的假 API 只實作部分方法，若型別要求完整介面，改用 `Pick<ApiClient, ...>` 或在假物件補上 `vi.fn()`；記一條 Ruling）

- [ ] **Step 5: Commit**

```bash
git add src/game/api.ts src/game/api.test.ts
git commit -m "feat(api): client calls for login, bind and account management"
```

---

### Task 9: 開始畫面的登入模式

**Files:**
- Modify: `src/ui/messages.ts`
- Modify: `src/ui/Onboarding.tsx`
- Modify: `src/ui/Onboarding.test.tsx`

**Interfaces:**
- Consumes: Task 1 規則；Task 8 `ApiError`、`RateLimitedError`、`LoginResult`、`ApiClient['login']`
- Produces（`messages.ts`）：`usernameProblemMessage(p: UsernameProblem): string`、`passwordProblemMessage(): string`、`accountErrorMessage(e: unknown): string`。`Onboarding` props 變成 `{ api: Pick<ApiClient, 'createGuest' | 'login'>; onDone: (result: LoginResult) => void }`

- [ ] **Step 1: 寫失敗的測試**

`src/ui/Onboarding.test.tsx`：`setup()` 的 `api` 改成 `{ createGuest: vi.fn(async () => result), login: vi.fn(async () => result) }`，並在檔尾新增：

```tsx
describe('Onboarding login', () => {
  function openLogin() {
    const ctx = setup();
    fireEvent.click(screen.getByRole('button', { name: '已有帳號？登入' }));
    const user = screen.getByLabelText('帳號名稱');
    const pass = screen.getByLabelText('密碼');
    const submit = () => fireEvent.click(screen.getByRole('button', { name: '登入' }));
    return { ...ctx, user, pass, submitLogin: submit };
  }

  it('logs in with a username and password', async () => {
    const { api, onDone, user, pass, submitLogin, result } = openLogin();
    fireEvent.change(user, { target: { value: 'mage_1' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(result));
    expect(api.login).toHaveBeenCalledWith('mage_1', 'password1');
  });

  it('checks the format before calling the server', () => {
    const { api, user, pass, submitLogin } = openLogin();
    fireEvent.change(user, { target: { value: 'ab' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    expect(screen.getByRole('alert').textContent).toContain('3～20');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('shows the server errors in Chinese', async () => {
    const { api, user, pass, submitLogin } = openLogin();
    const { ApiError, RateLimitedError } = await import('../game/api');
    api.login.mockRejectedValueOnce(new ApiError('x', 403, 'invalid_credentials'));
    fireEvent.change(user, { target: { value: 'mage_1' } });
    fireEvent.change(pass, { target: { value: 'password1' } });
    submitLogin();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('帳號或密碼錯誤'));
    api.login.mockRejectedValueOnce(new RateLimitedError(61));
    submitLogin();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('嘗試次數過多，請 2 分鐘後再試'));
  });

  it('can go back to creating a new character', () => {
    openLogin();
    fireEvent.click(screen.getByRole('button', { name: '建立新角色' }));
    expect(screen.getByLabelText('顯示名稱')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/ui/Onboarding.test.tsx`
Expected: FAIL（找不到「已有帳號？登入」按鈕）

- [ ] **Step 3: 訊息**

`src/ui/messages.ts` 新增：

```ts
import { USERNAME_MAX, USERNAME_MIN, PASSWORD_MAX, PASSWORD_MIN, type UsernameProblem } from '../engine/account-rules';
import { ApiError, NetworkError, RateLimitedError } from '../game/api';

export function usernameProblemMessage(p: UsernameProblem): string {
  return p === 'length' ? `帳號名稱需要 ${USERNAME_MIN}～${USERNAME_MAX} 個字` : '帳號名稱只能用中英文、數字和底線';
}

export function passwordProblemMessage(): string {
  return `密碼需要 ${PASSWORD_MIN}～${PASSWORD_MAX} 個字`;
}

export function accountErrorMessage(e: unknown): string {
  if (e instanceof RateLimitedError) return `嘗試次數過多，請 ${Math.max(1, Math.ceil(e.retryAfterSec / 60))} 分鐘後再試`;
  if (e instanceof ApiError) {
    if (e.code === 'invalid_credentials') return '帳號或密碼錯誤';
    if (e.code === 'taken') return '這個帳號名稱已被使用';
    if (e.code === 'already_bound') return '這個角色已經綁定過帳號';
    if (e.code === 'not_bound') return '這個角色還沒有綁定帳號';
    if (e.code === 'invalid_username') return usernameProblemMessage('chars');
    if (e.code === 'invalid_password') return passwordProblemMessage();
  }
  if (e instanceof NetworkError) return '連線異常，請稍後再試';
  return '發生錯誤，請稍後再試';
}
```

（`messages.ts` 原本沒有 import `game/api`；兩者沒有循環相依，因為 `api.ts` 不 import `ui/`。）

- [ ] **Step 4: Onboarding 實作**

`src/ui/Onboarding.tsx` 整份換成：

```tsx
import { useState } from 'react';
import { passwordProblem, usernameProblem } from '../engine/account-rules';
import { RateLimitedError, type ApiClient, type LoginResult } from '../game/api';
import { accountErrorMessage, passwordProblemMessage, usernameProblemMessage } from './messages';

export const MAX_NAME_LENGTH = 16;

export function Onboarding({
  api,
  onDone,
}: {
  api: Pick<ApiClient, 'createGuest' | 'login'>;
  onDone: (result: LoginResult) => void;
}) {
  const [mode, setMode] = useState<'new' | 'login'>('new');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next: 'new' | 'login'): void => {
    setMode(next);
    setError('');
  };

  const createGuest = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError('請輸入名稱');
    if ([...trimmed].length > MAX_NAME_LENGTH) return setError(`名稱最多 ${MAX_NAME_LENGTH} 個字`);
    setError('');
    setBusy(true);
    try {
      onDone(await api.createGuest(trimmed));
    } catch (e) {
      setError(e instanceof RateLimitedError ? accountErrorMessage(e) : '無法建立角色，請確認連線後再試');
      setBusy(false);
    }
  };

  const login = async (): Promise<void> => {
    const up = usernameProblem(username);
    if (up) return setError(usernameProblemMessage(up));
    if (passwordProblem(password)) return setError(passwordProblemMessage());
    setError('');
    setBusy(true);
    try {
      onDone(await api.login(username, password));
    } catch (e) {
      setError(accountErrorMessage(e));
      setBusy(false);
    }
  };

  const submit = (e: { preventDefault(): void }): void => {
    e.preventDefault();
    if (busy) return;
    void (mode === 'new' ? createGuest() : login());
  };

  return (
    <form className="screen-center onboarding" onSubmit={submit}>
      <h1>無限魔導書</h1>
      <p className="muted">Infinite Grimoire</p>
      {mode === 'new' ? (
        <>
          <label htmlFor="display-name">顯示名稱</label>
          <input id="display-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：艾莉亞" autoComplete="off" />
        </>
      ) : (
        <>
          <label htmlFor="login-username">帳號名稱</label>
          <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <label htmlFor="login-password">密碼</label>
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{mode === 'new' ? '開始冒險' : '登入'}</button>
      <button type="button" className="link-button" onClick={() => switchMode(mode === 'new' ? 'login' : 'new')}>
        {mode === 'new' ? '已有帳號？登入' : '建立新角色'}
      </button>
    </form>
  );
}
```

`src/ui/App.css` 新增：

```css
.link-button { background: none; border: none; color: var(--rune); text-decoration: underline; min-height: 32px; padding: 4px; }
.onboarding label { align-self: center; }
```

- [ ] **Step 5: 執行測試**

Run: `npx vitest run src/ui/Onboarding.test.tsx && npm test && npm run build`
Expected: 全部 PASS（`main.tsx` 傳入的 `api` 已具備 `login`，型別相容）

- [ ] **Step 6: Commit**

```bash
git add src/ui/messages.ts src/ui/Onboarding.tsx src/ui/Onboarding.test.tsx src/ui/App.css
git commit -m "feat(ui): log in from the start screen"
```

---

### Task 10: 帳號對話框與頂列按鈕

**Files:**
- Create: `src/ui/AccountDialog.tsx`
- Create: `src/ui/AccountDialog.test.tsx`
- Modify: `src/ui/TopBar.tsx`、`src/ui/TopBar.test.tsx`
- Modify: `src/ui/App.tsx`、`src/ui/App.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/ui/App.css`

**Interfaces:**
- Consumes: Task 8 `ApiClient` 方法、`AccountInfo`、`LoginResult`；Task 9 訊息函式；Task 1 規則
- Produces:
  - `AccountDialog(props: { api: Pick<ApiClient, 'getAccount' | 'bind' | 'changePassword' | 'logoutOthers' | 'logout' | 'login'>; displayName: string; learnedCount: number; onClose: () => void; onAccountChange: (info: AccountInfo) => void; onSwitched: (r: LoginResult) => void; onLoggedOut: () => void; beforeLogout: () => Promise<void> })`
  - `TopBar` 新增 props：`bound: boolean | null`、`onOpenAccount: () => void`；按鈕名稱 `帳號`，遊客時內含「未綁定」標籤
  - `App` 新增 props：`api: ApiClient`、`onSwitched: (r: LoginResult) => void`、`onLoggedOut: () => void`

- [ ] **Step 1: 寫失敗的測試**

`src/ui/AccountDialog.test.tsx`：

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameData } from '../engine/data';
import { createInitialState } from '../engine/state';
import { ApiError, NetworkError } from '../game/api';
import { AccountDialog } from './AccountDialog';

afterEach(cleanup);

function setup(username: string | null) {
  const loginResult = { token: 't2', state: createInitialState(gameData), revision: 1 };
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username, sessions: 2 })),
    bind: vi.fn(async (u: string) => ({ username: u })),
    changePassword: vi.fn(async () => {}),
    logoutOthers: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    login: vi.fn(async () => loginResult),
  };
  const props = {
    onClose: vi.fn(),
    onAccountChange: vi.fn(),
    onSwitched: vi.fn(),
    onLoggedOut: vi.fn(),
    beforeLogout: vi.fn(async () => {}),
  };
  render(<AccountDialog api={api} displayName="Aria" learnedCount={3} {...props} />);
  return { api, loginResult, ...props };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AccountDialog (guest)', () => {
  it('binds an account after checking the form', async () => {
    const { api, onAccountChange } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    type('帳號名稱', 'aria_1');
    type('密碼', 'password1');
    type('確認密碼', 'password2');
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    expect(screen.getByRole('alert').textContent).toBe('兩次輸入的密碼不一致');
    expect(api.bind).not.toHaveBeenCalled();
    type('確認密碼', 'password1');
    api.getAccount.mockResolvedValueOnce({ displayName: 'Aria', username: 'aria_1', sessions: 1 });
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    await waitFor(() => expect(onAccountChange).toHaveBeenCalledWith({ displayName: 'Aria', username: 'aria_1', sessions: 1 }));
    expect(api.bind).toHaveBeenCalledWith('aria_1', 'password1');
    expect(await screen.findByText('aria_1')).toBeTruthy();
  });

  it('shows the taken error', async () => {
    const { api } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    api.bind.mockRejectedValueOnce(new ApiError('x', 409, 'taken'));
    type('帳號名稱', 'aria_1');
    type('密碼', 'password1');
    type('確認密碼', 'password1');
    fireEvent.click(screen.getByRole('button', { name: '綁定帳號' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('這個帳號名稱已被使用'));
  });

  it('warns before switching to another account, then logs in', async () => {
    const { api, onSwitched, loginResult } = setup(null);
    await screen.findByText(/忘記密碼無法找回/);
    fireEvent.click(screen.getByRole('button', { name: '登入其他帳號' }));
    expect(screen.getByText(/Aria/).textContent).toContain('已學 3 個魔法');
    expect(screen.getByText(/無法取回/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '我了解，繼續登入' }));
    type('帳號名稱', 'other_1');
    type('密碼', 'password1');
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith(loginResult));
    expect(api.login).toHaveBeenCalledWith('other_1', 'password1');
  });
});

describe('AccountDialog (bound)', () => {
  it('shows the account and changes the password', async () => {
    const { api } = setup('aria_1');
    expect(await screen.findByText('aria_1')).toBeTruthy();
    expect(screen.getByText(/2 台裝置/)).toBeTruthy();
    type('目前密碼', 'password1');
    type('新密碼', 'password2');
    type('確認新密碼', 'password2');
    fireEvent.click(screen.getByRole('button', { name: '更改密碼' }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('password1', 'password2'));
    expect(await screen.findByText('密碼已更新，其他裝置已登出')).toBeTruthy();
  });

  it('logs out other devices', async () => {
    const { api } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.click(screen.getByRole('button', { name: '登出其他裝置' }));
    await waitFor(() => expect(api.logoutOthers).toHaveBeenCalled());
    expect(api.getAccount).toHaveBeenCalledTimes(2);
  });

  it('uploads, then logs out this device', async () => {
    const { api, beforeLogout, onLoggedOut } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.click(screen.getByRole('button', { name: '登出這台裝置' }));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalled());
    expect(beforeLogout).toHaveBeenCalled();
    expect(beforeLogout.mock.invocationCallOrder[0]!).toBeLessThan(api.logout.mock.invocationCallOrder[0]!);
  });

  it('keeps the session when logout fails on the network', async () => {
    const { api, onLoggedOut } = setup('aria_1');
    await screen.findByText('aria_1');
    api.logout.mockRejectedValueOnce(new NetworkError('down'));
    fireEvent.click(screen.getByRole('button', { name: '登出這台裝置' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('連線異常，請稍後再試'));
    expect(onLoggedOut).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = setup('aria_1');
    await screen.findByText('aria_1');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

`src/ui/TopBar.test.tsx`：所有 `render(<TopBar ... />)` 加上 `bound={true} onOpenAccount={() => {}}`，並新增：

```tsx
  it('shows the account button with an unbound badge for guests', () => {
    const onOpenAccount = vi.fn();
    render(<TopBar runtime={runtime(createInitialState(gameData))} data={gameData} status="online" bound={false} onOpenAccount={onOpenAccount} />);
    const button = screen.getByRole('button', { name: /帳號/ });
    expect(button.textContent).toContain('未綁定');
    fireEvent.click(button);
    expect(onOpenAccount).toHaveBeenCalled();
  });
```

（`TopBar.test.tsx` 的 import 補上 `fireEvent`。）

`src/ui/App.test.tsx`：`setup()` 內新增

```tsx
  const api = {
    getAccount: vi.fn(async () => ({ displayName: 'Aria', username: null, sessions: 1 })),
    bind: vi.fn(),
    changePassword: vi.fn(),
    logoutOthers: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  } as unknown as ApiClient;
  render(<App runtime={runtime} sync={sync} data={gameData} api={api} onSwitched={vi.fn()} onLoggedOut={vi.fn()} />);
```

（取代原本的 `render(<App ... />)`；import `type ApiClient` 自 `../game/api`；`sync` 的假物件補上 `uploadNow: vi.fn(async () => {})`）並新增：

```tsx
  it('opens the account dialog from the top bar', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /帳號.*未綁定/ }));
    expect(await screen.findByRole('dialog', { name: '帳號' })).toBeTruthy();
  });
```

- [ ] **Step 2: 執行，確認失敗**

Run: `npx vitest run src/ui/AccountDialog.test.tsx src/ui/TopBar.test.tsx src/ui/App.test.tsx`
Expected: FAIL（找不到 `./AccountDialog`；TopBar 沒有帳號按鈕）

- [ ] **Step 3: AccountDialog 實作**

`src/ui/AccountDialog.tsx`：

```tsx
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { passwordProblem, usernameProblem } from '../engine/account-rules';
import type { AccountInfo, ApiClient, LoginResult } from '../game/api';
import { accountErrorMessage, passwordProblemMessage, usernameProblemMessage } from './messages';

type View = 'main' | 'confirm-switch' | 'login';

export function AccountDialog({
  api,
  displayName,
  learnedCount,
  onClose,
  onAccountChange,
  onSwitched,
  onLoggedOut,
  beforeLogout,
}: {
  api: Pick<ApiClient, 'getAccount' | 'bind' | 'changePassword' | 'logoutOthers' | 'logout' | 'login'>;
  displayName: string;
  learnedCount: number;
  onClose: () => void;
  onAccountChange: (info: AccountInfo) => void;
  onSwitched: (r: LoginResult) => void;
  onLoggedOut: () => void;
  beforeLogout: () => Promise<void>;
}) {
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [view, setView] = useState<View>('main');
  const [fields, setFields] = useState({ username: '', password: '', confirm: '', current: '', next: '', confirmNext: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const refresh = async (): Promise<void> => {
    try {
      const next = await api.getAccount();
      setInfo(next);
      onAccountChange(next);
    } catch (e) {
      setError(accountErrorMessage(e));
    }
  };

  // load once when the dialog opens
  useEffect(() => {
    dialogRef.current?.focus();
    void refresh();
  }, []);

  const set = (k: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(accountErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checkNewPassword = (pw: string, confirm: string): string | null => {
    if (passwordProblem(pw)) return passwordProblemMessage();
    if (pw !== confirm) return '兩次輸入的密碼不一致';
    return null;
  };

  const bind = (e: FormEvent): void => {
    e.preventDefault();
    const up = usernameProblem(fields.username);
    const problem = up ? usernameProblemMessage(up) : checkNewPassword(fields.password, fields.confirm);
    if (problem) return setError(problem);
    void run(async () => {
      await api.bind(fields.username, fields.password);
      await refresh();
      setNotice('綁定完成');
    });
  };

  const login = (e: FormEvent): void => {
    e.preventDefault();
    const up = usernameProblem(fields.username);
    if (up) return setError(usernameProblemMessage(up));
    if (passwordProblem(fields.password)) return setError(passwordProblemMessage());
    void run(async () => onSwitched(await api.login(fields.username, fields.password)));
  };

  const changePassword = (e: FormEvent): void => {
    e.preventDefault();
    const problem = checkNewPassword(fields.next, fields.confirmNext);
    if (problem) return setError(problem);
    void run(async () => {
      await api.changePassword(fields.current, fields.next);
      setFields((f) => ({ ...f, current: '', next: '', confirmNext: '' }));
      await refresh();
      setNotice('密碼已更新，其他裝置已登出');
    });
  };

  const logout = (): void => {
    void run(async () => {
      await beforeLogout();
      await api.logout();
      onLoggedOut();
    });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  const bound = info?.username != null;
  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="account-title" tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="dialog-head">
          <h2 id="account-title">帳號</h2>
          <button type="button" aria-label="關閉" onClick={onClose}>×</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="dialog-notice" role="status">{notice}</p>}
        {!info && !error && <p className="muted">載入中…</p>}

        {info && view === 'main' && !bound && (
          <>
            <p>綁定帳號後，可以在其他裝置登入，清掉瀏覽器資料也不會失去進度。</p>
            <p className="warn-text">沒有 email，忘記密碼無法找回，請記好帳號名稱和密碼。</p>
            <form className="dialog-form" onSubmit={bind}>
              <label htmlFor="acc-username">帳號名稱</label>
              <input id="acc-username" value={fields.username} onChange={set('username')} autoComplete="username" />
              <label htmlFor="acc-password">密碼</label>
              <input id="acc-password" type="password" value={fields.password} onChange={set('password')} autoComplete="new-password" />
              <label htmlFor="acc-confirm">確認密碼</label>
              <input id="acc-confirm" type="password" value={fields.confirm} onChange={set('confirm')} autoComplete="new-password" />
              <button type="submit" className="primary" disabled={busy}>綁定帳號</button>
            </form>
            <button type="button" className="link-button" onClick={() => setView('confirm-switch')}>登入其他帳號</button>
          </>
        )}

        {info && view === 'main' && bound && (
          <>
            <p>帳號名稱：<b>{info.username}</b></p>
            <p className="muted">目前有 {info.sessions} 台裝置登入中</p>
            <form className="dialog-form" onSubmit={changePassword}>
              <label htmlFor="acc-current">目前密碼</label>
              <input id="acc-current" type="password" value={fields.current} onChange={set('current')} autoComplete="current-password" />
              <label htmlFor="acc-next">新密碼</label>
              <input id="acc-next" type="password" value={fields.next} onChange={set('next')} autoComplete="new-password" />
              <label htmlFor="acc-confirm-next">確認新密碼</label>
              <input id="acc-confirm-next" type="password" value={fields.confirmNext} onChange={set('confirmNext')} autoComplete="new-password" />
              <button type="submit" disabled={busy}>更改密碼</button>
            </form>
            <div className="dialog-actions">
              <button type="button" disabled={busy} onClick={() => void run(async () => { await api.logoutOthers(); await refresh(); })}>登出其他裝置</button>
              <button type="button" disabled={busy} onClick={logout}>登出這台裝置</button>
              <button type="button" className="link-button" onClick={() => setView('login')}>切換帳號</button>
            </div>
          </>
        )}

        {view === 'confirm-switch' && (
          <>
            <p>這台裝置上未綁定的進度（名稱 {displayName}、已學 {learnedCount} 個魔法）登入其他帳號後將無法取回。</p>
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={() => setView('login')}>我了解，繼續登入</button>
              <button type="button" onClick={() => setView('main')}>取消</button>
            </div>
          </>
        )}

        {view === 'login' && (
          <form className="dialog-form" onSubmit={login}>
            <label htmlFor="acc-login-username">帳號名稱</label>
            <input id="acc-login-username" value={fields.username} onChange={set('username')} autoComplete="username" />
            <label htmlFor="acc-login-password">密碼</label>
            <input id="acc-login-password" type="password" value={fields.password} onChange={set('password')} autoComplete="current-password" />
            <button type="submit" className="primary" disabled={busy}>登入</button>
            <button type="button" className="link-button" onClick={() => setView('main')}>返回</button>
          </form>
        )}
      </div>
    </div>
  );
}
```

測試中的標籤「帳號名稱」「密碼」在 `login` 檢視也存在；同一時間只會顯示一種檢視，所以 `getByLabelText` 不會重複。

- [ ] **Step 4: TopBar、App、main.tsx**

`src/ui/TopBar.tsx`：props 新增 `bound: boolean | null; onOpenAccount: () => void;`，在 `topbar-row` 的最後（`stuck` 提示之後）加入：

```tsx
        <button type="button" className="account-button" onClick={onOpenAccount}>
          帳號{bound === false && <span className="tag warn">未綁定</span>}
        </button>
```

`src/ui/App.tsx`：
- import `AccountDialog`、`type AccountInfo, type ApiClient, type LoginResult`（自 `../game/api`）、`useEffect`。
- props 型別加上 `api: ApiClient; onSwitched: (r: LoginResult) => void; onLoggedOut: () => void`。
- 元件內加入：

```tsx
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    api.getAccount().then((info) => alive && setAccount(info)).catch(() => {
      // the badge just stays hidden; auth errors are handled by sync
    });
    return () => {
      alive = false;
    };
  }, [api]);
```

- `<TopBar ... />` 加上 `bound={account ? account.username !== null : null} onOpenAccount={() => setAccountOpen(true)}`。
- `<OfflineOverlay />` 之前加入：

```tsx
      {accountOpen && (
        <AccountDialog
          api={api}
          displayName={account?.displayName ?? ''}
          learnedCount={game.learned.length}
          onClose={() => setAccountOpen(false)}
          onAccountChange={setAccount}
          onSwitched={onSwitched}
          onLoggedOut={onLoggedOut}
          beforeLogout={() => sync.uploadNow()}
        />
      )}
```

`src/main.tsx`，`case 'ready'` 內的 `<App ... />` 改成：

```tsx
      const app = (
        <App
          runtime={phase.runtime}
          sync={phase.sync}
          data={gameData}
          api={api}
          onSwitched={(r) => {
            if (!writeToken(storage(), r.token)) console.warn('could not persist token');
            start(r);
          }}
          onLoggedOut={() => {
            clearToken();
            setPhase({ kind: 'onboarding' });
          }}
        />
      );
```

`src/ui/App.css` 新增：

```css
.account-button { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 150; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
.dialog { width: min(420px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px; outline: none; display: flex; flex-direction: column; gap: 10px; }
.dialog-head { display: flex; align-items: center; justify-content: space-between; }
.dialog-head h2 { margin: 0; color: var(--gold); font-size: 18px; }
.dialog-form { display: flex; flex-direction: column; gap: 6px; }
.dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dialog-notice { color: var(--rune); }
.warn-text { color: var(--gold); font-size: 14px; }
```

`.topbar-spell { margin-left: auto; }` 會和 `.account-button` 的 `margin-left: auto` 並存；寬螢幕上 `.topbar-spell` 隱藏，帳號按鈕靠右；窄螢幕上兩者並排靠右，可接受。

- [ ] **Step 5: 執行測試**

Run: `npx vitest run src/ui && npm test && npm run build`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/AccountDialog.tsx src/ui/AccountDialog.test.tsx src/ui/TopBar.tsx src/ui/TopBar.test.tsx src/ui/App.tsx src/ui/App.test.tsx src/main.tsx src/ui/App.css
git commit -m "feat(ui): account dialog for binding, password change, logout and switching"
```

---

### Task 11: 本機驗收、Node 版本與文件

**Files:**
- Modify: `package.json`（`engines`）
- Modify: `AGENTS.md`（第 3、4、5、10 節）
- Modify: `README.md`（Node 版本）
- Modify: 帳本 `docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md`（執行時建立）

- [ ] **Step 1: Node 版本**

`package.json` 在 `"type": "module",` 之後加入：

```json
  "engines": {
    "node": ">=22.13"
  },
```

`AGENTS.md` 第 4 節的「Node 22。」改成「Node 22.13 以上（資料庫測試用到 `node:sqlite`）。」；`README.md` 中提到 Node 22 的地方同步改成 22.13。

- [ ] **Step 2: 全部測試與 build**

Run: `npm test && npm run build`
Expected: 全部 PASS；記下檔案數與測試數

- [ ] **Step 3: 本機 D1 與 dev server**

Run: `npm run db:migrate:local`，再以背景執行 `npm run dev -- --port 5173 --strictPort`

- [ ] **Step 4: 瀏覽器驗收（主控 session）**

優先用 Claude in Chrome；未連線時用 headless Edge／Chrome + `puppeteer-core`（腳本放 scratchpad，不進專案），兩個 `browser.createBrowserContext()` 當兩台裝置。逐項確認並把結果寫進帳本：
1. 裝置 A 建立遊客、等 10 秒、在帳號對話框綁定 `accept_1` / `password1`；頂列的「未綁定」消失。
2. 裝置 B 在開始畫面按「已有帳號？登入」，以同一組帳密登入；B 的背包與已學魔法和 A 一致。
3. A、B 同時遊玩 30 秒，兩邊都沒有斷線遮罩或錯誤提示條。
4. B 在帳號對話框改密碼為 `password2`；A 下一次上傳（或重新整理）後回到開始畫面；A 用 `password2` 可以再登入，用 `password1` 顯示「帳號或密碼錯誤」。
5. 在 C（新 context）連續用錯的密碼登入 5 次，第 6 次顯示「嘗試次數過多，請 N 分鐘後再試」。
6. 360px 寬：帳號對話框完整在畫面內、`document.documentElement.scrollWidth <= window.innerWidth`。
7. 遊客在帳號對話框按「登入其他帳號」，確認文字包含顯示名稱與已學魔法數。

**不要**執行任何 `--remote` 或 `deploy` 指令。

- [ ] **Step 5: 停止 dev server，更新文件**

- `AGENTS.md` 第 3 節：第二版 A 標為完成，指向本計畫與帳本；測試數字更新。
- 第 5 節架構地圖：`worker/` 一行加上「sessions／credentials（password.ts、store-contract.ts）」，`migrations/` 一行加上「0003 帳號」，新增一行 `tests/d1/  node:sqlite 上的 D1Store 與 migration 測試`。
- 第 10 節：新增交接紀錄（做了什麼、停在哪裡、下一步：第二版 B 發現紀錄的設計討論）。

- [ ] **Step 6: Commit**

```bash
git add package.json AGENTS.md README.md docs/
git commit -m "docs: record v2 accounts acceptance and require node 22.13"
```
