# 魔法陣質感與手感改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 魔法陣改成昏暗書房裡的羊皮紙＋墨線金線，只畫已開放的格子、在格子周圍選元素與符文、合成有儀式感；星圖改相生順序與星座感；動畫期間不劇透新星。

**Architecture:** 只改 `src/ui`（React＋SVG＋CSS）與文件；`src/engine` 只多 export 一個既有的私有函式 `overcomes`，規則、伺服器、存檔、`tests/sim` 都不動。新的幾何是 `circle-draw.ts` 的純函式；元素圈與符文圈是新元件 `RingPicker.tsx`，取代 `CircleTable.tsx` 裡的 `Picker`；劇透修正是 App 層的一個「面紗」（合成開始時的已學會清單）。

**Tech Stack:** React 19、TypeScript、Vitest＋Testing Library（jsdom）、CSS（`src/ui/App.css`）。

**Spec:** `docs/superpowers/specs/2026-10-31-magic-circle-polish-design.md`（逐字問答在 `2026-10-31-magic-circle-playtest-feedback.md`）

## Global Constraints

- Branch `feat/magic-circle`（不開新 branch；未 push、未合併，push／合併前先問使用者）。
- **不改** `src/engine` 的規則、`worker/`、`migrations/`、存檔格式；唯一例外：`src/engine/circle.ts` 的 `overcomes` 改成 `export`（內容不變）。
- 節點仍佔用原本序號 0～4（一環）與 0～4（二環，最多 4 格）；相生＝序號相鄰、相剋＝星線（i, i+2），畫在陣上的線依**規則序號**的關係畫，不是依外形。
- 預測仍**不顯示形態**。
- 動畫時長維持：合成 `PROGRESS_MS` 3000、稀有 `RARE_PROGRESS_MS` 5000、揭曉點一下跳過。新動畫數字都是佔位（墨水暈開 0.6 s、震動 0.4 s／2 px、光柱 0.9 s、稀有變暗不透明度 0.75），結束後交使用者確認。
- 不新增無上限的粒子；`prefers-reduced-motion: reduce` 時所有新動畫關掉、改成直接顯示最終狀態。
- 介面文字繁體中文；配色沿用 `:root` 變數（背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`），元素色用 `COLORS.element`。
- React 效能：`CircleTable` 與 `GrimoirePanel` 只用窄 selector；既有 Profiler 測試（「不因戰鬥或無關掉落重畫」）必須照樣通過。
- 素材：`public/assets/parchment.webp`、`public/assets/desk.webp` 由使用者用 AI 生成；**程式在沒有這兩個檔時要完整可用**（暫代紙張與木桌）。pngtree 參考圖不進版本庫。
- 每個任務結束前 `npm test` 與 `npm run build` 都要通過；`tests/sim` 結果不變（0 次被拒）。
- Commit 訊息 Conventional Commits（英文），結尾加：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BbLnQR1oxFiq58K5QZz56M
  ```
- 帳本：`docs/superpowers/sdd/2026-11-03-magic-circle-polish/progress.md`（每個任務完成記一行；計畫沒寫到的決定記 `Ruling:`）。

## Review Focus

1. **從星圖「放到牛皮紙上」的陣，節點在預設開放序號之外**（例：開放 2 格時載入節點在序號 0 與 2 的 Lv.3 陣）——格子要照樣出現、可合成，不可以消失或擠到別的序號。→ Task 2 測試 `shows a loaded node outside the default open slots`。
2. **先放節點、再把核心換成低階**——圖形不跳動（排列只看 `circleTier`），超出核心上限的空格變暗並說「超過核心上限」。→ Task 2 測試 `lowering the core greys extra slots without moving them`。
3. **面紗卡住**——伺服器拒絕、網路錯誤、元件卸載、換帳號之後，新星都要出現，不能永遠被藏。→ Task 1 測試 `lifts the veil on refusal, error and unmount`、`a new runtime drops the veil`。
4. **手機寬度下格子在紙邊**（390 px，一環最上方或二環）——元素圈要整圈在紙內、按鈕不被裁掉。→ Task 3 測試 `wheelCenter keeps the wheel inside the sheet`。
5. **鍵盤操作**——元素圈與符文圈用方向鍵移動焦點、Enter 選、Escape 關閉並把焦點還給原本的格子。→ Task 3 測試 `arrow keys walk the wheel and Escape returns focus to the slot`。

---

### Task 1: 動畫期間星圖不劇透新魔法（規格第 8 節）

