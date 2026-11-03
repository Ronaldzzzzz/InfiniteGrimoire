# 魔法陣質感改版：瀏覽器驗收（Task 8）

日期：2026-11-03　分支：`feat/magic-circle`（驗收當時最後一個 commit：`c31d99c`）　平台：macOS

## 方法

- `npm run dev`（http://localhost:5173，網頁與 `/api` 一起跑）；本機 D1 已在 0008，`npm run db:migrate:local` 回報 `No migrations to apply`（沒有動到存檔）。
- puppeteer-core 裝在專案外的 scratchpad，驅動本機 macOS Google Chrome（headless），視窗 1280×900（滑鼠、鍵盤）與 390×844（`isMobile`、`hasTouch`，用 `page.touchscreen.tap`）。腳本與截圖都沒有進版本庫；截圖放在 `.superpowers/sdd/2026-11-03-magic-circle-polish/accept/`（gitignore）。
- **headless Chrome 預設回報 `prefers-reduced-motion: reduce`**（用 `matchMedia` 確認為 true），質感改版的所有動畫（畫線、紅線閃動、符文帶旋轉、充能、成功光柱）都會被關掉。驗收腳本每次先 `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])`；這個改動前跑的一輪元素與迴路檢查，改完之後又重跑一次，結果相同。
- 每個項目都用新的遊客帳號（`開始冒險`）。

## 種進本機 D1 的（直接改 `saves.state` 與 `anchor_state`）與實際操作的

- **種進去的：** 每個情境的元素存量（`el:<元素>:<階>`）、`circleTier`（2／4／10）、`defeatedBosses`（六個魔王全部，為了符文）、關鍵道具 `key:storm_heart`、`key:thunder_eye`、`key:magma_seal`、`key:titan_crown`、`key:star_sigil` 各 1 個（項目 2）。每次也清掉 `guest_creations`（遊客每小時 10 個的限制）。
- **實際操作的：** 擺陣（點格子、元素圈、階級圈、符文圈、方向鍵、Esc）、按「使用」關鍵道具、按「合成」、迴路不合、成功、大失敗、稀有（真的連續合成，第一次 59 次、第二次 189 次擲出焚世之焰，沒有改機率）、星圖點選。
- 沒有改任何程式、機率或內容資料。

## 規格第 10 節驗收清單

