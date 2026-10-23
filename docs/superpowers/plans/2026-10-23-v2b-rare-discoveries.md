# 第二版 B：稀有魔法與發現紀錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 5 個每屬性一個的稀有魔法（機率配方、需高階元素），合出時發現者看到全螢幕動畫，伺服器記下發現（含首位發現者），其他玩家從頂端鈴鐺的歷史清單看到消息。

**Architecture:** 內容（`spells.json`／`recipes.json` 加 `rare` 旗標與 5 組新配方）→ 伺服器（migration 0005 的 `discoveries` 表、`Store` 兩個新方法、合成成功後寫入並在結果帶 `rare.first`、`GET /api/discoveries`）→ 用戶端（`ApiClient.recentDiscoveries`、合成台把稀有結果交給全螢幕 `RareReveal`、`TopBar` 的鈴鐺＋清單每 60 秒輪詢）。

**Tech Stack:** TypeScript、zod、Hono（Cloudflare Worker）、D1／SQLite（`node:sqlite` 測試）、React 19、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-23-v2b-rare-discoveries-design.md`（執行者必須兩份都讀；本計畫沒寫到的行為以規格為準）

## Global Constraints

- Branch：從 `feat/core-rework` 開 `feat/v2b-rare-discoveries`；不 push、不合併。
- 帳本：`docs/superpowers/sdd/2026-10-23-v2b-rare-discoveries/progress.md`（controller 維護）。
- 每個任務完成前 `npm test` 與 `npm run build` 都要通過；採 TDD。
- **不改動任何現有魔法或配方的數值**；只新增 5 個魔法、5 個配方，並在聖光審判、深淵吞噬加上 `rare: true`。
- `tests/sim/pure-paths.test.ts` 各路線仍 60～240 模擬分鐘、0 次被拒；改動 `worker/app.ts` 時 worker 對抗測試全部通過。
- migration 0005 **不能重置存檔**（0004 是唯一的重置）。
- 稀有配方權重：稀有魔法 `weight: 1`、`spellId: null` `weight: 64`（成功率 1/65）。
- 稀有魔法：Lv.8、攻擊約 80；只用現有效果種類；`named: true`、`affinity: "self"`、`rare: true`。
- 數值：`FEED_LIMIT = 20`、`FEED_POLL_MS = 60_000`、`RARE_REVEAL_MS = 4000`（階段界線 1000／2000 ms）、成本上限 `RARE_FARM_CEILING_MIN = 120` 模擬分鐘。
- 資訊欄與紀錄只能有魔法名稱、殘卷線索、發現者 `display_name`、時間、是否首位——**不能有配方、不能有 `player_id`**。
- 介面文字繁體中文；「Lv.」只代表階級；窄 selector（不訂閱整個 `game`）。
- Commit：Conventional Commits（英文），結尾加所用 agent 的 `Co-Authored-By`。

## Review Focus

1. **兩位玩家幾乎同時合出同一個稀有魔法**：只有一位 `first`，另一位照常學會、`first: false`、仍有一筆紀錄。測試在 Task 3（store）與 Task 4（app）。
2. **合成被拒（422）或衝突（409）**：不寫 `discoveries`、不回 `rare`。測試在 Task 4。
3. **可疑帳號合出稀有魔法**：照常學會；不寫 `discoveries`；回應 `rare.first === false`。測試在 Task 4。
4. **鈴鐺的未讀數在 `localStorage` 不可用時**（私密視窗、丟例外）：不當機、當作全部已讀。測試在 Task 7。
5. **全螢幕動畫期間又按合成或切分頁**：動畫只播一次、結束後狀態正常（魔法已裝備、合成台已清空）、不重複觸發。測試在 Task 6。

---

### Task 1: 稀有魔法內容

**Files:**
- Modify: `src/data/content/spells.json`、`src/data/content/recipes.json`
- Modify: `src/engine/content.ts`（`spellSchema` 加 `rare: z.boolean().optional()`；交叉檢查）、`src/engine/model.ts`（`Spell` 加 `rare?: boolean`）
- Test: `src/engine/content.test.ts`（或現有的內容測試檔）

**Interfaces:**
- Produces：`Spell.rare?: boolean`；內容中的 5 個魔法 id：`worldfire`、`heavens_breath`、`ninefold_thunder`、`titans_grip`、`moontide`；5 個配方 id：`worldfire`、`heavens_breath`、`ninefold_thunder`、`titans_grip`、`moontide`（輸入見規格 2.1 表）。

- [ ] **Step 0: 開 branch**（controller 已做則跳過）。
- [ ] **Step 1: 失敗測試**

```ts
it('has one rare spell per element, each only from a random recipe that needs a 高階 element', () => {
  const rares = Object.values(content.spells).filter((s) => s.rare);
  expect(rares.map((s) => s.id).sort()).toEqual(
    ['abyss_devour', 'heavens_breath', 'holy_judgment', 'moontide', 'ninefold_thunder', 'titans_grip', 'worldfire'],
  );
  for (const [id, el, base] of [
    ['worldfire', 'fire', 'inferno'], ['heavens_breath', 'wind', 'vacuum_blades'], ['ninefold_thunder', 'thunder', 'myriad_thunder'],
    ['titans_grip', 'earth', 'landslide'], ['moontide', 'water', 'maelstrom'],
  ] as const) {
    const s = content.spells[id]!;
    expect(s).toMatchObject({ elements: [el], tier: 8, named: true, affinity: 'self', rare: true });
    const r = content.recipes.find((x) => x.id === id)!;
    expect([...r.inputs].sort()).toEqual([base, `el:${el}:3`].sort());
    expect(r.outcomes).toEqual([{ spellId: id, weight: 1 }, { spellId: null, weight: 64 }]);
  }
});
it('rejects content where a rare spell comes from a fixed recipe', () => {
  // clone the content, give worldfire's recipe a single fixed outcome → loading/cross-check throws
});
it('existing spells and recipes are unchanged', () => {
  // snapshot of the pre-change ids/attack/tier of every non-new spell and every non-new recipe (taken before editing the JSON)
});
```

- [ ] **Step 2: 執行確認失敗**：`npx vitest run src/engine/content.test.ts`。
- [ ] **Step 3: 加 schema 欄位與交叉檢查**：每個 `rare` 魔法至少出現在一個配方的 outcomes 裡，而且所有產出它的配方都有 `spellId: null` 的 outcome；違反時照現有交叉檢查的方式丟錯。
- [ ] **Step 4: 加 5 個魔法與 5 個配方**（規格 2.1）：攻擊約 80，冷卻與效果讓整體輸出比同屬性 Lv.7 名魔法（墜日、天穹颶風、雷神降臨、大地之怒、大洪水）高 15～20%、低於聖光審判；每個用規格 2.1 建議的效果組合；`hint` 暗示「Lv.5 純屬性魔法＋高階元素、要多試很多次」；`prerequisites` 為該 Lv.5 魔法；`depth` 依該配方實際的深度規則（看 `crafting.ts` 的 `requiredGrade` 與現有 depth 3 的魔法，確保 `el:x:3` 的配方不會因階級不足被拒）；`node` 放在該 Lv.5 魔法外側、現有區域、不重疊（跑 `src/ui/grimoire-layout.test.ts`）。聖光審判、深淵吞噬只加 `"rare": true`。
- [ ] **Step 5: 執行**：內容測試、`npx vitest run tests/sim`（各路線仍通過）、`npm test`、`npm run build`。
- [ ] **Step 6: Commit**：`feat(content): five rare spells from random recipes that need a 高階 element`。

---

### Task 2: 稀有魔法的刷取成本量測

**Files:**
- Modify: `tests/sim/bot.ts`（`BotResult` 加 `gained`）
- Create: `tests/sim/rare-cost.test.ts`

**Interfaces:**
- Consumes：Task 1 的配方。
- Produces：`BotResult.gained: Record<ElementId, { atMs: number; eq: number }[]>`——每模擬分鐘一個樣本，`eq` 是**從掉落累積獲得**的該元素初階當量（`gradeValue` 加權，不扣花費）。
- 常數：`RARE_FARM_CEILING_MIN = 120`（在測試檔內）。

- [ ] **Step 1: 失敗測試**（每個屬性一個 `it`，沿用 `pure-paths` 的 `SEED` 與路線）

```ts
it(`pure ${el}: farming one rare spell takes at most RARE_FARM_CEILING_MIN simulated minutes`, async () => {
  const r = await runBot({ route: el, seed: SEED, maxSimMs: FOUR_HOURS });
  const from = r.learnedAt[BASE[el]]!;                     // when the Lv.5 spell is learned
  const rate = eqPerMinuteAfter(r.gained[el], from, 30);  // grade-1 equivalents per sim minute over the next 30 min (or to the end)
  const minutes = (65 * gradeValue(3)) / rate;
  console.info(`[rare-cost] ${el}: ${rate.toFixed(1)} eq/min → ${minutes.toFixed(0)} min`);
  expect(minutes).toBeLessThanOrEqual(RARE_FARM_CEILING_MIN);
});
```

- [ ] **Step 2: 執行確認失敗**（`gained` 不存在）。
- [ ] **Step 3: 在 bot 的掉落處累加 `gained` 並每模擬分鐘取樣**；`eqPerMinuteAfter` 寫在測試檔。
- [ ] **Step 4: 執行**：`npx vitest run tests/sim/rare-cost.test.ts`。**若任何屬性超過 120 分鐘：不要改權重、成本或魔法數值**——把各屬性的分鐘數寫進報告，回報 `DONE_WITH_CONCERNS`，把該測試標成 `it.skip` 並註明「待使用者決定（規格 2.1 成本檢查）」；controller 會記成待決事項。
- [ ] **Step 5: `npm test`、`npm run build`；Commit**：`test(sim): measure how long farming a rare spell takes`。

---

### Task 3: `discoveries` 資料表與 Store

**Files:**
- Create: `migrations/0005_discoveries.sql`（規格第 5 節的 SQL，原樣）
- Modify: `worker/store.ts`（介面＋`MemoryStore`）、`worker/d1-store.ts`、`worker/store-contract.ts`
- Test: `tests/d1/d1-store.test.ts`（migration 測試）

**Interfaces:**
- Produces（`worker/store.ts`）：

```ts
export interface DiscoveryRow { id: number; spellId: string; displayName: string; at: number; first: boolean }
// Store:
/** Inserts a discovery, as the first one for this spell when no first exists yet (the partial unique index decides races). */
recordDiscovery(d: { spellId: string; playerId: string; displayName: string; at: number }): Promise<{ first: boolean }>;
/** Newest first, at most `limit`; with `after`, only rows whose id is greater. */
recentDiscoveries(after: number | null, limit: number): Promise<DiscoveryRow[]>;
```

- [ ] **Step 1: 契約測試（失敗）**——加進 `describeStoreContract`：
  - 第一位 `recordDiscovery` → `{ first: true }`，同一魔法第二位 → `{ first: false }`，不同魔法 → `{ first: true }`。
  - `recentDiscoveries(null, 20)` 新到舊、不含 `playerId` 欄位；`recentDiscoveries(id, 20)` 只回比 `id` 新的；`limit` 生效。
  - （D1 才測得到的競態）在 `tests/d1/d1-store.test.ts`：直接插入一筆 `first = 1` 後再 `recordDiscovery` 同一魔法 → `{ first: false }`，表中只有一筆 `first = 1`。
  - migration 測試：套用 0001～0004、寫一筆存檔、再套用 0005，存檔仍在、`discoveries` 表存在。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run worker tests/d1`。
