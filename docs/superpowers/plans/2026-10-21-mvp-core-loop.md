# Infinite Grimoire MVP（自動戰鬥 + 合成換魔法 + 伺服器核心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 做出第一版可以玩、必須聯網的網頁遊戲。小人自動打怪、掉元素；玩家用元素合成魔法，合成的擲骰由伺服器負責；換上魔法後，戰鬥效果馬上改變；打倒魔王會解鎖下一個地點。存檔放在伺服器，伺服器會檢查進度是否合理。

**Architecture：**
- **遊戲邏輯：** `src/engine/` 是純 TypeScript，不 import React、Pixi、DOM 或 Workers API。瀏覽器和 Worker 共用這份程式碼。
- **瀏覽器執行層：** `src/game/` 負責固定時間步進、動作，以及和伺服器同步。畫面由 `src/render/`（Pixi）和 `src/ui/`（React）負責。
- **伺服器：** `worker/` 是 Cloudflare Worker，用 Hono 寫 `/api/*`，資料存在 D1。同一個 Worker 也提供 Vite 打包出來的靜態網頁。
- **分工原則：** 伺服器是銀行。戰鬥在瀏覽器裡跑；伺服器用上一份已接受的存檔和伺服器時間，檢查新上傳的存檔合不合理。合成一律在伺服器擲骰。

**Tech Stack：** Node 22、Vite 8、TypeScript、React 19、Pixi.js 8、zod 4、Vitest 5、@testing-library/react 16、jsdom、Hono 4、wrangler 4、@cloudflare/vite-plugin 1、@cloudflare/workers-types、Cloudflare D1。

**Spec：** `docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md`
- 第 6 節：第一版範圍
- 第 4 節：遊戲規則
- 第 4.11、4.12 節：帳號與防作弊

## Global Constraints

- 介面文字一律用繁體中文。資料中的名稱都要附 `nameEn`。
- 小人**沒有血條、永遠不會死**。
- 屬性相剋倍率限制在 **0.9～1.1**。
- 傷害門檻：設魔物為 M 階，當魔法階級 ≥ M − 1，**或**攻擊力 ≥ 防禦 × 0.7 時，才會造成傷害；否則傷害為 0。
- 越級效益：d = 魔法階級 − M。d ≥ 2 時，效益 = `0.5 + 0.5 * k^(d-1)`，k = 0.5；d < 2 時，效益為 1。效益套用在掉落上。
- 階級範圍是 1～20。
- 元素的圓周順序是 `fire, wind, thunder, earth, water`。
- **必須聯網**。斷線時遊戲暫停並顯示提示，不能在斷線狀態下繼續累積進度。
- **伺服器是唯一可信來源**：
  - 存檔檢查只用**伺服器時間**，不信任瀏覽器送來的任何時間。
  - 只有伺服器能改變 `learned` 和 `synthesisLog`。
- 不儲存 email。瀏覽器的 `localStorage` 只存登入權杖，讀寫都要包 try/catch。
- 存檔包含 `version: 1`。每次上傳都要附 `baseRevision`，用來偵測衝突。
- 360px 寬的手機也要能玩，所有操作都可以用點擊完成。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`。元素色：火 `#e2643b`、風 `#7fd0c0`、雷 `#f3e36b`、土 `#c79a5a`、水 `#5aa0e8`、無屬性 `#b8c7ff`。
- 第一版不做：光暗、煉金、商店、金幣、稱號、轉生、離線收益、排行、發現紀錄、帳號綁定、市集。

## Review Focus

1. **遊玩中斷線：** 上傳或合成時網路失敗，遊戲要暫停並顯示「連線中斷，正在重新連線…」，連線恢復後自動繼續，不能卡死，也不能把狀態弄壞。由 Task 9 測試。
2. **重複送出合成：** 例如連點兩下，或兩個分頁同時送出。這時伺服器不能重複扣材料，第二個請求要回傳 409 和最新狀態。由 Task 8 測試。
3. **背景分頁回來，或單一影格非常長：** 每次最多補算 1 秒，不能一次跑幾分鐘的模擬。由 Task 9 測試。
4. **合成槽不完整或數量不足：** 直接拒絕，不消耗材料，按鈕顯示停用。由 Task 4 和 Task 12 測試。
5. **魔法打不動目前的魔物：** 要發出 `immune` 事件，畫面上浮出「無效」，讓玩家知道不是 bug。由 Task 5 和 Task 11 測試。

---

## 檔案結構

