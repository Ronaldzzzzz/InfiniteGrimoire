# Infinite Grimoire MVP（自動戰鬥 + 合成換魔法）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 做出可以在瀏覽器裡玩的第一版。小人自動打怪、掉元素；玩家用元素合成魔法、換上魔法，馬上看到戰鬥效果變化；打倒魔王後解鎖下一個地點。

**Architecture：** 遊戲邏輯放在 `src/engine/`，是純 TypeScript，不 import React、Pixi 或 DOM。所有規則都用 Vitest 測試，並用可指定種子的亂數讓結果可以重現。`src/game/` 是執行層，負責固定時間步進、動作、存檔和訂閱。`src/render/` 用 Pixi 畫戰鬥畫面，`src/ui/` 用 React 畫操作面板。內容全部放在 `src/data/*.json`，載入時用 zod 檢查。

**Tech Stack：** Node 22、Vite 8、TypeScript、React 19、Pixi.js 8、zod 4、Vitest 5、@testing-library/react 16、jsdom。

**Spec：** `docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md`（第 6 節是第一版範圍，第 4 節是規則來源）

## Global Constraints

- 介面文字一律使用繁體中文。資料中的每個名稱都要附 `nameEn` 欄位。
- 小人**沒有血條、永遠不會死**：任何地方都不能出現小人的血量或死亡。
- 屬性相剋的倍率限制在 **0.9～1.1**，也就是最多 ±10%。
- 傷害門檻：設魔物為 M 階。魔法階級 ≥ M − 1，**或**魔法攻擊力 ≥ 魔物防禦值 × 0.7，才會造成傷害；否則傷害為 0。
- 越級效益：d = 魔法階級 − M。d ≥ 2 時效益 = `0.5 + 0.5 * k^(d-1)`，k 預設 0.5；d < 2 時效益為 1。效益套用在掉落上。
- 階級範圍是 1～20。
- 元素 id 和圓圈上的排列順序是 `fire, wind, thunder, earth, water`。在這個順序中相鄰的屬性才算「相鄰」。
- 執行期間不發出任何網路請求，只會讀取本站自己的靜態檔。
- 所有 `localStorage` 讀寫都要包 try/catch。儲存失敗時遊戲照常運作。
- 存檔包含 `version: 1`。
- 版面在 360px 寬的手機上要能使用。所有操作都可以用點擊完成，不能只支援拖曳。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`。元素色：火 `#e2643b`、風 `#7fd0c0`、雷 `#f3e36b`、土 `#c79a5a`、水 `#5aa0e8`、無屬性 `#b8c7ff`。
- 第一版不出現光暗、煉金、商店、金幣、稱號、轉生、離線收益。

## Review Focus

1. **壞掉或格式不符的存檔：** `localStorage` 裡的資料損壞、版本不對或引用不存在的 id 時，遊戲要能開始新局並備份舊資料，不能白屏。由 Task 6 測試。
2. **背景分頁回來或單一影格很長：** 一次跑太多步會卡死，所以每次補算最多 1 秒，不要一次補幾分鐘。由 Task 7 測試。
3. **合成槽不完整或數量不足：** 只放一格，或同一個元素放兩格但只有 1 個時，要直接拒絕、不消耗任何東西，按鈕顯示為停用。由 Task 4 和 Task 10 測試。
4. **裝備的魔法打不動目前的魔物：** 玩家會以為是 bug，所以每一下都要產生 `immune` 事件，畫面上浮出「無效」。由 Task 5 和 Task 9 測試。
5. **前往尚未解鎖的地點：** 拒絕前往，狀態不變。由 Task 3 測試。

---

## 檔案結構

```
index.html
vite.config.ts                  base: '/InfiniteGrimoire/'
.github/workflows/deploy.yml    GitHub Pages
src/main.tsx
src/engine/                     純邏輯，不可 import react/pixi/DOM
  rng.ts                        mulberry32 種子亂數
  types.ts                      ElementId、ItemId、各種定義與狀態型別
  data.ts                       zod schema + loadGameData（交叉檢查）
  combat-rules.ts               canDamage / overlevelEfficiency / affinity / computeHit
  inventory.ts                  addItems / removeItems / upgradeElement
  state.ts                      createInitialState / equipSpell / travel
  synthesis.ts                  comboKey / synthesize
  battle.ts                     createBattle / stepBattle
  save.ts                       serialize / deserialize
src/data/                       spells.json recipes.json monsters.json zones.json
src/game/
  runtime.ts                    GameRuntime（固定步進、動作、訂閱）
  persistence.ts                loadGame / saveGame（localStorage）
  loop.ts                       startLoop（rAF + 自動存檔）
src/render/
  palette.ts                    色票
  assets.ts                     選用貼圖載入（沒有就用佔位圖）
  effects.ts                    施法、命中、狀態、浮動文字的特效
  battle-view.ts                BattleView（Pixi 場景）
src/ui/
  App.tsx  App.css  useGame.ts  messages.ts
  BattleCanvas.tsx  Hud.tsx  InventoryBar.tsx  ZonePanel.tsx
  SynthesisPanel.tsx  GrimoirePanel.tsx  grimoire-layout.ts
tests/sim/bot.ts  tests/sim/pure-paths.test.ts
docs/art-assets.md  README.md
```