- [ ] **Step 3: 實作**：D1 版先嘗試 `INSERT ... first = 1`，撞到唯一索引（constraint error）就改插 `first = 0`；MemoryStore 用陣列＋「此魔法是否已有首位」判斷。
- [ ] **Step 4: `npm test`、`npm run build`；Commit**：`feat(worker): store discoveries with a single first per spell`。

---

### Task 4: 伺服器：合成寫入發現、`GET /api/discoveries`

**Files:**
- Modify: `worker/app.ts`、`src/engine/crafting.ts`（`SynthResult` 的 `learned` 加 `rare?: { first: boolean }`）
- Test: `worker/app.test.ts`

**Interfaces:**
- Consumes：Task 3 的 `recordDiscovery`、`recentDiscoveries`。
- Produces：
  - `serverAction` 的 `onCommit` 改為 `(playerId, t, result) => Promise<R | void>`；回傳值（若有）取代回應裡的 `result`。
  - 合成 `learned` 且 `content.spells[spellId]?.rare` 時：讀玩家（`store.getPlayer`）；非可疑 → `recordDiscovery({ spellId, playerId, displayName, at: t })`，結果加 `rare: { first }`；可疑 → 不寫，結果加 `rare: { first: false }`。
  - `GET /api/discoveries?after=<id>`：需要 session（同其他 API）；`after` 不是非負整數時 400；回 `{ discoveries: DiscoveryRow[] }`，最多 `FEED_LIMIT = 20` 筆（常數 export 自 `worker/app.ts`）。