```
index.html  vite.config.ts  wrangler.jsonc  tsconfig.json
migrations/0001_init.sql        D1 schema
worker/                         Cloudflare Worker（只有這裡可以用 Workers API）
  index.ts                      export default { fetch }，掛上 createApp
  app.ts                        createApp(deps) → Hono
  store.ts                      Store 介面 + MemoryStore（測試用）
  d1-store.ts                   D1Store
  auth.ts                       token 產生與雜湊
  crypto-rng.ts                 createCryptoRng()
src/engine/                     共用的純邏輯
  rng.ts  types.ts  data.ts  combat-rules.ts  inventory.ts  state.ts
  synthesis.ts  battle.ts  save.ts  validate.ts
src/data/                       spells.json  recipes.json  monsters.json  zones.json
src/game/
  runtime.ts                    GameRuntime
  api.ts                        createApiClient（fetch 包裝）
  session.ts                    token 存取、遊客建立
  sync.ts                       SyncController（定期上傳、斷線處理）
  loop.ts                       startLoop
src/render/                     palette.ts  assets.ts  effects.ts  battle-view.ts
src/ui/                         App.tsx  App.css  useGame.ts  messages.ts  BattleCanvas.tsx
                                Hud.tsx  InventoryBar.tsx  ZonePanel.tsx  SynthesisPanel.tsx
                                GrimoirePanel.tsx  grimoire-layout.ts  Onboarding.tsx  OfflineOverlay.tsx
src/main.tsx
tests/sim/bot.ts  tests/sim/pure-paths.test.ts
docs/art-assets.md  README.md
```

測試檔和被測檔放在同一個資料夾，命名為 `*.test.ts(x)`。

---

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

### Task 2：型別、資料 schema 與載入檢查

**Files:**
- Create: `src/engine/types.ts`, `src/engine/data.ts`, `src/data/spells.json`, `src/data/recipes.json`, `src/data/monsters.json`, `src/data/zones.json`
- Test: `src/engine/data.test.ts`

**Interfaces:**
- Produces（`types.ts`）：
```ts
export const ELEMENT_ORDER = ['fire','wind','thunder','earth','water'] as const;
export type ElementId = typeof ELEMENT_ORDER[number];
export type ItemId = string;            // 'el:<ElementId>:<grade 1-3>' 或 'mat:<id>'
export type Inventory = Record<ItemId, number>;
export type SpellPattern = 'bolt' | 'beam' | 'chain' | 'nova';
export type StatusKind = 'burn' | 'paralyze' | 'freeze';
export interface SpellDef { id: string; name: string; nameEn: string; elements: ElementId[]; tier: number;
  attack: number; cooldownMs: number; pattern: SpellPattern; chainCount?: number;
  status?: { kind: StatusKind; chance: number; durationMs: number };
  prerequisites: string[]; hint: string; grimoire: { ring: 0 | 1 | 2 | 3; offset: number } }
export interface RecipeDef { id: string; inputs: ItemId[]; outcomes: { spellId: string; weight: number }[] }
export interface DropDef { itemId: ItemId; chance: number; min: number; max: number }
export interface MonsterDef { id: string; name: string; nameEn: string; element: ElementId; tier: number; hp: number;
  defense: number; regenPerSec: number; boss: boolean; drops: DropDef[] }
export interface ZoneDef { id: string; name: string; nameEn: string; order: number; monsters: string[];
  bossId: string; killsForBoss: number; maxAlive: number; spawnIntervalMs: number }
export interface GameData { spells: Record<string, SpellDef>; recipes: RecipeDef[];
  monsters: Record<string, MonsterDef>; zones: ZoneDef[] /* 依 order 排序 */ }
export const elementItem = (e: ElementId, grade: number): ItemId => `el:${e}:${grade}`;
export const MAX_ELEMENT_GRADE = 3;
export const STARTING_SPELL = 'mana_bolt';
```
- Produces（`data.ts`）：
  - `loadGameData(raw: { spells: unknown; recipes: unknown; monsters: unknown; zones: unknown }): GameData`：失敗時丟出 `DataError`，訊息列出所有問題。
  - `export const gameData: GameData`

- [ ] **Step 1：寫失敗的測試** `data.test.ts`
  - `real data loads`：`gameData.spells.mana_bolt.tier === 1`。
  - `rejects tier out of range`：tier 為 21 時，錯誤訊息包含 `tier`。
  - `rejects unknown prerequisite / outcome / monster / boss / item references`：每種一個案例。
  - `rejects recipe with inputs.length !== 2`。
  - `every non-starting spell is an outcome of some recipe`。
  - `every zone drops all five grade-1 elements`：每個地點的一般魔物合起來，掉落五種初階元素。
  - `hybrid spells have exactly two adjacent elements`：兩個屬性在 `ELEMENT_ORDER` 的環上相鄰。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作 `types.ts` 和 `data.ts`。
