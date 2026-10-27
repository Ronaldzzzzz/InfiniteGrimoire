# 魔法階級曲線、第一批魔法與地圖擴充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓每高一階的魔法 DPS 穩定約 ×1.7，補齊五純屬 Lv.2～9、稀有改 Lv.10，新增兩個地點與星界，並加上面板公開、光暗技能樹、魔王倒數、放回上次組合、學會時詢問裝備。

**Architecture:** 規則改在引擎（`spells.ts`、`empower.ts`、`crafting.ts`、`content.ts`），內容全在 `src/data/content/*.json`；平衡靠新的共用量測模組 `tests/sim/measure.ts` 與 `tests/sim/tier-curve.test.ts` 把關，模擬機器人走新路線。介面只加小元件，訂閱一律用窄 selector。

**Tech Stack:** TypeScript、React、Pixi、zod、Hono（worker）、vitest。

**Spec:** `docs/superpowers/specs/2026-10-27-tier-curve-and-map-expansion-design.md`（第二版，含 9.3、9.4 與附錄總表）。執行者兩份都要讀；本計畫沒寫到的照規格。

**Branch：** `feat/spell-tiers`（已從 `feat/rare-tuning` 開出）。帳本：`docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`（每個任務完成記一行；`Ruling:` 行記實作時的決定）。

## Global Constraints

- 介面文字繁體中文；資料名稱附 `nameEn`。「Lv.」永遠是階級，強化寫「強化 +N」（R17）。
- `TIER_STEP = 1.7`（可調 1.5～2.0），放在 `src/engine/spells.ts`，量測、測試、強化都讀它。
- 名魔法 `tier`：非稀有 1～9，稀有一律 10；稀有配方 = 同屬性 Lv.9 名魔法 ＋ 素材，權重 稀有 1 : 落空 49。
- 強化只改攻擊：`attack × (1 + (TIER_STEP − 1) × (L − 1) / 49)`；`MAX_SPELL_LEVEL` 仍 50。
- 自創魔法 `tier = min(9, max(A, B) + (good ? 1 : 0))`；`attackCeiling` 只看非稀有。
- 名魔法 `depth`：Lv.1～2 → 0、Lv.3～4 → 1、Lv.5～6 → 2、Lv.7～10 → 3。
- 技能樹 `ring = tier − 1`；區域：core Lv.1～4、outer Lv.5～6、rift Lv.7、abyss Lv.8、zenith Lv.9、astral Lv.10。
- 不改：`audit.ts`、`canDamage`、越級遞減、`computeDamage` 公式、`HARD_MAX_DEPTH`、`MAX_ACTIVE_FX`、`ENGAGE_R`。
- 不需要 migration；名魔法 id 只增不刪。
- `tests/sim` 各路線 0 次被拒；worker 對抗測試全過；被拒時找原因，不放寬容許值。
- 每個任務結束前 `npm test` 與 `npm run build` 都過（標了「暫不強制」的量測斷言除外，見 Task 5）。
- Commit 用 Conventional Commits（英文），結尾：
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01BbLnQR1oxFiq58K5QZz56M`
- 不 push、不合併、不部署；不 commit `.dev.vars`。

## 計畫層級的 Ruling（寫計畫時決定，執行時照做）

- **R1 稀有配方的落空成本＝素材本身。** 現行規則下，「魔法＋素材」沒有元素輸入，所以會收融合成本（落空的自創魔法深度 4 → 每種屬性 1 個極階），而且重複時退還素材；加上素材的屬性常含其他屬性（例如落雷岩 `fulgurite` 是土＋雷），純雷玩家刷九天雷獄會需要極階土。改成：**配方存在、且輸入含素材時，不收融合成本**（`crafting.ts` 的 `plan()` 裡 `fused` 多一個條件）。效果：每次嘗試只扣 1 個素材（落空重複時 `spent.length === 1`，照現行規則不退），稀有成功也不另收元素。只影響有配方的「魔法＋素材」組合；沒有配方的「魔法＋素材」自創照舊收融合成本。
- **R2 新增的內容檢查**：配方的 `comboKey(inputs)` 不得重複（新舊配方輸入改動多，重複會被 `findRecipe` 默默覆蓋）。
- **R3 新手引導**：`Onboarding.tsx` 沒有依賴「學會就自動裝備」的步驟（已查），規格 9.3 最後一點不需要改動。
- **R4 量測斷言分階段啟用**：Task 5 寫好 `tier-curve.test.ts`，Task 6 寫好新的模擬目標，兩者的斷言在調平完成（Task 7）前用 `ENFORCE` 常數關著（只印報告）；Task 7 打開並讓它們通過。

## Review Focus

1. **舊存檔**：已學會舊稀有（Lv.8 的焚世之焰等）、聖光審判、以及含它們的自創魔法（例如 `c(inferno|worldfire)`）的存檔，改版後仍要通過 `parseState`，深度不超過 `HARD_MAX_DEPTH`。→ Task 2 的 `persist.test.ts` 測試。
2. **配方輸入重複**：改動後兩條配方輸入相同會讓其中一條永遠不生效。→ Task 2 的 R2 檢查與測試。
3. **學會通知與狀態更新競爭**：通知還在、存檔已被伺服器（409 衝突）換掉而沒有那招時，按「裝備」不能裝上不存在的魔法；3 秒到期一定不裝備。→ Task 11 的測試。
4. **`localStorage` 的上次組合壞掉**：不是 JSON、長度不是 2、裡面是已不存在的 id → 按鈕停用並顯示原因，不丟例外。→ Task 10 的測試。
5. **光暗分頁在星界未解開時**：只顯示迷霧，不洩漏名稱與線索；解開後雙擊放入合成台、泡泡、詳情卡都能用。→ Task 9 的測試。

---

### Task 1: 強化、自創與稀有配方成本的引擎規則

**Files:**
- Modify: `src/engine/spells.ts`（`TIER_STEP`、`MAX_CRAFTED_TIER`、`spellAtLevel`、`attackCeiling`、`derive`）
- Modify: `src/engine/empower.ts`（`empowerCost`、新增 `empowerGrade`）
- Modify: `src/engine/crafting.ts`（R1）
- Test: `src/engine/spells.test.ts`、`src/engine/empower.test.ts`、`src/engine/crafting.test.ts`

**Interfaces:**
- Produces: `export const TIER_STEP = 1.7`、`export const MAX_CRAFTED_TIER = 9`（`spells.ts`）；`spellAtLevel(spell, level): Spell`（只改 `attack`）；`export function empowerGrade(tier: number, level: number): number`、`empowerCost(spell, level): ItemId[]`（`empower.ts`）。

- [ ] **Step 1: 改寫失敗的測試**
  - `spells.test.ts`：
    - `spellAtLevel(s, 50).attack` ≈ `s.attack * TIER_STEP`（`toBeCloseTo`）；`spellAtLevel(s, 26).attack` ≈ `s.attack * (1 + 0.7 * 25 / 49)`。
    - `spellAtLevel(s, 50)` 的 `tier`、`effects`（含 `count`、`hops`、`strikes`、`radius`）與 `s` 深度相等。
    - 自創：兩個 Lv.9 相性好的輸入，`tier === 9`；用一個只放稀有高攻擊魔法的測試內容，`attackCeiling(10, c)` 不含它。
    - 刪除舊的「強化提高階級／數量」斷言。
  - `empower.test.ts`：
    - `empowerCost` 對單屬性 Lv.2 魔法：L=1 → 2 個 `el:X:1`；L=10 → 6 個 `el:X:1`；L=11 → 2 個 `el:X:1`（`g(2)=1` 封頂）。
    - Lv.9 魔法：L=41 → 2 個 `el:X:4`（`g(9)=4`）；Lv.10：L=41 → 2 個 `el:X:5`。
    - 雙屬性魔法每種屬性各一份。
  - `crafting.test.ts`（R1）：`test content` 裡放一條「Lv.9 名魔法 ＋ 素材 → 稀有 1 : null 49」配方；
    - 落空（rng 選到 null）：只扣 1 個素材、不扣任何元素；第二次落空（自創已會）仍扣 1 個素材、`refunded` 為空；
    - 命中：學會稀有，只扣素材；
    - `fusionNeeds` 對這組回傳 `[]`；
    - 沒有配方的「魔法＋素材」仍收融合成本（舊測試保持通過）。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/engine/spells.test.ts src/engine/empower.test.ts src/engine/crafting.test.ts`，預期新斷言 FAIL。