**Files:**
- Modify: `src/ui/CircleTable.tsx`（`run`、卸載的 effect、props）
- Modify: `src/ui/App.tsx`（面紗 state，傳給兩個魔導書分頁）
- Modify: `src/ui/GrimoirePanel.tsx`、`src/ui/Notebook.tsx`（新 prop `veil`）
- Test: `src/ui/CircleTable.test.tsx`、`src/ui/StarMap.test.tsx`、`src/ui/Notebook.test.tsx`、`src/ui/App.test.tsx`

**Interfaces:**
- Produces: `CircleTable` 新 prop `onCharging?: (charging: boolean) => void`；`GrimoirePanel`、`Notebook` 新 prop `veil?: readonly string[] | null`（非 null 時只顯示 id 在這個清單裡的已學會魔法）。

- [ ] **Step 1: 寫失敗的測試**

`CircleTable.test.tsx`（用既有 `setup` 加一個 `onCharging` spy）：
- `calls onCharging(true) before the request and onCharging(false) when the result is revealed`：按合成 → 在 `synthesizeCircle` resolve 之前 `onCharging` 已以 `true` 被呼叫一次；resolve `learned` 後推進 `PROGRESS_MS` → 以 `false` 被呼叫；呼叫順序 `[true, false]`。
- `lifts the veil on refusal, error and unmount`：三個情境各自 `[true, false]`：(a) resolve `{ kind: 'rejected', reason: 'overCap' }`；(b) reject 一個 Error；(c) 按合成後在 resolve 前 `unmount()`。
- 稀有：resolve 稀有 learned 時，推進 `PROGRESS_MS` 後**還沒有** `false`，推進到 `RARE_PROGRESS_MS` 才有。

`StarMap.test.tsx`（`GrimoirePanel`）：
- `a veiled spell has no star until the veil lifts`：`learned: ['a','b']`、`veil: ['a']` → 只有 a 的星（用星的 aria-label 查）；rerender `veil: null` → a、b 都有。

`Notebook.test.tsx`：同上，`veil` 擋住的魔法不出現在列表。

`App.test.tsx`：
- `a new runtime drops the veil`：合成進行中（`synthesizeCircle` 不 resolve）換一個新的 runtime rerender App → 星圖顯示新 runtime 的所有已學會魔法。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/CircleTable.test.tsx src/ui/StarMap.test.tsx src/ui/Notebook.test.tsx src/ui/App.test.tsx`
Expected: 新測試 FAIL（`onCharging` 沒被呼叫、`veil` 沒效果）。

- [ ] **Step 3: 實作**

- `CircleTable`：`run()` 在 `await` 之前（`setCharging` 同一處）呼叫 `latest.current.onCharging?.(true)`；在三個結束點（揭曉的 `later` 回呼裡、被拒／空回應、catch）呼叫 `onCharging?.(false)`。卸載時若還在 charging，cleanup 呼叫 `onCharging(false)`（用 ref 記住是否在 charging，不要用 state）。`onCharging` 跟 `onResult` 一樣放進 `latest` ref。
- `App`：`const [veil, setVeil] = useState<readonly string[] | null>(null)`；`onCharging` 為 `true` 時 `setVeil([...runtime.getSnapshot().game.learned])`，`false` 時 `setVeil(null)`（用 `useCallback`，依賴 `runtime`）；`useEffect(() => setVeil(null), [runtime])`。傳給 `GrimoirePanel` 與 `Notebook`。
- `GrimoirePanel`／`Notebook`：`learned` 在 `veil` 非 null 時先過濾成 `learned.filter((id) => veil.includes(id))`，再走原本的流程（`useMemo` 依賴加上 `veil`）。元素扣除照常，不擋。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui` 然後 `npm test`
Expected: 全部 PASS（含 Profiler 測試）。

- [ ] **Step 5: Commit**

```bash
git add src/ui/CircleTable.tsx src/ui/App.tsx src/ui/GrimoirePanel.tsx src/ui/Notebook.tsx src/ui/*.test.tsx
git commit -m "fix(ui): hide a just-learned spell until the circle reveals it"
```

---

### Task 2: 只畫已開放的格子，依格數對稱排列（規格第 3 節）

**Files:**
- Modify: `src/ui/circle-draw.ts`（新的排列函式）
- Modify: `src/engine/circle.ts`（`overcomes` 加 `export`，內容不變）
- Modify: `src/ui/CircleTable.tsx`（SVG 與格子按鈕改用新排列；移除 `.guide` 五芒星）
- Modify: `src/ui/App.css`（`.guide` 規則刪除；新增 `.wire.clash`）
- Test: `src/ui/circle-draw.test.ts`、`src/ui/CircleTable.test.tsx`

