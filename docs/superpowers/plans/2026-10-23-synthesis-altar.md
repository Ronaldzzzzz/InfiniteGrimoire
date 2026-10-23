# 合成台與技能樹操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把合成區改成方形合成台（左右兩邊＋中間合成鈕＋融合特效），讓技能樹可以原地放入合成與裝備（泡泡、雙擊、浮動詳情卡），技能樹填滿欄位、滾輪只縮放、拖曳不重畫，關鍵道具按鈕移到戰鬥畫面。

**Architecture:** 純介面改動（`src/ui/`、`App.css`），不碰 engine、worker、存檔。技能樹的平移縮放改成直接寫 SVG `viewBox`（不經 React state）；泡泡、詳情卡共用一份 `selected`；合成台是新元件 `SynthesisAltar`，用窄 selector 訂閱 runtime，特效用 CSS 動畫（顏色與粒子形狀取自 `src/render/element-fx.ts`）。

**Tech Stack:** React 19、TypeScript、Vitest + Testing Library（jsdom）、CSS。

**Spec:** `docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md`（執行者必須兩份都讀；本計畫沒寫到的行為以規格為準）

## Global Constraints

- Branch：從 `feat/core-rework` 開 `feat/synthesis-altar`；不 push、不合併（`AGENTS.md` 第 7 節）。
- 帳本：`docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md`，每完成一個任務記一行；計畫沒寫到的決定記成 `Ruling:` 行。
- 每個任務完成前 `npm test` 與 `npm run build` 都要通過；採 TDD。
- 介面文字繁體中文；「Lv.」只代表階級，強化顯示「強化 +N」（`empowerLabel`）。
- 窄 selector：技能樹、泡泡、詳情卡、合成台、關鍵道具列都不能訂閱整個 `game` 或整個 `inventory`；有 Profiler 測試把關。
- 合成、強化、使用關鍵道具、解鎖被動仍然只透過 `sync.synthesize` / `sync.action`；不改 engine、worker、migrations。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`；元素色用 `COLORS.element`（`src/render/palette.ts`）。
- 數值：融合動畫至少 `MIN_FUSE_MS = 800`；揭曉停留 `REVEAL_MS = BANNER_MS`（2600）；放入提示 `PLACED_TOAST_MS = 1500`；關鍵道具訊息 `KEY_MESSAGE_MS = 3000`；滾輪每格 ×1.1、按鈕每次 ×1.25；縮放範圍 0.5～3；拖曳門檻 4px。
- Commit 訊息用 Conventional Commits（英文），結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（或執行者所用 agent 的標記）。

## Review Focus

1. **合成進行中又放東西**（技能樹泡泡、雙擊、元素表）：玩家預期什麼都不會被放進去、也不會被揭曉時清掉——`synthPending` 期間 `App` 的 `pick` 不動作、合成台兩邊不能取出。測試在 Task 6。
2. **雙擊未學會的魔法，或合成台已滿時雙擊**：不放入、不閃、不跳提示。測試在 Task 2。
3. **拖曳結束時游標停在節點上**：不能打開泡泡，也不能觸發雙擊放入。測試在 Task 2。
4. **靠近技能樹邊緣的節點**：泡泡要翻到另一側，不被裁掉。純函式測試在 Task 1（`bubblePlacement`）。
5. **揭曉期間放入下一個東西**：揭曉立刻結束，回到放入狀態，新放入的東西不會被清掉。測試在 Task 5。

---

### Task 1: 技能樹視窗（滾輪只縮放、以游標為中心、拖曳不重畫、按鈕移進技能樹）

**Files:**
- Create: `src/ui/tree-viewport.ts`, `src/ui/tree-viewport.test.ts`
- Modify: `src/ui/GrimoirePanel.tsx`（`zoom`/`pan` state、`onWheel`/`onDown`/`onMove`/`onUp`、`.grimoire-controls`、`<svg viewBox>`）
- Modify: `src/ui/App.css`（`.grimoire-col`、`.grimoire-controls`、`.grimoire-svg`，新增 `.tree-stage`）
- Test: `src/ui/GrimoirePanel.test.tsx`

**Interfaces:**
- Produces（`tree-viewport.ts`）：
  - `export interface View { x: number; y: number; zoom: number }`（視窗中心的樹座標與縮放）
  - `export const MIN_ZOOM = 0.5, MAX_ZOOM = 3, HOME: View = { x: 0, y: 0, zoom: 1 }`
  - `export function viewBoxOf(view: View, base: number): string` → `"${x - w/2} ${y - w/2} ${w} ${w}"`，`w = base / zoom`
  - `export function zoomAt(view: View, factor: number, p: { x: number; y: number }): View` — 縮放夾在範圍內，樹座標點 `p` 縮放前後位置不變（`c' = p + (c - p) * zoom / zoom'`）
  - `export function panBy(view: View, dx: number, dy: number): View`（dx、dy 為樹座標單位）
  - `export function bubblePlacement(node: { x: number; y: number }, stage: { w: number; h: number }, bubble: { w: number; h: number }): { left: number; top: number; side: 'above' | 'below'; align: 'left' | 'right' }` — 預設在節點上方、向右展開；右側放不下改向左，上方放不下改到下方；結果夾在 stage 內
  - `GrimoirePanel` 內部提供 `onGesture: () => void` 掛點（拖曳開始、滾輪、＋－⌖ 都呼叫；Task 2 用來關泡泡）

- [ ] **Step 0: 開 branch**：`git checkout -b feat/synthesis-altar feat/core-rework`；建立帳本檔（標題＋任務清單）。

- [ ] **Step 1: 寫 `tree-viewport.test.ts` 的失敗測試**

```ts
it('zoomAt keeps the point under the cursor fixed', () => {
  const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: -50 });
  expect(v).toEqual({ x: 50, y: -25, zoom: 2 });
});
it('zoomAt clamps to MIN_ZOOM..MAX_ZOOM and then does not move', () => {
  expect(zoomAt({ x: 0, y: 0, zoom: 3 }, 1.1, { x: 100, y: 0 })).toEqual({ x: 0, y: 0, zoom: 3 });
  expect(zoomAt({ x: 0, y: 0, zoom: 0.5 }, 1 / 1.1, { x: 100, y: 0 }).zoom).toBe(0.5);
});
it('viewBoxOf is a square of base / zoom around the centre', () => {
  expect(viewBoxOf({ x: 10, y: 20, zoom: 2 }, 600)).toBe('-140 -130 300 300');
});
it('bubblePlacement flips left near the right edge and below near the top', () => {
  const stage = { w: 400, h: 400 }, bubble = { w: 200, h: 80 };
  expect(bubblePlacement({ x: 100, y: 200 }, stage, bubble)).toMatchObject({ side: 'above', align: 'left' });
  expect(bubblePlacement({ x: 350, y: 200 }, stage, bubble)).toMatchObject({ align: 'right' });
  expect(bubblePlacement({ x: 100, y: 30 }, stage, bubble)).toMatchObject({ side: 'below' });
  const p = bubblePlacement({ x: 395, y: 395 }, stage, bubble);
  expect(p.left).toBeGreaterThanOrEqual(0); expect(p.left + 200).toBeLessThanOrEqual(400);
});
```

- [ ] **Step 2: 執行確認失敗**：`npx vitest run src/ui/tree-viewport.test.ts` → FAIL（模組不存在）。

- [ ] **Step 3: 實作 `tree-viewport.ts`**（上列簽名）。

- [ ] **Step 4: 寫 `GrimoirePanel.test.tsx` 的失敗測試**

jsdom 的 pointer 事件可能沒有 `clientX`：在測試檔頂端補一個最小 `PointerEvent`（`class extends MouseEvent`，帶 `pointerId`），並把 `Element.prototype.setPointerCapture`／`releasePointerCapture` stub 成 no-op。

```ts
it('the wheel zooms the tree and never scrolls the page', () => {
  setup();
  const svg = document.querySelector('svg.grimoire-svg')!;
  const before = svg.getAttribute('viewBox')!.split(' ').map(Number)[2]!;
  expect(fireEvent.wheel(svg, { deltaY: -100 })).toBe(false); // preventDefault was called
  expect(svg.getAttribute('viewBox')!.split(' ').map(Number)[2]).toBeCloseTo(before / 1.1);
});
it('dragging pans without re-rendering the tree, and ⌖ goes home', () => {
  // render inside <Profiler>, count onRender calls
  // pointerDown(0,0) → pointerMove(40,0) → pointerUp: viewBox x changed, onRender count unchanged
  // click 「回到中心」: viewBox equals the initial value
});
it('the zoom buttons live inside the tree stage', () => {
  setup();
  expect(document.querySelector('.tree-stage button[aria-label="放大"]')).toBeTruthy();
  expect(document.querySelector('.tree-stage button[aria-label="回到中心"]')).toBeTruthy();
});
```

- [ ] **Step 5: 執行確認失敗**：`npx vitest run src/ui/GrimoirePanel.test.tsx`。

- [ ] **Step 6: 改 `GrimoirePanel.tsx`**
  - 拿掉 `zoom`、`pan` state 與 JSX 上的 `viewBox`；改用 `viewRef = useRef<View>(HOME)`，`applyView()` 用 `svgRef.current.setAttribute('viewBox', viewBoxOf(viewRef.current, base))`；`useLayoutEffect` 在 `base`（`Math.max(SIZE, 2 * (maxR + 50))`）改變時套用一次。
  - 滾輪：`useEffect` 掛原生 `svg.addEventListener('wheel', h, { passive: false })`，`preventDefault()`，游標點用 `svg.getScreenCTM()?.inverse()` 轉成樹座標（取不到時用視窗中心），`zoomAt(view, deltaY < 0 ? 1.1 : 1/1.1, p)`。
  - 拖曳：`onPointerDown` 呼叫 `setPointerCapture`（存在時），超過 4px 才算拖曳；每像素換算 `w / svg寬`；拖曳中只 `applyView()`，不 setState。拿掉 `onPointerLeave={onUp}`（有 capture 就不需要），保留 `wasDrag`。
  - ＋／－：`zoomAt(view, 1.25 或 1/1.25, 視窗中心)`；新增「⌖」按鈕 `aria-label="回到中心"` → `HOME`。三個按鈕放進新的 `<div className="tree-stage">`（包住 svg，`position: relative`）右上角。
  - 每次手勢呼叫 `onGesture()`（本任務先是空函式）。

- [ ] **Step 7: CSS**：`.grimoire-col` 在寬畫面改成 `display:flex; flex-direction:column; overflow:hidden`；`.grimoire` `flex:1; min-height:0; display:flex; flex-direction:column`；`.tree-stage { position:relative; flex:1; min-height:0 }`；`.grimoire-svg { width:100%; height:100% }`（拿掉 `aspect-ratio`）；`.grimoire-controls { position:absolute; top:8px; right:8px; flex-direction:column }`。`@media (max-width:1099px)`：`.tree-stage { flex:none; aspect-ratio:1; max-height:70vh }`。（此任務結束時詳情仍接在下方；Task 2 改成浮動。）

- [ ] **Step 8: 執行**：`npx vitest run src/ui` → PASS；`npm test`、`npm run build` → PASS。

- [ ] **Step 9: Commit**：`feat(ui): zoom the grimoire under the cursor and pan it without re-rendering`；帳本記一行。

---

### Task 2: 泡泡、雙擊放入、浮動詳情卡（詳情＋強化合一）

**Files:**
- Create: `src/ui/NodeBubble.tsx`, `src/ui/NodeCard.tsx`（由 `GrimoirePanel.tsx` 的 `NodeDetail` 搬出，內含 `EmpowerPanel`）
- Modify: `src/ui/GrimoirePanel.tsx`, `src/ui/App.tsx`（傳 `slotsFull`）, `src/ui/App.css`
- Test: `src/ui/GrimoirePanel.test.tsx`, `src/ui/App.test.tsx`（兩個線索測試）

**Interfaces:**
- Consumes：Task 1 的 `bubblePlacement`、`onGesture`。
- Produces：
  - `GrimoirePanel` 新 prop：`slotsFull: boolean`（`App` 傳 `!slots.includes(null)`）
  - `export const PLACED_TOAST_MS = 1500`（`GrimoirePanel.tsx`）
  - `NodeBubble({ selected, runtime, content, slotsFull, position, onPick, onDetails })` — `role="group"`、`aria-label="魔法操作"`
  - `NodeCard({ selected, runtime, sync, content, slotsFull, onPick, onClose })` — `<section className="node-card" aria-label="節點詳情">`，關閉鈕 `aria-label="關閉詳情"`；按鈕文字「放入合成」「裝備」／「裝備中」

狀態（`GrimoirePanel` 內）：`selected`（共用）、`bubbleOpen`、`cardOpen`。規則照規格 4.1～4.3：
- 單擊魔法 → `selected`＝它、`bubbleOpen=true`，`cardOpen` 不變；`onHint(未學會 ? id : null)`（`App` 的 `hintId` 保留）。
- 單擊被動 → `selected`、`bubbleOpen=false`、`cardOpen=true`。
- 雙擊（`onDoubleClick`）已學會且 `!slotsFull` → `onPick(id)`、`bubbleOpen=false`、節點加 `node-flash` class 600ms、顯示提示；否則什麼都不做。
- 點 svg 空白處（非節點、非拖曳）→ 兩者都關；Esc（掛在 `.grimoire` 的 `onKeyDown`）→ 兩者都關；`onGesture` → 只關泡泡。
- 泡泡按「放入合成」「裝備」→ 動作後關泡泡；「詳情」→ 關泡泡、開卡片。
- 放入（泡泡、雙擊、卡片）都顯示 `<p className="tree-toast only-narrow" role="status">已放入合成台：{名字}</p>`，`PLACED_TOAST_MS` 後消失。
- 泡泡位置：打開時用 `svg.getScreenCTM()` 把節點座標換成 `.tree-stage` 內的像素，再用 `bubblePlacement`（泡泡大小用常數 `{ w: 220, h: 96 }`）。

- [ ] **Step 1: 改寫 `GrimoirePanel.test.tsx` 前三個測試並新增失敗測試**

```ts
it('clicking a learned spell opens a bubble: put into the altar, equip, details', () => {
  const { rt, onHint, onPick } = setup({ learned: ['mana_bolt', 'fireball'], levels: { fireball: 4 } });
  fireEvent.click(node(content.spells.fireball!.name));
  expect(onHint).toHaveBeenCalledWith(null);
  const bubble = screen.getByRole('group', { name: '魔法操作' });
  expect(bubble.textContent).toContain('強化 +3');
  fireEvent.click(within(bubble).getByRole('button', { name: '放入合成' }));
  expect(onPick).toHaveBeenCalledWith('fireball');
  expect(screen.queryByRole('group', { name: '魔法操作' })).toBeNull();
  fireEvent.click(node(content.spells.fireball!.name));
  fireEvent.click(screen.getByRole('button', { name: '裝備' }));
  expect(rt.equip).toHaveBeenCalledWith('fireball');
});
it('詳情 opens the floating card with the empower section inside it', () => {
  // click fireball → 詳情 → region 節點詳情 contains desc and region 強化; card is inside .tree-stage
});
it('a locked spell bubble shows the hint and no buttons', () => { /* 殘卷：hint; no 裝備 / 放入合成 */ });
it('放入合成 is disabled when the altar is full', () => { /* setup with slotsFull=true */ });
it('double-click puts a learned spell into the altar without a bubble', () => {
  // fireEvent.doubleClick(node) → onPick('fireball'); no group 魔法操作; text 已放入合成台：火球
});
it('double-click does nothing on a locked spell or when the altar is full', () => { /* onPick not called, no toast */ });
it('a drag that ends on a node opens nothing', () => {
  // pointerDown on the node, move 40px, pointerUp, click → no bubble; doubleClick after a drag → onPick not called
});
it('a blank click or Esc closes bubble and card; a drag closes only the bubble', () => {});
it('with the card open, clicking another spell switches the card and opens its bubble', () => {});
```

既有的被動解鎖測試改成點被動節點後直接看到 `region 節點詳情`；Profiler 測試改成「泡泡與卡片都開著」時，無關掉落不重畫。

- [ ] **Step 2: 執行確認失敗**：`npx vitest run src/ui/GrimoirePanel.test.tsx`。

- [ ] **Step 3: 實作 `NodeBubble.tsx`、`NodeCard.tsx`，改 `GrimoirePanel.tsx`**（照上方規則；`NodeCard` 的內容就是原本 `NodeDetail` 的三種 body，「放進合成槽」改名「放入合成」，加 ✕）。泡泡與卡片都渲染在 `.tree-stage` 裡面；卡片 `position:absolute; left:8px; right:8px; bottom:8px; max-height:60%; overflow-y:auto`。

- [ ] **Step 4: 改 `App.tsx`**：傳 `slotsFull={!slots.includes(null)}`。改寫 `App.test.tsx` 第二個線索測試：點未學會的火球後，`group 魔法操作` 內含線索（第一個測試「合成台旁顯示線索」維持，只是目前仍在舊合成區）。

- [ ] **Step 5: 執行**：`npm test`、`npm run build` → PASS。

- [ ] **Step 6: Commit**：`feat(ui): act on spells in place with a bubble, double-click and a floating card`；帳本記一行。

---

### Task 3: 關鍵道具按鈕移到戰鬥畫面

**Files:**
- Create: `src/ui/KeyItemBar.tsx`, `src/ui/KeyItemBar.test.tsx`
- Modify: `src/ui/GrimoirePanel.tsx`（拿掉 `.key-items`、`keyList`、`useKey`、`keyMessage`、`lifting` state；改收 prop）, `src/ui/App.tsx`, `src/ui/App.css`
- Test: `src/ui/GrimoirePanel.test.tsx`（迷霧測試改寫）, `src/ui/App.test.tsx`

**Interfaces:**
- Produces：
  - `export const KEY_MESSAGE_MS = 3000`
  - `KeyItemBar({ runtime, sync, content, onRevealed }: { runtime: RuntimeStore; sync: Pick<SyncController,'action'>; content: Content; onRevealed: (region: string) => void })` — 每個可用道具一個 `<button className="key-use">`，名稱 `使用{道具名}`，下方小字為該道具 `desc`；`synthPending` 時停用；訊息 `<p role="status">` 在 `KEY_MESSAGE_MS` 後消失
  - `GrimoirePanel` 新 prop：`lifting: string | null`（正在散開的區域；`FOG_LIFT_MS` 仍由 `GrimoirePanel.tsx` export）
  - `App`：`lifting` state ＋ `useEffect` 在 `FOG_LIFT_MS` 後清掉；`onRevealed(region)` → `setLifting(region); setTab('tree')`；`<KeyItemBar>` 放在 `.battle` 內

- [ ] **Step 1: 寫 `KeyItemBar.test.tsx` 失敗測試**：搬原本 GrimoirePanel「key item reveals」的動作部分——按「使用風暴之心」呼叫 `action('reveal', { keyItem: 'key:storm_heart' })`、`onRevealed('outer')`、顯示「迷霧散開了」、用 fake timers 前進 3000ms 後訊息消失、揭開後按鈕消失；`synthPending` 時停用；Profiler：無關掉落不重畫（比照 GrimoirePanel 的 `keyList` 寫法）。

- [ ] **Step 2: 改 GrimoirePanel 迷霧測試**：揭開後重新 render 時傳 `lifting="outer"`，斷言 `.fog.lifting` 存在、迷霧數 4→3；不再有「使用風暴之心」按鈕。`App.test.tsx` 新增：在「魔法筆記」分頁時按戰鬥畫面的「使用風暴之心」→ 分頁切回「技能樹」。

- [ ] **Step 3: 執行確認失敗**。

- [ ] **Step 4: 實作**；CSS：`.key-bar { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); z-index:4; display:flex; gap:8px; flex-wrap:wrap; justify-content:center }`，`.key-use` 改成金色漸層大按鈕＋發光（沿用 `key-glow`），小字 `.key-desc`；要能在 140px 高的戰鬥畫面裡完整顯示。

- [ ] **Step 5: 執行**：`npm test`、`npm run build` → PASS。

- [ ] **Step 6: Commit**：`feat(ui): use key items from a glowing button on the battle view`；帳本記一行。

---

### Task 4: 合成台的資料與結果對照（純函式）

**Files:**
- Create: `src/ui/altar-data.ts`, `src/ui/altar-data.test.ts`

**Interfaces:**
- Consumes：`particleStyle`、`blendForSpell`、`ParticleShape`（`src/render/element-fx.ts`）、`COLORS`、`resolveSpell`、`spellAtLevel`、`synthMessage`、`itemName`。
- Produces：
  - `export type AltarInput = { kind: 'spell'; id: string; name: string; elements: ElementId[]; tier: number; level: number } | { kind: 'element'; id: string; name: string; element: ElementId; grade: number } | { kind: 'material'; id: string; name: string }`
  - `export function describeInput(id: string, content: Content, levels: Record<string, number>): AltarInput | null`（`tier` 用 `spellAtLevel(spell, level).tier`；`level` 預設 1）
  - `export interface AltarLook { primary: string; secondary: string | null; shapes: ParticleShape[]; particles: number; halo: boolean }`
  - `export function lookOf(input: AltarInput): AltarLook` — 元素：該元素顏色與形狀、`particles: 8`、`halo: false`；魔法：`blendForSpell`、`particles: 14`、`halo: true`；素材：`COLORS.amber`、`['spark']`、`particles: 6`、`halo: false`
  - `export type RevealTone = 'new' | 'crafted' | 'known' | 'fizzle' | 'dormant' | 'overload'`
  - `export interface Reveal { tone: RevealTone; kicker: string; spellId: string | null; detail: string }`
  - `export function revealOf(result: ActionResult, content: Content, inputs: string[]): Reveal | null` — `rejected` 與非合成結果回 `null`；kicker：`learned`→「新發現！」、`learned`+`crafted`→「自創魔法！」、`duplicate`→「已經會了」、`noReaction`→「沒有反應」、`dormant`→「似乎還缺少什麼……」、`overload`→「魔力過載！」；`detail = synthMessage(result, content, inputs)`

- [ ] **Step 1: 失敗測試**

```ts
it('describes elements, materials and spells', () => {
  expect(describeInput('el:fire:2', content, {})).toMatchObject({ kind: 'element', element: 'fire', grade: 2, name: '中階火' });
  expect(describeInput('fireball', content, { fireball: 4 })).toMatchObject({ kind: 'spell', level: 4, elements: ['fire'] });
  expect(describeInput('nope', content, {})).toBeNull();
});
it('a spell looks stronger than an element', () => {
  const el = lookOf(describeInput('el:fire:1', content, {})!), sp = lookOf(describeInput('fireball', content, {})!);
  expect(sp.halo && !el.halo).toBe(true);
  expect(sp.particles).toBeGreaterThan(el.particles);
});
it('maps synthesis results to reveals and leaves refusals out', () => {
  expect(revealOf({ kind: 'learned', spellId: 'fireball', crafted: false }, content, [])).toMatchObject({ tone: 'new', kicker: '新發現！' });
  expect(revealOf({ kind: 'duplicate', spellId: 'fireball', refunded: [] }, content, [])!.detail).toContain('沒有退還');
  expect(revealOf({ kind: 'rejected', reason: 'grade' }, content, [])).toBeNull();
});
```

（`ActionResult` 各 kind 的欄位以 `src/engine/model.ts` 為準；素材 id 用 content 裡實際存在的一個。）

- [ ] **Step 2: 執行確認失敗** → **Step 3: 實作** → **Step 4: 執行通過**（`npx vitest run src/ui/altar-data.test.ts`）。

- [ ] **Step 5: Commit**：`feat(ui): describe altar inputs and synthesis reveals`；帳本記一行。

---

### Task 5: `SynthesisAltar` 元件（外觀、融合、揭曉）

**Files:**
- Create: `src/ui/SynthesisAltar.tsx`, `src/ui/SynthesisAltar.test.tsx`
- Modify: `src/ui/SynthesisPanel.tsx`（`Slots`、`emptySlots`、`fillSlot` 搬到 `SynthesisAltar.tsx`，這裡暫時改成從那邊 import，Task 6 刪檔）, `src/ui/App.css`

**Interfaces:**
- Consumes：Task 4 全部。
- Produces：
  - `export type Slots`、`export const emptySlots`、`export function fillSlot`（行為與現在相同）
  - `export const MIN_FUSE_MS = 800`、`export const REVEAL_MS = BANNER_MS`
  - `SynthesisAltar({ runtime, sync, content, slots, onSlotsChange, hint, onResult }: { runtime: RuntimeStore; sync: { synthesize(inputs: string[]): Promise<ActionResult | null> }; content: Content; slots: Slots; onSlotsChange: (s: Slots) => void; hint?: string | null; onResult?: (r: ActionResult) => void })`
  - DOM：外框 `<section className="altar" aria-label="合成台">`；兩邊 `<button className="altar-side">`，有東西時 `aria-label="取出{名稱}"`、內含 `.altar-name`，空的時 `aria-label="空的合成位置"`；中間 `<button className="altar-go">` 文字「合成」／「嬗變中…」；揭曉 `<div className="altar-reveal tone-{tone}" role="status" aria-label="合成結果">`；訊息 `<p className="synth-message" role="status">`；線索 `<div className="synth-hint" aria-label="殘卷線索">`

行為（規格 3.3、3.4）：
- 窄 selector：`synthPending`；兩邊物品的持有數（join 成字串）；兩邊魔法是否已學會；兩邊魔法的強化等級。`canSynth` 條件與現在的 `SynthesisPanel` 相同。
- 按下：進入 `fusing`（外框加 class `fusing`）；收到回應後——
  - `rejected`／`null`／例外：立刻離開 `fusing`，外框加 `bounce` 400ms，兩邊保留，訊息分別為 `synthMessage(...)`／`SYNTH_RETRY_MESSAGE`／`SYNTH_ERROR_MESSAGE`；不呼叫 `onResult` 以外的東西（`rejected` 照現狀呼叫 `onResult`）。
  - 其他：等到距按下滿 `MIN_FUSE_MS` 才揭曉；揭曉時 `onSlotsChange(emptySlots())`、呼叫 `onResult(result)`、顯示 `revealOf` 的內容與 `detail` 訊息。
- 揭曉在 `REVEAL_MS` 後、點揭曉層、或 `slots` 出現新放入的東西時結束；訊息保留到下一次放入或合成。
- `fusing` 期間兩邊按鈕停用。
- 特效：每邊依 `lookOf` 產生 `particles` 個 `<span className="p p-{shape}" style={{ '--c': color, '--i': i }}>`，`halo` 時加 `.halo` 外圈；CSS keyframes 各形狀不同（火往上飄、土水往下落、風橫掃、雷閃爍）；`fusing` 時兩邊往中間收、以 `--a`/`--b` 兩色漸層交融；`@media (prefers-reduced-motion: reduce)` 關掉粒子動畫。外框 `aspect-ratio: 1`、左右 `grid-template-columns: 1fr 1fr`，`.altar-go` 絕對定位於中心。
- 計時器在卸載時清掉。

- [ ] **Step 1: 失敗測試**（把 `SynthesisPanel.test.tsx` 的情境搬過來，改用 `fakeRuntime`）

```ts
it('enables 合成 only with two affordable, known inputs and no pending action', () => {});
it('synthesizes sorted inputs and reveals only after the reply and MIN_FUSE_MS', async () => {
  vi.useFakeTimers();
  // slots ['el:wind:1','el:fire:1'] → click 合成 → synthesize(['el:fire:1','el:wind:1'])
  // resolve learned fireball immediately → no 合成結果 yet; advance 799 → still none; advance 1 → 合成結果 contains 新發現！ and 火球
  // onSlotsChange([null,null]) and onResult called at the reveal, not before
});
it('a refusal stops at once, keeps the inputs and says why', async () => {
  // reply { kind:'rejected', reason:'grade' } → no 合成結果, onSlotsChange not called, message starts with 元素階級不夠
});
it('null keeps the inputs with the retry message; a throw keeps them with the error message', async () => {});
it('clicking a side takes it out; sides are locked while fusing', () => {});
it('a spell side has a halo and more particles than an element side', () => {});
it('placing the next input ends the reveal and is not cleared', async () => {}); // Review Focus 5
it('does not re-render on drops unrelated to its inputs', () => {}); // Profiler
```

- [ ] **Step 2: 執行確認失敗** → **Step 3: 實作與 CSS** → **Step 4: `npx vitest run src/ui/SynthesisAltar.test.tsx` 通過；`npm test`、`npm run build` 通過**。

- [ ] **Step 5: Commit**：`feat(ui): a square synthesis altar with fusion and reveal effects`；帳本記一行。

---

### Task 6: 接上合成台、移除舊合成區與嘗試紀錄、版面收尾

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/App.css`, `src/ui/App.test.tsx`
- Delete: `src/ui/SynthesisPanel.tsx`, `src/ui/SynthesisPanel.test.tsx`, `src/ui/SynthesisMatrix.tsx`, `src/ui/SynthesisMatrix.test.tsx`