- [ ] **Step 3: 實作**
  - `spellAtLevel`：L 夾在 1～50；L=1 回傳原物件；否則 `{ ...spell, attack: spell.attack * (1 + (TIER_STEP - 1) * (L - 1) / (MAX_SPELL_LEVEL - 1)) }`。移除 `bump`。
  - `derive`：`tier = Math.min(MAX_CRAFTED_TIER, …)`；`attackCeiling` 跳過 `s.rare`。
  - `empowerGrade(tier, level) = Math.min(1 + Math.floor((level - 1) / 10), clamp(Math.ceil((tier - 1) / 2), 1, 5))`；每種屬性 `2 + Math.floor(((level - 1) % 10) / 2)` 個。
  - `crafting.ts` `plan()`：`const fused = !inputs.some(isElementItem) && !(recipe && inputs.some((i) => i.startsWith('mat:')))`（`recipe` 要先查出來再算 `fused`）。註解寫上 R1。
- [ ] **Step 4: 跑測試確認通過**：同上指令 PASS；再 `npm test`。`tests/sim` 可能因強化變弱而時間變長或卡關——**這一步只要求非 sim 測試全過**；sim 失敗記在帳本，Task 6～7 處理（`ENFORCE` 之前 sim 若擋住，暫時把 `pure-paths`、`rare-cost` 的 `describe` 改 `describe.skip` 並在帳本寫 Ruling，Task 6 恢復）。
- [ ] **Step 5: Commit**：`feat(engine): empower scales attack only, crafted tier caps at 9, rare recipes cost the material`

### Task 2: 內容結構：學派、詠唱詞、光暗樹節點、現有魔法改階與改名

**Files:**
- Modify: `src/engine/model.ts`（`School`、`Spell.school`、`NamedSpellDef.chant`、`TreeNode.tree/side`）
- Modify: `src/engine/spells.ts`（`derive` 算出 `school`；`materialPart` 給 `school`）
- Modify: `src/engine/content.ts`（schema 與檢查 1、4、5、6、8、R2）
- Modify: `src/data/content/spells.json`、`recipes.json`、`regions.json`、`passives.json`
- Test: `src/engine/content.test.ts`、`src/engine/spells.test.ts`、`src/engine/persist.test.ts`

