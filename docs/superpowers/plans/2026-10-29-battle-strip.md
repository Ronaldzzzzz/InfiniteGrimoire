# 橫向戰鬥帶與關卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把圓形戰場換成主介面下方的橫向長帶，推圖改成每個地點 10 關（第 10 關是限時 180 秒的魔王關），通關有伺服器發的結算戰利品。

**Architecture:** 引擎座標仍以小人為原點 (0, 0)，只是怪改從右邊 `x ≈ 1` 進場、往左走到停止線，所以大多數距離計算不變；圓形專屬的常數換成橫向的射程、走道寬與右緣。出怪從計時改成「關卡資料的波次」，戰鬥狀態多了關卡階段（走路／戰鬥／等待進入魔王關／完成／失敗）。關卡通過與結算戰利品是新的伺服器動作 `POST /api/stage-clear`，`clearedStages` 與 `lastClearAt` 變成伺服器擁有的欄位；`zoneKills` 與依出怪速度的 `maxKills` 移除。

**Tech Stack:** TypeScript、React、Pixi、Hono（Cloudflare Worker）、D1、vitest、zod。

**Spec:** `docs/superpowers/specs/2026-10-29-side-scroll-battle-strip-design.md`（上層：`docs/superpowers/specs/2026-10-29-magic-research-rework-design.md`）

## Global Constraints

- Branch：從 `main` 開 `feat/battle-strip`；push、合併前問使用者，push 只能由使用者 `! git push`。
- 每個任務結束前 `npm test` 與 `npm run build` 都要通過（`src/ui/App.test.tsx` 的稀有揭曉測試在整套負載高時偶爾逾時，單獨跑過即可）。
- Commit 用 Conventional Commits（英文），結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 與 `Claude-Session: https://claude.ai/code/session_01BbLnQR1oxFiq58K5QZz56M`。
- 引擎（`src/engine/`）不能用 DOM／React／Pixi／Workers API。
- 小人沒有血量、不會死。
- 伺服器是銀行：`learned`、`levels`、`revealed`、`passives`、`synthesisLog`，以及本計畫新增的 `clearedStages`、`lastClearAt` 只能由伺服器改；被拒絕的動作回 422、不寫入、不算作弊。
- 魔王關限制 **180 秒**，**魔王波出現才開始倒數**；時間到判定失敗、退回前一關。
- 主場階級魔法（不越級）一個小怪關約 **2～3 分鐘**（模擬中位數）。
- 結算戰利品約為這關掉落物的 **兩倍**，由伺服器擲骰。
- 進度用**進度條**呈現，不顯示「第幾／幾波」。
- 波數不固定，寫在關卡資料裡。
- `MAX_ACTIVE_FX = 24` 不變；「Lv.」只代表階級；介面繁體中文；配色背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`。
- 存檔重置（新 migration），不寫舊存檔轉換。
- 平衡數值（波數、隻數、速度、範圍）的最終值要給使用者確認（Task 7）。

## Review Focus

1. **分頁切走再回來（卡頓補算）**：倒數用模擬步數算，不是牆上時間；補算最多 `MAX_CATCHUP_MS`。→ Task 3 測試「boss timer counts simulated steps」。
2. **結算請求重送**（雙擊、網路重試）：同一次通關不能拿兩份。→ Task 4 測試「a repeated stage-clear is rejected as tooFast」。
3. **打到一半換地點或換關**：已拿的掉落保留、不算通過、沒有結算。→ Task 5 測試「travel mid-stage keeps loot and does not claim」。
4. **魔法打不動魔王（免疫）**：倒數照樣跑完、失敗退回，不會卡住。→ Task 3 測試「an immune boss still times out」。
5. **最後一個地點的魔王關打完、或重刷已通過的魔王關**：自動前進沒有下一關時改成重刷，不會壞掉。→ Task 5 測試「auto-advance past the last stage repeats it」。

---

### Task 1: 關卡資料與存檔欄位（新增，不移除舊的）

**Files:**
- Modify: `src/engine/model.ts`（`Zone` 加 `stages`；`GameState` 加 `currentStage`、`clearedStages`、`lastClearAt`）
- Modify: `src/data/content/zones.json`（每個地點 10 關的起始資料）
- Modify: `src/engine/content.ts`（zod 與交叉檢查）
- Modify: `src/engine/persist.ts`（初始存檔、解析）
- Create: `src/engine/stages.ts`
- Create: `migrations/0007_stages.sql`
- Test: `src/engine/stages.test.ts`、`src/engine/content.test.ts`、`src/engine/persist.test.ts`、`tests/d1/`（migration 測試照既有寫法）

**Interfaces:**
- Produces:
  - `interface StageDef { waves: number[] }`（每個數字是那一波的隻數；魔王關的魔王另外出，不算在 `waves` 裡）；`Zone.stages: StageDef[]`（長度 10，最後一個是魔王關）。
  - `GameState` 新欄位：`currentStage: number`（1 起算）、`clearedStages: Record<string, number>`（每個地點已通過的最高關卡，0 或沒有＝都沒過）、`lastClearAt: number`（上次結算的伺服器時間 ms，初始 0）。
  - `src/engine/stages.ts`：`export const WALK_MS = 1500`；`export const BOSS_LIMIT_MS = 180_000`；`stageCount(zone: Zone): number`；`isBossStage(zone: Zone, stage: number): boolean`；`stageTotal(zone: Zone, stage: number): number`（這關的怪總數，魔王關含魔王 1 隻）；`minStageMs(zone: Zone, stage: number): number`（＝波數 × `WALK_MS`；魔王關的魔王波也算一波）；`maxWaveSize(zone: Zone): number`；`highestPlayable(state: GameState, zone: Zone): number`（`min(stageCount, cleared + 1)`）。

- [ ] **Step 1: 寫失敗的測試**（`src/engine/stages.test.ts`）

```ts
const zone = { ...content.zones[0]!, stages: [...Array(9)].map(() => ({ waves: [5, 6] })).concat([{ waves: [4] }]) };
it('counts stages and finds the boss stage', () => {
  expect(stageCount(zone)).toBe(10);
  expect(isBossStage(zone, 10)).toBe(true);
  expect(isBossStage(zone, 9)).toBe(false);
});
it('totals include the boss on the boss stage', () => {
  expect(stageTotal(zone, 1)).toBe(11);
  expect(stageTotal(zone, 10)).toBe(5);
});
it('minimum stage time is one walk per wave, the boss wave included', () => {
  expect(minStageMs(zone, 1)).toBe(2 * WALK_MS);
  expect(minStageMs(zone, 10)).toBe(2 * WALK_MS);
});
it('highest playable stage is one past the highest cleared, capped', () => {
  const s = { ...createInitialState(content), clearedStages: { [zone.id]: 3 } };
  expect(highestPlayable(s, zone)).toBe(4);
  expect(highestPlayable({ ...s, clearedStages: { [zone.id]: 10 } }, zone)).toBe(10);
  expect(highestPlayable({ ...s, clearedStages: {} }, zone)).toBe(1);
});
```

`content.test.ts` 加：「every zone has 10 stages, each with at least one wave of 1+ foes」，以及一個 `issuesOf` 案例：stage 的 `waves` 為空陣列時回報 `'waves'`。`persist.test.ts` 加：初始存檔 `currentStage === 1`、`clearedStages` 為 `{}`、`lastClearAt === 0`；`currentStage` 為 0、11 或 `clearedStages` 含不存在的地點時 `parseState` 回 null。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/engine/stages.test.ts src/engine/content.test.ts src/engine/persist.test.ts`
Expected: FAIL（`stages` 模組不存在、新欄位缺）

