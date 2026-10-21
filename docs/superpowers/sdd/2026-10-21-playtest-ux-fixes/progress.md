# SDD ledger — plan: docs/superpowers/plans/2026-10-21-playtest-ux-fixes.md

Spec: docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md
Branch: feat/mvp-core-loop
Executor: executing-plans（inline，Claude Opus 5.5）

## Rulings
Ruling R1: 斷點 ≥1100px 三欄；768～1099px 戰鬥在上、下方面板兩欄；<768px 全部上下排列（戰鬥 → 元素＋合成 → 魔導書）— 規格建議值 — 錯了只改 CSS。
Ruling R2: 升階按鈕維持每列尾端一顆，升最低可升階級 — 尊重使用者決定的位置 — 錯了改成每格 ↑。
Ruling R3: 怪物角度只存在畫面層（BattleView 以 uid 對應），引擎不動 — 不影響 sim/worker — 重新整理後角度重新隨機。
Ruling R4: 生成時與現存怪物至少錯開 25°（試 12 次，否則取最大間隔），不加分離位移 — 簡單、無每幀成本 — 怪物多時仍可能貼近。
Ruling R5: beam 第一目標畫主光束，第二目標從圓心畫細分支 — 不改規則 — 純視覺。
Ruling R6: 不論量測結果都做 selector 拆分與 Pixi 重畫優化（含 BitmapText 傷害數字）— 成本低 — 無。
Ruling R7: 戰場半徑 = hypot(w/2+最大怪物半徑, h/2+最大怪物半徑)+1（規格寫長邊一半，正方形畫面的斜角會在畫面內生成）— 使用者 2026-10-21 同意 — 走進畫面的時間比例變短。
Ruling R8: 魔法選擇器依屬性分組時，無屬性放最前面的「無屬性」組 — 規格未提魔力彈 — 錯了改順序。
Ruling R9: 排序偏好存 localStorage（ig.spellSort），以新規格優先於 MVP「localStorage 只存權杖」— 使用者 2026-10-21 同意；非遊戲資料 — 錯了改成不記住。
Ruling R10: 目前地點在選擇器中標為已選且不可點 — 沿用 ZonePanel — 無。

## Progress