- [ ] **Step 4：寫入第一版內容 JSON。** 攻擊力、血量、防禦、掉落率等數值先填合理的初始值，Task 10 會再調整。
  - **魔法**（`id` 名稱 / 階級 / 模式 / 狀態）：
    - 起始魔法：`mana_bolt` 魔力彈 / T1 / bolt / 無屬性（`elements: []`、`grimoire.ring: 0`）
    - 火：`fireball` 火球術 T2 bolt burn → `flame_burst` 烈焰術 T4 beam burn → `explosion` 爆炎 T5 nova burn
    - 風：`wind_blade` 風刃 T2 bolt → `whirlwind` 旋風 T4 nova → `vacuum_slash` 真空斬 T5 beam
    - 雷：`thunder_bolt` 雷電術 T2 bolt paralyze → `lightning` 閃電術 T4 chain（chainCount 3）paralyze → `thunderstorm` 雷暴 T5 nova paralyze
    - 土：`pebble` 石礫 T2 bolt → `rock_spear` 岩槍 T4 beam → `earthquake` 地震 T5 nova paralyze
    - 水：`water_shot` 水彈 T2 bolt → `ice_spike` 冰錐 T4 beam freeze → `tsunami` 海嘯 T5 nova freeze
    - 混合：
      - `fire_whirl` 火焰旋風（fire + wind）T6 nova burn，前置 `flame_burst`、`whirlwind`
      - `steam_burst` 蒸氣爆發（water + fire）T6 chain，前置 `ice_spike`、`flame_burst`
    - 前置條件：每條屬性線的 T2 沒有前置；T4 前置 T2；T5 前置 T4。
    - 魔導書位置：T2 是 `ring 1, offset 0`；T4 是 `ring 2, offset -1`；T5 是 `ring 2, offset 1`；混合魔法是 `ring 3`。
  - **配方**（每個屬性 X）：
    - `[el:X:1, el:X:1]` → T2，權重 100
    - `[el:X:2, el:X:2]` → T4 權重 92、T5 權重 8
    - `[el:X:2, mat:mana_crystal]` → T5，權重 100
    - 混合：`[el:fire:2, el:wind:2]` → `fire_whirl`；`[el:water:2, el:fire:2]` → `steam_burst`
  - **地點**（order / 一般魔物階級 / 魔王階級）：
    - `mist_meadow` 迷霧草原：1 / T1 / T2
    - `thunder_gorge` 雷鳴峽谷：2 / T3 / T4
    - `ash_volcano` 灰燼火山：3 / T5 / T6
    - 每個地點有 3 種一般魔物，涵蓋至少兩種屬性，另外加 1 隻 `boss: true`。
    - 第 2、3 個地點會掉 `mat:mana_crystal`。
    - 第 2 個地點一般魔物的防禦值 > `mana_bolt.attack / 0.7`，確保魔力彈打不動。
  - **殘卷提示：** 每個魔法都要有 `hint`。
- [ ] **Step 5：** 執行 `npx vitest run src/engine/data.test.ts`，預期 PASS。
- [ ] **Step 6：Commit**：`feat(engine): add data schema, validation and MVP content`

---

### Task 3：戰鬥規則、背包與遊戲狀態

**Files:**
- Create: `src/engine/combat-rules.ts`, `src/engine/inventory.ts`, `src/engine/state.ts`
- Test: `src/engine/combat-rules.test.ts`, `src/engine/inventory.test.ts`, `src/engine/state.test.ts`

**Interfaces:**
- Produces：
```ts
// combat-rules.ts
export const OVERLEVEL_K = 0.5;
export function canDamage(spell: { tier: number; attack: number }, monster: { tier: number; defense: number }): boolean;
export function overlevelEfficiency(spellTier: number, monsterTier: number, k?: number): number;
export function affinityMultiplier(spellElements: ElementId[], monsterElement: ElementId): number; // 0.9 | 1 | 1.1
export function computeHit(spell: SpellDef, monster: MonsterDef, opts: { frozen: boolean }): number; // 0 = 免疫
// inventory.ts
export function addItems(inv: Inventory, items: ItemId[]): Inventory;
export function removeItems(inv: Inventory, items: ItemId[]): Inventory | null;
export function upgradeElement(inv: Inventory, element: ElementId, grade: number): Inventory | null; // 3 → 1
export function elementEquivalent(inv: Inventory, element: ElementId): number; // Σ count × 3^(grade-1)
// state.ts
export interface SynthLogEntry { attempts: number; results: Record<string, number>; noReaction: boolean }
export interface GameState { version: 1; inventory: Inventory; learned: string[]; equipped: string;
  currentZone: string; unlockedZones: string[]; defeatedBosses: string[];
  zoneKills: Record<string, number>; synthesisLog: Record<string, SynthLogEntry> }
export function createInitialState(data: GameData): GameState;
export function equipSpell(state: GameState, spellId: string): GameState;
export function travel(state: GameState, zoneId: string): GameState | null;
```

