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