測試檔和被測檔放在同一個資料夾，命名為 `*.test.ts(x)`；模擬測試放在 `tests/sim/`。

---

### Task 1：專案骨架 + 種子亂數

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `.github/workflows/deploy.yml`, `src/engine/rng.ts`
- Test: `src/engine/rng.test.ts`

**Interfaces:**
- Produces: `interface Rng { next(): number /* [0,1) */; int(min: number, max: number): number /* 含兩端 */ }`、`createRng(seed: number): Rng`、`pickWeighted<T>(rng: Rng, items: { value: T; weight: number }[]): T`

- [ ] **Step 1：安裝套件**
  執行 `npm init -y`，然後安裝：
  - `npm i react@19 react-dom@19 pixi.js@8 zod@4`
  - `npm i -D vite@8 @vitejs/plugin-react@6 typescript @types/react @types/react-dom vitest@5 jsdom @testing-library/react@16 @testing-library/dom`

  在 `package.json` 加入 scripts：`"dev": "vite"`、`"build": "tsc --noEmit && vite build"`、`"test": "vitest run"`。
  `tsconfig.json` 設定 `strict: true`、`jsx: react-jsx`、`moduleResolution: bundler`、`resolveJsonModule: true`。
  `vite.config.ts` 設定 `base: '/InfiniteGrimoire/'`，並設定 vitest 的 `environment: 'node'`。UI 測試檔開頭寫 `// @vitest-environment jsdom`。
  `src/main.tsx` 先只渲染一行 `<h1>無限魔導書</h1>`。
- [ ] **Step 2：寫失敗的測試** `rng.test.ts`
  - `same seed gives same sequence`：`createRng(42)` 連續 5 次 `next()` 的結果，和另一個 `createRng(42)` 的結果相等。
  - `int stays in range`：`int(1,3)` 跑 1000 次，結果都屬於 `{1,2,3}`，而且三個值都出現過。
  - `pickWeighted respects weights`：權重 `[{a,92},{b,8}]` 抽 10000 次，`b` 的比例落在 0.06～0.10。
  - `pickWeighted single item`：只有一個項目時永遠回傳它。
- [ ] **Step 3：** 執行 `npx vitest run src/engine/rng.test.ts`，預期 FAIL（模組不存在）。
- [ ] **Step 4：** 用 mulberry32 實作 `rng.ts`。
- [ ] **Step 5：** 執行 `npm test && npm run build`，預期全部通過，並產生 `dist/`。
- [ ] **Step 6：** 建立 `deploy.yml`：push 到 `main` 時觸發，流程是 `npm ci` → `npm test` → `npm run build`，再用 `actions/upload-pages-artifact`（path `dist`）和 `actions/deploy-pages` 部署。
- [ ] **Step 7：Commit**：`chore: scaffold vite react ts project with seeded rng`

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
- Produces（`data.ts`）：`loadGameData(raw: { spells: unknown; recipes: unknown; monsters: unknown; zones: unknown }): GameData`，資料有問題時丟出 `DataError`，訊息列出全部問題；`export const gameData: GameData`，由四個 JSON 載入。

- [ ] **Step 1：寫失敗的測試** `data.test.ts`
  - `real data loads`：`gameData` 載入成功，`gameData.spells.mana_bolt.tier === 1`。
  - `rejects tier out of range`：把某個魔法的 tier 改成 21，丟出包含 `tier` 的錯誤。
  - `rejects unknown prerequisite / outcome / monster / boss / item references`：每種錯誤各一個案例，都會丟出錯誤。
  - `rejects recipe with inputs.length !== 2`。
  - `every non-starting spell is an outcome of some recipe`：每個魔法都有辦法取得。
  - `every zone drops all five grade-1 elements`：每個地點的一般魔物合起來會掉五種初階元素（規格 4.1）。
  - `hybrid spells have exactly two adjacent elements`：`elements.length === 2` 的魔法，兩個屬性在 `ELEMENT_ORDER` 的環上相鄰。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作 `types.ts` 和 `data.ts`，交叉檢查要涵蓋上面所有測試。