**Interfaces:**
- Produces:
  - `export type School = 'evocation' | 'conjuration' | 'cataclysm' | 'enchantment' | 'forbidden'`；`Spell` 加 `school: School`；`NamedSpellDef` 加 `chant?: string`。
  - `TreeNode = { region: string; ring: number; angle: number; tree?: 'elements' | 'lightdark'; side?: 'light' | 'dark' }`。
  - `export const NAMED_DEPTH = (tier: number) => tier <= 2 ? 0 : tier <= 4 ? 1 : tier <= 6 ? 2 : 3`（`content.ts` 匯出，測試與 Task 3 用）。
  - 新區域 `astral`（`order` 6，`initiallyVisible: false`，名稱「星界」*Astral Sea*）。

- [ ] **Step 1: 寫失敗的測試**（`content.test.ts` 用現有的「改一筆 raw 資料 → 期待 `ContentError` 含某訊息」寫法）
  - 缺 `school` → 錯誤；稀有不是 `forbidden`、非稀有是 `forbidden` → 錯誤；`tier >= 7` 或稀有缺 `chant` → 錯誤。
  - 非稀有 `tier` 10 或稀有 `tier` 不是 10 → 錯誤（檢查 1）。
  - `depth !== NAMED_DEPTH(tier)` → 錯誤（檢查 4）。
  - 兩個名魔法 `words.pre` 相同（或 `noun` 相同）→ 錯誤（檢查 5）。
  - 光暗魔法（`id` 屬於 `LIGHT_DARK_SPELLS = ['holy_judgment', 'abyss_devour']`，`content.ts` 匯出）節點不是 `tree: 'lightdark'` 或缺 `side` → 錯誤；其他名魔法或被動用 `lightdark` → 錯誤（檢查 8）。
  - 兩條配方 `comboKey` 相同 → 錯誤（R2）。
  - 真實內容：每招名魔法 `node.ring === tier - 1`（`node` 為 null 的 `mana_overload` 除外；光暗樹也適用）；區域對照照 Global Constraints。
  - `spells.test.ts`：自創學派取攻擊較高的一邊、同攻擊取 id 排序在前、`forbidden` 降為 `cataclysm`、素材當輸入時取另一邊。
  - `persist.test.ts`（Review Focus 1）：`learned` 含 `worldfire`、`holy_judgment`、`craftedId('inferno', 'worldfire')`、`craftedId('fire_tornado', 'mat:sun_shard')` 的存檔 `parseState` 不為 null，且每個 learned 的 `resolveSpell(...).depth <= HARD_MAX_DEPTH`。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/engine/content.test.ts src/engine/spells.test.ts src/engine/persist.test.ts`。
- [ ] **Step 3: 型別、schema、檢查**：照 Interfaces；`node` schema 加 `tree`、`side` 選填；檢查訊息照現有格式（`spell <id>: ...`）。
- [ ] **Step 4: 改現有資料**（`spells.json` 等；只改這幾項，數值留給 Task 7）
  - 每招加 `school`（Phase 1 文案有寫的照寫，其餘照第一個主要效果：投射類 `evocation`、區域類 `conjuration`、天象大範圍 `cataclysm`、增益或反噬 `enchantment`）；Lv.7 以上與 7 招稀有加 `chant`（Phase 1 文案有的照抄，沒有的照同風格寫一句古語）。
  - `depth` 改成 `NAMED_DEPTH(tier)`；`node.ring = tier - 1`、`region` 照對照表；同環同角度錯開 ±12°。
  - 7 招稀有：`tier: 10`、`school: 'forbidden'`、`region: 'astral'`、`ring: 9`；`holy_judgment` 節點 `{ region: 'astral', ring: 9, angle: 0, tree: 'lightdark', side: 'light' }`、`abyss_devour` 同上 `side: 'dark'`。
  - 改名 11 招（id 不變；`name`、`nameEn`、`words` 取 Phase 1 文案）：`water_wave` 湧泉之環、`tailwind` 翠風祝禱、`earthquake` 地脈震盪、`mire` 腐殖泥潭、`sandstorm` 黃昏沙暴、`steam` 沸霧逆流、`grounding` 地脈噬雷、`rain_cloud` 劫雷積雲、`thunder_tsunami` 狂雷怒濤、`quicksand` 噬骨流沙、`thunder_fire_hurricane` 雷火狂嵐。改名後所有 `hint`、`desc`、被動與關鍵道具說明裡提到舊名的地方一起改（`grep` 舊名確認）。
  - 被動節點跟著區域移到該區域的環（outer → ring 4～5、rift → 6、abyss → 7、zenith → 8）。
  - 這一步還不動配方輸入（Task 3 才改），稀有暫時保留舊配方；檢查 2、3 也在 Task 3 才加。
- [ ] **Step 5: 跑測試確認通過**：`npm test`（sim 照 Task 1 Step 4 的處理）、`npm run build`。
- [ ] **Step 6: Commit**：`feat(content): add spell schools and chants, retier rares to Lv.10, light/dark tree nodes`

### Task 3: 20 招新魔法與純屬性配方鏈

**Files:**
- Modify: `src/data/content/spells.json`、`recipes.json`
- Modify: `src/engine/content.ts`（檢查 2、3）
- Test: `src/engine/content.test.ts`、`src/engine/crafting.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `NAMED_DEPTH`、`School`、`chant`。
- Produces: 新魔法 id 與配方 id（Task 6 的機器人路線用）：