- [ ] **Step 1: 失敗測試**（用一個固定 `next()` 回傳很小值的 `Rng` 注入 `createApp` 的 `deps.rng`，讓 `inferno + el:fire:3` 擲出焚世之焰；另一個回傳接近 1 的值讓它落空）
  - 擲中：回應 `result` 為 `{ kind: 'learned', spellId: 'worldfire', crafted: false, rare: { first: true } }`；第二位玩家擲中 → `rare: { first: false }`；`GET /api/discoveries` 回兩筆、新到舊、`first` 依序為 false、true、只有 `id/spellId/displayName/at/first` 欄位。
  - 落空：照常學會自創魔法，沒有 `rare` 欄位，`discoveries` 為空。
  - 被拒（例如沒有高階火）：422、`discoveries` 為空。
  - 衝突（baseRevision 過舊）：409、`discoveries` 為空。
  - 可疑帳號擲中：學會、`rare: { first: false }`、`discoveries` 為空。
  - `GET /api/discoveries` 無 token → 401；`after=abc` → 400；`after=<第一筆 id>` 只回之後的。
  - 既有的 worker 對抗測試全部照舊通過。
- [ ] **Step 2: 執行確認失敗**：`npx vitest run worker/app.test.ts`。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: `npx vitest run tests/sim`（0 次被拒）、`npm test`、`npm run build`；Commit**：`feat(worker): record rare discoveries and serve the recent feed`。