| # | 項目 | 結果 | 證據 |
|---|---|---|---|
| 1 | 開局只看到核心與一個節點的位置 | 通過 | `circleTier` 2：只有「核心：空」與「一環 第1格」兩個格子；畫面上 0 條連線、0 條星線，沒有五芒星（`a1-start.png`）。 |
| 2 | 關鍵道具依序開放 Lv.4／6／8／9／10，格子依 1～5 排列，放好的元素不跳動 | 通過 | 放好核心（火）與一環第 1 格（土）後依序使用風暴之心、大鵬之眼、熔火封印、巨神之冠、墮星之印：一環格數 1 → 3 → 5 → 5 → 5，二環 0 → 0 → 2 → 3 → 4；每一步後一環第 1 格的畫面座標都是 (975, 301)、核心 (975, 429)，沒有位移（`a2-*.png`）。（注意：規格寫「Lv.4／6／8／10」，Lv.6 時二環還是 0 格，二環從 Lv.8 才有 2 格，Lv.9 有 3 格。） |
| 3 | 元素圈與符文圈：滑鼠、觸控、鍵盤；390 px 邊緣格子的圈不被裁掉 | 通過 | 滑鼠：核心、一環、二環格都長出元素圈（5 個元素，相生順序）、接著階級圈（「初階 ×1200（上限 Lv.2）」等 5 項）。鍵盤：Enter 開圈、焦點先到「水」、方向鍵移動焦點、Enter 選、階級步驟按 Esc 回到元素步驟、再按 Esc 關閉；符文帶用 `focus()`＋Enter 開出 8 個符文。觸控：在 390×844 用 `touchscreen.tap` 開元素圈、階級圈、符文圈。390 px 最邊緣的二環第 2、第 5 格：圈內 5 個項目的座標範圍 x 218～350 與 40～172（視窗寬 390），都在視窗與羊皮紙範圍內，0 個超出（`a3-m-wheel-*.png`）。1280 px 同樣 0 個超出。選二環時階級圈中，初階與中階反灰並顯示「二環需要高階以上」（可見的說明列）。 |
| 4 | 迴路不合：紅線閃動、微震一次、文字警告 | 通過 | 火核心＋風節點（火剋風）：`.wire.clash` 出現（描邊 `rgb(176, 51, 29)`，動畫 `circle-draw, circle-clash`，0.6 s／0.5 s 反覆）；`.parchment` 的 class 序列為 `parchment shake`（約 0.4 s 後回到 `parchment`），只震一次；外環變成紅色虛線（`.ring-line.mismatch`）；出現「迴路對不上：大失敗機率提高」。1280 與 390 結果相同（`a4-*.png`）。 |
| 5 | 合成中、成功、大失敗、稀有四種看起來不同 | 通過 | 合成中：羊皮紙充能暗框、外圈進度環、12 個火花、符文帶旋轉（`circle-spin`）；成功：結果「習得新魔法」，羊皮紙 `success`（光柱）、中央結果、頂端「新發現！」橫幅；大失敗：`parchment burnt` 焦痕變暗，結果「魔法陣崩解了…… 元素已經消耗」；稀有：整個畫面變暗（`.rare-dim`）、羊皮紙抬到暗場上方、進度環與符文帶轉 5 秒（量到 5047 ms 出現全螢幕揭曉）、揭曉動畫為「✦ 稀有魔法！✦」，停在「裝備／不裝備」兩個按鈕（`a5-*.png`、`a6-rare-*.png`）。一般結果出現在 3004～3034 ms。 |
| 6 | 動畫期間星圖與魔法筆記不出現新魔法，揭曉後才出現 | 通過 | 一般：合成前 11 顆星，充能 1.5 秒時仍 11 顆，結果出現時 12 顆。稀有：合成前 13 顆，充能中 13 顆，揭曉時 14 顆。（魔法筆記沒有另外數；它與星圖共用面紗，沒有單獨驗證。） |
| 7 | 流水魔彈‧風在水與風之間；選中才有連線；教科書是印、自創是發光星 | 通過 | 「水」「風」扇區標籤在 x = 443 與 227，流水魔彈‧風的星在 x = 348（兩者之間，靠上緣）。未選中時 `.star-lines line` 0 條；選中時 1 條（疾風刃與流水魔彈‧風共用一環風節點）。教科書魔法火球、疾風刃、魔力彈是 `star-seal` 方印；自創魔法流水魔彈‧風是 `star crafted` 的 `star-glow` 發光圓（`a7-*.png`、`a8-*.png`）。 |
| 8 | 沒有圖時暫代正常；有圖時換成圖 | 通過 | 這台本機 `public/assets/` 本來就有使用者生成的 `parchment.webp`、`desk.webp`（未進版本庫、使用者的檔案，我**沒有**另外放測試圖，也沒有刪）。有圖：`.parchment-sheet.has-art`、`.workbench.has-desk`，截圖為羊皮紙卷軸與木桌（`a1-start.png` 等所有截圖）。無圖：把兩個檔暫時搬到 scratchpad、驗完搬回（MD5 與搬走前相同、目錄內容與原本相同）：`.parchment-sheet` 沒有 `has-art`，用 CSS 漸層與 `clip-path` 畫的破邊紙，桌面是漸層暗木色，版面與功能正常（`a9-noart-d.png`、`a9-noart-m.png`）。 |
| 9 | 無頁面錯誤 | 通過 | 所有腳本的 `pageerror` 與 `console.error` 都是空的（1280 與 390）。 |
| 10 | `npm test`、`npm run build` 通過，`tests/sim` 結果不變 | 通過 | `npm test`：**81 個檔案 932 個測試全過**（含 `tests/sim`，0 次被拒）；`npm run build` 通過（只有 Pixi 超過 500 kB 的既有提示）。 |

**9 項功能驗收＋測試：全部通過。**

## 其他觀察（都沒有修，本任務只驗收）

找到的問題（都沒有修，依嚴重度）：