- [ ] **Step 1：寫失敗的測試**
  - **`canDamage`：**
    - `{tier:9}` 打 `{tier:10, defense:1000}` → true
    - `{tier:8, attack:10}` 打 `{tier:10, defense:100}` → false
    - `{tier:8, attack:70}` 打同一隻 → true
    - `{tier:8, attack:69}` 打同一隻 → false
  - **`overlevelEfficiency`：**
    - `(10,10)` = 1、`(11,10)` = 1、`(12,10)` = 0.75、`(13,10)` = 0.625、`(14,10)` ≈ 0.5625
    - `(20,1)` 落在 0.5～0.5001
  - **`affinityMultiplier`：**
    - 相剋關係：water→fire、fire→wind、wind→earth、earth→thunder、thunder→water
    - `(['water'],'fire')` = 1.1、`(['fire'],'water')` = 0.9、`([],'fire')` = 1
    - 混合魔法取最大值：`(['water','fire'],'fire')` = 1.1
    - 所有組合的結果都在 [0.9, 1.1] 之內
  - **`computeHit`：** 打不動時為 0；打得動時是 ≥ 1 的整數；`frozen` 時的傷害比沒有 frozen 時大。
  - **背包：**
    - `removeItems({a:1}, ['a','a'])` → null，而且原本的物件不變
    - `upgradeElement`：3 個 `el:fire:1` → 1 個 `el:fire:2`；只有 2 個時 → null；grade 3 → null
    - `elementEquivalent({ 'el:fire:1': 2, 'el:fire:2': 1 }, 'fire')` = 5
  - **狀態：**
    - `createInitialState`：`learned` 是 `['mana_bolt']`，`currentZone` 是 `zones[0].id`
    - `travel` 到未解鎖的地點 → null
    - `equipSpell` 未學會的魔法 → 原樣回傳
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：實作。**
  - `computeHit` = `round(attack × 100 / (100 + defense) × affinity × (frozen ? 1.15 : 1))`，打得動時至少為 1。
  - 所有函式都不修改傳入的參數。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): combat rules, inventory and game state`

---

### Task 4：合成規則（純函式，之後由伺服器呼叫）

**Files:**
- Create: `src/engine/synthesis.ts`
- Test: `src/engine/synthesis.test.ts`

**Interfaces:**
- Produces：
```ts
export const SYNTH_SLOTS = 2;
export type SynthResult =
  | { kind: 'learned'; spellId: string }
  | { kind: 'duplicate'; spellId: string; refunded: ItemId[] }
  | { kind: 'noReaction'; consumed: ItemId[] }
  | { kind: 'knownNoReaction' }
  | { kind: 'dormant' }
  | { kind: 'rejected'; reason: 'slots' | 'insufficient' };
export function comboKey(inputs: ItemId[]): string;
export function synthesize(state: GameState, inputs: ItemId[], data: GameData, rng: Rng): { state: GameState; result: SynthResult };
```

規則（依序判斷）：
1. 輸入數量不是 2 → `rejected/slots`，不消耗。
2. 背包數量不足 → `rejected/insufficient`，不消耗。
3. 沒有對應的配方：
   - 紀錄中已標記為 noReaction → `knownNoReaction`，不消耗。
   - 否則消耗排序後的第一個輸入，記錄 `attempts+1`、`results.none+1`、`noReaction = true`，回傳 `noReaction`。
4. 有配方，但沒有任何結果的前置條件已滿足 → `dormant`，不消耗，也不記錄。
5. 否則從前置條件已滿足的結果中依權重抽一個，消耗全部輸入，並記錄 `attempts+1`、`results[spellId]+1`：
   - 已經學會 → `duplicate`，退還排序後的第一個輸入。
   - 還沒學會 → 加入 `learned`，回傳 `learned`。

- [ ] **Step 1：寫失敗的測試**
  - `rejects one slot without consuming`
  - `rejects same element twice when only one owned`：背包是 `{el:fire:1: 1}`，輸入 `[el:fire:1, el:fire:1]`。
  - `first invalid combo consumes one item and logs noReaction`
  - `second invalid combo consumes nothing`
  - `dormant when prerequisite missing`
  - `learns T2 spell from two grade-1 elements`
  - `duplicate refunds one input`
  - `outcome with unmet prereq is never rolled`：已學雷電術、還沒學閃電術時，用 `[el:thunder:2, el:thunder:2]` 從同一個狀態跑 200 次，每次都是 learned `lightning`，不會出現 `thunderstorm`。
  - `comboKey is order-insensitive`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): spell synthesis rules with prerequisites and attempt log`

---

### Task 5：戰鬥模擬

**Files:**
- Create: `src/engine/battle.ts`
- Test: `src/engine/battle.test.ts`

**Interfaces:**
- Produces：
```ts
export const STEP_MS = 50;
export interface ActiveStatus { kind: StatusKind; remainingMs: number }
export interface MonsterInstance { uid: number; defId: string; hp: number; maxHp: number; x: number; statuses: ActiveStatus[] }
export interface BattleState { zoneId: string; monsters: MonsterInstance[]; spawnTimerMs: number;
  castTimerMs: number; bossActive: boolean; nextUid: number }
export type BattleEvent =
  | { type: 'spawn'; uid: number; boss: boolean }
  | { type: 'cast'; spellId: string; targets: number[] }
  | { type: 'hit'; uid: number; damage: number; immune: boolean }
  | { type: 'status'; uid: number; kind: StatusKind }
  | { type: 'kill'; uid: number; defId: string; drops: ItemId[] }
  | { type: 'bossDefeated'; zoneId: string; unlockedZoneId: string | null };
export function createBattle(zoneId: string): BattleState;
export function stepBattle(game: GameState, battle: BattleState, data: GameData, rng: Rng):
  { game: GameState; battle: BattleState; events: BattleEvent[] };
```

