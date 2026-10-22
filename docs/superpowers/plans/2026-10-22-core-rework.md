# 核心重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 MVP 的一維戰鬥、固定配方合成、整張攤開的技能樹，換成「成群魔物的 2D 戰鬥＋效果積木魔法＋名魔法／自創魔法合成＋元素強化＋迷霧技能樹」，伺服器照樣保管所有進度並檢查上傳。

**Architecture:** 新引擎模組以**新檔名**和舊模組並存（`model.ts`、`content.ts`、`spells.ts`、`crafting.ts`、`empower.ts`、`tree.ts`、`combat.ts`、`persist.ts`、`audit.ts`），每個任務結束時整個測試套件都是綠的。Task 7 先切換伺服器與模擬機器人，Task 8 切換瀏覽器並刪掉舊模組與舊資料。之後才做特效、介面與完整內容。

**Tech Stack:** TypeScript、Vitest、zod、Hono（Cloudflare Workers）、D1（測試用 `node:sqlite` shim）、React、Pixi.js v8。

**Spec:** `docs/superpowers/specs/2026-10-22-core-rework-design.md`（衝突時以 spec 為準；spec 沒寫的看上層規格 `2026-10-21-infinite-grimoire-design.md`）。原型：`docs/design/mockups/combo-prototype.html`（數值與手感的參考，可直接打開）。

## Global Constraints

- 在 `main` 開新 branch `feat/core-rework` 執行；不 push、不合併、不部署，等使用者指示（AGENTS.md）。
- 每個任務結束都要 `npm test` 與 `npm run build` 通過；TDD。
- `src/engine/` 禁止 DOM、React、Pixi、Workers API（WebCrypto 也不要用；引擎只用純計算）。
- 伺服器是銀行：`learned`、`levels`（魔法等級）、`revealed`（技能樹拓展）、`passives`、`synthesisLog` 只能由伺服器改變。合成擲骰一律在伺服器。
- 401 只代表 token 無效；遊客 token 只在 401 時清除。
- 介面文字用繁體中文；資料名稱附 `nameEn`。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`；元素色沿用 `src/render/palette.ts`（火 `#e2643b`、風 `#7fd0c0`、雷 `#f3e36b`、土 `#c79a5a`、水 `#5aa0e8`）。
- 保留的 MVP 規則：傷害門檻（魔法階級 ≥ 魔物階級 − 1，或攻擊力 ≥ 防禦 × 0.7，否則傷害 0、顯示「無效」）、越級遞減（d ≥ 2 時效益 = 0.5 + 0.5 × 0.5^(d−1)）、小人沒有血條不會死、屬性相剋 ±10%。
- 元素五階：初階、中階、高階、極階、神階；升階成本 3、10、30、100；換算成初階的價值 1、3、30、900、90,000。
- 目前沒有真實玩家：v1 存檔直接重置成 v2 初始狀態，帳號與 session 保留。
- `tests/sim` 的機器人經由真實 API 遊玩，**0 次被拒**；worker 的對抗測試全部通過。
- 安全性與防作弊做到合理即可（使用者 2026-10-22）。
- 不在遊戲中呼叫 AI。

## Review Focus

1. **惡意或畸形的魔法 ID**：伺服器收到任意字串當合成輸入或存檔裡的 `learned`。超長、括號不成對、巢狀過深的自創魔法 ID 必須回 null／400，不能讓解析遞迴爆堆疊或卡住。→ Task 3 測試 `rejects malformed, oversized and over-deep crafted ids`。
2. **輸入順序無關**：「A＋B」與「B＋A」必須得到同一個自創魔法（同 ID、同名、同效果），瀏覽器與伺服器一致。→ Task 3 `crafted ids and names do not depend on input order`、Task 4 `synthesize is order independent`。
3. **強度天花板**：一路疊「相性極佳」到深度上限、再強化到 50 級，攻擊力仍不超過天花板公式。→ Task 3 `deep good chains stay under the attack ceiling`、Task 5 `max level stays bounded`。
4. **偽造伺服器欄位**：上傳的存檔自己加一個沒合成過的自創魔法、自己升級、自己散開迷霧、裝備沒學過的魔法，都要被拒（422）。關鍵道具的增加量也要受掉落上限約束。→ Task 7 `rejects forged crafted spells, levels, reveals and passives`。
5. **戰鬥負載有上限**：魔物數不超過地點的 `maxAlive`（含成群）、同時存在的效果不超過 `MAX_ACTIVE_FX`，同一個亂數種子得到同一串事件。→ Task 6 `active effects never exceed MAX_ACTIVE_FX`、`same seed gives the same events`。

---

## 檔案地圖

| 檔案 | 責任 | 任務 |
|---|---|---|
| `src/engine/types.ts` | 元素、物品 ID、元素階級常數（保留並擴充；舊的 SpellDef 等在 Task 8 刪除） | 1, 8 |
| `src/engine/inventory.ts` | 背包、升階、換算成初階 | 1 |
| `src/engine/model.ts` | 新的資料與狀態型別（Effect、Spell、Content、GameState v2…） | 2 |
| `src/engine/content.ts` | 讀取並交叉檢查 `src/data/content/*.json`，匯出 `content` | 2 |
| `src/data/content/*.json` | 新內容（Task 2 最小版，Task 9 完整版） | 2, 9 |
| `src/engine/spells.ts` | 自創魔法 ID、解析、推導、相性、天花板、等級縮放 | 3 |
| `src/engine/crafting.ts` | 合成 v2 | 4 |
| `src/engine/tree.ts` | 迷霧區域、關鍵道具、被動能力、深度上限、加成 | 5 |
| `src/engine/empower.ts` | 強化成本與套用 | 5 |
| `src/engine/combat.ts` | 2D 戰鬥模擬與效果執行 | 6 |
| `src/engine/persist.ts` | v2 存檔 schema、`parseState`、`serialize`、`createInitialState` | 7 |
| `src/engine/audit.ts` | v2 上傳檢查（取代 `validate.ts`） | 7 |
| `worker/app.ts`、`worker/index.ts` | 改用新引擎；新增 empower／reveal／passive API | 7 |
| `migrations/0004_core_rework.sql` | 把所有存檔重置成 v2 初始狀態 | 7 |
| `tests/sim/bot.ts`、`tests/sim/pure-paths.test.ts` | 新系統的模擬機器人 | 7, 9 |
| `src/game/*`、`src/ui/*`、`src/render/battle-view.ts` | 瀏覽器切換 | 8 |
| `src/render/element-fx.ts`、`src/render/battle-view.ts` | 元素特效語言、效果畫面 | 10 |
| `src/ui/DiscoveryBanner.tsx`、`src/ui/Notebook.tsx`、`src/ui/EmpowerPanel.tsx`、`src/ui/GrimoirePanel.tsx` | 新介面 | 11 |

---

### Task 1: 元素五階與越往上越難的升階

**Files:**
- Modify: `src/engine/types.ts`、`src/engine/inventory.ts`、`src/engine/save.ts`（`ITEM_ID_RE` 改用常數）、`src/engine/data.ts`（`ITEM_RE` 改用同一個常數）、`src/engine/validate.ts`（`dropMaxima` 的換算）
- Test: `src/engine/inventory.test.ts`、`src/engine/validate.test.ts`、`src/engine/save.test.ts`