1. **手機（390 px）核心階級圈的標籤溢出圓形。** 圈上每項只有 47 px 寬，三行文字（「初階」「×1200」「上限 Lv.2」，11 px）高過圓形，文字上下蓋出圓外（`b1-corewheel-m.png`；量到每項 `scrollWidth`／`scrollHeight` 大於 `clientWidth`／`clientHeight`）。1280 px 時每項 74 px，沒有溢出。這是帳本 Task 3 延後的「11px 上限標籤在約 45 px 的項目裡放得下嗎」，答案是放不下。節點的階級圈只有兩行，沒有這個問題。
2. **手機合成後，「新發現！」橫幅與「裝備『…』？」通知蓋住牛皮紙下方與預測文字。** 390 px 下橫幅在牛皮紙中央偏下，擋住結果面板的下半（陣的結果文字被切成兩層），裝備通知蓋住「主屬性…約 Lv.4」預測行（`a5-m-t0-3-result.png`）。1280 px 時橫幅在戰鬥長帶上、通知在右下角，沒有互蓋。
3. **符文帶的字在接縫處重疊。** 整圈符文（「射」「刃」「墜」…）用 `textLength` 排成一圈，起點與終點在上方 12 點鐘處，兩個字疊在一起，且剛好被一環第 1 格的節點壓住（`a8-sel-crafted.png`、`a3-d-wheel-rune.png`）。這是帳本延後的「符文帶字距沒在瀏覽器確認」。不影響操作。
4. **Lv.10 時二環最左與最右的格子落在羊皮紙邊緣。** 二環第 2、第 5 格在 1280 px 時圓心座標 x = 1172／779，羊皮紙實際可畫區約 780～1170，格子被紙緣與 `clip-path` 切掉一部分（`a2-7-tier10.png` 左右各一個半圓）。點得到、圈也不被裁掉（項目 3），但看起來像被切。手機（390 px）同樣貼著紙緣（`a3-m-*.png`）。
5. **無圖暫代時（沒有 `parchment.webp`）桌機的紙比面板高，底部被面板切掉**（`a9-noart-d.png`）；有圖時沒有這個問題。暫代只是素材到位前的版本。
6. **規格敘述與實際格數的小差異：** 規格第 3 節「Lv.4／6／8／10：一環 1→3→5、二環 0→2→4」，實際是一環 Lv.2 1 格、Lv.4 3 格、Lv.6 起 5 格；二環 Lv.8 2 格、Lv.9 3 格、Lv.10 4 格（Lv.4、Lv.6 沒有二環）。程式與 `circle-rules.json` 一致，只是敘述不同。
7. 沒有再量到的舊問題：手機星圖與詳情卡很小、學會上百個陣時連線太密（本次沒有重測，只用不到 15 顆星）。「充能時線條閃爍重畫」（Task 6 延後）與「金線在羊皮紙上的對比」：充能截圖裡線條可見、金線在紙上清楚，沒有看到閃爍的證據（沒有逐幀錄影，不算驗證）。

**稀有揭曉的備註：** 第一次擲出（第 59 次）的截圖在揭曉後 3 秒時中央空白（只有標題與按鈕），第二次擲出（第 189 次）逐一讀 DOM：焚世之焰名稱、「火・Lv.10・稀有魔法」、殘卷線索與按鈕在揭曉後 0、1.5、4 秒都是 `opacity: 1`、`visibility: visible`，截圖也完整顯示（`a6b-rare-late-4000.png`），所以前一張是載入中（頁面約 0 fps）的截圖時機問題，不是 bug。兩次稀有分別在第 59、189 次擲出（期望約 50 次）；擲出時揭曉動畫出現在 5043～5047 ms，停在「裝備／不裝備」。

## 留給使用者試玩的

- 手感與美術：羊皮紙與桌面的比例、元素圈與符文圈的順手程度（尤其觸控）、迴路不合時紅線與微震的強度、合成 3 秒與稀有 5 秒的節奏。
- 手機（390 px）的星圖與詳情卡仍然偏小（舊問題）。
- 規格第 9 節 Pixi 特效層：先看過 CSS／SVG 版再決定要不要做。

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