- [ ] **Step 3: 實作**

- 型別與 `stages.ts` 照 Interfaces。
- `zones.json` 起始資料（Task 7 會校準）：第 s 關（1～9）`waves` 為 `16 + s` 個數字，每個 `5 + Math.floor(s / 3)`；第 10 關 10 波、每波 `5 + 3`，魔王另出。用腳本產生後寫回 JSON（格式照現有 2 空格縮排）；**舊欄位 `killsForBoss`、`maxAlive`、`spawnIntervalMs`、`pack` 這個任務先保留**。
- `persist.ts`：`currentStage` 整數 1～10、`clearedStages` 的鍵必須是地點、值 0～10 整數、`lastClearAt` 非負整數。
- `migrations/0007_stages.sql`：照 `0004_core_rework.sql` 的寫法把 `saves.state` 與 `anchor_state` 設成新的初始存檔（`serialize(createInitialState(content))` 的字面值，含新欄位、仍含 `zoneKills: {}`），`revision = revision + 1`、`anchor_at = saved_at`；**不動 players、accounts、sessions**。Task 4 移除 `zoneKills` 時再補一個 migration 把它從字面值拿掉（或那時改寫本檔，因為還沒 push）。
- `tests/d1/` 加 migration 測試：套用前後 `players` 筆數相同、`saves.state` 解析得到 `currentStage === 1`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/model.ts src/engine/stages.ts src/engine/stages.test.ts src/data/content/zones.json src/engine/content.ts src/engine/content.test.ts src/engine/persist.ts src/engine/persist.test.ts migrations/0007_stages.sql tests/d1
git commit -m "feat(engine): stage data and stage fields in the save"
```

---

### Task 2: 橫向戰場幾何

**Files:**
- Modify: `src/engine/combat.ts`
- Test: `src/engine/combat.test.ts`

**Interfaces:**
- Consumes: 無
- Produces（`combat.ts` 匯出，Task 6 的畫面會用）：`LANE_Y = 0.09`（走道半高，`y ∈ [-LANE_Y, LANE_Y]`）、`RANGE = 0.75`（小人前方 `x ≤ RANGE` 的怪才算交戰）、`STOP_X = 0.08`（怪走到 `x = STOP_X + 半徑` 停下）、`SPAWN_X = 1.05`、`RIGHT_X = 1.0`（擊退與漫遊的右界）、`LANE_SPEED = 4`（怪在走道上的移動速度＝`def.speed × LANE_SPEED`）、`BLADE_FAN = 0.7`（rad，飛刃扇形半角）；`spawnPoint(rng: Rng): { x: number; y: number }`（`x ∈ [SPAWN_X, SPAWN_X + 0.15]`、`y ∈ [-LANE_Y, LANE_Y]`）。移除匯出 `ENGAGE_R`、`KNOCK_MAX_R`、`STOP_R`（引用它們的測試與 `tests/sim/measure.ts` 一起改成新常數或刪掉）。

- [ ] **Step 1: 寫失敗的測試**（`combat.test.ts`，取代依圓形寫的幾何測試）

- 「foes walk left to the stop line and never pass the mage」：一隻怪在 `(1, 0.05)`，跑 60 秒後 `x` ≥ `STOP_X + radius - 1e-9`，`y` 不變。
- 「knockback pushes right and never past RIGHT_X」：ring `push` 很大，怪在 `(0.3, 0)`，結束後 `0.3 < x ≤ RIGHT_X`。
- 「foes stay inside the lane」：blind 漫遊、zone pull 之後所有怪 `|y| ≤ LANE_Y`、`x ≤ RIGHT_X`（怪還在 `SPAWN_X` 進場段時允許 `x > RIGHT_X`，只限制「被移動過」的）。
- 「area spells aim only within RANGE when someone is」：一隻 `x = 0.5`、一隻 `x = 0.95` 的較密群，`densest` 目標選 `x = 0.5`。
- 「blades fly forward」：`bladePositions` 每片的角度 `atan2(y, x)` 在 `[-BLADE_FAN, BLADE_FAN]` 內。
- 「spawnPoint is off the right edge inside the lane」：100 次 `spawnPoint` 都在範圍內。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/engine/combat.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

- `moveFoe`：走路改成沿 `-x` 走到停止線（不再沿半徑），速度乘 `LANE_SPEED`；blind 漫遊與擊退後把 `y` 夾在 `±LANE_Y`、`x` 夾在 `≤ RIGHT_X`（只在 `x ≤ RIGHT_X` 的怪身上夾，進場段不夾）；移除 `d > 1` 正規化與 `KNOCK_MAX_R` 邏輯。
- `push`：方向仍是「從爆點往外」，但夾 `x` 方向分量 ≥ 0（擊退一律往右或原地，不會把怪推向小人身後）。
- `engagedFoes`：`x ≤ RANGE`；`pickTargets` 的 `nearest`／`center` 依 `x` 排序。
- `bladePositions`：第 k 片角度 `-BLADE_FAN + (2 × BLADE_FAN × (k + 0.5)) / n`，半徑照舊隨時間變大，不旋轉。
- 出怪暫時仍用舊的計時器，只是位置改用 `spawnPoint`（Task 3 換成波次）。
- 檔頭註解改寫成橫向長帶的說明。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS（`tests/sim` 的曲線與場上隻數可能大幅改變；這個任務把 `crowd.test.ts` 標成 `describe.skip` 並註明「Task 7 改寫」，`tier-curve.test.ts` 若失敗也同樣先跳過並註明）

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts src/engine/combat.test.ts tests/sim
git commit -m "feat(engine): side-scrolling lane geometry"
```