| 屬性 | Lv.4 | Lv.6 | Lv.8 | Lv.9 |
|---|---|---|---|---|
| 火 | `ash_serpents` | `crimson_pillar` | `hellfire_siege` | `corona_scorch` |
| 風 | `gale_cage` | `severing_scythe` | `gale_severance` | `void_gale` |
| 雷 | `arc_cage` | `voltaris_javelin` | `thunder_throne` | `astral_fulmination` |
| 土 | `stone_fangs` | `obsidian_thorns` | `mountain_fall` | `continental_crush` |
| 水 | `torrent_lance` | `abyssal_crush` | `abyssal_prison` | `nether_tides` |

  配方 id：新增 `${e}_lv4`、`${e}_lv6`、`${e}_lv8`、`${e}_lv9`；沿用 `${e}_base`、`${e}_empower`、`${e}_pure_2`（→ Lv.5）、`${e}_pure_3`（→ Lv.7），但輸入改掉。完整鏈（以火為例，`X` 為屬性）：

| 配方 | 輸入 | 結果 |
|---|---|---|
| `fire_lv4` | `flame_burst` ＋ `el:fire:2` | `ash_serpents` |
| `fire_pure_2` | `ash_serpents` ＋ `el:fire:3` | `inferno` |
| `fire_lv6` | `inferno` ＋ `el:fire:3` | `crimson_pillar` |
| `fire_pure_3` | `crimson_pillar` ＋ `el:fire:4` | `sunfall` |
| `fire_lv8` | `sunfall` ＋ `el:fire:4` | `hellfire_siege` |
| `fire_lv9` | `hellfire_siege` ＋ `el:fire:5` | `corona_scorch` |
| `worldfire` | `corona_scorch` ＋ `mat:ember_core` | `worldfire` 1 : null 49 |

  稀有配方輸入（id 不變）：`heavens_breath` = `void_gale` ＋ `mat:roc_feather`；`ninefold_thunder` = `astral_fulmination` ＋ `mat:fulgurite`；`titans_grip` = `continental_crush` ＋ `mat:lava_stone`；`moontide` = `nether_tides` ＋ `mat:tide_scale`；`holy_judgment` = `astral_fulmination` ＋ `mat:sun_shard`；`abyss_devour` = `nether_tides` ＋ `mat:abyss_pearl`；全部 1 : null 49。每招的 `prerequisites` = 配方裡的那個魔法輸入。

- [ ] **Step 1: 寫失敗的測試**
  - `content.test.ts` 真實內容：
    - 每種屬性的純屬非稀有名魔法（`elements` 恰為 `[X]`）Lv.2～9 每階恰好一招（檢查 3）；
    - 每個稀有的配方：一個輸入是 `tier: 9` 名魔法、另一個是素材，結果權重 稀有 1、null 49（檢查 2）；
    - 名魔法總數 67、各階招數照規格附錄（2／5／5／15／11／6／6／5／5／7）；
    - 刪除「稀有約為 Lv.7 的 1.12～1.25 倍」那個測試（約第 336 行）。
  - `crafting.test.ts`：用真實內容走一遍火屬性鏈 Lv.2 → Lv.9（給足元素、依序合成，每步 `learned`），最後 `corona_scorch` ＋ `mat:ember_core` 用固定 rng 命中與落空各一次。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/engine/content.test.ts src/engine/crafting.test.ts`。
- [ ] **Step 3: 加內容**
  - 20 招新魔法：`name`、`nameEn`、`words`、`chant`（Lv.8～9 必填）取 Phase 1 文案（Lv.4、Lv.8 的 10 個名字是規格新取的，`words` 照規則取不重複的 `pre`／`noun`）；`hint` 照新配方寫方向、不寫配方；`desc` 照實際效果。
  - 效果只用現有 10 種形態，每條純屬路線逐階「疊加或升級」（例如火：bolt → bolt＋燃燒 → bolt＋ring → meteor …）；**攻擊、冷卻、mult 先用 `TIER_STEP^(tier−1)` 的粗估值**，精調在 Task 7。
  - 配方照上表；`content.ts` 加檢查 2、3。
- [ ] **Step 4: 跑測試確認通過**：`npm test`（sim 照 Task 1 Step 4）、`npm run build`。
- [ ] **Step 5: Commit**：`feat(content): add the 20 pure-element spells for Lv.4/6/8/9 and move rares onto Lv.9 + material`

### Task 4: 兩個新地點、8 個新魔物、星界與掉落重排

**Files:**
- Modify: `src/data/content/zones.json`、`monsters.json`、`key-items.json`、`passives.json`
- Modify: `src/engine/content.ts`（檢查 7）
- Modify: `docs/art-assets.md`（8 個新魔物的提示詞）
- Test: `src/engine/content.test.ts`

**Interfaces:**
- Produces: 地點 `starfall_plateau`（order 5、`killsForBoss` 180）、`worlds_end`（order 6、220），出怪參數同現有地點；魔物 `meteor_golem`（土 8）、`frost_griffin`（風 9）、`astral_ray`（水 9）、魔王 `fallen_star_wyrm`（火 9）；`ash_giant`（火 9）、`chaos_wisp`（雷 10）、`doom_knight`（土 10）、魔王 `first_page_warden`（風 10）；關鍵道具 `key:star_sigil` 墮星之印（`reveals: 'astral'`，墮星龍掉）；被動 `astral_attunement` 星界共鳴（`{ kind: 'damage', element: null, pct: 5 }`，`unlock: { kind: 'boss', bossId: 'fallen_star_wyrm' }`，節點 `astral`、ring 9）。

- [ ] **Step 1: 寫失敗的測試**（`content.test.ts`）
  - 地點 6 個、依 `order` 魔王階級不遞減；每個地點魔王 `tier` ≥ 一般怪最高 `tier`（檢查 7，含一筆 raw 改壞的錯誤測試）；
  - 每個地點的五種屬性都至少出現一次（魔物或魔王）；
  - 掉落分級（規格 6.2）：星殞高原魔王有 `el:*:5` 掉落且 `chance < 1`；世界盡頭一般怪有 `el:*:5`；新地點一般怪合起來會掉 7 種稀有素材，每隻 2～3 種、`chance` 0.01～0.02；
  - 每種純屬元素在每個地點都有掉落列（R12：每條純屬路線不需要其他屬性）；
  - `first_page_warden` 不掉 `key:` 道具；`key:star_sigil` 只有 `fallen_star_wyrm` 掉。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/engine/content.test.ts`。