**Interfaces:**
- Consumes: `SLOTS`、`MAX_RING2`、`GRADE_CAP`、`overcomes(a, b)` from `src/engine/circle.ts`。
- Produces（`circle-draw.ts`）：
  - `openSlotCounts(unlockedTier: number): [ring1: number, ring2: number]` ＝ `[clamp(unlockedTier − 1, 0, 5), clamp(unlockedTier − 6, 0, 4)]`。**只看 `circleTier`，不看核心階級**（放入或更換核心時圖形不跳動；超出核心上限的格子照樣畫、變暗）。
  - `RING2_DEFAULT: Record<1|2|3|4, number[]>` ＝ `{1: [0], 2: [1, 4], 3: [0, 2, 3], 4: [1, 2, 3, 4]}`（對稱於垂直軸、對齊一環的五芒星射線）。一環的預設是 `[0 … n−1]`。
  - `shownSlots(ring: 0 | 1, open: number, filled: number[]): number[]` ＝ 預設序號 ∪ 已填的序號，升冪排序。（Review Focus 1：載入的陣節點在預設之外時照樣顯示。）
  - `shownPoint(ring: 0 | 1, j: number, shown: number[]): Pt`：一環＝把 `shown` 第 k 個放在半徑 `RING_R[0]`、角度 `360° × k / shown.length`（0° 在正上方、順時針）——1 個上方、2 個上下、3 個三角、4 個菱形、5 個就是原本的五芒星（k = j）；二環＝`rayPoint(j, RING_R[1])`（二環只在一環 5 格時存在，所以一定對齊）。
  - `starPath`、`slotPoint` 保留（`NodeCard` 的小圖還在用）。

- [ ] **Step 1: 寫失敗的測試**

`circle-draw.test.ts`：
- `openSlotCounts`：`2 → [1,0]`、`4 → [3,0]`、`6 → [5,0]`、`7 → [5,1]`、`10 → [5,4]`、`1 → [0,0]`。
- `shownSlots`：`(0, 2, []) → [0,1]`；`(0, 2, [0,2]) → [0,1,2]`；`(1, 2, []) → [1,4]`；`(1, 3, [1]) → [0,1,2,3]`。
- `shownPoint` 一環：shown 長度 1 → `(CENTER, CENTER − RING_R[0])`；長度 2 → 第二個在 `(CENTER, CENTER + RING_R[0])`；長度 4 → 第二個在 `(CENTER + RING_R[0], CENTER)`；長度 5 → 等於 `slotPoint(0, j)`（每個 j）。二環 → 等於 `slotPoint(1, j)`。