---

### Task 3: 波次、關卡階段與魔王倒數

**Files:**
- Modify: `src/engine/combat.ts`
- Test: `src/engine/combat.test.ts`

**Interfaces:**
- Consumes: Task 1 `stages.ts`；Task 2 `spawnPoint`。
- Produces:
  - `type StagePhase = 'walk' | 'fight' | 'held' | 'done' | 'failed'`。
  - `BattleState` 新欄位：`stage: number`、`phase: StagePhase`、`phaseMs: number`（目前階段已過的模擬 ms）、`wave: number`（下一波的索引，0 起算）、`killed: number`、`total: number`（`stageTotal`）、`bossMs: number | null`（魔王波出現後經過的模擬 ms，之前是 null）。移除 `spawnTimerMs`、`packTimerMs`。
  - `createBattle(zoneId: string, stage: number, opts?: { held?: boolean }): BattleState`（`held` 只用在魔王關：停在入口等玩家按「進入」）。
  - `enterStage(battle: BattleState): BattleState`（`held` → `walk`，其他階段原樣回傳）。
  - 新事件：`{ type: 'waveStart'; wave: number }`、`{ type: 'stageCleared'; zoneId: string; stage: number }`、`{ type: 'stageFailed'; zoneId: string; stage: number }`；`bossDefeated` 保留。
  - `stageProgress(b: BattleState): number`（`killed / total`，0～1）。

