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