- [ ] **Step 4：寫入第一版內容 JSON。** 這一步只決定 id、階級、模式和配方結構；攻擊力、血量、防禦、掉落率等數值先填合理的初始值，Task 8 會再調整。
  - **魔法**（`id` 名稱 / 階級 / 模式 / 狀態）：
    - `mana_bolt` 魔力彈 / T1 / bolt / 無屬性（`elements: []`，`grimoire.ring: 0`）
    - 火：`fireball` 火球術 T2 bolt burn → `flame_burst` 烈焰術 T4 beam burn → `explosion` 爆炎 T5 nova burn
    - 風：`wind_blade` 風刃 T2 bolt → `whirlwind` 旋風 T4 nova → `vacuum_slash` 真空斬 T5 beam
    - 雷：`thunder_bolt` 雷電術 T2 bolt paralyze → `lightning` 閃電術 T4 chain（chainCount 3）paralyze → `thunderstorm` 雷暴 T5 nova paralyze
    - 土：`pebble` 石礫 T2 bolt → `rock_spear` 岩槍 T4 beam → `earthquake` 地震 T5 nova paralyze
    - 水：`water_shot` 水彈 T2 bolt → `ice_spike` 冰錐 T4 beam freeze → `tsunami` 海嘯 T5 nova freeze
    - 混合：`fire_whirl` 火焰旋風（fire + wind）T6 nova burn，前置 `flame_burst` 和 `whirlwind`；`steam_burst` 蒸氣爆發（water + fire）T6 chain，前置 `ice_spike` 和 `flame_burst`。
    - 每條屬性線：T2 沒有前置，T4 前置 T2，T5 前置 T4。
    - `grimoire` 位置：T2 是 `ring 1, offset 0`，T4 是 `ring 2, offset -1`，T5 是 `ring 2, offset 1`。混合魔法用 `ring 3`，位置由 Task 11 依兩個屬性計算。
  - **配方**（每個屬性 X）：
    - `[el:X:1, el:X:1]` → T2 魔法，權重 100
    - `[el:X:2, el:X:2]` → T4 權重 92、T5 權重 8
    - `[el:X:2, mat:mana_crystal]` → T5 權重 100
    - 混合：`[el:fire:2, el:wind:2]` → `fire_whirl`；`[el:water:2, el:fire:2]` → `steam_burst`。
  - **地點**（`order` / 一般魔物階級 / 魔王階級）：
    - `mist_meadow` 迷霧草原（1 / T1 / 魔王 T2）
    - `thunder_gorge` 雷鳴峽谷（2 / T3 / 魔王 T4）
    - `ash_volcano` 灰燼火山（3 / T5 / 魔王 T6）
    - 每個地點有 3 種一般魔物，屬性至少涵蓋兩種，再加 1 隻 `boss: true`。
    - 第 2、3 個地點的魔物會掉 `mat:mana_crystal`。
    - 第 2 個地點一般魔物的防禦值必須大於 `mana_bolt.attack / 0.7`，確保初始魔法打不動。
  - **殘卷提示**：每個魔法都要有 `hint`，例如閃電術是「據說兩股凝聚的雷鳴相撞時，會迸出連鎖的電光……」。
- [ ] **Step 5：** 執行 `npx vitest run src/engine/data.test.ts`，預期 PASS。
- [ ] **Step 6：Commit**：`feat(engine): add data schema, validation and MVP content`

---

### Task 3：戰鬥規則、背包與遊戲狀態

**Files:**
- Create: `src/engine/combat-rules.ts`, `src/engine/inventory.ts`, `src/engine/state.ts`
- Test: `src/engine/combat-rules.test.ts`, `src/engine/inventory.test.ts`, `src/engine/state.test.ts`

**Interfaces:**
- Consumes：Task 2 的型別。
- Produces：
```ts
// combat-rules.ts
export const OVERLEVEL_K = 0.5;
export function canDamage(spell: { tier: number; attack: number }, monster: { tier: number; defense: number }): boolean;
export function overlevelEfficiency(spellTier: number, monsterTier: number, k?: number): number;
export function affinityMultiplier(spellElements: ElementId[], monsterElement: ElementId): number; // 0.9 | 1 | 1.1
export function computeHit(spell: SpellDef, monster: MonsterDef, opts: { frozen: boolean }): number; // 0 表示免疫
// inventory.ts
export function addItems(inv: Inventory, items: ItemId[]): Inventory;
export function removeItems(inv: Inventory, items: ItemId[]): Inventory | null; // 數量不足回傳 null（多重集合）
export function upgradeElement(inv: Inventory, element: ElementId, grade: number): Inventory | null; // 3 個 grade → 1 個 grade+1
// state.ts
export interface SynthLogEntry { attempts: number; results: Record<string, number>; noReaction: boolean }
export interface GameState { version: 1; inventory: Inventory; learned: string[]; equipped: string;
  currentZone: string; unlockedZones: string[]; defeatedBosses: string[];
  zoneKills: Record<string, number>; synthesisLog: Record<string, SynthLogEntry> }
export function createInitialState(data: GameData): GameState;
export function equipSpell(state: GameState, spellId: string): GameState;      // 未學會就原樣回傳
export function travel(state: GameState, zoneId: string): GameState | null;     // 未解鎖回傳 null
```