- [ ] **Step 1: 寫失敗的測試**

- 「a stage walks, fights each wave in order and ends cleared」：用只有 2 波（各 2 隻）的測試地點、一招必殺的魔法，跑到 `phase === 'done'`；事件順序含 `waveStart 0`、`waveStart 1`、`stageCleared`；兩波之間至少隔 `WALK_MS`；`killed === total === 4`。
- 「no foe spawns while walking, the next wave waits for the last foe」：第 0 波還有活的怪時不會出第 1 波。
- 「the boss comes after the boss stage's waves and the timer starts only then」：魔王關，出魔王前 `bossMs === null`，魔王出現當步 `bossMs === 0`。
- 「boss timer counts simulated steps」：魔王出現後跑 `BOSS_LIMIT_MS / STEP_MS` 步（打不死的設定），最後一步出 `stageFailed`、`phase === 'failed'`；之後再跑不出怪也不再出事件。
- 「an immune boss still times out」：裝一招對魔王 `canDamage` 為 false 的魔法，結果同上。
- 「a held boss stage spawns nothing until entered」：`createBattle(zone, 10, { held: true })` 跑 10 秒沒有 spawn；`enterStage` 後開始 `walk`。
- 「killing the boss defeats it and unlocks the next zone」：沿用舊測試，改成魔王關情境。
- 刪除依 `killsForBoss`／`zoneKills` 的舊測試。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/engine/combat.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