**Interfaces:**
- Produces（`types.ts`）：`MAX_ELEMENT_GRADE = 5`；`GRADE_UPGRADE_COST: readonly number[] = [3, 10, 30, 100]`（index `g-1` 是從 g 升到 g+1 的數量）；`gradeValue(grade: number): number`（1→1、2→3、3→30、4→900、5→90000）；`GRADE_NAMES = ['初階','中階','高階','極階','神階']`；`ITEM_ID_RE`（`el:<元素>:[1-5]`、`mat:[a-z_]+`、`key:[a-z_]+`）從 `types.ts` 匯出，`save.ts`、`data.ts` 改為引用。
- Produces（`inventory.ts`）：`upgradeElement(inv, element, grade)` 改成扣 `GRADE_UPGRADE_COST[grade-1]` 個；`elementEquivalent` 改用 `gradeValue`。

- [ ] **Step 1: 改測試**
  - `inventory.test.ts`：`upgradeElement` 初→中扣 3 個、中→高扣 10 個、極→神扣 100 個、神階不能再升（回 null）、數量不足回 null；`elementEquivalent` 對 `{el:fire:1:2, el:fire:3:1, el:fire:5:1}` 回 `2 + 30 + 90000`；升階前後 `elementEquivalent` 不變（每一階都測）。
  - `save.test.ts`：`el:fire:5`、`key:storm_heart` 合法；`el:fire:6` 不合法。
  - `validate.test.ts`：把用到「每階 ×3」的期待值改成 `gradeValue`（例如掉 1 個 `el:fire:3` 算 30）。
- [ ] **Step 2:** `npx vitest run src/engine` → 新斷言 FAIL
- [ ] **Step 3: 實作**（`dropMaxima` 的 `3 ** (g-1)` 改成 `gradeValue(g)`；`ITEM_ID_RE` 加入 `key:` 前綴）
- [ ] **Step 4:** `npm test`（含 `tests/sim` 0 次被拒）與 `npm run build` 通過
- [ ] **Step 5:** `git commit -m "feat(engine): five element grades with escalating upgrade costs"`

### Task 2: 新的資料模型與內容載入

**Files:**
- Create: `src/engine/model.ts`、`src/engine/content.ts`、`src/engine/content.test.ts`、`src/data/content/{spells,recipes,monsters,zones,materials,key-items,passives,regions}.json`

**Interfaces:**
- Produces（`model.ts`，型別定義是給後面所有任務用的決定，照抄）：

```ts
import type { ElementId, Inventory, ItemId } from './types';

export type StatusKind = 'burn' | 'wet' | 'slow' | 'stun' | 'freeze' | 'blind' | 'regen';
/** burn: power = dps as a fraction of the hit; regen: power = max-hp fraction healed per second. */
export interface StatusDef { kind: StatusKind; ms: number; power?: number }
export type Target = 'nearest' | 'densest' | 'strongest' | 'center' | 'random';
/** Arena units: the arena radius is 1, monsters stop at STOP_R = 0.15. mult scales the spell's attack. */
export type Effect =
  | { kind: 'bolt'; mult: number; count: number; radius: number; target: Target; status?: StatusDef }
  | { kind: 'ring'; mult: number; radius: number; push: number; status?: StatusDef }
  | { kind: 'blades'; mult: number; count: number; push: number }
  | { kind: 'chain'; mult: number; hops: number; range: number; explode: number; status?: StatusDef }
  | { kind: 'zone'; mult: number; radius: number; ms: number; tickMs: number; target: Target; pull: number; follow: boolean; strikes: number; status?: StatusDef }
  | { kind: 'storm'; mult: number; ms: number; tickMs: number; status?: StatusDef }
  | { kind: 'meteor'; mult: number; count: number; radius: number; delayMs: number; lavaMs: number; target: Target }
  | { kind: 'field'; mult: number; delayMs: number; status?: StatusDef }
  | { kind: 'haste'; factor: number; ms: number }
  | { kind: 'backfire'; chance: number; stunMs: number };

export interface Words { pre: string; noun: string; preEn: string; nounEn: string }
export type Affinity = 'base' | 'self' | 'good' | 'odd' | 'bad';
/** A castable spell: a named one from data, or a crafted one derived from its id. */
export interface Spell {
  id: string; name: string; nameEn: string; desc: string;
  elements: ElementId[]; tier: number; attack: number; cooldownMs: number;
  effects: Effect[]; words: Words; affinity: Affinity; depth: number; named: boolean;
}
export interface TreeNode { region: string; ring: number; angle: number }
export interface NamedSpellDef extends Spell {
  named: true; hint: string; prerequisites: string[]; node: TreeNode | null;
  /** the element whose "el+el" grade-1 recipe teaches it; crafted inputs use it for that element */
  baseOf?: ElementId;
}
export interface Material { id: ItemId; name: string; nameEn: string; desc: string; elements: ElementId[]; words: Words; effect: Effect }
export interface KeyItem { id: ItemId; name: string; nameEn: string; desc: string; reveals: string }
export type PassiveBonus =
  | { kind: 'damage'; element: ElementId | null; pct: number }
  | { kind: 'cooldown'; pct: number }
  | { kind: 'depth'; add: number };
export type PassiveUnlock =
  | { kind: 'items'; items: Record<ItemId, number> }
  | { kind: 'boss'; bossId: string }
  | { kind: 'learned'; count: number; element: ElementId | null };
export interface Passive { id: string; name: string; nameEn: string; desc: string; node: TreeNode; bonus: PassiveBonus; unlock: PassiveUnlock }
export interface TreeRegion { id: string; name: string; nameEn: string; order: number; initiallyVisible: boolean }
/** spellId null: the roll fell through, the inputs make their crafted spell instead. */
export interface Recipe { id: string; inputs: [string, string]; outcomes: { spellId: string | null; weight: number }[] }
export interface DropDef { itemId: ItemId; chance: number; min: number; max: number }
export interface Monster { id: string; name: string; nameEn: string; element: ElementId; tier: number; hp: number; defense: number; regenPerSec: number; speed: number; radius: number; boss: boolean; drops: DropDef[] }
export interface Zone { id: string; name: string; nameEn: string; order: number; monsters: string[]; bossId: string; killsForBoss: number; maxAlive: number; spawnIntervalMs: number; pack: { everyMs: number; size: number } }
export interface Content {
  spells: Record<string, NamedSpellDef>; recipes: Recipe[]; monsters: Record<string, Monster>; zones: Zone[];
  materials: Record<ItemId, Material>; keyItems: Record<ItemId, KeyItem>; passives: Record<string, Passive>; regions: TreeRegion[];
  /** element -> its base spell id (from baseOf) */
  baseSpells: Record<ElementId, string>;
}
export interface SynthLogEntry { attempts: number; results: Record<string, number>; noReaction: boolean }
export interface GameState {
  version: 2; inventory: Inventory; learned: string[]; equipped: string; levels: Record<string, number>;
  revealed: string[]; passives: string[]; currentZone: string; unlockedZones: string[];
  defeatedBosses: string[]; zoneKills: Record<string, number>; synthesisLog: Record<string, SynthLogEntry>;
}
export const STARTING_SPELL = 'mana_bolt';
export const OVERLOAD_SPELL = 'mana_overload';
```