- [ ] **Step 3: 加內容**：名稱、英文、說明照規格 6.1 與現有語氣；血量、防禦、速度、半徑、掉率先粗估（Lv.N 魔物的防禦大致讓 Lv.N−1 魔法還打得動、Lv.N−2 打不動），Task 7 精調。現有 4 個地點的掉落照規格 6.2 重排，讓 Lv.4／6／8 需要的元素在主場拿得到。`docs/art-assets.md` 補 8 段提示詞，格式照現有條目。
- [ ] **Step 4: 跑測試確認通過**：`npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(content): add Starfall Plateau, World's End and the astral region`

### Task 5: 共用量測模組與階級曲線測試

**Files:**
- Create: `tests/sim/measure.ts`
- Modify: `scripts/measure-dps.ts`（改成用 `measure.ts`，輸出格式不變，另加「依主場」的摘要）
- Create: `tests/sim/tier-curve.test.ts`
- Test: `tests/sim/measure.test.ts`

**Interfaces:**
- Produces（`tests/sim/measure.ts`）：
  - `export const HOME_ZONE: Record<number, string>`：`{1:'mist_meadow',2:'mist_meadow',3:'mist_meadow',4:'thunder_gorge',5:'thunder_gorge',6:'ember_wastes',7:'sunken_temple',8:'starfall_plateau',9:'worlds_end',10:'worlds_end'}`。
  - `export function soloBossDps(spellId: string, level: number, zoneId: string, opts: { seed: number; ms: number }): number`（情境 A，魔王血量 ×1000）。
  - `export function crowdDps(spellId: string, level: number, zoneId: string, opts: { seed: number; ms: number }): number`（情境 B，20 隻主場最硬一般怪，血量 ×1000）。
  - `export function curveReport(opts: { seed: number; soloMs: number; crowdMs: number }): CurveReport`，`CurveReport = { perSpell: { id: string; tier: number; rare: boolean; soloAt: Record<string, number>; crowdAt: Record<string, number>; empoweredGeoAt: Record<string, number> }[]; failures: string[] }`——`failures` 是規格 7.3 第 1～4 項每條不成立的白話描述（含數字）；量測位置照規格 7.2「在較低那一階的主場」。
  - `export const CURVE_EXEMPT = ['mire', 'sandstorm', 'steam', 'grounding', 'mana_overload']`（只檢查不高於上限）。