- [ ] **Step 1：寫失敗的測試**
  - `canDamage`：
    - `{tier:9}` 打 `{tier:10, defense:1000}` → true
    - `{tier:8, attack:10}` 打 `{tier:10, defense:100}` → false
    - `{tier:8, attack:70}` 打 `{tier:10, defense:100}` → true（剛好 70%）
    - `{tier:8, attack:69}` 打同一隻 → false
  - `overlevelEfficiency`：`(10,10)=1`、`(11,10)=1`、`(12,10)=0.75`、`(13,10)=0.625`、`(14,10)≈0.5625`、`(20,1)` 落在 0.5～0.5001。
  - `affinityMultiplier`：
    - 相剋表（攻方 → 被剋方）：water→fire、fire→wind、wind→earth、earth→thunder、thunder→water。
    - `(['water'],'fire')=1.1`、`(['fire'],'water')=0.9`、`([],'fire')=1`。
    - 混合魔法取各屬性倍率中的最大值：`(['water','fire'],'fire')=1.1`。
    - 所有組合的結果都在 [0.9, 1.1] 之間。
  - `computeHit`：不能造成傷害時回傳 0；可以時回傳 ≥ 1 的整數；`frozen: true` 時的結果比 false 大。
  - `removeItems`：`{a:1}` 移除 `['a','a']` → null，而且原物件不變；`{a:2}` 移除 `['a','a']` → `{a:0}` 或刪掉該鍵都可以。
  - `upgradeElement`：3 個 `el:fire:1` → 得到 1 個 `el:fire:2`；只有 2 個 → null；grade 為 3 → null。
  - `createInitialState`：`learned=['mana_bolt']`，`equipped='mana_bolt'`，`currentZone` 和 `unlockedZones` 都是 `zones[0].id`，`version=1`。
  - `travel` 到未解鎖的地點 → null（Review Focus 5）；到已解鎖的地點 → 新狀態，`currentZone` 已更新。
  - `equipSpell` 指定未學會的魔法 → 原樣回傳。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：實作。** `computeHit` 的公式：

  ```
  round(attack × 100 / (100 + defense) × affinity × (frozen ? 1.15 : 1))
  ```

  可以造成傷害時，結果至少為 1。所有函式都不修改傳入的物件。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): combat rules, inventory and game state`

---

### Task 4：合成

**Files:**
- Create: `src/engine/synthesis.ts`
- Test: `src/engine/synthesis.test.ts`

**Interfaces:**
- Consumes：`removeItems`、`addItems`、`GameState`、`pickWeighted`、`Rng`。
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
export function comboKey(inputs: ItemId[]): string;   // 排序後用 '+' 串起來
export function synthesize(state: GameState, inputs: ItemId[], data: GameData, rng: Rng): { state: GameState; result: SynthResult };
```

規則（依序判斷）：
1. `inputs.length !== 2` → `rejected/slots`，不消耗任何東西。
2. 背包數量不足 → `rejected/insufficient`，不消耗任何東西。
3. 沒有對應的配方：
   - 紀錄中已經標記為 `noReaction` → `knownNoReaction`，不消耗。
   - 否則消耗排序後的第一個材料，記錄 `attempts+1`、`results.none+1`、`noReaction=true`，回傳 `noReaction`。
4. 有配方，但沒有任何結果的前置條件已滿足 → `dormant`，不消耗，也不記錄。
5. 從前置條件已滿足的結果中依權重抽一個，消耗全部材料，記錄 `attempts+1`、`results[spellId]+1`。
   - 已經學會的魔法 → `duplicate`，退還排序後的第一個材料。
   - 否則加入 `learned`，回傳 `learned`。

- [ ] **Step 1：寫失敗的測試**，每條規則一個測試。
  - `rejects one slot without consuming`
  - `rejects same element twice when only one owned`：Review Focus 3，背包是 `{el:fire:1:1}`，輸入 `[el:fire:1, el:fire:1]`。
  - `first invalid combo consumes one item and logs noReaction`
  - `second invalid combo consumes nothing`
  - `dormant when prerequisite missing`：沒學雷電術時，用 `[el:thunder:2, el:thunder:2]`，背包不變。
  - `learns T2 spell from two grade-1 elements`
  - `duplicate refunds one input`
  - `outcome with unmet prereq is never rolled`：已學雷電術、沒學閃電術，用 `[el:thunder:2, el:thunder:2]` 跑 200 次，每次都從同一個狀態開始，結果都是 learned `lightning`，從來不會抽到 `thunderstorm`（雷暴的前置是閃電術）。
  - `comboKey is order-insensitive`
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作 `synthesis.ts`。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): spell synthesis with prerequisites and attempt log`

---

### Task 5：戰鬥模擬

**Files:**
- Create: `src/engine/battle.ts`
- Test: `src/engine/battle.test.ts`

**Interfaces:**
- Consumes：`combat-rules`、`addItems`、`GameState`、`GameData`、`Rng`。
- Produces：
```ts
export const STEP_MS = 50;
export interface ActiveStatus { kind: StatusKind; remainingMs: number }
export interface MonsterInstance { uid: number; defId: string; hp: number; maxHp: number;
  x: number /* 1 = 畫面右緣，0 = 小人位置 */; statuses: ActiveStatus[] }
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
  { game: GameState; battle: BattleState; events: BattleEvent[] };   // 每次前進 STEP_MS