---

### Task 5: 用戶端 API

**Files:**
- Modify: `src/game/api.ts`
- Test: `src/game/api.test.ts`

**Interfaces:**
- Consumes：Task 4 的端點與 `SynthResult.rare`。
- Produces：
  - `export interface Discovery { id: number; spellId: string; displayName: string; at: number; first: boolean }`
  - `ApiClient.recentDiscoveries(after?: number): Promise<Discovery[]>`——驗證每筆欄位型別，壞資料丟 `ApiError('invalid discoveries from server', 0)`；401 照現有規則丟 `AuthError`。
  - `resultOf` 對 `learned` 的 `rare` 欄位：存在時必須是 `{ first: boolean }`，否則丟 `ApiError`。

- [ ] **Step 1: 失敗測試**：`recentDiscoveries()` 打 `GET /api/discoveries`、`recentDiscoveries(7)` 打 `?after=7`；回傳解析；欄位錯誤丟錯；`synthesize` 的 `learned` 帶 `rare` 時原樣保留。
- [ ] **Step 2～4**：確認失敗 → 實作 → `npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(api): fetch recent discoveries and read the rare flag`。

---

### Task 6: 全螢幕稀有魔法動畫

**Files:**
- Create: `src/ui/RareReveal.tsx`、`src/ui/RareReveal.test.tsx`
- Modify: `src/ui/SynthesisAltar.tsx`（稀有結果不在合成台中央揭曉）、`src/ui/altar-data.ts`（`revealOf` 對帶 `rare` 的 `learned` 回 `null`）、`src/ui/App.tsx`、`src/ui/App.css`
- Test: `src/ui/SynthesisAltar.test.tsx`、`src/ui/altar-data.test.ts`、`src/ui/App.test.tsx`

