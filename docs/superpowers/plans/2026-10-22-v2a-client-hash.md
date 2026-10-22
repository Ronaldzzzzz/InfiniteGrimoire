# 第二版 A 修訂：瀏覽器端密碼雜湊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把伺服器端 PBKDF2 50,000 次，改成「瀏覽器端 PBKDF2-SHA256 300,000 次 ＋ 伺服器端 HMAC-SHA256（pepper）」，讓伺服器不再接近免費方案 10ms 的 CPU 上限。

**Spec:** `docs/superpowers/specs/2026-10-21-v2a-accounts-design.md`（2026-10-22 修訂：第 2 節決策表、第 4 節「驗證規則」「不透露帳號是否存在」「密碼雜湊」、第 5 節「處理中…」、第 6 節雜湊測試）

**Branch:** `feat/v2a-accounts`（接在 550b8d2 之後）

## Global Constraints

- 沿用 `docs/superpowers/plans/2026-10-21-v2a-accounts.md` 的 Global Constraints：不部署、不 push、401 只代表 token 無效、帳密錯誤 403、`tests/sim` 0 次被拒、`npm test` 與 `npm run build` 每個任務結束都要通過。
- 安全性做到合理即可（使用者 2026-10-22 指示），不加規格以外的防護。
- 密碼本身絕不離開瀏覽器：`ApiClient` 的 `login`、`bind`、`changePassword` 在送出前就算好雜湊。
- `src/engine/` 不得使用 WebCrypto 以外的平台 API；瀏覽器端雜湊放在 `src/game/password-hash.ts`。
- 還沒有真實玩家，所以不做舊雜湊（`pbkdf2-sha256$...`）的相容與搬移。本機 D1 裡驗收時建立的帳號會失效，可以直接重新綁定。

## Interfaces

- `src/game/password-hash.ts`：`CLIENT_PBKDF2_ITERATIONS = 300_000`、`passwordSalt(username: string): string`（`"infinite-grimoire:v1:" + usernameKey(username)`）、`clientPasswordHash(username: string, password: string, iterations?: number): Promise<string>`（43 字元 base64url）。
- `worker/password.ts`：`CLIENT_HASH_RE = /^[A-Za-z0-9_-]{43}$/`、`hashPassword(clientHash: string, pepper: string): Promise<string>`、`verifyPassword(clientHash: string, stored: string, pepper: string): Promise<boolean>`。pepper 為空字串時兩者都 throw。移除 `PBKDF2_ITERATIONS`、`needsRehash`、`DUMMY_HASH`。
- `AppDeps` 新增 `pepper: string`；`worker/index.ts` 的 `Env` 新增 `PASSWORD_PEPPER?: string`，傳 `env.PASSWORD_PEPPER ?? ''`。
- `ApiClient.changePassword(username: string, current: string, next: string)`：多一個 `username` 參數（算 salt 用）。`login`、`bind` 的簽章不變。

---

### Task 1: 瀏覽器端雜湊模組

**Files:** Create `src/game/password-hash.ts`、`src/game/password-hash.test.ts`

- [ ] **Step 1: 寫失敗的測試**

```ts
import { describe, expect, it } from 'vitest';
import { CLIENT_PBKDF2_ITERATIONS, clientPasswordHash, passwordSalt } from './password-hash';

describe('client password hash', () => {
  it('uses 300k iterations and a salt from the normalized username', () => {
    expect(CLIENT_PBKDF2_ITERATIONS).toBe(300_000);
    expect(passwordSalt(' Ａｒｉａ_1 ')).toBe('infinite-grimoire:v1:aria_1');
  });

  it('is deterministic per account and differs by password', async () => {
    const a = await clientPasswordHash('Aria_1', 'password1', 1000);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await clientPasswordHash('ＡＲＩＡ_1', 'password1', 1000)).toBe(a);
    expect(await clientPasswordHash('Aria_1', 'password2', 1000)).not.toBe(a);
    expect(await clientPasswordHash('other_1', 'password1', 1000)).not.toBe(a);
  });

  it('defaults to the full iteration count', async () => {
    expect(await clientPasswordHash('Aria_1', 'password1')).not.toBe(await clientPasswordHash('Aria_1', 'password1', 1000));
  });
});
```

- [ ] **Step 2:** `npx vitest run src/game/password-hash.test.ts` → FAIL（找不到模組）
- [ ] **Step 3: 實作**

```ts
import { usernameKey } from '../engine/account-rules';

/**
 * The slow part of password hashing runs in the browser, so the Worker stays far below the free
 * plan's 10 ms CPU limit. The password itself never leaves the browser; the server HMACs this value.
 */
export const CLIENT_PBKDF2_ITERATIONS = 300_000;

/** Fixed per-account salt, so no extra round trip is needed before hashing. */
export function passwordSalt(username: string): string {
  return `infinite-grimoire:v1:${usernameKey(username)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function clientPasswordHash(username: string, password: string, iterations = CLIENT_PBKDF2_ITERATIONS): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(passwordSalt(username)), iterations },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}