```

行為：
- **生成：** 沒有魔王時，每 `spawnIntervalMs` 生成一隻一般魔物，種類從 `zone.monsters` 隨機挑，位置 `x = 1`，最多同時存在 `maxAlive` 隻。
- **移動：** 魔物每秒往小人移動 0.1，停在 `x = 0.15`。
- **回血：** 魔物每秒回復 `regenPerSec`，上限是最大血量。
- **狀態：**
  - `paralyze` 和 `freeze`：停止移動和回血。
  - `freeze`：另外讓受到的傷害 ×1.15，由 `computeHit` 處理。
  - `burn`：每秒造成原始命中傷害 20% 的持續傷害。
- **施法：** `castTimerMs` 累積到 `equipped.cooldownMs` 時施放，目標選 `x` 最小的魔物。
  - `bolt`：1 個目標。
  - `beam`：最近的 2 個。
  - `chain`：最近的 1 個，再加最多 `chainCount` 個，第 i 跳的傷害 ×0.7^i。
  - `nova`：全部，每個 ×0.6。
  - 每個目標各自擲 `status.chance`。
  - `computeHit` 為 0 時，發出 `hit` 事件，`immune: true`。
- **擊殺：**
  - 每個掉落項目以 `chance × overlevelEfficiency(spell.tier, monster.tier)` 的機率掉落，數量在 `min..max` 之間，加進背包。
  - 一般魔物：`zoneKills[zone]+1`。累積到 `killsForBoss` 時生成魔王（`bossActive = true`），並把 `zoneKills` 歸零。
  - 魔王：加入 `defeatedBosses`（不重複），解鎖 `order + 1` 的地點，發出 `bossDefeated` 事件，`bossActive = false`。

- [ ] **Step 1：寫失敗的測試**，使用一份測試專用的小型 `GameData` fixture。
  - `spawns up to maxAlive`
  - `mana_bolt vs tier-3 monster emits immune hits and never kills`：跑 60 秒模擬時間（Review Focus 4）。
  - `kills add drops and zoneKills`
  - `boss spawns after killsForBoss and unlocks next zone on defeat`
  - `defeating last zone boss unlocks nothing`：`unlockedZoneId` 為 null。
  - `chain hits up to chainCount+1 targets with falloff`
  - `paralyze stops movement and regen`
  - `overlevel reduces drops`：同一個種子下，T12 魔法打 T10 魔物的平均掉落，大約是 T10 魔法打 T10 的 75%，誤差 ±5%，跑 2000 次擊殺。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作 `battle.ts`。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(engine): auto battle simulation with bosses and zone unlock`

---

### Task 6：存檔

**Files:**
- Create: `src/engine/save.ts`, `src/game/persistence.ts`
- Test: `src/engine/save.test.ts`, `src/game/persistence.test.ts`

**Interfaces:**
- Produces：
```ts
// save.ts
export function serialize(state: GameState): string;
export function deserialize(text: string, data: GameData): GameState | null; // 格式錯誤或 version !== 1 回傳 null；不認識的魔法或地點 id 直接濾掉
// persistence.ts
export const SAVE_KEY = 'infinite-grimoire.save';
export function loadGame(storage: Storage | null, data: GameData): { state: GameState; recovered: boolean };
export function saveGame(storage: Storage | null, state: GameState): boolean;
```