- 階段流程：`walk`（`phaseMs ≥ WALK_MS` 時出下一波並進 `fight`）→ `fight`（這波全死：還有波就回 `walk`；沒有了：魔王關且魔王還沒出 → 回 `walk` 後出魔王波；否則 `done` 並發 `stageCleared`）。`held` 什麼都不做；`done`／`failed` 不出怪、不施法、不發事件。
- 一波的怪一次全部出（`spawnPoint`），怪種照舊從 `zone.monsters` 隨機。
- `killed` 每殺一隻 +1；不再更新 `game.zoneKills`（欄位 Task 4 才刪，這裡維持原值不動）。
- 魔王：魔王波出現時 `bossMs = 0`，之後每步 `+STEP_MS`；`bossMs ≥ BOSS_LIMIT_MS` 且魔王還活著 → `failed` + `stageFailed`。打倒魔王照舊更新 `defeatedBosses`、`unlockedZones` 並發 `bossDefeated`，然後這波清空就 `done`。
- 沒有活著的怪時小人不施法（照舊）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS（runtime 用 `createBattle(state.currentZone)` 的地方先改成 `createBattle(state.currentZone, state.currentStage)` 讓它編得過；完整的關卡流程在 Task 5）

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts src/engine/combat.test.ts src/game/runtime.ts
git commit -m "feat(engine): waves, stage phases and the boss timer"
```

---

### Task 4: 防作弊改以關卡計算、結算動作、移除舊欄位

**Files:**
- Modify: `src/engine/audit.ts`、`src/engine/model.ts`、`src/engine/persist.ts`、`src/data/content/zones.json`、`src/engine/content.ts`
- Create: `src/engine/stage-clear.ts`
- Modify: `worker/app.ts`（`/api/stage-clear`、GM `boss_ready`）
- Modify: `migrations/0007_stages.sql`（字面值拿掉 `zoneKills`）
- Modify: `src/ui/gm/GmMapTab.tsx`（按鈕文字）
- Test: `src/engine/audit.test.ts`、`src/engine/stage-clear.test.ts`、`worker/app.test.ts`、`src/ui/gm/*.test.tsx`

**Interfaces:**
- Consumes: Task 1 `stages.ts`。
- Produces:
  - `audit.ts`：`maxKills(zone: Zone, elapsedMs: number): number` 改成 `(Math.floor(elapsed / WALK_MS) + 1) × maxWaveSize(zone)`；`killRate(zone) = maxWaveSize(zone) / WALK_MS`。伺服器擁有欄位的比對加上 `clearedStages`、`lastClearAt`。
  - `stage-clear.ts`：`claimStage(state: GameState, zoneId: string, stage: number, now: number, content: Content, rng: Rng): { state: GameState; result: StageClearResult }`；`type StageClearResult = { kind: 'cleared'; loot: ItemId[] } | { kind: 'rejected'; reason: 'locked' | 'notReached' | 'tooFast' | 'bossAlive' }`；`stageLoot(zone: Zone, stage: number, equippedTier: number, content: Content, rng: Rng): ItemId[]`。
  - Worker：`POST /api/stage-clear`，body 多 `zoneId`、`stage`，走 `serverAction`。
  - `ActionPayloads.stageClear: { zoneId: string; stage: number }`（`src/game/sync.ts`；Task 5 呼叫）。

- [ ] **Step 1: 寫失敗的測試**

`stage-clear.test.ts`：
- 「claims the next stage: cleared goes up, lastClearAt is now, loot is added」。
- 「a repeated stage-clear is rejected as tooFast」：同一個 `now` 再送一次 → `tooFast`，狀態不變。
- 「rejects a locked zone and a stage beyond highestPlayable」→ `locked`、`notReached`。
- 「the boss stage needs the boss in defeatedBosses」→ `bossAlive`。
- 「re-claiming an already cleared stage gives loot but keeps cleared」：`clearedStages` 不倒退。
- 「loot is about twice the stage's drops and never has key items」：同一關用固定種子跑 200 次，`stageLoot` 平均件數 ÷（這關怪數 × 單隻平均掉落件數）在 1.6～2.4 之間；沒有 `key:`。
- 「overleveling thins the loot like kills do」：`equippedTier` 高 4 階時平均件數低於同階。

`audit.test.ts`：
- 「maxKills is one wave per walk」：`maxKills(zone, 0) === maxWaveSize(zone)`、`maxKills(zone, 3 * WALK_MS) === 4 * maxWaveSize(zone)`。
- 「an upload may not change clearedStages or lastClearAt」→ 有 reason。
- 「currentStage above highestPlayable is rejected」。
- 「a boss defeated faster than its stage allows is rejected」：用 `minStageMs(zone, 10)` 取代舊的 `killsForBoss / killRate`。
- 「a boss may only fall after the first 9 stages are cleared」：`clearedStages[zone] < 9` 時新的 `defeatedBosses` 被拒。
- 刪除所有 `zoneKills` 的測試。

`worker/app.test.ts`：
- 「POST /api/stage-clear grants loot and stores clearedStages」、「a second identical request gets 422 tooFast and writes nothing」、「stage-clear loot does not trip the next upload's audit」（結算後立刻上傳同一狀態 → 200，`rejections` 不增加；照 `chargeAnchor` 的做法，結算加的東西也要加到錨點）。
- GM `boss_ready` 測試改成：`clearedStages[currentZone] === 9`、`currentStage === 10`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/engine/stage-clear.test.ts src/engine/audit.test.ts worker/app.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

- `claimStage` 檢查順序：地點在 `unlockedZones`（否則 `locked`）→ `1 ≤ stage ≤ highestPlayable`（否則 `notReached`）→ `now - lastClearAt ≥ minStageMs / GAIN_TOLERANCE`（否則 `tooFast`）→ 魔王關要 `defeatedBosses` 含該地點魔王（否則 `bossAlive`）。通過：`clearedStages[zone] = max(舊值, stage)`、`lastClearAt = now`、`inventory += loot`。
- `stageLoot`：這關每一隻怪（`stageTotal` 隻；一般怪從 `zone.monsters` 隨機挑，魔王關的魔王用 `zone.bossId`）的掉落表擲 **2 次**，每次乘 `overlevelEfficiency(equippedTier, def.tier)`，跳過 `key:`。
- Worker 端點用 `deps.now()` 當 `now`、`deps.rng()`；serverAction 照 synthesize 的寫法（`chargeAnchor` 會把結算拿到的東西記進錨點；確認它對「增加」也成立，不成立就在這裡補，並加測試）。
- `audit.ts`：移除 `zoneKills` 的所有檢查與 `burstMs`；魔王「太快」改成 `minStageMs(zone, stageCount(zone))`；新增 `clearedStages[zone] ≥ stageCount - 1` 才能有新魔王；`currentStage ≤ highestPlayable(prev 的伺服器欄位, zone)`。
- 從 `model.ts`、`persist.ts`、`content.ts`、`zones.json` 刪除 `zoneKills`、`killsForBoss`、`maxAlive`、`spawnIntervalMs`、`pack`；`combat.ts` 裡殘留的引用一併拿掉；`src/ui/BossCounter.tsx` 若還引用 `zoneKills`，這個任務先讓它回傳 null（Task 6 刪掉）。
- GM `boss_ready`：把 `clearedStages[currentZone]` 設成 `stageCount - 1`、`currentStage` 設成 `stageCount`；`GmMapTab` 按鈕文字「目前地點直達魔王關」。
- `0007_stages.sql` 的字面值重新產生（不含 `zoneKills`）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS（`tests/sim` 的 bot 若因 `zoneKills` 移除而壞，先在 bot 內暫時改成只靠 `stage-clear`／魔王，Task 7 完整改寫；至少 `pure-paths` 要能跑完不丟例外，時間只印報告）

- [ ] **Step 5: Commit**

```bash
git add -A src worker migrations tests
git commit -m "feat: stage-based audit, server stage-clear loot, drop zoneKills"
```

---

### Task 5: 執行層的關卡流程與同步

**Files:**
- Modify: `src/game/runtime.ts`、`src/game/sync.ts`、`src/game/api.ts`
- Create: `src/game/auto-advance.ts`（`localStorage` 偏好）
- Test: `src/game/runtime.test.ts`、`src/game/sync.test.ts`、`src/game/auto-advance.test.ts`

**Interfaces:**
- Consumes: Task 3 `createBattle`、`enterStage`、事件；Task 4 `/api/stage-clear`、`StageClearResult`。
- Produces（Task 6 的介面用）：
  - `GameRuntime.travel(zoneId: string, stage: number): boolean`（取代只有地點的版本；不合法的關卡回 false；魔王關一律 `held`）。
  - `GameRuntime.enterBoss(): void`。
  - `GameRuntime.setAutoAdvance(on: boolean): void`、`Snapshot.autoAdvance: boolean`。
  - `Snapshot.lastResult: { kind: 'cleared'; zoneId: string; stage: number; loot: ItemId[] } | { kind: 'failed'; zoneId: string; stage: number; backTo: number } | null`（結算或失敗提示用，換關時清掉）。
  - `src/game/auto-advance.ts`：`loadAutoAdvance(): boolean`（預設 true）、`saveAutoAdvance(on: boolean): void`，key `ig.autoAdvance`，讀寫都包 try/catch。
  - `SyncController.claimStage(zoneId: string, stage: number): Promise<ActionOutcome>`。

- [ ] **Step 1: 寫失敗的測試**

`runtime.test.ts`：
- 「after stageCleared, auto-advance on moves to the next stage」、「auto-advance off restarts the same stage」。
- 「auto-advance stops at the boss stage held」：下一關是魔王關時 `battle.phase === 'held'`，`enterBoss()` 後 `walk`。
- 「stageFailed sends the player back one stage」：魔王關失敗 → `currentStage === 9`、`lastResult.kind === 'failed'`、`backTo === 9`。
- 「auto-advance past the last stage repeats it」：最後一個地點第 10 關通過後仍停在第 10 關（重新 `held`）。
- 「travel mid-stage keeps loot and does not claim」：打到一半 `travel` 到別關，背包保留，`claimStage` 沒被呼叫。
- 「travel rejects a stage beyond highestPlayable or a locked zone」。

`sync.test.ts`：
- 「a stageCleared event claims the stage once」：事件來一次只呼叫一次 API；回應的狀態取代本地狀態，`lastResult.loot` 是伺服器給的。
- 「a 422 tooFast claim keeps the local state and does not retry forever」。
- 「a network error on claim retries like other actions」（照既有 action 的重試規則）。

`auto-advance.test.ts`：預設 true、存了 false 讀回 false、`localStorage` 丟例外時回 true 且不丟。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/game`
Expected: FAIL

- [ ] **Step 3: 實作**

- runtime 在 `advance` 收到 `stageCleared` 時通知 sync（沿用 `onEvents`）；sync 的 `claimStage` 走既有的 action 管道（`synthPending` 那套鎖），回覆後 `replaceState`。
- 通過或失敗後，runtime 依 `autoAdvance` 建新的 battle：下一關（`min(stage + 1, stageCount)`；下一關是魔王關就 `held`）或同一關；失敗退 `max(1, stage - 1)`。`currentStage` 跟著改（客戶端欄位，Task 4 的稽核會檢查上限）。
- `replaceState` 不能把正在進行的關卡重建（照現在「只有伺服器存檔在不同地點時才重建」的規則，改成「不同地點或不同關卡」）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat(game): stage flow, auto-advance and stage-clear claims"
```

---

### Task 6: 畫面：下方長帶、關卡列、版面

**Files:**
- Modify: `src/render/arena.ts`、`src/render/battle-view.ts`
- Modify: `src/ui/App.tsx`、`src/ui/App.css`、`src/ui/TopBar.tsx`、`src/ui/pickers.tsx`（地點＋關卡）
- Create: `src/ui/StageBar.tsx`（長帶上的關卡資訊與按鈕）
- Delete: `src/ui/BossCounter.tsx`、`src/ui/BossCounter.test.tsx`
- Test: `src/render/arena.test.ts`、`src/ui/StageBar.test.tsx`、`src/ui/TopBar.test.tsx`、`src/ui/App.test.tsx`

**Interfaces:**
- Consumes: Task 2 常數（`LANE_Y`、`RANGE`、`RIGHT_X`）；Task 3 `stageProgress`、`BattleState.phase`／`bossMs`；Task 5 runtime API 與 `lastResult`。
- Produces: `makeArena(w: number, h: number): Arena`（小人在 `x = 0.25w`、`y = h/2`；`radius` 改名語意為「每個引擎單位的像素」＝`0.75w`；走道半高 `LANE_Y × radius` 不大於 `h/2 - 4`，超過時改以高度決定比例）。

- [ ] **Step 1: 寫失敗的測試**

- `arena.test.ts`：`toScreen(makeArena(1280, 180), 0, 0)` 是 `(320, 90)`；`x = 1` 在右緣（`1280 ± 1`）；走道上下緣在畫面內。
- `StageBar.test.tsx`：
  - 顯示「迷霧草原 1-3」與進度條（`role="progressbar"`、`aria-valuenow` 為百分比）；**畫面上沒有「波」字**。
  - 魔王波出現後顯示剩餘秒數（`bossMs = 30_000` → 「150」秒）；魔王出現前沒有倒數。
  - `phase === 'held'` 時顯示「進入魔王關」按鈕，按下呼叫 `runtime.enterBoss`。
  - 「自動前進」勾選反映 `snapshot.autoAdvance`，切換呼叫 `setAutoAdvance`。
  - `lastResult.kind === 'failed'` 顯示「時間到，退回 1-9」；`cleared` 顯示這關的結算戰利品（元素以中文名稱與數量）。
- `TopBar.test.tsx`：地點選擇器可以選關卡，未解鎖的關卡停用；選擇呼叫 `runtime.travel(zoneId, stage)`。
- `App.test.tsx`：戰鬥區在主介面之後（DOM 順序）、有 `className="battle-strip"`；`BossCounter` 不存在。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/render src/ui`
Expected: FAIL

- [ ] **Step 3: 實作**

- 版面（`App.css`）：桌面 `.battle-strip` 在 `.main` 底部、高 180 px、全寬；`max-width: 600px` 時 `position: fixed; bottom: 0` 高 140 px，`body` 底部留同樣的 padding。`KeyItemBar`、`EquipToasts` 放在長帶上方右側（不蓋 `StageBar`）。
- `battle-view.ts`：背景與地面線在 `phase === 'walk'` 時往左捲（純畫面，速度常數自訂）；`ring` 只畫 `x ≥ 0` 的半圓；`field`／`storm` 的閃光涵蓋整條長帶；其他效果用新的 `toScreen`。DPS 讀數留在長帶左下。
- 「魔王現身！」橫幅照舊（魔王波出現時）。
- 結算／失敗提示顯示約 3 秒（`lastResult` 改變時開始計時）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A src/render src/ui
git commit -m "feat(ui): battle strip at the bottom with stage bar and stage picker"
```

---

### Task 7: 模擬、量測與節奏校準

**Files:**
- Modify: `tests/sim/bot.ts`、`tests/sim/measure.ts`、`tests/sim/crowd.test.ts`（改寫成關卡時間）、`tests/sim/tier-curve.test.ts`、`tests/sim/pure-paths.test.ts`、`tests/sim/rare-cost.test.ts`、`scripts/measure-dps.ts`
- Modify: `src/data/content/zones.json`（波數）、`src/engine/combat.ts`（`LANE_SPEED`、`RANGE` 等若需要）
- Create: `docs/superpowers/sdd/2026-10-29-battle-strip/progress.md` 的量測表（ledger 本身由執行者維護）
- Test: 同上

**Interfaces:**
- Consumes: Task 1～5 全部。
- Produces: `measure.ts` 的 `stageTime(spellId: string, level: number, zoneId: string, stage: number, opts: { seed: number; limitMs: number }): number | null`（打完這關的模擬 ms，打不完回 null）；`stageReport(opts: { seeds: number[] }): StageRow[]`，`StageRow = { zoneId: string; rel: -1 | 0 | 1; tier: number; medianMs: number | null }`。

- [ ] **Step 1: 寫失敗的測試**（`crowd.test.ts` 改名為 `stage-time.test.ts`）

- 「home-tier spells clear a normal stage in 2–3 minutes」：每個地點第 5 關，`rel 0` 的中位數 ∈ [120 000, 180 000] ms。
- 「one tier up is clearly faster, one tier down slower」：`rel 1` 中位數 < `rel 0` × 0.75；`rel -1` 中位數 > `rel 0`（或打不完）。
- 「home tier beats the boss within the 180 s limit」：每個地點第 10 關的魔王波，主場階級中位數 < `BOSS_LIMIT_MS`。
- `tier-curve.test.ts` 改用 `stageTime` 的群怪情境（單挑魔王情境照舊），恢復執行；`KNOWN_GAPS` 依結果重新列出。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/sim`
Expected: FAIL（起始資料不會剛好落在 2～3 分鐘）

- [ ] **Step 3: 實作與校準**

- `bot.ts`：照關卡前進；通過一關呼叫 `/api/stage-clear`；遇魔王關前用 `soloBossDps` 估計 180 秒內打不打得倒，打不倒就留在第 9 關重刷；被拒次數照舊統計。
- 校準順序：先調 `LANE_SPEED`（怪從進場到停止線約 3～5 秒），再依每個地點調 `zones.json` 的波數（每關波數 × 每波隻數），讓 `rel 0` 落在 2～3 分鐘；魔王血量只在 180 秒內打不倒時才調。
- 把校準後的波數、隻數、`LANE_SPEED`、`RANGE` 與 `stageReport` 結果整理成表，**停下來給使用者確認**（Global Constraints 最後一行），確認後才 commit 數值。
- `pure-paths`、`rare-cost` 維持只印報告；確認 0 次被拒。
- `scripts/measure-dps.ts` 改成橫向情境，重新產生 `docs/superpowers/specs/2026-10-27-dps-after.md`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test && npm run build`
Expected: PASS，`tests/sim` 0 次被拒

- [ ] **Step 5: Commit**

```bash
git add -A tests/sim scripts src/data/content/zones.json src/engine/combat.ts docs/superpowers/specs/2026-10-27-dps-after.md
git commit -m "balance: calibrate stage waves to 2-3 minutes at home tier"
```

---

### Task 8: 瀏覽器驗收與文件

**Files:**
- Modify: `AGENTS.md`（第 3.0 節、第 5 節架構、第 6 節規則：移除 `ENGAGE_R`／`KNOCK_MAX_R` 條目，改寫範圍魔法瞄準為 `RANGE`，加上關卡、結算、`clearedStages`／`lastClearAt` 伺服器擁有、魔王 180 秒；第 10 節交接）
- Modify: `README.md`（玩法說明若提到圓形戰場）
- Modify: `docs/prelaunch-checklist.md`（遠端 D1 要套用 0007，會重置存檔）
- Create: `docs/superpowers/sdd/2026-10-29-battle-strip/task-8-report.md`（驗收紀錄；截圖放 `.superpowers/`，不進版本庫）

- [ ] **Step 1:** `npm run db:migrate:local`，`npm run dev`，用 headless Chrome（puppeteer-core 裝在專案外，照之前驗收的做法）逐項驗規格第 4 節 1～7；種進去的狀態（例如直接改本機 D1 的 `clearedStages`）要在報告裡寫明。
- [ ] **Step 2:** 驗收發現的問題：小問題記在 ledger 的 `minor (deferred)`，會擋驗收的回到對應任務修。
- [ ] **Step 3:** 更新文件；`npm test`、`npm run build` 通過。
- [ ] **Step 4: Commit**

```bash
git add AGENTS.md README.md docs
git commit -m "docs: battle strip acceptance and hand-off"
```

---

### Task 9: 離線收益（先討論，再實作）

規格第 3.8 節：畫面沒有被注目（分頁隱藏或視窗失去焦點）**30 秒後開始計算**；算法、上限、回來時的提示、與防作弊的關係都還沒定。

- [ ] **Step 1: 停下來和使用者討論**：收益速度（例如照目前關卡的通關速度）、上限時數、是否含結算戰利品、回來時怎麼呈現、由伺服器依時間計算的方式。把決定寫進規格第 3.8 節並 commit（只改文件可以直接 commit）。
- [ ] **Step 2:** 依決定在本計畫末尾補上 Task 9 的實作步驟（測試、介面、伺服器動作），再照本計畫的格式執行。