- Produces（`content.ts`）：`class ContentError extends Error { issues: string[] }`、`loadContent(raw: Record<'spells'|'recipes'|'monsters'|'zones'|'materials'|'keyItems'|'passives'|'regions', unknown>): Content`、`export const content: Content`（讀 `src/data/content/*.json`）。

- [ ] **Step 1: 寫失敗的測試** `content.test.ts`
  - `loads the shipped content`：`content.spells.mana_bolt`、`content.spells.mana_overload` 存在；`content.baseSpells` 五個元素都有；`content.zones[0].id === 'mist_meadow'`。
  - 交叉檢查各一個 case（餵最小的壞資料，`expect(() => loadContent(bad)).toThrow(ContentError)` 並檢查 `issues` 內容包含關鍵字）：重複 ID、配方輸入引用不存在的魔法／材料、配方結果不存在、`baseOf` 重複或缺元素、節點的 `region` 不存在、關鍵道具 `reveals` 不存在的區域、被動 `unlock.items` 引用不存在的物品、地點引用不存在的魔物、魔王沒標 `boss`、`chance` 超出 0～1、`max < min`、材料從沒被任何魔物掉落、`mana_overload` 或 `mana_bolt` 缺少、名魔法 ID 不符合 `^[a-z][a-z0-9_]*$`。
- [ ] **Step 2:** `npx vitest run src/engine/content.test.ts` → FAIL（找不到模組）
- [ ] **Step 3: 實作** zod schema（沿用 `data.ts` 的 `parseList`／`checkUnique` 寫法，複製到 `content.ts`，Task 8 刪 `data.ts` 時就不用回頭改）。**最小內容**（Task 9 會擴充，ID 從這裡開始就是正式的）：
  - 魔法：`mana_bolt`（無元素、階 1、`bolt`）、`mana_overload`（無元素、`backfire` chance 1 stunMs 2000、`node: null`）、五個基礎（`fireball`、`wind_blade`、`lightning`、`rock_spear`、`water_wave`，階 2，`baseOf` 各自的元素，效果照原型）、五個同元素強化（`flame_burst`、`tailwind`、`thunder_hammer`、`earthquake`、`tsunami`，階 3）、`fire_tornado`（火＋風，階 4，`zone` pull+燃燒）。
  - 配方：`el:X:1 + el:X:1 → 基礎`；`基礎 + el:X:2 → 同元素強化`；`fireball + wind_blade → fire_tornado`。
  - 區域：`core`（`initiallyVisible: true`）、`outer`（false）。關鍵道具 `key:storm_heart`（`reveals: 'outer'`）。材料 `mat:ember_core`（火、效果＝`bolt` 小爆炸）。被動 `ember_affinity`（火傷 +10%，解鎖：`{ items: { 'mat:ember_core': 5 } }`，區域 `outer`）。
  - 地點：`mist_meadow`（魔物階 1～2，魔王掉 `key:storm_heart` 機率 1）、`thunder_gorge`（階 3～4）。成群 `pack: { everyMs: 6000, size: 10 }`，`maxAlive` 約 80。
- [ ] **Step 4:** 測試 PASS；`npm test`、`npm run build` 通過
- [ ] **Step 5:** `git commit -m "feat(engine): content model and loader for the core rework"`

### Task 3: 自創魔法（ID、推導、相性、天花板、等級）

**Files:** Create `src/engine/spells.ts`、`src/engine/spells.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `Content`、`Spell`、`Material`、`Effect`。
- Produces：
  - `CRAFTED_MAX_LEN = 512`、`HARD_MAX_DEPTH = 8`、`MAX_EFFECTS = 4`、`MAX_SPELL_LEVEL = 50`、`CEILING_FACTOR = 1.25`
  - `craftedId(a: string, b: string): string` → `c(<x>|<y>)`，x、y 依字串排序。
  - `inputToken(input: string, content: Content): string | null`：元素物品 `el:<e>:<g>` → `content.baseSpells[e]`；`mat:` → 原樣；魔法 ID → 原樣；其他 → null。
  - `resolveSpell(id: string, content: Content): Spell | null`：名魔法查表；`c(...)` 解析兩個子 token 遞迴推導；結果以 `WeakMap<Content, Map<string, Spell | null>>` 快取。
  - `affinityOf(a: ElementId[], b: ElementId[]): 'good' | 'odd' | 'bad'`，相性表照 spec 6.4（好：火風、水雷、風雷、土火、水風、火雷；差：火水、土雷；其他 0），兩兩加總，>0 good、<0 bad、0 odd。
  - `attackCeiling(tier: number, content: Content): number` = `CEILING_FACTOR ×` 名魔法中「階級 ≤ tier」的最大攻擊力。
  - `spellAtLevel(spell: Spell, level: number): Spell`。

推導規則（`resolveSpell` 對 `c(A|B)`，A、B 為排序後順序；材料的 attack＝0、depth＝0、cooldown＝0、effects＝`[material.effect]`）：
  - `elements`：兩邊聯集，依 `ELEMENT_ORDER` 排序。`affinity = affinityOf(A.elements, B.elements)`。
  - `depth = max(A.depth, B.depth) + 1`；> `HARD_MAX_DEPTH` → null。
  - `tier = min(20, max(A.tier, B.tier) + (good ? 1 : 0))`。
  - `attack = min(attackCeiling(tier), round(max(A.attack, B.attack) × gain))`，`gain`：good `1 + 0.35 × 0.7^(depth−1)`、odd `1`、bad `0.6`。
  - `cooldownMs`：任一邊是材料 → 另一邊的冷卻；否則 `min(6000, round((A.cd + B.cd) × 0.6))`。
  - `effects`：A 的效果與 B 的效果，魔法來源的 `mult × 0.6`、材料來源不縮放；截到 `MAX_EFFECTS`（A 先）；bad 時再附加 `{ kind: 'backfire', chance: 0.3, stunMs: 1200 }`（只留一個 backfire）。
  - `name = (bad ? '失控的' : '') + A.words.pre + B.words.noun`；`nameEn = (bad ? 'Unstable ' : '') + A.words.preEn + ' ' + B.words.nounEn`；`words = { pre: A.pre, noun: B.noun, preEn: A.preEn, nounEn: B.nounEn }`。
  - `desc`：good「{A}和{B}互相增幅。」、odd「{A}和{B}同時發動。」、bad「{A}和{B}互相干擾，威力下降，偶爾會反噬自己。」（{A}、{B} 是名稱）。
  - `named: false`。

等級縮放（`spellAtLevel`，L 夾在 1～50）：`attack × (1 + 0.08 × (L−1))`；`tier + floor((L−1)/10)`（上限 20）；`bolt.count`、`blades.count`、`chain.hops`、`meteor.count`、`zone.strikes`（>0 才加）各 `+ floor((L−1)/10)`；所有 `radius` `× (1 + 0.02 × (L−1))`。L=1 回傳原物件。

- [ ] **Step 1: 寫失敗的測試**（用 Task 2 的 `content`）
  - `crafted ids and names do not depend on input order`：`craftedId('fireball','mat:ember_core') === craftedId('mat:ember_core','fireball')`；兩者 `resolveSpell` 的 `name` 相同。
  - `derives a good-affinity spell`：`resolveSpell(craftedId('fire_tornado','lightning'))` 的 `elements` 為 `['fire','wind','thunder']`、`affinity` 'good'、`depth` 2、`tier` 5、效果數 ≤ 4、`named` false。
  - `derives a bad-affinity spell with a backfire`：火＋水的自創魔法（`craftedId('fireball','water_wave')`）`affinity` 'bad'、名稱以「失控的」開頭、恰好一個 `backfire`。
  - `material modifies a spell`：`craftedId('lightning','mat:ember_core')` 的 effects 包含材料效果原樣（mult 未縮放）、`cooldownMs === lightning.cooldownMs`、`depth` 1。
  - `rejects malformed, oversized and over-deep crafted ids`：`'c(fireball|'`、`'c(|)'`、`'c(nope|fireball)'`、長度 513 的 ID、巢狀 9 層 → 全部 null；巢狀 8 層的合法 ID 不是 null；`resolveSpell` 不丟例外。
  - `deep good chains stay under the attack ceiling`：從 `fire_tornado` 開始反覆與 `lightning`、`wind_blade` 交替組合到深度 8，每一層 `attack ≤ attackCeiling(tier)`，且至少有一層的攻擊力超過同階名魔法的最大值（「不一定比名魔法弱」）。
  - `spellAtLevel scales damage, counts, radius and tier`：L=11 時 attack ×1.8、tier +1、`bolt.count` +1、radius ×1.2；L=1 回同一個物件；L=99 夾成 50。
- [ ] **Step 2:** FAIL
- [ ] **Step 3: 實作**（解析器只接受 `c(` 開頭、`)` 結尾，逐字掃描以括號深度找頂層的 `|`；任何不符直接 null，不用正則回溯）
- [ ] **Step 4:** PASS；`npm test`、`npm run build`
- [ ] **Step 5:** `git commit -m "feat(engine): crafted spells derived deterministically from their ids"`

### Task 4: 合成 v2

**Files:** Create `src/engine/crafting.ts`、`src/engine/crafting.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `craftedId`、`inputToken`、`resolveSpell`；Task 5 的 `depthCap` 尚不存在 → 本任務 `synthesize` 接受 `opts.depthCap: number`，Task 5 之後由呼叫端傳 `depthCap(state, content)`。
- Produces：
  - `requiredGrade(depth: number): number = min(5, max(1, depth))`
  - `type SynthResult = { kind: 'learned'; spellId: string; crafted: boolean } | { kind: 'duplicate'; spellId: string; refunded: ItemId[] } | { kind: 'noReaction' } | { kind: 'dormant' } | { kind: 'overload'; spellId: typeof OVERLOAD_SPELL } | { kind: 'rejected'; reason: 'slots' | 'unknownInput' | 'insufficient' | 'grade' }`
  - `comboKey(inputs: string[]): string`（排序後以 `+` 連接，沿用 MVP 寫法）
  - `synthesize(state: GameState, inputs: string[], content: Content, rng: Rng, opts: { depthCap: number }): { state: GameState; result: SynthResult }`