- [ ] **Step 1：寫失敗的測試**
  - `roundtrip`：`deserialize(serialize(s))` 和 `s` 深度相等。
  - `rejects wrong version / garbage JSON` → null。
  - `filters unknown spell ids and falls back equipped to mana_bolt`。
  - `loadGame with corrupt save`（Review Focus 1）：回傳初始狀態，`recovered = true`，原始字串另存到 `infinite-grimoire.save.corrupt-<timestamp>`。
  - `loadGame with throwing storage`：存取時會丟例外的 storage，回傳初始狀態，不丟錯。
  - `saveGame returns false when setItem throws`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。`deserialize` 用 zod 檢查 `GameState` 的結構。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat: versioned save with corrupt-save recovery`

---

### Task 7：GameRuntime 與主迴圈

**Files:**
- Create: `src/game/runtime.ts`, `src/game/loop.ts`
- Test: `src/game/runtime.test.ts`

**Interfaces:**
- Consumes：Task 3～6 的全部函式。
- Produces：
```ts
export const MAX_CATCHUP_MS = 1000;
export interface Snapshot { game: GameState; battle: BattleState }
export class GameRuntime {
  constructor(data: GameData, state: GameState, rng: Rng);
  readonly data: GameData;
  getSnapshot(): Snapshot;                         // 狀態沒變時回傳同一個參考，給 useSyncExternalStore 用
  subscribe(listener: () => void): () => void;
  onEvents(listener: (events: BattleEvent[]) => void): () => void;
  advance(elapsedMs: number): void;                // 截到 MAX_CATCHUP_MS，切成 STEP_MS 一步一步跑，剩餘時間留到下次
  synthesize(inputs: ItemId[]): SynthResult;
  upgrade(element: ElementId, grade: number): boolean;
  equip(spellId: string): void;
  travel(zoneId: string): boolean;                 // 成功時重建 BattleState
}
// loop.ts
export function startLoop(runtime: GameRuntime, storage: Storage | null): () => void;
// requestAnimationFrame 驅動 advance；每 10 秒、visibilitychange 變成 hidden、以及 pagehide 時呼叫 saveGame
```

- [ ] **Step 1：寫失敗的測試**
  - `advance clamps huge elapsed`（Review Focus 2）：`advance(600000)` 最多只跑 `MAX_CATCHUP_MS / STEP_MS` 步，可以用 `vi.spyOn` 去數 `stepBattle` 被呼叫的次數；而且執行時間要小於 50ms。
  - `leftover time carries over`：`advance(30)` 跑兩次，等於跑 1 步。
  - `travel rebuilds battle and notifies subscribers`。
  - `synthesize success notifies subscribers`。
  - `getSnapshot stable when nothing changed`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行測試，預期 PASS。
- [ ] **Step 5：Commit**：`feat(game): runtime with fixed-step loop and autosave`

---

### Task 8：數值平衡與五條專精路線模擬測試

**Files:**
- Create: `tests/sim/bot.ts`, `tests/sim/pure-paths.test.ts`
- Modify: `src/data/*.json`（只調數值）

**Interfaces:**
- Consumes：`GameRuntime`、`gameData`。
- Produces：`runBot(opts: { element: ElementId | null; seed: number; maxSimMs: number }): { clearedZones: string[]; learned: string[]; simMs: number }`。

  機器人每模擬 1 秒做一次決策，依序：
  1. 把指定屬性的元素升階；
  2. 依 T2 → T4 → T5 嘗試合成該屬性的魔法；
  3. 裝備可用魔法中階級最高的那個；
  4. 有新地點解鎖時前往。

  `element: null` 的機器人只用 `mana_bolt`，不做任何合成。

- [ ] **Step 1：寫測試** `pure-paths.test.ts`
  - 五個屬性各一個測試：`pure <element> path clears all MVP zones within 3 simulated hours`，條件是 `clearedZones` 包含三個地點，而且 `learned` 只有 `mana_bolt` 和該屬性的魔法（規格 6 的驗收條件）。
  - `mana_bolt only cannot clear thunder_gorge`：`null` 機器人在 3 小時內只會打倒 `mist_meadow` 的魔王。
  - `each pure path needs the third zone to take at least 20 simulated minutes`：防止數值太鬆，讓推力消失。
- [ ] **Step 2：** 執行 `npx vitest run tests/sim`，觀察哪些測試失敗。
- [ ] **Step 3：** 只改 `src/data/*.json` 的數值，直到測試全部通過，不改規則程式。
- [ ] **Step 4：** 執行 `npm test`，預期全部 PASS。
- [ ] **Step 5：Commit**：`test: pure element path simulations and MVP balance`

---

### Task 9：Pixi 戰鬥畫面（佔位圖 + 選用貼圖）

**Files:**
- Create: `src/render/palette.ts`, `src/render/assets.ts`, `src/render/effects.ts`, `src/render/battle-view.ts`, `src/ui/BattleCanvas.tsx`
- Test: `src/render/effects.test.ts`

**Interfaces:**
- Consumes：`GameRuntime.getSnapshot / onEvents`。
- Produces：
```ts
// palette.ts
export const COLORS: { bg: string; rune: string; amber: string; element: Record<ElementId | 'none', string> };
export function spellColor(spell: SpellDef): string;          // 混合魔法用第一個屬性的顏色
// assets.ts
export const ASSET_KEYS: string[];                             // 'hero_idle', 'monster_<id>', 'fx_<pattern>'…
export function loadOptionalTextures(baseUrl: string): Promise<Map<string, Texture>>; // 個別失敗就忽略
// effects.ts（純幾何函式，可以測試）
export function jaggedPath(from: Pt, to: Pt, segments: number, rng: Rng): Pt[];
export function floatingText(hit: { damage: number; immune: boolean }): { text: string; color: string };
// battle-view.ts
export class BattleView { constructor(host: HTMLElement, data: GameData, textures: Map<string, Texture>);
  sync(snapshot: Snapshot): void; handle(events: BattleEvent[]): void; destroy(): void }
```

- [ ] **Step 1：寫失敗的測試** `effects.test.ts`
  - `jaggedPath` 的起點和終點都等於輸入，長度為 `segments + 1`。
  - `floatingText({immune:true})` 的文字是 `'無效'`；`{damage:12}` 的文字是 `'12'`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：實作。**
  - **小人：** 符文綠色的方塊人，放在畫面左側約 20% 的位置。
  - **魔物：** 依屬性上色的方塊，上方有血條；魔王的尺寸是一般魔物的 2 倍。
  - **施法特效：**
    - `bolt`：發光的粒子彈。
    - `beam`：粗光束，0.2 秒內淡出。
    - `chain`：用 `jaggedPath` 一隻接一隻連下去。
    - `nova`：從小人位置往外擴散的環。
  - **命中：** 噴出粒子，並顯示 `floatingText`。
  - **狀態外觀：**
    - `burn`：橘色閃爍。
    - `paralyze`：黃色電弧。
    - `freeze`：外框變藍白色。
  - **貼圖：** 有貼圖就用 Sprite，沒有就用 Graphics 畫佔位圖。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，在暫時的 `App` 裡掛上 `BattleCanvas` 並截圖，確認：
  - 魔物會生成，被打倒時有特效；
  - 第 2 個地點出現「無效」；
  - 換成閃電術時可以看到連鎖。
- [ ] **Step 6：Commit**：`feat(render): pixi battle view with placeholder shapes and effects`

---

### Task 10：React 介面（HUD、背包、地點、合成）

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/useGame.ts`, `src/ui/messages.ts`, `src/ui/Hud.tsx`, `src/ui/InventoryBar.tsx`, `src/ui/ZonePanel.tsx`, `src/ui/SynthesisPanel.tsx`
- Modify: `src/main.tsx`（建立 runtime：`loadGame` → `new GameRuntime` → `startLoop` → render `<App runtime>`）
- Test: `src/ui/SynthesisPanel.test.tsx`, `src/ui/messages.test.ts`

**Interfaces:**
- Consumes：`GameRuntime`、`SynthResult`、`overlevelEfficiency`。
- Produces：
  - `useGame(runtime): Snapshot`，用 `useSyncExternalStore` 實作。
  - `synthMessage(result: SynthResult, data: GameData): string`，文字固定如下：
    - learned：`習得新魔法：${name}`
    - duplicate：`已習得 ${name}，退還部分元素`
    - noReaction：`沒有反應……材料損耗了一部分`
    - knownNoReaction：`這個組合沒有反應`
    - dormant：`似乎還缺少什麼……`
    - rejected/insufficient：`材料不足`
    - rejected/slots：`請放入兩個素材`

**版面：**
- 桌面（≥ 768px）：上方 HUD；中間左邊是戰鬥畫面，右邊是分頁（合成 / 魔導書 / 地圖）；下方常駐背包列。
- 手機（< 768px）：上下排列，依序是 HUD、戰鬥畫面（高度 45vh）、分頁、背包。

**各區塊內容：**
- **HUD：** 地點名稱與階級、裝備中的魔法；越級時顯示 `越級：掉落效益 75%`，數字由 `overlevelEfficiency` 算出。
- **背包列：** 每個物品顯示名稱和數量，點一下就放進第一個空的合成槽。數量 ≥ 3 而且還沒到最高階的元素，旁邊顯示「升階」按鈕。
- **合成面板：**
  - 兩個合成槽，點槽位可以移除裡面的素材。
  - 「合成」按鈕：兩格都有素材、而且背包數量足夠時才能按（Review Focus 3）。
  - 結果訊息。
  - 嘗試紀錄：列出每個組合的 `attempts`，以及每種結果的出現頻率百分比（`results[x] / attempts`）；`noReaction` 的組合顯示「無反應」。
- **地點面板：** 列出所有地點。已解鎖的可以點擊前往，未解鎖的顯示鎖頭並停用。

- [ ] **Step 1：寫失敗的測試**
  - `synthMessage`：每種結果各一個案例，文字要完全相同。
  - `SynthesisPanel`：
    - 點兩個背包物品後，兩格都填滿，按鈕可以按；
    - 只填一格時按鈕停用；
    - 背包只有 1 個 `el:fire:1` 卻點了兩次時，按鈕停用；
    - 按下按鈕會以排序後的 inputs 呼叫 `runtime.synthesize`，並顯示訊息；
    - 合成結果是 `duplicate` 時，兩個合成槽都清空。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：** 執行 `npm run dev`，在 1280px 和 360px 兩種寬度下各截圖一次，確認沒有橫向捲軸、可以完成「打怪 → 合成雷電術 → 裝備」。
- [ ] **Step 6：Commit**：`feat(ui): hud, inventory, zones and synthesis panel`

---

### Task 11：魔導書面板（五屬扇形 SVG）

**Files:**
- Create: `src/ui/grimoire-layout.ts`, `src/ui/GrimoirePanel.tsx`
- Test: `src/ui/grimoire-layout.test.ts`, `src/ui/GrimoirePanel.test.tsx`

**Interfaces:**
- Consumes：`SpellDef.grimoire`、`ELEMENT_ORDER`、`GameRuntime.equip`。
- Produces：`layoutGrimoire(spells: SpellDef[]): { nodes: { spellId: string; x: number; y: number }[]; edges: { from: string; to: string }[] }`。座標系是以中心 (0, 0) 為原點，正上方是 0°。

**位置規則：**
- 屬性 i 的扇形中心角度是 `i × 72°`。
- `ring` 對應半徑 `[0, 120, 185, 250]`；角度為 `扇形中心 + offset × 14°`。
- 混合魔法（ring 3）：放在兩個相鄰屬性的交界角度上，也就是取順時針方向較前面那個屬性 i 的 `i × 72 + 36`，半徑 215。
- 連線：每個前置魔法都連一條線到該魔法。

**互動：**
- 已學會的節點用屬性色實心顯示，點一下就裝備，裝備中的節點加琥珀金外框。
- 未學會的節點只有外框，點一下顯示 `hint`（殘卷）。
- 面板支援滾輪縮放和拖曳平移；手機上用雙指縮放，或改用按鈕縮放。
- 五芒星區域在第一版只畫一層霧，不放節點。

- [ ] **Step 1：寫失敗的測試**
  - `mana_bolt at center`：位置是 (0, 0)。
  - `fireball at angle 0 radius 120`：位置約為 (0, −120)。
  - `steam_burst sits on water/fire boundary`：角度約 324°，半徑 215。
  - `fire_whirl sits on fire/wind boundary`：角度約 36°。
  - `edges include flame_burst→fire_whirl and whirlwind→fire_whirl`。
  - `GrimoirePanel`：點已學會的節點會呼叫 `runtime.equip(id)`；點未學會的節點會顯示該魔法的 `hint`。
- [ ] **Step 2：** 執行測試，預期 FAIL。
- [ ] **Step 3：** 實作。
- [ ] **Step 4：** 執行 `npm test`，預期 PASS。
- [ ] **Step 5：Commit**：`feat(ui): radial grimoire panel with hybrid boundary nodes`

---

### Task 12：README、美術素材清單、最終驗證

**Files:**
- Modify: `README.md`
- Create: `docs/art-assets.md`

- [ ] **Step 1：改寫 `README.md`。** 內容包含：
  - 一段遊戲概念；
  - 開發指令：`npm i`、`npm run dev`、`npm test`、`npm run build`；
  - 連結到 spec 和這份 plan；
  - 一節「貼圖替換」，說明把 PNG 放進 `public/assets/<key>.png` 就會自動取代佔位圖。
- [ ] **Step 2：撰寫 `docs/art-assets.md`。** 涵蓋 `ASSET_KEYS` 的每一項，每項包含：
  - key 和檔名；
  - 用途；
  - 尺寸：角色和魔物 32×32、魔王 64×64、特效 32×32 sprite sheet；
  - 影格數；
  - 可以直接貼給 AI 繪圖工具的英文提示詞。

  另外加一條測試 `art-assets doc covers all ASSET_KEYS`，放在 `src/render/assets.test.ts`：讀取 md 檔，檢查每個 key 都有出現。
- [ ] **Step 3：** 執行 `npm test && npm run build`，預期全部 PASS，build 成功。
- [ ] **Step 4：** 執行 `npm run preview`，開啟 `/InfiniteGrimoire/` 從頭玩一次：
  - 打倒魔王 1；
  - 在第 2 個地點看到「無效」；
  - 合成 T4 魔法後打倒魔王 2；
  - 重新整理後存檔還在。
- [ ] **Step 5：Commit**：`docs: rewrite README and add art asset list`

---

## 完成後

- GitHub Pages 需要到 repo 的 Settings → Pages，把 Source 設成「GitHub Actions」。這要由使用者手動操作。
- 合併到 `main` 和 push 前，要先問使用者。
