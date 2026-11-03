## Final fix wave（最終審查的修正，2026-11-03）

方法同上（`npm run dev`、puppeteer-core 驅動 headless Chrome，1280×900 與 390×844，`prefers-reduced-motion: no-preference`）。截圖在 `.superpowers/sdd/2026-11-03-magic-circle-polish/accept-fix/`（gitignore）。測試：`npm test` 81 檔 945 個全過、`npm run build` 通過。

| # | 發現 | 結果 | 證據 |
|---|---|---|---|
| 1 | `placeItem` 把二環元素放進第一個空的規則索引 | 已修：改用 `shownSlots(...)` 中第一個空格 | `CircleTable.test.tsx`「placeItem puts a ring-2 element into an open slot…」（circleTier 8：二環只畫 2 格、元素在規則索引 1）、「ring 2 says ring 1 must be full first」 |
| 2 | 手機核心階級圈三行字溢出 | 已修：字級 `clamp(8px, 3.4cqi, 11px)`、可見字「≤Lv.N」與「×1.2k」（aria 保留全文） | 測試「the grade wheel shows short text…」；390 px 每項 42 px、字 9.46 px，5 項 `scrollWidth/scrollHeight` 都不大於 `clientWidth/clientHeight`；1280 px 53 px、11 px，也無溢出（`f1-corewheel-m.png`、`-d.png`） |
| 3 | Lv.10 二環第 2、5 格被紙邊切掉 | 已修（只改 CSS）：`.parchment` 86% → 76% | 1280：紙 741–1209、二環格 811–1139；390：紙 12–378、二環格 67–323，都在紙內（`f1-lv10-d.png`、`f1-lv10-m.png`）；`layout-css.test.ts` |
| 4 | ≤600 px 橫幅與裝備通知蓋住結果與預測 | 已修：橫幅 `top: 28%`、通知固定在頂欄下方（`top: 112px`） | 390 實測：橫幅 y 167–305、通知 112–164、預測行 635–655；通知與預測都不被蓋，橫幅只蓋到結果圓上緣 35 px、不蓋名稱（`f3-result-m.png`）；`layout-css.test.ts` |
| 5 | 符文帶字在 12 點鐘接縫重疊 | 已修：起點移到 36°（兩格之間），`textLength` 少一個字寬，字數少一個，`aria-hidden` | 測試「the rune band glyphs are hidden…」；`f3-rune-d.png` 接縫有空隙、不在節點下方 |
| 6 | 無圖時桌機佔位紙比面板高 | 已修：`:not(.has-art)` 寬 `min(100%, 52vh)`（有圖維持原尺寸） | 1280×900 無圖：紙 69–654、工作台 57–720（以前紙底超出）；圖檔搬開再搬回，檔案清單與搬走前相同（`f2-noart-d.png`） |
| 7 | TopBar 魔法選單沒套面紗 | 已修：`veil` 傳給 `TopBar`，過濾 `learned` | `TopBar.test.tsx`「veils a just-learned spell in the spell picker…」 |
| 8 | 連續合成時 `success` 蓋過充能光 | 已修：`run()` 開頭 `setSuccess(false)` | 測試「re-synthesising right after a success drops the success glow at once」 |
| 9 | 選完後焦點掉到 body | 已修：選取、移除、階級步驟的「關閉」都回到原格子或符文帶 | 測試「returns focus to the slot after a pick and after a grade-step close」 |
| 10 | 未取得符文只有 title | 已修：符文圈有可見說明「未取得的符文從魔王取得」 | 測試「explains locked runes with a visible note」 |
| 11 | 減少動態時光柱靜止顯示 | 已修：`display: none` | `layout-css.test.ts`「reduced motion hides the light pillar」 |
| 12 | 符文帶 `<text>` 缺 `aria-hidden`、多餘空行 | 已修 | 同第 5 項的測試 |
| 13 | App 測試「a new runtime drops the veil」沒驗面紗 | 已修：重新整理前斷言 1 顆星（面紗中），之後 2 顆 | `App.test.tsx` |

沒有改 `src/engine`、`worker/`、migrations、存檔格式；`public/assets/` 的圖沒有進 commit。

RED captured before implementation: 7 new unit tests failed (CircleTable x6, TopBar x1); CSS tests were written after the CSS edit and verified in the browser. GREEN: npm test 81 files 945 tests, npm run build ok. Dev server stopped.