規則（依序）：
1. 輸入不是 2 個 → `rejected slots`。每個輸入必須是：背包裡有的元素／材料（`ITEM_ID_RE`、兩個相同時要有 2 個）、或 `learned` 裡的魔法 ID；`key:` 物品與其他字串 → `unknownInput`；物品數量不足 → `insufficient`。
2. 有名魔法配方（`comboKey` 對 `recipe.inputs`）：沿用 MVP 的資格（`prerequisites` 都學過才可抽）與權重擲骰；無可抽結果 → `dormant`（不消耗）。抽到 `spellId: null` → 走第 4 步的自創魔法。抽到已學會 → `duplicate`，退回第一個物品輸入（排序後），沒有物品輸入就不扣。其餘：扣掉所有物品輸入；若兩個輸入都不是元素物品，另扣第 4 步的「融合成本」（以結果魔法的元素與 `depth` 計算），`learned` 加入。名魔法的 `depth` 由資料給定：`mana_bolt` 與基礎魔法 0、同元素強化與雙元素 1、再上一層 2，依此類推。
3. 沒有配方、兩個都是物品 → `noReaction`，**不消耗**，記錄 `noReaction: true`。
4. 自創：`id = craftedId(inputToken(a), inputToken(b))`；`spell = resolveSpell(id)`（null → `unknownInput`）。
   - 成本：所有物品輸入；元素物品的階級必須 ≥ `requiredGrade(spell.depth)`，否則 `rejected grade`（不消耗）。若兩個輸入都不是元素物品，另扣「融合成本」：結果的每個元素各 1 個 `el:<e>:<requiredGrade(depth)>`，缺 → `insufficient`。
   - `spell.depth > opts.depthCap` → 扣成本、學會 `mana_overload`（已會則 `duplicate`），結果 `overload`。
   - 已學會 → `duplicate`，**全部退回**（`refunded` 為所有被扣的物品）。
   - 否則學會，`{ kind: 'learned', crafted: true }`。
5. 每次（除了 `rejected`）都寫 `synthesisLog[comboKey]`（`results` 的鍵：學到的魔法 ID、`none`、`overload`）。

- [ ] **Step 1: 寫失敗的測試**（`createRng(1)`、手工的 `GameState` v2 物件）
  - `teaches a base spell from two grade-1 elements`、`teaches the self spell from base + grade-2 element`、`fuses two learned spells into a named spell (fire_tornado)`（扣融合成本：火、風各 1 個 `requiredGrade(1)=1` 階）。
  - `crafts a spell when no recipe matches`：`fireball + el:thunder:2` → `learned crafted`、ID 等於 `craftedId('fireball','lightning')`，背包少 1 個 `el:thunder:2`。
  - `synthesize is order independent`：反過來的輸入得到同樣的 `state.learned`。
  - `rejects a too-low grade for a deep infusion`：學會深度 2 的自創魔法後，再注入 `el:fire:1`（結果深度 3，需要高階）→ `rejected grade`，背包不變。
  - `overloads past the depth cap`：`opts.depthCap = 1` 時合成深度 2 → `overload`，`learned` 含 `mana_overload`。
  - `items without a recipe do nothing`：`mat:ember_core + mat:ember_core` → `noReaction`，背包不變、log `noReaction: true`。
  - `a crafted duplicate refunds everything`、`a named duplicate refunds the first item`。
  - `unknown or unowned inputs are rejected`：沒學過的魔法、`key:storm_heart`、`'drop table'` → `unknownInput`。
  - `a random recipe can fall through to the crafted spell`：測試內自建一個 `Recipe`（outcomes `[{spellId:'fire_tornado',weight:1},{spellId:null,weight:1}]`）塞進複製的 content，用兩個不同 seed 分別得到兩種結果。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** PASS；`npm test`、`npm run build`
- [ ] **Step 5:** `git commit -m "feat(engine): synthesis v2 with named and crafted spells"`

### Task 5: 技能樹（迷霧、關鍵道具、被動）與強化

**Files:** Create `src/engine/tree.ts`、`src/engine/tree.test.ts`、`src/engine/empower.ts`、`src/engine/empower.test.ts`