行為：
- **生成：** 沒有魔王時，每 `spawnIntervalMs` 生成一隻一般魔物，最多同時 `maxAlive` 隻，從 `x = 1` 出現。
- **移動：** 魔物每秒移動 0.1，停在 `x = 0.15`。
- **回血：** 魔物每秒回復 `regenPerSec`。
- **狀態：**
  - `paralyze`、`freeze`：停止移動和回血。
  - `freeze`：另外讓受到的傷害 ×1.15，由 `computeHit` 處理。
  - `burn`：每秒造成原始命中傷害的 20%。
- **施法：** `castTimerMs` 累積到 `cooldownMs` 時施放，目標是 `x` 最小的魔物。
  - `bolt`：1 個目標。
  - `beam`：最近的 2 個。
  - `chain`：1 個目標，再加最多 `chainCount` 個，第 i 跳的傷害 ×0.7^i。
  - `nova`：全部魔物，各 ×0.6。
  - 每個目標各自擲狀態效果的機率。
  - 打不動時發出 `hit`，`immune: true`。
- **擊殺：**
  - 每個掉落項目以 `chance × overlevelEfficiency` 的機率掉落，數量在 `min..max` 之間。
  - 一般魔物：`zoneKills + 1`。累積到 `killsForBoss` 時生成魔王，並把 `zoneKills` 歸零。
  - 魔王：記入 `defeatedBosses`（不重複），解鎖下一個地點（`order + 1`），發出 `bossDefeated`。

- [ ] **Step 1：寫失敗的測試**，使用一份測試專用的小型 fixture。
  - `spawns up to maxAlive`
  - `mana_bolt vs tier-3 monster emits immune hits and never kills`：跑 60 秒模擬時間。
  - `kills add drops and zoneKills`
  - `boss spawns after killsForBoss and unlocks next zone on defeat`
  - `defeating last zone boss unlocks nothing`
  - `chain hits up to chainCount+1 targets with falloff`
  - `paralyze stops movement and regen`
  - `overlevel reduces drops`：T12 打 T10 的平均掉落，約是 T10 打 T10 的 75%，誤差 ±5%，跑 2000 次擊殺。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): auto battle simulation with bosses and zone unlock`

---

### Task 6：存檔序列化

**Files:**
- Create: `src/engine/save.ts`
- Test: `src/engine/save.test.ts`

**Interfaces:**
- Produces：
  - `serialize(state: GameState): string`
  - `parseState(input: unknown, data: GameData): GameState | null`：用 zod 檢查結構，`version` 不是 1 時回傳 null；不認識的魔法或地點 id 視為無效，回傳 null。伺服器會用它解析上傳的存檔，所以這裡**不做濾除修補**，有問題就整份拒絕。

- [ ] **Step 1：寫失敗的測試**
  - `roundtrip`：`parseState(JSON.parse(serialize(s)))` 和 `s` 深度相等。
  - `rejects wrong version`
  - `rejects non-object / missing fields`
  - `rejects unknown spell id in learned`
  - `rejects negative or non-integer inventory counts`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): versioned save parsing`

---

### Task 7：進度合理性檢查（防作弊）

**Files:**
- Create: `src/engine/validate.ts`
- Test: `src/engine/validate.test.ts`

**Interfaces:**
- Consumes：`canDamage`、`elementEquivalent`、`GameData`。
- Produces：
```ts
export const GAIN_TOLERANCE = 1.25;   // 上限乘數
export const GAIN_SLACK = 6;          // 每種屬性或素材的固定寬限
export interface GainBound { elements: Record<ElementId, number> /* 初階等值 */; materials: Record<string, number> }
export function maxGain(prev: GameState, elapsedMs: number, data: GameData): GainBound;
export type ValidationResult = { ok: true } | { ok: false; reasons: string[] };
export function validateUpload(prev: GameState, next: GameState, elapsedMs: number, data: GameData): ValidationResult;
```

**`maxGain` 的算法：**
- 對每個已解鎖的地點，如果 `prev.learned` 裡有任何魔法能傷害該地點的某一隻一般魔物：
  - 擊殺數上限 = `floor(elapsedMs / spawnIntervalMs) + maxAlive`。
  - 每次擊殺的掉落上限 = 各掉落項目的 `max` 總和。元素換算成初階等值（`3^(grade-1)`）。
  - 另外，如果能打倒魔王，再加一次魔王的掉落上限。
- 取所有地點中的**最大值**，因為玩家可能待在其中任何一個地點。這個算法本身不套用越級效益，結果一定偏大，算是安全的上限。

