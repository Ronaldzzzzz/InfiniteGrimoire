### Task 1：專案骨架（Vite + React + Worker）+ 種子亂數

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `wrangler.jsonc`, `index.html`, `src/main.tsx`, `worker/index.ts`, `worker/app.ts`, `src/engine/rng.ts`
- Test: `src/engine/rng.test.ts`, `worker/app.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number; int(min: number, max: number): number }`
  - `createRng(seed: number): Rng`
  - `pickWeighted<T>(rng: Rng, items: { value: T; weight: number }[]): T`
  - `createApp(deps: AppDeps): Hono`。Task 1 的 `AppDeps` 先是空物件，只提供 `GET /api/health → { ok: true }`。

- [ ] **Step 1：安裝套件**
  - `npm init -y`
  - `npm i react@19 react-dom@19 pixi.js@8 zod@4 hono@4`
  - `npm i -D vite@8 @vitejs/plugin-react@6 @cloudflare/vite-plugin@1 wrangler@4 @cloudflare/workers-types typescript @types/react @types/react-dom vitest@5 jsdom @testing-library/react@16 @testing-library/dom`
  - scripts：
    - `"dev": "vite"`（`@cloudflare/vite-plugin` 會在本機同時跑 Worker）
    - `"test": "vitest run"`
    - `"build": "tsc --noEmit && vite build"`
    - `"deploy": "npm run build && wrangler deploy"`
    - `"db:migrate:local": "wrangler d1 migrations apply DB --local"`
  - `wrangler.jsonc`：
    - `name: "infinite-grimoire"`
    - `main: "worker/index.ts"`
    - `compatibility_date: "2026-10-01"`
    - `assets: { not_found_handling: "single-page-application" }`
    - `d1_databases: [{ binding: "DB", database_name: "infinite-grimoire", database_id: "<執行時填入>", migrations_dir: "migrations" }]`
  - `vite.config.ts`：plugins 用 `react()` 和 `cloudflare()`；vitest 的 `environment: 'node'`。UI 測試檔開頭寫 `// @vitest-environment jsdom`。
- [ ] **Step 2：寫失敗的測試**
  - `rng.test.ts`：
    - 相同種子產生相同序列；
    - `int(1,3)` 的結果都在範圍內，而且 1、2、3 都出現過；
    - 權重 92 / 8 抽 10000 次，`b` 的比例落在 0.06～0.10；
    - 只有一個項目時永遠回傳它。
  - `app.test.ts`：`createApp({}).request('/api/health')` 回傳 200，內容是 `{ ok: true }`。
- [ ] **Step 3：** 執行 `npm test`，預期 FAIL。
- [ ] **Step 4：** 實作 `rng.ts`（mulberry32）、`app.ts` 和 `worker/index.ts`。
- [ ] **Step 5：** 執行 `npm test && npm run build`，預期全部 PASS；`npm run dev` 後，`/api/health` 可以回應。
- [ ] **Step 6：Commit**：`chore: scaffold vite react app with cloudflare worker and seeded rng`

---

