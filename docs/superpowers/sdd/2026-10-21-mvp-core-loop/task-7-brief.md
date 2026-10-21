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