**`validateUpload` 的規則**（每條不符合就加入一條 reason）：
- `learned`、`synthesisLog` 必須和 `prev` 完全相同（`learned` 視為集合）。
- `equipped` 必須在 `learned` 之中；`currentZone` 必須在 `next.unlockedZones` 之中。
- 每個屬性：`elementEquivalent(next) − elementEquivalent(prev)` ≤ `bound × GAIN_TOLERANCE + GAIN_SLACK`。每種素材也用同樣的規則檢查。
- **新打倒的魔王**，也就是在 `next.defeatedBosses` 中、但不在 `prev` 中的：
  - 該地點必須在 `prev.unlockedZones` 裡，或是由同一次上傳中另一個新魔王解鎖；
  - `prev.learned` 裡必須有魔法能傷害該魔王；
  - 所有新魔王的 `killsForBoss × spawnIntervalMs` 加總 ≤ `elapsedMs × GAIN_TOLERANCE`。
- `next.unlockedZones` 必須等於 `prev.unlockedZones` 加上新魔王解鎖的地點。

- [ ] **Step 1：寫失敗的測試**
  - `identical state is ok`
  - `normal gain within bound is ok`：用 `stepBattle` 實際跑 30 秒產生 `next`，結果是 ok。
  - `inventory explosion rejected`：`el:fire:1` 在 30 秒內加 10000 → 拒絕，reason 包含 `fire`。
  - `added learned spell rejected`
  - `modified synthesisLog rejected`
  - `boss defeated too fast rejected`：用 1 秒的 `elapsedMs` 加入新魔王。
  - `boss in locked zone rejected`
  - `zone unlocked without boss rejected`
  - `no damaging spell means zero element gain allowed beyond slack`：只有 `mana_bolt`，只解鎖第 2 區的狀態。
  - `element upgrade conversion is ok`：3 個 `el:fire:1` 換成 1 個 `el:fire:2`，等值不變。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): server-side progress plausibility validation`

---

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

### Task 10：數值平衡 + 專精路線 + 上傳不誤判的模擬測試

**Files:**
- Create: `tests/sim/bot.ts`, `tests/sim/pure-paths.test.ts`
- Modify: `src/data/*.json`（只改數值）

**Interfaces:**
- Consumes：`stepBattle`、`synthesize`、`upgradeElement`、`equipSpell`、`travel`、`validateUpload`、`gameData`。機器人直接呼叫 engine 函式，不經過網路。
- Produces：`runBot(opts: { element: ElementId | null; seed: number; maxSimMs: number }): { clearedZones: string[]; learned: string[]; simMs: number; rejectedUploads: number }`
  - 機器人每模擬 1 秒做一次決策：升階 → 依序合成 T2、T4、T5 → 裝備可用魔法中階級最高的 → 有新地點就前往。
  - 每 30 秒，用 `validateUpload(last, current, 30000)` 模擬一次上傳，不通過就累加 `rejectedUploads`。合成和上傳一樣，以通過檢查後的狀態作為新的基準。

- [ ] **Step 1：寫測試**
  - 五個屬性各一個：`pure <element> path clears all MVP zones within 3 simulated hours`。條件：
    - `clearedZones` 包含 3 個地點；
    - `learned` 只有 `mana_bolt` 和該屬性的魔法；
    - `rejectedUploads === 0`，也就是正常遊玩不會被誤判。
  - `mana_bolt only cannot clear thunder_gorge`
  - `each pure path needs the third zone to take at least 20 simulated minutes`
- [ ] **Step 2：** 執行 `npx vitest run tests/sim`，找出失敗的項目。
- [ ] **Step 3：** 只調 `src/data/*.json` 的數值，直到測試全部通過。如果 `rejectedUploads > 0` 是因為上限算法本身太緊，可以回頭改 Task 7 的 `GAIN_TOLERANCE` 和 `GAIN_SLACK`，但要在 commit 訊息裡寫明原因。
- [ ] **Step 4：** 執行 `npm test`，預期全部 PASS。
- [ ] **Step 5：Commit**：`test: pure element path simulations, upload validation and MVP balance`

---

### Task 11：Pixi 戰鬥畫面（佔位圖 + 選用貼圖）

**Files:**
- Create: `src/render/palette.ts`, `src/render/assets.ts`, `src/render/effects.ts`, `src/render/battle-view.ts`, `src/ui/BattleCanvas.tsx`
- Test: `src/render/effects.test.ts`

**Interfaces:**
- Produces：
```ts
export const COLORS: { bg: string; rune: string; amber: string; element: Record<ElementId | 'none', string> };
export function spellColor(spell: SpellDef): string;
export const ASSET_KEYS: string[];   // 'hero_idle', 'monster_<id>', 'fx_<pattern>'…
export function loadOptionalTextures(baseUrl: string): Promise<Map<string, Texture>>; // 個別載入失敗就忽略
export function jaggedPath(from: Pt, to: Pt, segments: number, rng: Rng): Pt[];
export function floatingText(hit: { damage: number; immune: boolean }): { text: string; color: string };
export class BattleView { constructor(host: HTMLElement, data: GameData, textures: Map<string, Texture>);
  sync(snapshot: Snapshot): void; handle(events: BattleEvent[]): void; destroy(): void }
```

- [ ] **Step 1：寫失敗的測試**
  - `jaggedPath`：起點和終點與輸入相同，長度為 `segments + 1`。
  - `floatingText`：`immune` 時文字是 `'無效'`；`{damage:12}` 時文字是 `'12'`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：實作。**
  - 小人：符文綠的方塊人，放在畫面左側約 20% 的位置。
  - 魔物：依屬性上色的方塊，上方有血條；魔王的大小是一般魔物的 2 倍。
  - 施法特效：
    - `bolt`：粒子彈。
    - `beam`：光束，0.2 秒內淡出。
    - `chain`：用 `jaggedPath` 一段一段串起來。
    - `nova`：擴散的環。
  - 命中：噴出粒子，並顯示 `floatingText`。
  - 狀態外觀：burn 是橘色閃爍，paralyze 是黃色電弧，freeze 是藍白色外框。
  - 貼圖：有貼圖就用 Sprite，沒有就用 Graphics 畫。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，截圖確認：魔物會生成、被打倒時有特效、在第 2 區會出現「無效」、閃電術會連鎖。
- [ ] **Step 6：Commit**：`feat(render): pixi battle view with placeholder shapes and effects`

---

### Task 12：React 介面（入門、斷線、HUD、背包、地點、合成）

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/useGame.ts`, `src/ui/messages.ts`, `src/ui/Onboarding.tsx`, `src/ui/OfflineOverlay.tsx`, `src/ui/Hud.tsx`, `src/ui/InventoryBar.tsx`, `src/ui/ZonePanel.tsx`, `src/ui/SynthesisPanel.tsx`
- Modify: `src/main.tsx`
- Test: `src/ui/SynthesisPanel.test.tsx`, `src/ui/messages.test.ts`, `src/ui/Onboarding.test.tsx`

**Interfaces:**
- Consumes：`GameRuntime`、`SyncController`、`ApiClient`、`readToken`、`writeToken`。
- Produces：
  - `useGame(runtime): Snapshot`
  - `synthMessage(result: SynthResult, data: GameData): string`，文字固定如下：
    - learned：`習得新魔法：${name}`
    - duplicate：`已習得 ${name}，退還部分元素`
    - noReaction：`沒有反應……材料損耗了一部分`
    - knownNoReaction：`這個組合沒有反應`
    - dormant：`似乎還缺少什麼……`
    - rejected/insufficient：`材料不足`
    - rejected/slots：`請放入兩個素材`

**`main.tsx` 的開機流程：**
1. 用 `readToken` 讀取權杖。
2. 沒有權杖時，顯示 `<Onboarding>` 讓玩家輸入顯示名稱，接著 `createGuest` → `writeToken`。
3. 有權杖時，呼叫 `loadSave`。
4. 建立 `GameRuntime` 和 `SyncController`，呼叫 `startLoop`，然後 render `<App>`。

**例外情況：**
- 開機時 `NetworkError`：顯示「需要連線才能遊玩」和「重試」按鈕。
- 收到 401：清掉權杖，回到 `Onboarding`。

**畫面元件：**
- **`OfflineOverlay`：** `status === 'offline'` 時蓋在整個畫面上，顯示「連線中斷，正在重新連線…」。
- **版面：**
  - 桌面（≥ 768px）：上方 HUD；中間左邊是戰鬥畫面，右邊是分頁（合成 / 魔導書 / 地圖）；下方是背包列。
  - 手機（< 768px）：直式排列，戰鬥畫面高 45vh。
- **HUD：** 地點、階級、裝備中的魔法；越級時顯示 `越級：掉落效益 75%`，數字由 `overlevelEfficiency` 算出。
- **背包列：** 點物品就放進第一個空的合成槽；數量 ≥ 3 而且還沒到最高階的元素，旁邊顯示「升階」按鈕。
- **合成面板：**
  - 兩個合成槽，點槽位可以移除裡面的物品。
  - 「合成」按鈕只有在兩格都填滿、背包數量足夠、而且沒有合成進行中時才能按。
  - 合成透過 `sync.synthesize` 進行，等待中顯示「嬗變中…」。
  - 嘗試紀錄：列出每個組合的嘗試次數，以及每種結果的出現頻率百分比；無反應的組合標示「無反應」。
- **地點面板：** 已解鎖的地點可以點擊前往；未解鎖的地點顯示鎖頭並停用。

- [ ] **Step 1：寫失敗的測試**
  - `synthMessage`：每種結果一個案例，文字完全相同。
  - `SynthesisPanel`：
    - 填滿兩格後按鈕可以按；
    - 只填一格時按鈕停用；
    - 背包只有 1 個 `el:fire:1` 卻點了兩次時，按鈕停用；
    - `synthPending` 時按鈕停用；
    - 按下按鈕後，以排序過的 inputs 呼叫 `sync.synthesize`，並顯示回傳的訊息。
  - `Onboarding`：名稱空白或超過 16 字時不送出；合法名稱會呼叫 `createGuest`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，在 1280px 和 360px 兩種寬度下確認沒有橫向捲軸，並完成「取名 → 打怪 → 合成雷電術 → 裝備」。接著在 DevTools 把網路切成 Offline，確認斷線遮罩出現；切回 Online 後遊戲恢復。
- [ ] **Step 6：Commit**：`feat(ui): onboarding, offline overlay, hud, inventory, zones and synthesis`

---

### Task 13：魔導書面板（五屬扇形 SVG）

**Files:**
- Create: `src/ui/grimoire-layout.ts`, `src/ui/GrimoirePanel.tsx`
- Test: `src/ui/grimoire-layout.test.ts`, `src/ui/GrimoirePanel.test.tsx`

**Interfaces:**
- Produces：`layoutGrimoire(spells: SpellDef[]): { nodes: { spellId: string; x: number; y: number }[]; edges: { from: string; to: string }[] }`。中心是 (0, 0)，正上方是 0°。

**位置規則：**
- 屬性 i 的扇形中心角度為 `i × 72°`。
- `ring` 對應半徑 `[0, 120, 185, 250]`，角度再加上 `offset × 14°`。
- 混合魔法放在兩個相鄰屬性的交界：取順時針方向較前面的屬性 i，角度為 `i × 72 + 36`，半徑 215。
- 每個前置魔法都畫一條邊連到它的後續魔法。

**互動：**
- 已學會的節點：實心。點一下就裝備；裝備中的節點加上琥珀金外框。
- 未學會的節點：只有外框。點一下顯示殘卷提示（`hint`）。
- 支援縮放和平移：滾輪、拖曳、雙指，或縮放按鈕。
- 五芒星區域只畫一層霧，第一版不放節點。

- [ ] **Step 1：寫失敗的測試**
  - `mana_bolt` 在 (0, 0)。
  - `fireball` 約在 (0, −120)。
  - `steam_burst` 的角度約 324°，半徑 215。
  - `fire_whirl` 的角度約 36°。
  - 邊包含 `flame_burst → fire_whirl` 和 `whirlwind → fire_whirl`。
  - `GrimoirePanel`：點已學會的節點會呼叫 `runtime.equip`；點未學會的節點會顯示 `hint`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：Commit**：`feat(ui): radial grimoire panel with hybrid boundary nodes`

---

### Task 14：README、美術素材清單、部署

**Files:**
- Modify: `README.md`, `wrangler.jsonc`（填入 `database_id`）
- Create: `docs/art-assets.md`
- Test: `src/render/assets.test.ts`

- [ ] **Step 1：改寫 `README.md`。** 內容包含：
  - 遊戲概念；
  - 本機開發：`npm i`、`npm run db:migrate:local`、`npm run dev`、`npm test`；
  - 部署：`npx wrangler login` → `npx wrangler d1 create infinite-grimoire` → 把 id 填進 `wrangler.jsonc` → `npx wrangler d1 migrations apply DB --remote` → `npm run deploy`；
  - 連結到 spec 和這份 plan；
  - 「貼圖替換」一節：把檔案放到 `public/assets/<key>.png`。
- [ ] **Step 2：撰寫 `docs/art-assets.md`。** 涵蓋 `ASSET_KEYS` 的每一項，每項包含：
  - key 和檔名；
  - 用途；
  - 尺寸：角色和魔物 32×32、魔王 64×64、特效 32×32 sprite sheet；
  - 影格數；
  - 可以直接給 AI 繪圖工具用的英文提示詞。

  再加上測試 `art-assets doc covers all ASSET_KEYS`。
- [ ] **Step 3：** 執行 `npm test && npm run build`，預期全部 PASS。
- [ ] **Step 4：** 執行 `npm run dev` 從頭玩一次：
  - 取名；
  - 打倒魔王 1；
  - 在第 2 區看到「無效」；
  - 合成 T4 魔法後打倒魔王 2；
  - 重新整理頁面後，進度從伺服器載回來。
- [ ] **Step 5：** **請使用者執行**：在終端機輸入 `! npx wrangler login`，登入 Cloudflare。登入後依 README 的步驟建立 D1、套用 migration，並執行 `npm run deploy`。部署是對外發布的動作，執行前要先取得使用者同意。
- [ ] **Step 6：Commit**：`docs: rewrite README, add art asset list and deployment steps`

---

## 完成後

- 網域之後在 Cloudflare Registrar 購買，並綁定到這個 Worker。
- 合併到 `main` 和 push 之前，要先詢問使用者。