`CircleTable.test.tsx`（改寫既有 `greys out slots past the unlocked tier…` 為以下三個，其餘既有測試照規格更新）：
- `draws only the open slots`：`circleTier: 2` → 一環格子按鈕只有 1 個（`/^一環 第/`）、沒有二環按鈕；SVG 裡沒有 `.guide`；`circleTier: 4` → 一環 3 個；`circleTier: 7` → 一環 5 個、二環 1 個（序號 1，aria-label `二環 第1格`）。
- `shows a loaded node outside the default open slots`：`circleTier: 3`，`ref.current.loadPlacement` 一個一環節點在序號 0 與 2 的陣 → 有 `一環 第1格`、`一環 第2格`（空）、`一環 第3格`；空的第 2 格因為超過已開放而變暗（`aria-disabled`）；合成按鈕可用（元素足夠時）。
- `lowering the core greys extra slots without moving them`：`circleTier: 6`，核心選中階（上限 4）並放 3 個一環節點 → 記下每個格子的 `style.left/top`；把核心換成初階（上限 2）→ 格子位置不變，空格的 aria-label 含「超過核心上限」。
- `marks a clashing wire`：核心火、一環放水（水剋火）→ SVG 有 `.wire.clash`；換成風 → 沒有。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/circle-draw.test.ts src/ui/CircleTable.test.tsx`
Expected: FAIL（函式不存在、仍畫 5 格與 `.guide`）。

- [ ] **Step 3: 實作**

- `circle-draw.ts` 加上面四個 export。
- `circle.ts`：`const overcomes` → `export const overcomes`。
- `CircleTable`：`const [open1, open2] = openSlotCounts(unlockedTier)`；`shown1 = shownSlots(0, open1, filledIdx(ring1))`、`shown2 = shownSlots(1, open2, filledIdx(ring2))`；所有 `slotPoint(ring, j)` 改用 `shownPoint(ring, j, shownX)`；只為 `shown1`、`shown2` 的序號產生格子按鈕；一環環線在 `shown1.length > 0` 才畫、二環環線在 `shown2.length > 0` 才畫；刪掉 `<path className="guide">`。`CIRCLE_PAIRS`／`STAR_PAIRS` 照舊用規則序號決定要不要畫線（兩端都有節點），只是座標換成 `shownPoint`。核心↔一環、一環↔二環的 `wire` 在兩端元素 `overcomes` 時加 `clash` class。`slotBlock` 判斷不變（「尚未開放」「超過核心上限」照舊以數量判斷）。
- `App.css`：刪 `.parchment-svg .guide`；加 `.parchment-svg .wire.clash { stroke: #b0331d; }`（閃動在 Task 6）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui` 然後 `npm test`、`npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/circle-draw.ts src/ui/circle-draw.test.ts src/engine/circle.ts src/ui/CircleTable.tsx src/ui/CircleTable.test.tsx src/ui/App.css
git commit -m "feat(ui): draw only the open circle slots in a symmetric layout"
```

---

### Task 3: 格子周圍的元素圈（規格第 4 節）

**Files:**
- Create: `src/ui/RingPicker.tsx`
- Create: `src/ui/RingPicker.test.tsx`
- Modify: `src/ui/circle-draw.ts`（`wheelCenter`、`wheelPoints`）
- Modify: `src/ui/CircleTable.tsx`（刪掉 `Picker` 的元素部分，改用 `RingPicker`）
- Modify: `src/ui/App.css`（`.ring-picker` 樣式；舊 `.circle-picker` 在 Task 4 刪完前保留）
- Test: `src/ui/circle-draw.test.ts`、`src/ui/CircleTable.test.tsx`

**Interfaces:**
- Consumes: `GENERATES`（相生順序）、`GRADE_CAP`、`RING_FLOOR`；`shownPoint`（Task 2）。
- Produces:
  - `circle-draw.ts`：`WHEEL_ORDER: ElementId[] = ['water', 'earth', 'fire', 'thunder', 'wind']`（相生圓）；`wheelPoints(n: number, center: Pt, radius: number): Pt[]`（n 個點等分、第一個在正上方、順時針）；`wheelCenter(p: Pt, radius: number): Pt`（把圓心夾在 `[radius, VIEW − radius]`，讓整圈在紙內）。`WHEEL_R = 34`（viewBox 單位，佔位）。
  - `RingPicker.tsx`：
    ```ts
    export interface WheelItem { key: string; label: string; ariaLabel: string; enabled: boolean; on?: boolean; title?: string; color?: string }
    export function RingPicker(props: {
      at: Pt;                 // 被點的格子中心（viewBox 座標）
      title: string;          // dialog 的 aria-label
      items: WheelItem[];     // 依序排在圈上
      onPick: (key: string) => void;
      onRemove?: () => void;  // 有值才顯示「移除」
      onClose: () => void;
      returnFocus?: () => void; // Escape／點圈外關閉後呼叫
    }): JSX.Element
    ```
    以 `wheelCenter(at, WHEEL_R)` 為圓心、`wheelPoints(items.length, …)` 擺放 `<button>`（百分比定位，和格子一樣用 `left/top`），中間放「移除」「關閉」；底下一層透明的 `.ring-picker-backdrop` 蓋住整張紙，點它＝關閉。方向鍵（←↑ 上一個、→↓ 下一個，跳過停用的）移動焦點；開啟時焦點在第一個可用項目；Escape 關閉並呼叫 `returnFocus`。
- `CircleTable` 的元素選擇改成兩步：第一步 5 個元素（`WHEEL_ORDER`，任一階有庫存＝亮，否則暗、title「沒有這種元素」）；第二步同一個 `RingPicker` 換成 5 個階級（`GRADE_NAMES`，label 例「初階 ×12」；0 個＝暗；核心的 label 加「上限 Lv.N」；二環低於 `RING_FLOOR[1]` 的階級暗、title「二環需要高階以上」）。第二步按 Escape 回到第一步（不關閉）。

- [ ] **Step 1: 寫失敗的測試**

`circle-draw.test.ts`：
- `wheelPoints(4, {x:120,y:120}, 30)` → `[(120,90),(150,120),(120,150),(90,120)]`。
- `wheelCenter keeps the wheel inside the sheet`：`wheelCenter({x: 5, y: 120}, 34)` → `{x: 34, y: 120}`；`wheelCenter({x: 120, y: 238}, 34)` → `{x: 120, y: 206}`；中間的點不變。

`RingPicker.test.tsx`：
- `opens with focus on the first enabled item`。
- `arrow keys walk the wheel and Escape returns focus to the slot`：items 第 2 個停用；ArrowRight 從第 1 個跳到第 3 個；ArrowLeft 回第 1 個；Escape → `onClose`、`returnFocus` 各被呼叫一次。
- `clicking outside closes`：點 `.ring-picker-backdrop` → `onClose`。

`CircleTable.test.tsx`（改寫既有 picker 測試）：
- `tapping the core grows an element wheel in 相生 order`：點核心 → dialog「選擇核心元素」裡的按鈕依序是水、土、火、雷、風；沒有庫存的（例：只有火、風）水、土、雷 disabled。
- `picking an element then a grade places it`：點核心 → 火 → 出現階級圈，「初階 ×3（上限 Lv.2）」可按、「高階 ×0」disabled → 按初階 → 核心 aria-label 是 `核心：火・初階（…上限 Lv.2）`。
- `ring 2 greys grades below 高階`：二環格的階級圈裡初階、中階 disabled，title「二環需要高階以上」。
- `Escape on the grade step goes back to the elements`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/circle-draw.test.ts src/ui/RingPicker.test.tsx src/ui/CircleTable.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 實作** `RingPicker`、兩個幾何函式，`CircleTable` 的節點／核心選擇改用它（state `target` 加 `step: 'element' | { element: ElementId }`）；`heldKey` selector 照舊只在開啟時訂閱。移除 `Picker` 的元素分支（符文分支留給 Task 4）。手機（≤ 600 px）`.ring-picker button` 最小 40 px。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui` 然後 `npm test`、`npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/RingPicker.tsx src/ui/RingPicker.test.tsx src/ui/circle-draw.ts src/ui/circle-draw.test.ts src/ui/CircleTable.tsx src/ui/CircleTable.test.tsx src/ui/App.css
git commit -m "feat(ui): pick elements on a wheel around the slot"
```

---

### Task 4: 整圈符文帶（規格第 5 節）

**Files:**
- Modify: `src/ui/CircleTable.tsx`（SVG 符文帶；刪 `rune-row` 的兩顆符文按鈕與 `Picker` 剩下的部分）
- Modify: `src/ui/circle-draw.ts`（`RUNE_BAND_R`）
- Modify: `src/ui/App.css`（`.rune-band`；刪 `.rune-slot`、`.circle-picker`、`.picker-grid`、`.picker-actions` 不再用到的規則）
- Test: `src/ui/CircleTable.test.tsx`

**Interfaces:**
- Consumes: `RingPicker`、`wheelCenter`（Task 3）；`RUNE_IDS`、`RUNE_NAMES`、`runesUnlocked`。
- Produces: `RUNE_BAND_R = [RING_R[0] + 10, RING_R[1] + 10]`（佔位）。

- [ ] **Step 1: 寫失敗的測試**（改寫既有用到「一環符文」按鈕的測試）
- `draws a rune band only for an open ring`：`circleTier: 2` → 有 `role="button"` 名稱 `一環符文：空` 的元素、沒有二環符文；`circleTier: 7` → 兩條都有。
- `the band shows the chosen rune along the ring`：選「射」後，該 band 的 `<textPath>` 文字內容全部是「射」重複（至少 6 個字）、aria-label `一環符文：射`。
- `tapping the band grows the rune wheel; locked runes say 從魔王取得`：點一環符文帶 → dialog「選擇一環符文」有 8 個按鈕，只有「射」可按；其他 title「從魔王取得」。
- 「清空魔法陣」按鈕仍在、仍會清掉符文。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/CircleTable.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 實作**：每個已開放的環在 SVG 畫一個 `<g className="rune-band" role="button" tabIndex={0} aria-label=…>`，裡面是半徑 `RUNE_BAND_R[ring]` 的透明粗 `<circle>`（`pointer-events: stroke`，因為 `.parchment-svg` 是 `pointer-events: none`）與沿 `<path id>` 的 `<textPath>`（選中符文的字重複；空的時候畫淡淡的「·」點線）；Enter／空白鍵與點擊都開 `RingPicker`（`at` 為環的正上方點，`wheelCenter` 會夾回紙內）。選中後 `.rune-band.filled`。`rune-row` 只剩「清空魔法陣」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui` 然後 `npm test`、`npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/CircleTable.tsx src/ui/circle-draw.ts src/ui/CircleTable.test.tsx src/ui/App.css
git commit -m "feat(ui): draw each ring's rune as a band around the circle"
```

---

### Task 5: 書房色調與羊皮紙（規格第 2 節）

**Files:**
- Create: `src/ui/useArt.ts`
- Create: `src/ui/useArt.test.tsx`
- Modify: `src/ui/CircleTable.tsx`（外層 `.parchment-sheet`）
- Modify: `src/ui/App.css`（`.workbench` 木桌、`.parchment-sheet` 紙張）
- Check: `docs/art-assets.md`（「書房與羊皮紙」一節已寫好）
- Test: `tests/ui/layout-css.test.ts`、`src/ui/CircleTable.test.tsx`

**Interfaces:**
- Produces: `useArt(src: string): boolean`——用 `new Image()` 預載，`onload` 後回傳 `true`，失敗或還沒載入是 `false`；卸載後不再 setState。`PARCHMENT_SRC = '/assets/parchment.webp'`、`DESK_SRC = '/assets/desk.webp'`。

- [ ] **Step 1: 寫失敗的測試**
- `useArt.test.tsx`：stub `globalThis.Image`（可手動觸發 `onload`／`onerror`）→ 初始 `false`、`onload` 後 `true`、`onerror` 保持 `false`。
- `CircleTable.test.tsx`：`the parchment sits on a sheet with a fallback paper until the art loads`：`.parchment-sheet` 存在、沒有 `has-art` class（jsdom 不會載入圖）。
- `layout-css.test.ts`：`.workbench` 規則含 `url("/assets/desk.webp")`（缺檔時其他背景層照樣顯示）；`.parchment-sheet.has-art` 規則含 `url("/assets/parchment.webp")`；`.parchment-sheet:not(.has-art)` 有 `clip-path`（破邊暫代紙張）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/useArt.test.tsx src/ui/CircleTable.test.tsx tests/ui/layout-css.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作**
- `.parchment-sheet`：直立紙張（`aspect-ratio: 4 / 5`），原本正方形的 `.parchment`（魔法陣、格子的百分比座標不變）置中放在紙上，預測與按鈕列仍在紙下。
- 暫代紙張（`:not(.has-art)`）：現有的米黃漸層移到紙張上；`clip-path: polygon(...)` 做不規則破邊；上下緣用漸層畫出輕微捲曲的陰影；`.parchment` 本身改透明背景。
- `.has-art`：背景只剩 `url("/assets/parchment.webp") center / 100% 100% no-repeat`，不 clip。
- `.workbench`：暗褐木紋（`repeating-linear-gradient`）＋暗角（`radial-gradient` 邊緣變黑）＋左上微弱燭光（暖色 `radial-gradient`），最上層 `url("/assets/desk.webp") center / cover`。只做右欄（`.workbench`），整頁不動（規格第 11 節）。
- SVG 墨線加 `<filter id="ink-rough">`（`feTurbulence baseFrequency 0.9` ＋ `feDisplacementMap scale 1.2`，佔位），套在 `.draw` 線條上；`prefers-reduced-motion` 不影響（靜態）。
- `docs/art-assets.md` 的「書房與羊皮紙（魔法陣區，不是像素風）」一節**已經寫好（2026-11-03，提示詞已給使用者）**，只要確認檔名、尺寸與程式一致，不要改提示詞。原本預定內容供對照：新增一節「書房與羊皮紙（不是像素風）」：兩張圖的檔名、尺寸（`parchment.webp` 1024×1280 透明背景、`desk.webp` 1600×1000）、用途、AI 提示詞（羊皮紙：直立、破邊、邊緣微捲、老舊泛黃、斑點、中間留白可畫陣、正面俯視、無文字無浮水印；桌面：昏暗木屋書房的厚木書桌俯視、燭光從左上、暗角、木紋、無物件擋住中間），並註明「pngtree 參考圖不可用，只作風格參考」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui tests/ui` 然後 `npm test`、`npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/useArt.ts src/ui/useArt.test.tsx src/ui/CircleTable.tsx src/ui/CircleTable.test.tsx src/ui/App.css tests/ui/layout-css.test.ts docs/art-assets.md
git commit -m "feat(ui): dim study desk and torn parchment sheet with optional AI art"
```

---

### Task 6: 擺陣與合成的演出（規格第 6 節）

**Files:**
- Modify: `src/ui/CircleTable.tsx`（狀態 class 與幾個演出元素）
- Modify: `src/ui/App.css`（動畫）
- Test: `src/ui/CircleTable.test.tsx`、`tests/ui/layout-css.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `.wire.clash`；Task 4 的 `.rune-band`。
- Produces（`.parchment` 上的 class，給 CSS 用、測試查）：`charging`（既有）、`rare`（稀有的 5 秒）、`success`（揭曉後 900 ms）、`burnt`（大失敗後，直到下一次 `edit`）、`shake`（迴路對不上的狀態**剛變成**對不上時，400 ms）。`charging` 是 `{ ms: number; rare: boolean }`。

- [ ] **Step 1: 寫失敗的測試**（fake timers）
- `a failed circle scorches the paper until the next placement`：resolve `failed` → 推進 `PROGRESS_MS` → `.parchment.burnt`；再放一個元素 → 沒有 `burnt`。
- `success raises a light pillar briefly`：learned → `.parchment.success` 與 `.light-pillar`；再推進 900 ms → 都沒了。
- `the rare charge darkens the page and shows a starfield`：稀有 → 在 `PROGRESS_MS` 與 `RARE_PROGRESS_MS` 之間 `.parchment.rare`、`.rare-dim`（`document.body` 裡）、`.starfield` 都在；揭曉後消失。
- `a circuit that stops matching shakes once`：放出對不上的陣 → `.parchment.shake`；推進 400 ms → 沒有；繼續加對不上的節點但狀態沒變 → 不再出現。
- `charging lines light up in order, the core last`：charging 時每條 `.draw` 線有 `--k` 樣式，核心的 `.core-mark` 的 `--k` 最大。
- `layout-css.test.ts`：`@media (prefers-reduced-motion: reduce)` 區塊裡關掉 `.burnt`、`.shake`、`.success`、`.rune-band`、`.light-pillar` 的 `animation`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/CircleTable.test.tsx tests/ui/layout-css.test.ts`
Expected: FAIL。

- [ ] **Step 3: 實作**（數字是佔位）
- 放入：`.node-mark`、`.core-mark` 新增墨水暈開動畫（0.6 s，scale 0.3→1、`filter: blur(2px)`→0、不透明度 0→1）；連到鄰格的 `wire`／`edge` 用既有的 `circle-draw` 描線並改琥珀金描邊 0.4 s 延遲在暈開之後。
- 對不上：`.wire.clash` 紅色閃動（`opacity` 1↔0.4，0.5 s 無限）；`.shake`：`translate` ±2 px 0.4 s 一次（用一個 timer 在 400 ms 後拿掉 class；只在 `mismatch` 由 false 變 true 時觸發）。
- 注入中：每條線 `style={{ '--k': k }}`（一環邊 → 星線 → 二環 wire → 核心↔一環 wire → 核心最後），`.parchment.charging .draw` 依 `calc(var(--k) * var(--dur) / (n + 1))` 延遲變亮；整張紙 `translateY(-3px)` 與外光；`.rune-band` 旋轉 `var(--dur)` 內 3 圈，`cubic-bezier(0.55, 0, 1, 0.45)`（越轉越快）。
- 成功：`.light-pillar`（紙中央往上的金色漸層柱）900 ms。
- 大失敗：一次白色閃光（0.15 s）後 `.burnt`：紙邊內陰影焦黑（`inset box-shadow` 深褐→黑）、`.draw` 改成斷續虛線（`stroke-dasharray: 0.08 0.04`）；`edit()` 時拿掉，用 0.6 s transition 消退。
- 稀有：`.rare-dim`（`position: fixed; inset: 0; background: #000; opacity: 0.75`，用 portal 放到 `document.body`、`pointer-events: none`），`.parchment-sheet` 在 charging 稀有時 `z-index` 高於它；紙上 `.starfield`（20 個固定位置的小點，不是粒子系統）閃爍。
- `prefers-reduced-motion`：上述動畫全部 `animation: none`，直接顯示最終狀態。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui tests/ui` 然後 `npm test`、`npm run build`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/ui/CircleTable.tsx src/ui/CircleTable.test.tsx src/ui/App.css tests/ui/layout-css.test.ts
git commit -m "feat(ui): ink, charge, success, burn and rare-star effects on the circle"
```

---

### Task 7: 星圖：相生順序、選中才連線、墨印與發光星（規格第 7 節）

**Files:**
- Modify: `src/ui/star-layout.ts`（`SECTOR_ORDER`、`sectorAngle`）
- Modify: `src/ui/StarMap.tsx`（扇區線與標籤、連線、星的樣式）
- Modify: `src/ui/App.css`（星的發光、手機尺寸）
- Test: `src/ui/star-layout.test.ts`、`src/ui/StarMap.test.tsx`

**Interfaces:**
- Produces: `SECTOR_ORDER: ElementId[] = ['water', 'earth', 'fire', 'thunder', 'wind']`；`sectorAngle(e) = SECTOR_DEG / 2 + SECTOR_DEG × SECTOR_ORDER.indexOf(e)`（水 36°、土 108°、火 180°、雷 252°、風 324°）。`ELEMENT_ORDER` 不動。`StarMap` 的 props 不變。

- [ ] **Step 1: 寫失敗的測試**

`star-layout.test.ts`：
- `sectors follow the 相生 circle`：`sectorAngle` 水 36、土 108、火 180、雷 252、風 324。
- `a 水＋風 spell sits between the water and wind sectors`（流水魔彈・風的情況）：一個只含水、風的 `m:` 陣 → 角度與 0° 的圓周距離 ≤ `10`（`JITTER_DEG`）。
- `a 水＋火 spell (not neighbours) sits in the earth sector between them`：角度與 108° 的距離 < 36。
- 既有的「火＋土」測試照新角度更新（火、土相鄰，落在 144° 附近）。

`StarMap.test.tsx`：
- `no lines until a star is selected, then only that star's lines`：三個共用節點元素的魔法 → 一開始 `.star-lines line` 0 條；點 a → 只有含 a 的線。
- 改寫 `a crafted … amber halo`：自創星有 `.star-glow`、沒有 `.star-halo`；教科書星有 `.star-seal`、沒有 `.star-glow`。
- 扇區標籤依序是水、土、火、雷、風（順時針，從正上方右邊的第一個扇區開始）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/ui/star-layout.test.ts src/ui/StarMap.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 實作**
- `star-layout.ts`：加 `SECTOR_ORDER`，`sectorAngle` 用它（`starPosition` 的圓周平均不變，順序對了就自然落在對的位置）；更新檔頭註解。
- `StarMap`：扇區線與標籤迭代 `SECTOR_ORDER`；`layout.edges` 只畫 `a === selected || b === selected` 的；教科書魔法畫成圓角方形的印（`<rect className="star-seal">`，元素色填色、深色細邊、不發光）；自創魔法畫成發光的星（`<circle className="star-glow">` 加 `filter="url(#star-glow)"`，`<defs>` 裡 `feGaussianBlur` 合成光暈）；刪掉 `.star-halo`。裝備中／選中的標記照舊。
- 星座感：背景加少量固定的暗淡小點（20 個以內，由 `unit()` 這類確定性亂數放，不隨每次重畫變動）。
- 手機（≤ 600 px）：星圖區最小高度 `min(70vh, 520px)`；`.node-card` `max-height: 70%`、字級不小於 13 px。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/ui` 然後 `npm test`、`npm run build`
Expected: PASS（含 `does not re-render on drops` 的 Profiler 測試）。

- [ ] **Step 5: Commit**

```bash
git add src/ui/star-layout.ts src/ui/star-layout.test.ts src/ui/StarMap.tsx src/ui/StarMap.test.tsx src/ui/App.css
git commit -m "feat(ui): star map in 相生 order, lines on selection, seals and glowing stars"
```

---

### Task 8: 瀏覽器驗收與文件

**Files:**
- Create: `docs/superpowers/sdd/2026-11-03-magic-circle-polish/acceptance.md`
- Modify: `AGENTS.md`（第 2 節文件表、3.0、第 5 節架構地圖加 `RingPicker`／`useArt`、第 10 節交接紀錄）
- Modify: `docs/superpowers/sdd/2026-11-03-magic-circle-polish/progress.md`

- [ ] **Step 1:** `npm run dev`，headless Chrome（puppeteer-core 裝在專案外，同前幾次驗收）在 1280×900 與 390×844，逐項檢查規格第 10 節驗收清單並截圖（截圖放 `.superpowers/sdd/2026-11-03-magic-circle-polish/`，不進版本庫）：
  1. 開局（`circleTier` 2）只看到核心與一個節點位置，沒有五芒星。
  2. 用關鍵道具依序開放到 Lv.4／6／8／10：一環 1→3→5、二環 0→2→4，放好的元素不跳動。
  3. 元素圈與符文圈：滑鼠、觸控（`page.touchscreen`）、鍵盤都能用；390 px 下邊緣格子的圈不被裁掉。
  4. 迴路不合：紅線閃動、微震一次、文字警告。
  5. 合成中、成功、大失敗、稀有四種看起來不同（稀有用 GM 或本機種存檔＋重複合成，照前幾次的方法，報告寫清楚哪些是種的）。
  6. 動畫期間星圖與魔法筆記不出現新魔法，揭曉後才出現。
  7. 流水魔彈・風在水與風之間；選中魔法才有連線；教科書是印、自創是發光星。
  8. 沒有 `parchment.webp`／`desk.webp` 時暫代紙張與木桌正常；放一張任意測試圖到 `public/assets/parchment.webp` 時換成圖（驗完刪掉，不 commit）。
  9. 無頁面錯誤。
- [ ] **Step 2:** `npm test`、`npm run build` 再跑一次，數字寫進驗收報告。
- [ ] **Step 3:** 驗收報告寫明通過、沒通過、種進去的資料；沒通過的項目列在報告，不在這個任務裡修。
- [ ] **Step 4:** 更新 AGENTS.md 與帳本；Pixi 特效層（規格第 9 節）寫成「等使用者看過再決定」。
- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/sdd/2026-11-03-magic-circle-polish AGENTS.md
git commit -m "docs: magic circle polish acceptance and hand-off"
```