**Interfaces:**
- Produces：
  - `export const RARE_REVEAL_MS = 4000`
  - `RareReveal({ spell, first, onDone }: { spell: Spell; first: boolean; onDone: () => void })`——`role="dialog"`、`aria-label="稀有魔法"`；三個階段 class `phase-gather`（0～1000 ms）、`phase-burst`（1000～2000 ms）、`phase-title`（2000～4000 ms）；第 3 階段文字：首位「✦ 全服首次發現 ✦」、否則「✦ 稀有魔法！✦」，加元素點、名稱、`Lv.N`、「稀有魔法」、`殘卷：{hint}`；點一下：第 1、2 階段跳到第 3 階段，第 3 階段呼叫 `onDone`；`RARE_REVEAL_MS` 到時呼叫 `onDone`；`prefers-reduced-motion` 時直接從第 3 階段開始（測試用 `matchMedia` stub）。顏色與粒子形狀取自 `element-fx.ts`。
  - `App`：`onSynthResult` 收到 `learned` 且有 `rare` → 照常 `runtime.equip`、**不**顯示 `DiscoveryBanner`、顯示 `RareReveal`（同一時間只有一個；新的稀有結果在播放中到達時排在後面，播完再播）；結束後呼叫 Task 7 的 `refreshFeed()`（本任務先留一個 no-op prop／callback 位置）。

- [ ] **Step 1: 失敗測試**
  - `RareReveal`：fake timers 推進 0／1000／2000／4000 ms 檢查階段 class 與 `onDone`；點擊跳階段；首位與非首位文字；reduced-motion 直接第 3 階段。
  - `SynthesisAltar`：回覆 `{ kind:'learned', spellId:'worldfire', crafted:false, rare:{ first:true } }` 時，`MIN_FUSE_MS` 後清空兩邊、呼叫 `onResult`，但**沒有** `合成結果` 揭曉層。
  - `App`（Review Focus 5）：擲中稀有 → 出現 `dialog 稀有魔法`、`equip` 被呼叫一次、沒有 `新發現` 橫幅；動畫期間再收到一個稀有結果 → 第一個結束後才出現第二個；結束後合成台為空。
- [ ] **Step 2～4**：確認失敗 → 實作（CSS 動畫，`transform`／`opacity`，`z-index` 高於所有面板）→ `npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(ui): a full-screen reveal for rare spells`。

---

### Task 7: 頂端鈴鐺與發現清單

**Files:**
- Create: `src/ui/DiscoveryBell.tsx`、`src/ui/DiscoveryBell.test.tsx`、`src/ui/useDiscoveryFeed.ts`
- Modify: `src/ui/TopBar.tsx`、`src/ui/App.tsx`、`src/ui/App.css`、`src/ui/messages.ts`