**Interfaces:**
- Produces（`tree.ts`）：
  - `BASE_DEPTH_CAP = 3`；`depthCap(state, content): number = min(HARD_MAX_DEPTH, 3 + Σ depth 被動的 add)`
  - `visibleRegions(state, content): Set<string>`（`initiallyVisible` ∪ `revealed`）
  - `revealRegion(state, keyItemId, content): { state; result: { kind: 'revealed'; region: string } | { kind: 'rejected'; reason: 'unknown' | 'notOwned' | 'alreadyRevealed' } }`（扣 1 個關鍵道具）
  - `passiveRequirementMet(state, passiveId, content): boolean`：`items` 看背包數量；`boss` 看 `defeatedBosses`；`learned` 看已學會的名魔法數（`element` 非 null 時只算含該元素者）。
  - `unlockPassive(state, passiveId, content): { state; result: { kind: 'unlocked' } | { kind: 'rejected'; reason: 'unknown' | 'already' | 'hidden' | 'requirement' } }`（`hidden`：節點所在區域不可見；`items` 解鎖會扣物品）
  - `passiveBonuses(state, content): { damagePct: Record<ElementId | 'all', number>; cooldownPct: number }`
- Produces（`empower.ts`）：
  - `empowerCost(spell: Spell, level: number): ItemId[]`（從 level 升到 level+1）：每個元素 `4 + 2 × ((level−1) % 10)` 個 `el:<e>:<1 + floor((level−1)/10)>`。
  - `empower(state, spellId, content): { state; result: { kind: 'empowered'; level: number } | { kind: 'rejected'; reason: 'notLearned' | 'maxLevel' | 'noElements' | 'insufficient' } }`；`levels[spellId]` 不存在視為 1。

- [ ] **Step 1: 寫失敗的測試**
  - tree：`reveals a region with a key item and consumes it`、`rejects revealing without the item or twice`、`unlocks an item passive only when visible and affordable`（`ember_affinity` 在 `outer`，未拓展 → `hidden`；拓展後物品不足 → `requirement`；足夠 → 扣 5 個、`passives` 加入）、`boss and learned-count requirements`（測試內建 passive）、`depth passives raise the cap up to HARD_MAX_DEPTH`、`passiveBonuses sums damage per element and cooldown`。
  - empower：`level 1 -> 2 costs 4 grade-1 units per element`、`level 11 -> 12 costs grade-2 units`、`a dual-element spell pays both elements`、`mana_bolt cannot be empowered (noElements)`、`stops at MAX_SPELL_LEVEL`、`works for crafted spells`、`max level stays bounded`（深度 8 的極佳自創魔法在 L=50 時，`spellAtLevel(...).attack` ≤ `attackCeiling(原階級) × (1 + 0.08 × 49)`，且 tier ≤ 20）。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** PASS；`npm test`、`npm run build`
- [ ] **Step 5:** `git commit -m "feat(engine): fogged skill tree, key items, passives and spell empowerment"`

### Task 6: 2D 戰鬥

**Files:** Create `src/engine/combat.ts`、`src/engine/combat.test.ts`；Modify `src/engine/combat-rules.ts`（新增 `computeDamage`，舊的 `computeHit` 留到 Task 8 刪）

**Interfaces:**
- Consumes: `resolveSpell`、`spellAtLevel`、`passiveBonuses`、`canDamage`、`overlevelEfficiency`、`affinityMultiplier`。
- Produces（`combat-rules.ts`）：`computeDamage(attack: number, spell: { tier: number; attack: number; elements: ElementId[] }, monster: Monster, opts: { frozen: boolean; wetThunder: boolean; bonusPct: number }): number`——`canDamage` 不過回 0；否則 `round(attack × 100/(100+defense) × 相剋 × (frozen ? 1.5 : 1) × (wetThunder ? 2 : 1) × (1 + bonusPct/100))`，至少 1。
- Produces（`combat.ts`）：

```ts
export const STEP_MS = 50;
export const STOP_R = 0.15;
export const MAX_ACTIVE_FX = 24;
export interface ActiveStatus { kind: StatusKind; remainingMs: number; power?: number }
export interface Foe { uid: number; defId: string; x: number; y: number; hp: number; maxHp: number; statuses: ActiveStatus[]; kx: number; ky: number; wander: number }
export interface ActiveFx { uid: number; spellId: string; elements: ElementId[]; effect: Effect; x: number; y: number; ageMs: number; hits: number[] }
export interface Mage { cooldownMs: number; hasteMs: number; hasteFactor: number; stunMs: number }
export interface BattleState { zoneId: string; foes: Foe[]; fx: ActiveFx[]; mage: Mage; spawnTimerMs: number; packTimerMs: number; bossActive: boolean; nextUid: number }
export type BattleEvent =
  | { type: 'spawn'; uid: number; boss: boolean }
  | { type: 'cast'; spellId: string }
  | { type: 'hit'; uid: number; damage: number; immune: boolean; element: ElementId | null }
  | { type: 'status'; uid: number; kind: StatusKind }
  | { type: 'kill'; uid: number; defId: string; drops: ItemId[]; x: number; y: number }
  | { type: 'burst'; x: number; y: number; r: number; elements: ElementId[] }
  | { type: 'chain'; points: { x: number; y: number }[]; elements: ElementId[] }
  | { type: 'strike'; x: number; y: number; elements: ElementId[] }
  | { type: 'backfire'; stunMs: number }
  | { type: 'bossDefeated'; zoneId: string; unlockedZoneId: string | null };
export function createBattle(zoneId: string): BattleState;
export function stepBattle(game: GameState, battle: BattleState, content: Content, rng: Rng): { game: GameState; battle: BattleState; events: BattleEvent[] };
```

行為（數值以原型為準，可調，但要讓下面的測試成立）：
- 座標：圓心 (0,0)、半徑 1。魔物從半徑 1 生成，往圓心走到 `STOP_R + 魔物半徑`；`slow` 速度 ×0.25；`stun`、`freeze` 不動；`blind` 隨機遊走；擊退 `kx/ky` 每秒衰減到 2%；不能超出半徑 1。
- 生成：每 `spawnIntervalMs` 1 隻、每 `pack.everyMs` 一群 `pack.size` 隻（同角度 ±0.12 rad）；一般魔物總數不超過 `maxAlive`；魔王不計入。擊殺數達 `killsForBoss` 時出現魔王（沿用 MVP 的 `zoneKills` 規則與 `bossDefeated`／解鎖下一個地點）。
- 施法：裝備的魔法 `spellAtLevel(resolveSpell(equipped), levels[equipped] ?? 1)`，冷卻再乘 `(1 − cooldownPct/100)`；`hasteMs > 0` 時冷卻流速 ×`hasteFactor`；`stunMs > 0` 不施法；場上沒魔物時不施法。每次施法對每個效果建立一個 `ActiveFx`（`haste`、`backfire` 立即生效；`backfire` 用 rng 擲 `chance`，成功時整次施法只產生 `backfire` 事件與小人暈眩）。`fx` 數量達 `MAX_ACTIVE_FX` 時最舊的先結束。
- 效果執行：`bolt`（飛向目標，命中後半徑內爆炸）、`ring`（由中心擴散，每隻只打一次）、`blades`（向外螺旋、擊退）、`chain`（立即計算跳躍點，`wet` 傷害 ×2，`explode` > 0 時每跳爆炸）、`zone`（持續、每 `tickMs` 對範圍內魔物造成傷害；`pull` > 0 時把魔物往中心拉；`follow` 時往最密集處移動；`strikes` > 0 時每 tick 落雷）、`storm`（每 tick 對隨機魔物落雷）、`meteor`（`delayMs` 後落下爆炸；`lavaMs` > 0 留下燃燒區）、`field`（`delayMs` 後全場）。`densest` 目標：每隻魔物數半徑 0.25 內的鄰居，取最多者（只在需要時計算）。
- 燃燒中的魔物死亡時，把燃燒傳給半徑 0.12 內的魔物。`regen` 讓魔物回血。
- 掉落：沿用 MVP（`overlevelEfficiency` 以「裝備魔法的有效階級」計算）。