```

- [ ] **Step 4:** 該測試 PASS；`npm test`、`npm run build` 通過
- [ ] **Step 5:** `git commit -m "feat(client): browser-side pbkdf2 password hash"`

### Task 2: 伺服器端改成 HMAC + pepper

**Files:** Modify `worker/password.ts`、`worker/password.test.ts`、`worker/app.ts`、`worker/app.test.ts`、`worker/index.ts`、`tests/sim/bot.ts`、`.gitignore`；Create `.dev.vars`

- [ ] **Step 1: 改測試**
  - `worker/password.test.ts` 整份換成：格式 `^hmac-sha256\$v1\$[A-Za-z0-9_-]{43}$`；同樣輸入結果相同（HMAC 是確定性的）、不包含輸入值；`verifyPassword` 正確值為 true、不同值為 false、不同 pepper 為 false、格式錯誤（`'nope'`、舊格式 `pbkdf2-sha256$...`）為 false；pepper 為 `''` 時 `hashPassword` 與 `verifyPassword` 都 reject。
  - `worker/app.test.ts`：所有 `createApp({...})` 加 `pepper: 'test-pepper'`；新增 helper `const ph = (pw: string) => toBase64Url(sha256(pw))`（用 `crypto.subtle.digest`，非同步），帳號測試中送出的 `password`／`current`／`next` 改成 `await ph('password1')` 等。
  - 刪除「upgrades a weaker stored hash on login」。
  - 新增：送出 `password: 'password1'`（不是 43 字元 base64url）時 bind 與 login 回 400 `invalid_password`；`pepper: ''` 的 app 綁定回 500。
- [ ] **Step 2:** `npx vitest run worker` → FAIL
- [ ] **Step 3: 實作**
  - `worker/password.ts`：`importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' })` + `crypto.subtle.sign`；輸出 `hmac-sha256$v1$<b64url>`；比對沿用 `constantTimeEqual`（先把兩邊 decode 成 bytes）。
  - `worker/app.ts`：`AppDeps.pepper`；`readCredentials` 的密碼檢查改成 `CLIENT_HASH_RE.test(password)`，否則 400 `invalid_password`；`/api/account/password` 的 `next` 同樣檢查；`/api/login` 移除 `DUMMY_HASH` 與 rehash；呼叫 `hashPassword`／`verifyPassword` 時傳 `pepper`。帳號不存在時直接記失敗並回 403。
  - `worker/index.ts`：`Env.PASSWORD_PEPPER?: string`，`pepper: env.PASSWORD_PEPPER ?? ''`。
  - `tests/sim/bot.ts`：`createApp` 加 `pepper: 'sim-pepper'`。
  - `.gitignore` 加 `.dev.vars`；建立 `.dev.vars`，內容 `PASSWORD_PEPPER=dev-only-pepper-not-for-production`（只給本機 `npm run dev`，不進 git）。
- [ ] **Step 4:** `npx vitest run worker tests && npm test && npm run build` 通過
- [ ] **Step 5:** `git commit -m "feat(worker): hmac-pepper the client password hash instead of server pbkdf2"`

### Task 3: 用戶端送出雜湊、顯示「處理中…」

**Files:** Modify `src/game/api.ts`、`src/game/api.test.ts`、`src/game/sync.test.ts`（假物件不變）、`src/ui/AccountDialog.tsx`、`src/ui/AccountDialog.test.tsx`、`src/ui/Onboarding.tsx`、`src/ui/Onboarding.test.tsx`

- [ ] **Step 1: 改測試**
  - `api.test.ts`：`login('mage_1', 'password1')` 送出的 body 是 `{ username: 'mage_1', password: await clientPasswordHash('mage_1', 'password1') }`，而且 body 字串不包含 `password1`；`bind` 同樣檢查；`changePassword('mage_1', 'password1', 'password2')` 送出兩個雜湊，都不包含明文。測試用 `vi.mock('./password-hash', ...)` 把次數降到 1000，避免每次 0.2 秒。
  - `AccountDialog.test.tsx`：`changePassword` 改成以 `('aria_1', 'password1', 'password2')` 呼叫；送出期間按鈕文字為「處理中…」。
  - `Onboarding.test.tsx`：登入送出期間按鈕文字為「處理中…」。
- [ ] **Step 2:** 相關測試 FAIL
- [ ] **Step 3: 實作**
  - `api.ts`：`login`、`bind` 先 `await clientPasswordHash(username, password)` 再送；`changePassword(username, current, next)` 兩個都算。
  - `AccountDialog`：`api.changePassword(info.username!, fields.current, fields.next)`；`busy` 時送出按鈕文字改成「處理中…」。
  - `Onboarding`：`busy` 時送出按鈕文字改成「處理中…」。
- [ ] **Step 4:** `npm test`、`npm run build` 通過
- [ ] **Step 5:** `git commit -m "feat(ui): send password hashes, never the password, and show progress while hashing"`

### Task 4: 本機驗收與文件

- [ ] 刪掉本機 D1 的舊帳號資料不必要：舊 `pbkdf2-sha256$` 雜湊會驗證失敗，驗收用新的帳號名稱。
- [ ] `npm run dev`，用 headless Chrome（scratchpad 的 puppeteer 腳本）重跑原計畫 Task 11 的 1、2、4、5 項（綁定、另一台登入、改密碼後另一台被登出、連錯 5 次被限制），另外確認：開發者工具的網路請求 body 裡沒有明文密碼；登入時按鈕出現「處理中…」。
- [ ] AGENTS.md：第 3 節測試數、說明雜湊改版與 `.dev.vars`／`PASSWORD_PEPPER`（部署時要 `wrangler secret put PASSWORD_PEPPER`，**上線後不能更換**）；第 4 節本機啟動提到 `.dev.vars`；第 10 節交接紀錄。帳本 `docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md` 加上這次修訂的段落。
- [ ] `git commit -m "docs: record client-side password hashing and the pepper secret"`