**Interfaces:**
- Consumes：Task 5 的 `ApiClient.recentDiscoveries`、Task 6 的 refresh 位置。
- Produces：
  - `export const FEED_POLL_MS = 60_000`、`export const FEED_SEEN_KEY = 'ig.feedSeen'`
  - `useDiscoveryFeed(api: Pick<ApiClient,'recentDiscoveries'>, online: boolean): { entries: Discovery[]; refresh: () => void }`——上線時立即抓一次，之後每 `FEED_POLL_MS` 用 `after=<最新 id>` 抓新的，合併、依 id 新到舊、最多 20 筆；離線時停止；錯誤靜默（保留舊清單），401 交給既有流程；卸載時清掉計時器。
  - `DiscoveryBell({ entries, content, ownName })`：按鈕 `aria-label="發現動態"`，未讀數 `> 0` 時顯示數字（`aria-label` 含未讀數，例如「發現動態（2 則未讀）」）；點開是清單（`role="list"`），每則：首位「✦ 全服首次發現　{名稱} 合出了「{魔法}」」、否則「{名稱} 也合出了「{魔法}」」，下一行「殘卷：{hint}・{多久以前}」；沒有資料時「還沒有人發現稀有魔法」；打開時把最新 id 寫入 `localStorage[FEED_SEEN_KEY]`（try/catch）；未讀＝id 大於已讀 id 的筆數，**不含自己的**（`displayName === ownName` 視為自己的，規格 4）；讀不到 `localStorage` 時未讀為 0。
  - `messages.ts`：`discoveryLine(d, content)`、`timeAgo(ms)`（「剛剛」「N 分鐘前」「N 小時前」「N 天前」）。
  - `App`：`useDiscoveryFeed(api, status === 'online')`，把 `entries` 與 `refresh` 交給 `TopBar` 與 Task 6 的動畫結束回呼。

- [ ] **Step 1: 失敗測試**
  - `useDiscoveryFeed`（fake timers）：上線立即呼叫 `recentDiscoveries()`；60 秒後呼叫 `recentDiscoveries(<最新 id>)` 並合併；離線不呼叫；`refresh()` 立即抓；卸載後不再呼叫。
  - `DiscoveryBell`：未讀數、打開後歸零並寫入 `localStorage`；首位與非首位文字；不顯示任何配方或輸入（斷言清單文字不含 `+`、`el:`、`inferno` 等配方字樣）；`localStorage` 的 getItem／setItem 丟例外時不當機、未讀為 0（Review Focus 4）；自己的發現不算未讀。
  - `messages.timeAgo` 邊界值。
- [ ] **Step 2～4**：確認失敗 → 實作 → `npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(ui): a discovery bell with the recent rare finds`。

---

### Task 8: 瀏覽器驗收與文件

**Files:**
- Modify: `AGENTS.md`（第 2、3、5、6、8、10 節）

- [ ] **Step 1**：`npm run db:migrate:local`（套用 0005，確認既有存檔仍在）、`npm run dev`。
- [ ] **Step 2：照規格第 8 節驗收**（headless Edge＋puppeteer-core，腳本與截圖放 git-ignored 的 SDD 工作區）：兩個瀏覽器 context 當兩位玩家；元素存量與已學會的 Lv.5 魔法可以直接改本機存檔種進去；要擲中稀有魔法可以暫時把本機的配方權重改高**只在驗收腳本的伺服器實例**，或連續嘗試——**不能把修改 commit**，報告註明用了哪種方法。確認：全螢幕動畫（首位與非首位文字）、點擊跳過、魔法已裝備；另一位玩家 60 秒內鈴鐺亮起、清單內容正確且無配方。
- [ ] **Step 3**：發現的問題修掉（TDD、各自 commit）或記成 deferred minor。
- [ ] **Step 4：更新 `AGENTS.md`**：第 2 節閱讀表加本規格、計畫、帳本；第 3 節目前狀態與測試數、待辦；第 5 節架構地圖（`discoveries`、`RareReveal`、`DiscoveryBell`）；第 6 節加一條「稀有魔法只能機率取得、資訊欄不公布配方、可疑帳號不上發現紀錄」；第 8 節延後項目；第 10 節交接紀錄；上線前檢查清單 `docs/prelaunch-checklist.md` 加「遠端 D1 要套用 0005」。
- [ ] **Step 5**：`npm test`、`npm run build`；Commit：`docs: record rare spells and the discovery feed`。