- [ ] **Step 1: 寫失敗的測試**（用 Task 2 的 content；需要特定效果時在測試裡建一個只有那個效果的 `NamedSpellDef` 塞進複製的 content）
  - `spawns singles and packs up to maxAlive`、`monsters walk in and stop at the stop ring`、`stun and freeze stop movement, slow slows`
  - `immune hits deal 0 and are reported`（`mana_bolt` 對階 4 魔物）
  - 每種效果一個測試：`bolt explodes on impact`、`ring hits each foe once`、`chain doubles on wet foes`、`zone pulls foes toward its centre`、`storm strikes over time`、`meteor lands after its delay and leaves lava`、`field hits every foe`、`haste speeds up casting`、`backfire stuns the mage and skips the cast`
  - `burning foes spread fire when they die`
  - `kills drop items, reach the boss and unlock the next zone`
  - `active effects never exceed MAX_ACTIVE_FX`（冷卻極短、效果持續很長的測試魔法跑 2000 步）
  - `same seed gives the same events`（同 seed 跑 600 步，事件序列 `toEqual`）
  - `passive damage and cooldown bonuses apply`
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作（效能：每步只對活著的魔物迭代；`densest` 只在施法或 `follow` 時算）
- [ ] **Step 4:** PASS；`npm test`、`npm run build`
- [ ] **Step 5:** `git commit -m "feat(engine): 2d crowd battle with composable spell effects"`

### Task 7: 伺服器切換（存檔 v2、上傳檢查、API、migration、模擬機器人）

**Files:**
- Create: `src/engine/persist.ts`、`src/engine/persist.test.ts`、`src/engine/audit.ts`、`src/engine/audit.test.ts`、`migrations/0004_core_rework.sql`
- Modify: `worker/app.ts`、`worker/app.test.ts`、`worker/index.ts`、`tests/d1/d1-store.test.ts`、`tests/sim/bot.ts`、`tests/sim/pure-paths.test.ts`

**Interfaces:**
- Produces（`persist.ts`）：`createInitialState(content): GameState`（`inventory {}`、`learned ['mana_bolt']`、`equipped 'mana_bolt'`、`levels {}`、`revealed []`、`passives []`、`currentZone`＝第一個地點、`unlockedZones [第一個]`、其餘空）；`serialize(state): string`；`parseState(input: unknown, content): GameState | null`——strict schema `version: 2`；`learned` 每個 `resolveSpell` 不為 null；`equipped ∈ learned`；`levels` 的鍵 ∈ learned、值為 1～50 的整數；`revealed` ⊆ 區域 ID；`passives` ⊆ 被動 ID；地點、魔王、`zoneKills` 鍵同 MVP；背包鍵符合 `ITEM_ID_RE`；不丟例外。
- Produces（`audit.ts`）：`GAIN_TOLERANCE`、`GAIN_SLACK`（沿用 MVP 的值）、`maxKills(zone: Zone, elapsedMs: number): number = floor(elapsed/spawnIntervalMs) + floor(elapsed/pack.everyMs) × pack.size + maxAlive`、`maxGain(prev, elapsedMs, content, zoneIds?)`、`validateUpload(prev, next, elapsedMs, content): ValidationResult`——和 MVP 相同的檢查（魔王、解鎖、`zoneKills`、元素以 `gradeValue` 換算、材料），改用 `maxKills`；魔王最短時間 = `(killsForBoss − 已帶入) / 生成速率`；`key:` 物品與材料一樣受掉落上限；伺服器欄位 `learned`、`synthesisLog`、`levels`、`revealed`、`passives` 必須與 prev 完全相同；「打得到」用 `spellAtLevel(resolveSpell(id), levels[id])` 判斷。
- Produces（`worker/app.ts`）：`AppDeps.data` 改名 `AppDeps.content: Content`；共用 helper `serverAction(c, body, apply: (state: GameState) => { state: GameState; result: { kind: string } })`——`checkUpload` → `apply` → 結果是 `rejected` 時回 422 `{ reason: 'rejected', result, state, revision }`（不寫入）→ 否則 `parseState(serialize(...))` 再確認 → `chargeAnchor` → `commitSave` → 回 `{ result, state, revision }`。端點：
  - `POST /api/synthesize { state, baseRevision, inputs: string[2] }`：每個輸入是字串、長度 ≤ `CRAFTED_MAX_LEN`；以 `synthesize(..., { depthCap: depthCap(state, content) })`；成功後照舊 `recordSynthesis`。
  - `POST /api/empower { state, baseRevision, spellId }`、`POST /api/reveal { state, baseRevision, keyItem }`、`POST /api/passive { state, baseRevision, passiveId }`。
  - `/api/guest`、`/api/login`、`GET /api/save` 回傳的 state 都是 v2。
- `migrations/0004_core_rework.sql`：`UPDATE saves SET state = '<v2 初始 JSON>', anchor_state = '<同一份>', revision = revision + 1, anchor_at = saved_at;`（JSON 字面值就是 `serialize(createInitialState(content))`）。

- [ ] **Step 1: 寫失敗的測試**
  - `persist.test.ts`：初始狀態可被 parse；v1 存檔（MVP 的 `createInitialState` 輸出）→ null；不存在的自創魔法、`levels` 51、`revealed` 不存在的區域 → null。
  - `audit.test.ts`：把 `validate.test.ts` 的情境搬過來改成新型別（正常遊玩通過、超量元素／材料／`zoneKills`、太快打倒魔王、鎖住的地點都被拒）；新增 `pack spawns raise the kill bound`、`key items are bounded by boss drops`、`rejects changed server fields`（`learned`、`levels`、`revealed`、`passives`、`synthesisLog` 各一）。
  - `app.test.ts`：所有 `createApp({...})` 改傳 `content`；`rejects forged crafted spells, levels, reveals and passives`（PUT /api/save 自己加 → 422 `rejected`）；`synthesize crafts a spell and the next upload keeps it`；`empower spends elements and raises the level`；`reveal consumes the key item`；`passive unlock respects the fog`；`a rejected action returns 422 with the result and does not write`；`an over-long input is 400`；`guest and login return a v2 state`。
  - `tests/d1/d1-store.test.ts`：`migration 0004 resets every save to the v2 initial state`（套用 0001～0003、塞一筆 v1 存檔、套用 0004 → `parseState(JSON.parse(state), content)` 等於 `createInitialState(content)`，`revision` +1）。
  - `tests/sim/pure-paths.test.ts`：五條單一元素路線 `clears all zones with 0 rejections`（上限 3 模擬小時）；每條路線學到的魔法只含 `mana_bolt` 與該元素的魔法（含自創）；`mana_bolt only cannot clear thunder_gorge`。