**Interfaces:**
- Consumes：Task 2 的 `slotsFull`、Task 3 的 `KeyItemBar`／`lifting`、Task 5 的 `SynthesisAltar`、`Slots`、`emptySlots`、`fillSlot`。

- [ ] **Step 1: 改 `App.test.tsx`（先讓它失敗）**
  - `slotTexts` 改成讀 `.altar-side` 的 `.altar-name`（空的回 `'空'`）。
  - 「a new synthesis result is equipped」：火元素格放入後，在技能樹點「風刃」→ 泡泡「放入合成」；按「合成」；`reply(learned crafted)` 後用 `waitFor(..., { timeout: 3000 })`（或 fake timers 前進 `MIN_FUSE_MS`）等到 `equip` 被呼叫與新發現橫幅。
  - 新增（Review Focus 1）：按下合成、回應未到時，點元素格與泡泡「放入合成」都不改變兩邊；回應到達揭曉後兩邊清空。
  - 新增：頁面上沒有 `combobox 放入魔法`，也沒有「嘗試紀錄」標題。
- [ ] **Step 2: 執行確認失敗**。
- [ ] **Step 3: 改 `App.tsx`**：`SynthesisPanel` → `SynthesisAltar`（傳 `runtime`）；`pick` 在 `runtime.getSnapshot().synthPending` 時不動作；更新 `<768px` 那段註解（線索在泡泡與合成台下方各一份）。刪掉四個檔案與 `App.css` 中不再使用的 `.slots`、`.slot`、`.slot-spell`、`.synthesis h3`、`.synth-matrix*`、`.node-detail`（若已由 `.node-card` 取代）規則。
- [ ] **Step 4: 版面**：右欄 `.altar { width: min(100%, 52vh); margin: 0 auto }`，元素表在下方，右欄自己捲動；確認 1280×900、1000×800、375×800 版面不破（Task 7 實際截圖）。
- [ ] **Step 5: 執行**：`npm test`、`npm run build` → PASS；`grep -r "SynthesisPanel\|SynthesisMatrix" src` 無結果。
- [ ] **Step 6: Commit**：`feat(ui): replace the synthesis panel and attempt log with the altar`；帳本記一行。

---

### Task 7: 瀏覽器驗收與文件

**Files:**
- Modify: `docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md`, `AGENTS.md`（第 3 節、第 8 節、第 10 節）

- [ ] **Step 1: 啟動**：`npm run db:migrate:local`（若需要）、`npm run dev`。
- [ ] **Step 2: 照規格第 9 節 10 項逐一驗收**（Claude in Chrome 或 headless Chrome；腳本不進版本庫，截圖放 scratchpad）。元素存量可以直接改本機存檔種進去，帳本註明哪些是種的。另外量一次 1280×900 下拖曳技能樹與合成台特效同時播放時的 fps（比照試玩修正帳本的量法），記進帳本。
- [ ] **Step 3: 發現的問題**：修掉（各自 TDD、commit），或記成帳本的 `minor (deferred)`。
- [ ] **Step 4: 更新 `AGENTS.md`**：第 3 節（branch 疊成四層、測試數、驗收結果、待辦改成「使用者試玩合成台」）、第 8 節（移除已解決的「迷霧散開提示不消失」「滾輪縮放可能捲動頁面」）、第 10 節交接紀錄。
- [ ] **Step 5: `npm test`、`npm run build` 最終通過；Commit**：`docs: record the synthesis altar`。
