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