- [ ] **Step 2:** FAIL
- [ ] **Step 3: 實作**
  - `tests/sim/bot.ts` 改用 `combat.stepBattle`、`persist`、新 API。路線策略：`el:X:1 + el:X:1` 學基礎 → 存到 `el:X:2`（用 `upgradeElement`）學同元素強化 → 每 5 分鐘模擬時間把多餘的 X 元素拿去 `POST /api/empower` 強化最強的魔法 → 打不過下一個地點時繼續強化。拿到關鍵道具時呼叫 `/api/reveal`。
  - 調整最小內容的數值，讓五條路線都在 3 模擬小時內打通兩個地點（數值調整是本任務的一部分）。
- [ ] **Step 4:** PASS；`npm test`、`npm run build`
- [ ] **Step 5:** `git commit -m "feat(worker): v2 saves, audit and actions on the core rework engine"`

### Task 8: 瀏覽器切換並刪除舊模組

**Files:**
- Modify: `src/game/{runtime,api,sync,boot}.ts` 與測試、`src/main.tsx`、`src/ui/*.tsx` 與 `picker-data.ts`、`grimoire-layout.ts`、`messages.ts` 與測試、`src/render/battle-view.ts`、`src/render/arena.ts`、`src/render/palette.ts`
- Delete: `src/engine/{battle,synthesis,data,state,save,validate}.ts` 與它們的測試、`src/data/{spells,recipes,monsters,zones}.json`；`types.ts` 只留元素、物品、階級常數；`combat-rules.ts` 刪掉舊的 `computeHit`

**Interfaces:**
- Consumes: Task 2～7 的全部。
- Produces：
  - `GameRuntime` 用 `combat.ts` 的 `BattleState`；新增 `empower(spellId)`、`reveal(keyItem)`、`unlockPassive(id)` 不在 runtime 做——這三個和合成一樣走 `SyncController`：`sync.action(kind: 'synthesize' | 'empower' | 'reveal' | 'passive', payload): Promise<{ kind: string } | null>`（成功時 `runtime.replaceState`；`rejected` 時顯示訊息，存檔不變；網路錯誤回 null）。`sync.synthesize(inputs)` 保留為 `action('synthesize', { inputs })` 的包裝，讓 `SynthesisPanel` 少改。
  - `ApiClient` 新增 `empower(state, baseRevision, spellId)`、`reveal(state, baseRevision, keyItem)`、`unlockPassive(state, baseRevision, passiveId)`，回傳型別與 `synthesize` 相同（`SynthOutcome` 改名 `ActionOutcome`）。
  - `spellLabel(id: string, content): string`（`messages.ts`）：名魔法或自創魔法的名稱。
- 本任務的畫面只求「正確且能玩」：`battle-view.ts` 的魔物改用引擎的 `x, y`（乘上 `arena.radius`，補間沿用 `stepAlpha()`），效果先用現有的形狀畫（`burst`＝擴散環、`chain`＝鋸齒線、`strike`＝落雷線、`ActiveFx` 的 zone／storm 畫半透明圓）。完整特效在 Task 10。
- 介面只做必要的改動：合成槽可以放元素、材料、魔法（從魔導書或下拉選單點選）；元素表顯示五階與新的升階成本；`synthMessage` 支援新的結果種類（`learned` 自創時顯示「自創魔法：<名稱>」、`overload`「魔力過載！」、`rejected grade`「元素階級不夠，需要<階名>以上」）；魔導書照 `content` 的 `node` 畫，迷霧區域的節點不畫。

- [ ] **Step 1:** 先刪除舊模組與舊資料，跑 `npx tsc -b`，記下所有編譯錯誤當作待辦清單（`npm run build` 現在 FAIL）
- [ ] **Step 2:** 依清單逐檔改型別與呼叫；同時改相關的測試（`runtime.test.ts`、`sync.test.ts`、`App.test.tsx`、`SynthesisPanel.test.tsx`、`ElementTable.test.tsx`、`GrimoirePanel.test.tsx`、`TopBar.test.tsx`、`picker-data.test.ts`、`messages.test.ts`、`arena.test.ts`、`BattleCanvas.test.tsx`），新增：`sync.action('empower') adopts the server state`、`a rejected action keeps the state and reports the result`、`synthesis slots accept a learned spell`、`ElementTable shows five grades and the escalating cost`、`fogged nodes are not drawn`
- [ ] **Step 3:** `npm test`、`npm run build` 通過；`grep -rn "engine/battle'\|engine/data'\|engine/state'\|engine/save'\|engine/validate'\|engine/synthesis'" src worker tests` 沒有結果
- [ ] **Step 4:** `npm run dev` 用 headless Chrome（scratchpad 的 puppeteer 腳本）開一次：遊客開始、戰場有成群魔物、`el:fire:1+el:fire:1` 合出火球、換上後火球會打怪，console 沒有錯誤
- [ ] **Step 5:** `git commit -m "refactor: switch the client to the core rework engine and drop the mvp modules"`

### Task 9: 完整內容與平衡

**Files:** Modify `src/data/content/*.json`、`src/engine/content.test.ts`、`tests/sim/pure-paths.test.ts`、`tests/sim/bot.ts`（策略需要時）

**內容要求**（數字為下限；ID 用英文小寫底線，名稱繁中＋`nameEn`，每個名魔法都要有 `words` 與殘卷 `hint`）：
- 五元素的**所有兩兩組合（含同元素）都有名魔法**：5 基礎、5 同元素強化、10 雙元素（原型的火焰龍捲、感電之海、雷暴雲、隕石、冰風暴、雷炎鎖鏈、泥沼、沙塵暴、蒸氣、接地；雙元素以「基礎＋基礎」融合學會，部分也可用「基礎＋另一元素的中階」注入學會）。
- **每個元素的純屬性路線**再往上兩層（每元素 2 個，階 5～8），讓單一元素玩家能打通全部地點。
- **第二層以上的組合名魔法** ≥ 6，包含原型的雷火颶風（火焰龍捲＋`el:thunder:2`）、雷鳴海嘯、流星雨、雷雨雲（蒸氣＋雷：失敗作也值得留著）、冰封大地；至少 2 個放在玩家還看不到的區域（亂合可以撞中）。
- **隨機的特殊配方** ≥ 2（例如「聖光審判」「深淵吞噬」，成功機率 ≤ 10%，失敗時 `spellId: null` 落到自創魔法）。
- 材料 ≥ 8（每個地點至少 2 種、每種有元素傾向與一個效果）；關鍵道具 ≥ 3（每個魔王首殺必掉）；被動 ≥ 6（含 2 個 `depth` +1、至少一個 `boss` 與一個 `learned` 解鎖）。
- 區域 ≥ 4（中心可見 + 3 個靠關鍵道具揭開），地點 ≥ 4（魔物階 1～2、3～4、5～6、7～8，每個地點有自己的元素傾向）。

- [ ] **Step 1: 寫失敗的測試**（`content.test.ts`）：`every element pair has a named spell`（對 15 組 `el:X:1+el:Y:1` 或「基礎＋基礎」能找到名魔法配方）、`each element has a pure line to the top tier`、`at least two named spells sit in hidden regions`、`each boss drops a key item that reveals a different region`、`random recipes succeed at most 10% and fall through to crafted`、`materials and key items are all dropped somewhere`、`counts meet the minimums`（上列數字）。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 寫內容、調數值；`tests/sim/pure-paths.test.ts` 改成「打通全部地點、上限 4 模擬小時、0 次被拒」，並加一條 `mixed` 路線（火＋風，學火焰龍捲與雷火颶風）也要打通、0 次被拒。
- [ ] **Step 4:** PASS；`npm test`、`npm run build`；記錄每條路線的通關時間到帳本
- [ ] **Step 5:** `git commit -m "feat(content): full named spell set, materials, key items, passives and zones"`