- [ ] **Step 1: 寫失敗的測試**（`measure.test.ts`）：用 `mana_bolt` 在迷霧草原：`soloBossDps(..., 1, ...) > 0`；`soloBossDps` 同種子兩次結果相同；`level 50` 的值 ≈ `level 1 × TIER_STEP`（容許 ±15%，因為命中與溢出取整）；`crowdDps` 對打不動的組合（`mana_bolt` 在世界盡頭）回傳 0。
- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run tests/sim/measure.test.ts`。
- [ ] **Step 3: 實作** `measure.ts`（從 `scripts/measure-dps.ts` 的 `quiet`、`clean` 搬過來）；`scripts/measure-dps.ts` 改成 import 它。
- [ ] **Step 4: 寫 `tier-curve.test.ts`**：`const ENFORCE = false`（R4）；一個測試跑 `curveReport({ seed: 20261021, soloMs: 20_000, crowdMs: 10_000 })`，`console.info` 印出每階中位數、倍率與 `failures`；`if (ENFORCE) expect(report.failures).toEqual([])`。整檔時限 60 秒（`{ timeout: 60_000 }`）；量測時間超過時在帳本記錄並縮短 `soloMs`／`crowdMs`。
- [ ] **Step 5: 跑測試**：`npx vitest run tests/sim/measure.test.ts tests/sim/tier-curve.test.ts` PASS（`ENFORCE` 關著）；記下第一份報告到帳本。
- [ ] **Step 6: Commit**：`test(sim): shared DPS measurement and the tier curve report`

### Task 6: 機器人新路線與模擬目標

**Files:**
- Modify: `tests/sim/bot.ts`（`ROUTE_RECIPES`、素材計數）
- Modify: `tests/sim/pure-paths.test.ts`、`tests/sim/rare-cost.test.ts`

**Interfaces:**
- Consumes: Task 3 的配方 id。
- Produces: `ROUTE_RECIPES[e] = [`${e}_base`, `${e}_empower`, `${e}_lv4`, `${e}_pure_2`, `${e}_lv6`, `${e}_pure_3`, `${e}_lv8`, `${e}_lv9`]`；`mixed = ['fire_base', 'wind_base', 'fire_wind', 'thunder_fire_hurricane', 'skyburner', 'fire_empower', 'fire_lv4', 'fire_pure_2', 'fire_lv6', 'fire_pure_3', 'fire_lv8', 'fire_lv9']`（焚天之後接火屬性主幹，依序學）。`BotResult` 加 `gainedItems: Record<ItemId, { atMs: number; n: number }[]>`（素材每模擬分鐘取樣，和 `gained` 同一個迴圈）。

- [ ] **Step 1: 改測試**
  - `pure-paths.test.ts`：`const ENFORCE = false`（R4）；每條純屬路線 `maxSimMs` 360 分鐘；照舊斷言 0 次被拒、只學該屬性、所有區域都解開、清完 6 個地點；時間斷言（規格 6.4：前 4 個魔王 60～240、全部 ≤ 360、每個地點 5～90）放在 `if (ENFORCE)` 裡，否則 `console.info` 印出。混合路線同樣。`mana_bolt only` 測試不變。
  - `rare-cost.test.ts`：起點改成學會該屬性 Lv.9（`corona_scorch` 等）的時間；成本 = `ATTEMPTS (50) / 素材每分鐘掉落數`（R1：每次嘗試 1 個素材；素材用 `gainedItems`，取學會 Lv.9 之後 30 分鐘）；上限常數 `RARE_FARM_CEILING_MIN = 120`，斷言放 `if (ENFORCE)`。
- [ ] **Step 2: 實作 bot 改動**；`summary` 加上每個地點的清除分鐘數，方便調平。
- [ ] **Step 3: 跑**：`npx vitest run tests/sim` PASS（斷言關著），把印出的時間記到帳本。恢復 Task 1～3 期間被 `describe.skip` 的測試。
- [ ] **Step 4: Commit**：`test(sim): bots follow the Lv.2-9 pure lines through six zones`

### Task 7: 調平（數值）並打開所有量測斷言

**Files:**
- Modify: `src/data/content/spells.json`、`monsters.json`、`zones.json`（必要時）
- Modify（只在 Ruling 允許時）：`src/engine/combat.ts`（某施法形態的計算方式，規格 7.4）
- Modify: `tests/sim/tier-curve.test.ts`、`pure-paths.test.ts`、`rare-cost.test.ts`（`ENFORCE = true`）
- Create: `docs/superpowers/specs/2026-10-27-dps-after.md`

- [ ] **Step 1: 把三個檔案的 `ENFORCE` 改成 `true`**，跑 `npx vitest run tests/sim`，確認失敗清單（這是調平目標）。
- [ ] **Step 2: 調**：照規格 7.4——只調名魔法的 `attack`、`cooldownMs`、效果的 `mult` 與數量，魔物的血量、防禦、速度，掉率；不改傷害公式與門檻。可以寫一次性的調平腳本放 scratchpad（不進版本庫）。若某施法形態讓同階無法收斂（例如 `storm`／`field` 單挑魔王），可改它在 `combat.ts` 的計算，**在帳本寫 Ruling 與原因**，並保持 `combat.test.ts` 通過。
- [ ] **Step 3: 確認**：`npx vitest run tests/sim` 全 PASS（tier-curve 第 1～4 項、純屬與混合路線時間、刷稀有 ≤ 120、0 次被拒）；`npm test`、`npm run build`。`TIER_STEP` 若要改，先問使用者（數值最終值要使用者確認），帳本記錄。
- [ ] **Step 4: 完整量測**：`npx esbuild scripts/measure-dps.ts --bundle --platform=node --format=esm --outfile=<scratchpad>/measure.mjs && node <scratchpad>/measure.mjs`，輸出存成 `docs/superpowers/specs/2026-10-27-dps-after.md`（開頭寫一段和 `2026-10-27-dps-baseline.md` 的對照：每階中位數、倍率、最大同階差、強化 +50 對高一階）。
- [ ] **Step 5: Commit**：`balance: tune spells, monsters and drops to the 1.7x tier curve`

### Task 8: 詳情卡與魔法筆記公開數值

**Files:**
- Create: `src/ui/spell-facts.ts`
- Modify: `src/ui/NodeCard.tsx`、`src/ui/Notebook.tsx`、`src/ui/App.css`
- Test: `src/ui/spell-facts.test.ts`、`src/ui/Notebook.test.tsx`、`src/ui/GrimoirePanel.test.tsx`（詳情卡）

**Interfaces:**
- Produces: `export const SCHOOL_NAMES: Record<School, string>`（塑能投射、結界領域、天象災變、秘儀賦予、神話禁咒）；`export const STATUS_NAMES: Record<StatusKind, string>`（燃燒、潮濕、緩速、暈眩、冰凍、致盲、再生）；`export function spellFacts(spell: Spell, level: number, chant?: string): { school: string; attack: number; cooldownSec: string; statuses: { name: string; sec: string }[]; chant: string | null }`。
- `attack` 取 `spellAtLevel(spell, level).attack` 四捨五入；`cooldownSec` 一位小數（`'3.5 秒'`）；同種狀態取最長秒數、依出現順序。

- [ ] **Step 1: 寫失敗的測試**：`spellFacts` 對有燃燒的火球、強化 +50 的攻擊、`forbidden` 稀有的學派名與 `chant`；`Notebook` 與詳情卡出現「學派」「攻擊」「冷卻」文字與琥珀金斜體的詠唱詞（class `spell-chant`）；自創魔法沒有 `chant` 時不顯示那一行。
- [ ] **Step 2: 跑確認失敗**：`npx vitest run src/ui/spell-facts.test.ts src/ui/Notebook.test.tsx src/ui/GrimoirePanel.test.tsx`。
- [ ] **Step 3: 實作**；`.spell-chant { font-style: italic; color: #e8b84a }`。戰鬥中不顯示詠唱詞。
- [ ] **Step 4: 跑確認通過**；`npm test`、`npm run build`（Profiler 測試必須仍過）。
- [ ] **Step 5: Commit**：`feat(ui): show school, attack, cooldown, statuses and chant on spell cards`

### Task 9: 光暗技能樹（左右形式）與 10 環佈局

**Files:**
- Modify: `src/ui/grimoire-layout.ts`（`layoutGrimoire` 排除 `lightdark`；新增 `layoutLightDark`）
- Modify: `src/ui/GrimoirePanel.tsx`（新 prop `tree`）、`src/ui/App.tsx`（三個分頁）、`src/ui/tree-viewport.ts`（`HOME` 能看到 10 環時再調）、`src/ui/App.css`
- Test: `src/ui/grimoire-layout.test.ts`、`src/ui/GrimoirePanel.test.tsx`、`src/ui/App.test.tsx`

**Interfaces:**
- Produces:
  - `export function layoutLightDark(spells: NamedSpellDef[], visible: ReadonlySet<string>, regions: TreeRegion[]): GrimoireLayout`：只取 `node.tree === 'lightdark'`；`x = (side === 'light' ? -1 : 1) * COLUMN_STEP * ring`（`COLUMN_STEP = 60`，ring 0 是中央紋章位置）、`y` 同欄多招時以 `ROW_STEP = 48` 上下錯開置中；`fog` 回傳 `{ region, inner, outer }` 時 `inner`/`outer` 表示 x 方向的半寬（`GrimoirePanel` 在 `lightdark` 時把迷霧畫成矩形帶）。
  - `GrimoirePanel` 新 prop `tree: 'elements' | 'lightdark'`（預設 `'elements'`）。
  - `App` 分頁：`'tree' | 'lightdark' | 'notebook'`，按鈕文字「五元素」「光與暗」「魔法筆記」；`onRevealed` 仍切到 `'tree'`。
- [ ] **Step 1: 寫失敗的測試**
  - `layoutGrimoire` 的結果不含 `holy_judgment`、`abyss_devour`；`layoutLightDark` 在 `astral` 可見時兩招 x 一正一負（光 < 0）、y 相同；不可見時沒有節點、有一條 `astral` 迷霧（Review Focus 5：不含任何名稱）。
  - 10 環：`ringRadius(9)` 的節點在 `HOME` 視窗內（照 `tree-viewport` 現有的視窗測試寫法），同環節點距離 ≥ `2 * NODE_R`。
  - `GrimoirePanel tree="lightdark"`：雙擊節點呼叫 `onPick`；單擊出泡泡；迷霧時 `aria-label="迷霧"`、畫面沒有「聖光審判」文字。
  - `App`：三個分頁可切換；切換不清空合成台。
- [ ] **Step 2: 跑確認失敗**：`npx vitest run src/ui/grimoire-layout.test.ts src/ui/GrimoirePanel.test.tsx src/ui/App.test.tsx`。
- [ ] **Step 3: 實作**；光暗樹中央畫一個紋章（圓＋左右半邊琥珀金／深紫，佔位圖形即可）。縮放、拖曳、泡泡、詳情卡共用現有程式。
- [ ] **Step 4: 跑確認通過**；`npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(ui): separate left-right light/dark tree and a ten-ring grimoire`

### Task 10: 魔王倒數與「放回上次組合」

**Files:**
- Create: `src/ui/BossCounter.tsx`、`src/ui/last-combo.ts`
- Modify: `src/ui/App.tsx`（`.battle` 裡放 `BossCounter`）、`src/ui/SynthesisAltar.tsx`（按鈕與記錄）、`src/ui/App.css`
- Test: `src/ui/BossCounter.test.tsx`、`src/ui/last-combo.test.ts`、`src/ui/SynthesisAltar.test.tsx`

**Interfaces:**
- Produces:
  - `export function bossCounterText(s: Snapshot, content: Content): string`：`bossAlive(s, content)` → `'魔王現身！'`；否則 `` `魔王出現還差 ${Math.max(0, killsForBoss - (zoneKills[zone] ?? 0))} 隻` ``。`BossCounter` 用 `useRuntime(runtime, (s) => bossCounterText(s, content))`（字串，擊殺沒改變數字就不重畫）。
  - `last-combo.ts`：`LAST_COMBO_KEY = 'ig.lastCombo'`；`loadLastCombo(): [string, string] | null`（不是 JSON、不是兩個字串的陣列 → null，例外吞掉）；`saveLastCombo(inputs: string[]): void`（try/catch）；`comboBlocker(combo: [string, string] | null, game: GameState, content: Content): string | null`——null 代表可放回；否則原因：`'還沒有合成過'`、`` `「${名稱}」不夠` ``（元素或素材，兩邊同 id 時要 2 個）、`` `還沒學會「${名稱}」` ``、`'上次的組合已經不存在'`（id 解析不到）。
- [ ] **Step 1: 寫失敗的測試**
  - `bossCounterText`：0 隻擊殺 → `魔王出現還差 40 隻`（迷霧草原）；魔王在場 → `魔王現身！`；`zoneKills` 大於 `killsForBoss` → 0 隻。
  - `BossCounter` 的 Profiler／render 計數：連續兩個不改變數字的 snapshot 不重畫。
  - `last-combo`（Review Focus 4）：壞 JSON、`["a"]`、`[1,2]`、`localStorage` 讀取丟例外 → `null`；`comboBlocker` 四種原因各一個。
  - `SynthesisAltar`：按「合成」後（學會／重複／落空／無反應／被拒都要）呼叫 `saveLastCombo`；「放回上次組合」把兩邊放回並覆蓋原本內容；停用時 `title` 是原因；合成進行中停用。
- [ ] **Step 2: 跑確認失敗**：`npx vitest run src/ui/BossCounter.test.tsx src/ui/last-combo.test.ts src/ui/SynthesisAltar.test.tsx`。
- [ ] **Step 3: 實作**；倒數放在 DPS 數字附近（戰鬥畫面左上，DPS 下方一行），樣式照 `KeyItemBar` 的半透明底。
- [ ] **Step 4: 跑確認通過**；`npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(ui): boss countdown and put-back-last-combo button`

### Task 11: 學會新魔法時詢問是否裝備（待辦 0c）

**Files:**
- Create: `src/ui/EquipToasts.tsx`
- Modify: `src/ui/App.tsx`（移除自動 `runtime.equip`，管理通知佇列）、`src/ui/RareReveal.tsx`（結尾的「裝備／不裝備」）、`src/ui/App.css`
- Test: `src/ui/EquipToasts.test.tsx`、`src/ui/RareReveal.test.tsx`、`src/ui/App.test.tsx`

**Interfaces:**
- Produces:
  - `export const EQUIP_TOAST_MS = 3000`、`export const MAX_EQUIP_TOASTS = 3`；`export interface EquipToast { n: number; spellId: string; name: string }`；`export function pushToast(list: EquipToast[], t: EquipToast): EquipToast[]`（新的放最上面，超過 3 個丟掉最舊的）；`EquipToasts({ toasts, onEquip(n), onExpire(n) })`——每則各自計時 3 秒後 `onExpire`，按鈕只有「裝備」。
  - `RareReveal` props 改成 `{ spell, first, onChoose(equip: boolean) }`：標題階段顯示「裝備」「不裝備」兩個按鈕，點畫面其他地方不關閉；前兩階段點一下仍跳到標題；`prefers-reduced-motion` 直接在標題。
  - `App`：`onSynthResult` 學會一般魔法 → `pushToast`；學會稀有 → 進 `rareQueue`；`onEquip` 與 `onChoose(true)` 時**先確認 `runtime.getSnapshot().game.learned` 仍含那招**才 `runtime.equip`（Review Focus 3）；重複、落空、無反應、被拒不跳通知。
- [ ] **Step 1: 寫失敗的測試**（fake timers）
  - `pushToast`：第 4 個擠掉最舊的；順序新 → 舊。
  - `EquipToasts`：3 秒後 `onExpire`、不呼叫 `onEquip`；按「裝備」呼叫 `onEquip`；畫面只有一個按鈕。
  - `RareReveal`：標題階段有兩個按鈕，點背景不呼叫 `onChoose`；點「不裝備」→ `onChoose(false)`。
  - `App`：學會火焰龍捲後 `runtime.equip` **沒有**被呼叫；按「裝備」才呼叫；3 秒到期不呼叫；通知期間存檔被換成沒有那招的狀態，按「裝備」不呼叫；稀有揭曉選「裝備」呼叫一次。
- [ ] **Step 2: 跑確認失敗**：`npx vitest run src/ui/EquipToasts.test.tsx src/ui/RareReveal.test.tsx src/ui/App.test.tsx`。
- [ ] **Step 3: 實作**；通知放在戰鬥畫面上方中央（不蓋住合成台），文字 `` `裝備「${name}」？` ``。
- [ ] **Step 4: 跑確認通過**；`npm test`、`npm run build`。
- [ ] **Step 5: Commit**：`feat(ui): ask before equipping a newly learned spell`

### Task 12: 驗收與交接

**Files:**
- Modify: `AGENTS.md`（第 2 節表格、第 3.0 節、第 3 節測試數、第 10 節交接紀錄）、`docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`
- 驗收腳本與截圖放 `.superpowers/sdd/2026-10-27-spell-tiers/accept/`（不進版本庫）

- [ ] **Step 1**：`npm test`、`npm run build` 全過，記下檔案數與測試數。
- [ ] **Step 2：瀏覽器驗收（headless 即可，照規格第 12 節）**：本機 `npm run dev`，存檔可以直接改本機 D1 種進去（帳本寫明哪些是種的）。逐項：10 環技能樹桌面（1280×900）與手機（390×844）不重疊；星界迷霧與解開動畫；光暗分頁左右佈局、五元素樹上沒有聖光審判與深淵吞噬；詳情卡學派／數值／詠唱詞；魔王倒數會倒數、魔王在場顯示「魔王現身！」；放回上次組合可用、停用有原因；學會一般魔法跳 3 秒通知不按不裝備、連續 4 個擠掉最舊；稀有揭曉停在裝備選擇；新地點可進入、魔物佔位圖形；GM 工具配方表與地圖分頁列出新內容；無頁面錯誤。
- [ ] **Step 3**：最終全 branch 審查（`superpowers:requesting-code-review`），修 Critical／Important。
- [ ] **Step 4**：更新 AGENTS.md 與帳本（含 R1～R4 與執行中的 Ruling、DPS 對照、模擬時間）；`docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md` 標記已實作。
- [ ] **Step 5: Commit**：`docs: record the spell tier rework acceptance and handoff`
- [ ] **Step 6**：告訴使用者完成，並問要不要合併（`feat/rare-tuning` 與 `feat/spell-tiers` 都還沒合併）；之後主動提出待辦 0b（稀有落空保底）的討論。
