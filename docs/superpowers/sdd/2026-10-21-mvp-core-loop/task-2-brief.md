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