### Task 10: 元素特效與戰鬥回饋

**Files:** Create `src/render/element-fx.ts`、`src/render/element-fx.test.ts`；Modify `src/render/battle-view.ts`、`src/render/effects.ts`

**Interfaces:**
- Produces（`element-fx.ts`，純函式，可測）：
  - `particleStyle(element: ElementId): { color: string; vy: number; size: [number, number]; lifeMs: [number, number]; shape: 'spark' | 'streak' | 'bolt' | 'shard' | 'drop' }`——火：橘色火星往上飄（`vy < 0`）；風：青色弧線；雷：黃白鋸齒；土：褐色碎片（往下掉）；水：藍色水滴。
  - `blendForSpell(elements: ElementId[]): { primary: string; secondary: string | null; shapes: string[] }`：組合魔法同時帶兩邊的顏色與形狀。
  - `multiKillLabel(killTimesMs: number[], nowMs: number): { n: number } | null`：0.8 秒內 ≥ 6 隻回 `{ n }`。
  - `shakeFor(effect: Effect): number`：`meteor`、`field`、`zone`（strikes > 0）會震動，其他 0。
- `battle-view.ts`：依 `ActiveFx.effect.kind` 畫持續效果（龍捲旋轉橢圓＋火色、雷雲、泥沼／熔岩區、冰凍藍色覆蓋、蒸氣霧）；`burst`／`chain`／`strike` 事件用 `blendForSpell` 的顏色與粒子；魔物身上顯示狀態（燃燒橘框、濕藍框、凍結淺藍、暈眩星號、失明灰）；畫面上方「×N 一網打盡！」；施法名稱浮字；畫面震動。粒子池上限 1500。
- 效能：沿用試玩修正的量測方式（`PerfMeter`）在 headless Chrome 跑「上限魔物＋雷火颶風」30 秒，記錄平均幀時間到帳本；目標每幀 ≤ 16.7ms（headless 的 swiftshader 慢很多時，以「沒有長時間卡住、無錯誤」為準並記錄）。

- [ ] **Step 1: 寫失敗的測試** `element-fx.test.ts`：每個元素的 `particleStyle`（火 `vy < 0`、土 `vy > 0`、顏色等於 `palette.ts`）；`blendForSpell(['fire','wind'])` 兩個顏色都在；`multiKillLabel` 5 隻 null、6 隻 `{n:6}`、超過 0.8 秒的不算；`shakeFor`。
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作 `element-fx.ts` 與 `battle-view.ts`
- [ ] **Step 4:** PASS；`npm test`、`npm run build`；headless 截圖：火焰龍捲、感電之海、隕石各一張存到 scratchpad，確認看得出兩種元素
- [ ] **Step 5:** `git commit -m "feat(render): element particle language, effect visuals and multi-kill feedback"`

### Task 11: 新介面（發現展示、魔法筆記、強化、迷霧技能樹）

**Files:** Create `src/ui/DiscoveryBanner.tsx`、`src/ui/Notebook.tsx`、`src/ui/EmpowerPanel.tsx` 與測試；Modify `src/ui/GrimoirePanel.tsx`、`src/ui/grimoire-layout.ts`、`src/ui/App.tsx`、`src/ui/App.css`、`src/ui/SynthesisPanel.tsx` 與測試

**Interfaces:**
- `DiscoveryBanner({ spell: Spell | null; isNew: boolean; onDone(): void })`：在戰場中央顯示「新發現！」／「已經會了」、元素點、名稱、相性標籤（基礎／同元素強化／相性極佳／奇妙／相性差）與說明，2.6 秒後呼叫 `onDone`。合成結果 `learned` 時顯示並**自動裝備**（`runtime.equip`，合成回應之後才裝，避免被回應覆蓋）。
- `Notebook({ runtime, content, onPick(spellId) })`：列出 `learned` 中的自創魔法（`named: false`），每列：元素點、名稱、相性標籤、等級、「裝備」、點列放進合成槽。
- `EmpowerPanel({ spellId, runtime, sync, content })`：顯示目前等級、下一級成本（`empowerCost`，用階名顯示）、背包是否足夠、「強化」按鈕（送出中顯示「強化中…」並鎖住，沿用 `synthPending` 的鎖）。
- `GrimoirePanel`：節點＝名魔法＋被動；不可見區域畫成迷霧（只畫區域外框與「？」，不畫節點）；可見但未學會的名魔法顯示名稱與殘卷線索；被動節點顯示條件與「解鎖」按鈕（`passiveRequirementMet`）；背包有關鍵道具時顯示「使用<道具名>」按鈕，成功後播放迷霧散開的動畫（CSS 過渡即可）。點已學會的名魔法：放進合成槽／裝備／開啟強化。
- 版面：三欄不變（戰鬥｜魔導書（技能樹＋筆記分頁）｜元素表＋合成）；360px 寬不能有橫向捲動。

- [ ] **Step 1: 寫失敗的測試**：`DiscoveryBanner shows the tag and hides after 2.6 s`（fake timers）；`a new synthesis result is equipped after the reply`；`Notebook lists only crafted spells and picks into the slots`；`EmpowerPanel shows the next cost and locks while pending`；`fogged regions show no nodes and a key item reveals them`；`passive unlock button only when the requirement is met`
- [ ] **Step 2:** FAIL
- [ ] **Step 3:** 實作
- [ ] **Step 4:** PASS；`npm test`、`npm run build`；headless Chrome 1280／360 寬：無橫向捲動、新發現橫幅、筆記、強化、使用關鍵道具後迷霧散開
- [ ] **Step 5:** `git commit -m "feat(ui): discovery banner, spell notebook, empowerment and the fogged grimoire"`

### Task 12: 驗收與文件

- [ ] `npm run db:migrate:local` 套用 0004；`npm run dev`；headless Chrome 跑一輪：遊客 → 合出火球 → 存元素升階 → 合出同元素強化 → 融合出火焰龍捲（看到「新發現！」與成群清場、「一網打盡」）→ 自創一個魔法並出現在筆記 → 強化一次 → 打倒第一個魔王拿到關鍵道具 → 使用後迷霧散開 → 解鎖一個被動 → 綁定帳號的玩家重新整理後進度都在。截圖存到 scratchpad。
- [ ] AGENTS.md：第 2 節加本 spec 與計畫；第 3 節狀態、測試數、模擬通關時間；第 5 節架構地圖換成新模組；第 6 節「不能違反的規則」更新（保留的 MVP 規則、伺服器欄位多了 `levels`／`revealed`／`passives`、元素五階與升階成本、`MAX_ACTIVE_FX`）；第 8 節已知問題；第 10 節交接紀錄。`docs/prelaunch-checklist.md` 加：遠端 D1 要套用 0004（會重置所有存檔）。
- [ ] 帳本 `docs/superpowers/sdd/2026-10-22-core-rework/progress.md`（從工作區複製過來）。
- [ ] `git commit -m "docs: record the core rework"`
