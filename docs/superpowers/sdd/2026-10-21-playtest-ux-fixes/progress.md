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
Task 1: Ruling: plan's fps test spanned 1023ms (59×16.67+40) so the first frame fell out of the 1s window — changed test frame dt to 16ms (984ms total); implementation unchanged — cost if wrong: none (test arithmetic)
Task 1: Ruling: Claude-in-Chrome extension not connected — measured/screenshot with local Edge 155 headless via puppeteer-core in scratchpad, plus CDP 4x CPU throttle — cost if wrong: numbers differ from a real windowed browser (relative before/after still valid)
Task 1: complete (commits 74443d8..3b64c5f, tests: npm test →              at least ~947ms faster with isolate: false — reuses workers across files instead of one per file)
Task 2: complete (commits 3b64c5f..5f7db7a, tests: npx vitest run --reporter=dot →              at least ~896ms faster with isolate: false — reuses workers across files instead of one per file)
Task 1: tests 26 files / 207 passed (ledger line above shows vitest hint text)
Task 2: tests 27 files / 209 passed
Task 3: complete (commits 5f7db7a..68340e7, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  218 passed (218))
Task 4: complete (commits 68340e7..b775c5e, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  224 passed (224))
Task 5: complete (commits b775c5e..e57c85f, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  229 passed (229))
Task 6: complete (commits e57c85f..c1e8875, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  240 passed (240))
Task 7: browser check 1280 (headless Edge): 3 columns, no tabs, hint under slots, slots filled by cells, scrollWidth=innerWidth, React commits 3/s
Task 7: complete (commits c1e8875..1da0b57, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  243 passed (243))
Task 8: complete (commits 1da0b57..2dd4460, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  252 passed (252))
Task 9: Ruling: plan used size/2 (inscribed radius) for stop distances; screenshot showed the 2× boss square + hp bar overlapping the hero diagonally/below — added arena.boxRadius (circumscribed radius) and BattleView.extent(size)=hypot(max(12,s/2), s/2+9); hero radius = hypot(11,19); test 'keeps the hero box and a monster box apart…' RED (missing fn; old radii give 17.7<22.4 overlap below hero) → GREEN — cost if wrong: monsters stop slightly farther out.
Task 9: no TDD for Pixi code (jsdom can't run Pixi; plan-specified) — verified by arena tests, build, screenshots 1280/360 (t9b-*.png), scrollWidth==innerWidth both.
Task 9: not verified in browser: zone travel re-randomising angles (no unlocked second zone in the probe save); covered by the uid cleanup loop in sync().
Task 9: complete (commits 2dd4460..6338dd3, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  253 passed (253))
Task 10: browser 800px: bitmap damage numbers render, boss hp bar shrinks, 768-1099 layout correct; status effects (burn/paralyze/freeze) NOT seen in browser — probe save only knows mana_bolt; code path unchanged when statuses exist
Task 10: complete (commits 6338dd3..ccf5600, tests: .superpowers/sdd/2026-10-21-playtest-ux-fixes/suite.sh →       Tests  253 passed (253))
Task 11: acceptance (headless Edge): scrollWidth==innerWidth at 1280/768/360; zone picker popup inside viewport at all three, spell picker inside at 360 (hidden ≥768 by design); offline overlay shown and cleared (simulated by failing /api fetch in-page — Edge CDP rejects Network.emulateNetworkConditions and Fetch.enable); perf after: React 20/s → 0/s in battle, no long tasks during battle/synth.
Task 11: Ruling: offline simulated by wrapping window.fetch to reject /api/ with TypeError (same error class as a real network drop) — CDP offline unsupported in this Edge — cost if wrong: does not exercise browser 'offline' events.

## Final review（fresh reviewer, Opus；range 74443d8..6ff4571）
Final: fixed battle canvas clipped on short screens (host minHeight 200 > 25vh/40vh box) — BattleCanvas.test 'lets the .battle box decide the height' RED→GREEN, suite 34 files / 255 passed; browser 360×560 box/canvas 140/139, 844×390 156/155.
Final: fixed hint off-screen on phones (grimoire stacked below slots) — App.test 'also shows the hint right under the grimoire' RED→GREEN, suite 34 files / 255 passed.
Final: Ruling: on very short battle boxes (≤ ~160px) the stop ring's lower bound can exceed the box, so part of a stopped boss/ring is clipped — 'never overlap the hero' wins per Task 8 — cost if wrong: boss partly hidden on phone landscape.
Final: Ruling (declined-to-judge): Pixi BitmapText / beam sprite branch / shared BitmapFont after Application re-create not verifiable without running Pixi — build + headless screenshots show damage numbers rendering; re-create path (after 401) untested — cost if wrong: damage numbers missing after re-login.
Final: minor (deferred): Picker arrow keys don't scrollIntoView the active option in long lists.
Final: minor (deferred): Picker lacks aria-activedescendant / option ids / aria-controls.
Final: minor (deferred): Picker keys only work while the <ul> has focus; no close on focusout.
Final: minor (deferred): floating text clamped to the top edge drifts back off-screen as it rises.
Final: minor (deferred): ElementTable name column width 2.5em never applies (table-layout fixed takes header row).
Final: minor (deferred): BattleView matches views by uid only; safe today via per-frame cleanup, fragile if spawn timing changes.
Final: minor (deferred): travel/equip/upgrade made during an in-flight synthesis are reverted by replaceState (pre-existing in sync.ts, easier to hit now).
