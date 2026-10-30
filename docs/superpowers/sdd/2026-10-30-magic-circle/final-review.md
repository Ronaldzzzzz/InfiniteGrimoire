# 最終全 branch 審查：專案 2 魔法陣合成（e7c28de..9f49874）

審查者：Claude Code（Opus 5.5），2026-10-31。只讀；分兩輪看：(1) 引擎與伺服器（circle、circle-spell、circle-synth、spells、persist、audit、tree、worker/app、migration 0008），(2) 用戶端與介面（sync／api、CircleTable、NodeCard、star-layout、KeyItemBar、GM 配方表、App.css）。帳本、Task 7 驗收報告與規格第 2～5 節都讀過。`npx vitest run`：79 個檔案、871 個測試全過（本機 23 秒）。

## 做得好的地方
- **不可信的擺法從頭到尾都有檢查。** `parsePlacement`（circle-synth.ts:30-39）用 strictObject 檢查：環的長度、整數階級 1～5、元素與符文必須存在，格式不對回 400。接著 `synthesizeCircle`（circle-synth.ts:83）用**伺服器自己的** `circleTier` 與 `runesUnlocked(defeatedBosses)` 呼叫 `placementProblems`，違規回 422、不寫入、不算作弊。之後才扣元素（`removeItems`），所有擲骰用同一個 rng 流。扣掉的元素透過 `chargeAnchor`（worker/app.ts:462）記到錨點。worker 測試涵蓋：每一種擺法問題、格式錯誤、parseState 失敗回 500、同一 revision 同時送、大失敗扣錨點、錨點窗口、高頻呼叫、`circleTier` 不能上傳修改（app.test.ts:266-671）。
- **用戶端擋的和伺服器拒絕的一致。** CircleTable 用同一個 `placementProblems`／`circleCost`，輸入也一樣（`circleTier`、從 `defeatedBosses` 推出的符文、背包存量），所以按鈕能按就代表伺服器會收。被拒絕時陣保留、不播動畫。
- **標準化 id 的唯一性。** `foldRings` 在 10 種旋轉／鏡像中取最小字串；`parseCanonical` 不接受還沒摺疊的寫法。教科書陣有測試把關：迴路都接得上、符合上限與門檻、旋轉後是同一招（circle-spell.test.ts:113-140）。`content.ts` 擋重複的 circle。
- **稀有魔法與發現紀錄。** 只有自己的 Lv.10 陣在成功之後才擲 `RARE_CHANCE`；已經會的稀有回 `known`、不帶 `rare` 欄位、不寫第二筆發現紀錄。發現紀錄在存檔寫入成功之後才寫，寫入失敗不會把已學會的結果變成 500；可疑或用過 GM 的帳號不寫入（worker/app.ts:489-506；app.test.ts:1139-1215）。
- **關鍵道具與格子開放。** `useKeyItem` 只往上開；用過低一級的道具會失效，但 KeyItemBar 只列出「能開更高階級」的道具（KeyItemBar.tsx:27），失效的道具不會變成一直被拒絕的按鈕。GM 的 `reveal_all` 會開到最高階級。
- **React 效能。** CircleTable 的 selector 都是字串或數字，戰鬥中的掉落不會讓牛皮紙重畫。

## 問題

### Critical
（無）

### Important（合併前要修）
1. **牛皮紙上是一顆實心黑色五芒星（P1）。** App.css:250 的 `.parchment-svg .guide` 沒有 `fill: none`，SVG 的 path 預設填黑，每張牛皮紙都被它蓋住。它畫在連線與節點底下，和「淡淡的底線」的意圖相反。修法：加 `fill: none` 一行（NodeCard 的小陣圖已經有 `fill="none"`，NodeCard.tsx:35）。
2. **關鍵道具按鈕的說明還是迷霧時代的文案（P5）。** key-items.json:6,13,20,27,34 的 `desc`（例如「魔導書的外圍會浮現新的線索」）直接顯示在戰鬥畫面的按鈕上（KeyItemBar.tsx:49），但迷霧已經移除，這些道具現在是開放魔法陣格子。這會讓玩家誤會道具的作用。修法：五句改成「開放魔法陣到 Lv.N」之類的說明；只改內容，不動程式。
3. **手機上元素選擇器的「關閉」要捲動才看得到（P2）。** App.css:295-303：`.circle-picker` 最高是牛皮紙的 60%，`.picker-actions` 放在可捲動區域的最後面；寬 390 px 時 7 個選項只露出約 3.5 個，「關閉」在畫面外，手機也沒有 Esc。這是牛皮紙上最主要的操作。修法：`.picker-actions { position: sticky; bottom: 0; background: inherit }`，或把「關閉／移除」移到選擇器頂端。
4. **存檔裡的 `synthesisLog` 沒有上限，最後會超過上傳上限、讓帳號卡死（建議開票，上線前處理，不擋這次合併）。** circle-synth.ts:102 對每一種「陣＋形態」記一筆 `{attempts, results:{learned:<id>, known:<id>, failed}}`。以 `m:thunder.8.ttttt.---tt.storm` 估算，一筆約 170 bytes，再加上 `learned` 每招約 32 bytes。整份存檔每次上傳都受 `MAX_BODY_BYTES` 64 KB 限制（worker/app.ts:51、116）。大約試過 300 種不同的陣，存檔與所有伺服器動作都會回 413，玩家沒有辦法自己恢復。魔法陣能排出的不同組合比舊的兩兩組合多很多，介面又鼓勵實驗。介面完全沒有讀 `synthesisLog`，伺服器另外有 `recordSynthesis` 寫進資料庫（worker/app.ts:491）。修法擇一：從存檔移除 `synthesisLog`（只保留資料庫那份）；或改成精簡格式（只記 attempts）；或設上限，並在 `tests/sim` 加一個存檔大小的檢查。

### Minor（可以延後）
5. src/engine/spells.ts:22：`resolveSpell('fireball')` 這類非稀有的教科書名稱，回傳的是 spells.json 裡**舊的手調數值**；`resolveSpell(fireball.circle)` 回傳的則是公式算出的魔法，兩者不同。目前沒有任何路徑會學會名稱 id（`learned` 由伺服器擁有，只會存 `m:` id），但這是一個陷阱：任何新程式用名稱查魔法都會拿到另一份數值。建議：名稱 id 一律解析成它的陣，或者只讓沒有陣的 `mana_bolt`／`mana_overload` 用名稱解析。
6. circle.ts:193,205：`CANON_RE` 的 `\d{1,2}` 接受 `m:fire.02.…`，`parseCanonical` 也接受階級小於節點數的 id，所以同一個陣不只一種寫法，persist 都會接受。`learned` 由伺服器擁有，所以不能被利用；但這和規格 3.6「唯一的標準寫法」不完全一致。修法：檢查 `String(tier) === tierS && tier === 1 + n1 + n2`。
7. audit.ts:14 的 `KEY_SLACK` 註解還寫著「lift one fog region」；content.ts:112,261 與 key-items.json 的 `reveals`、regions.json 都是沒在用的資料（帳本已列）。之後清掉。
8. spells.json 裡 36 招沒有 `circle` 的舊名魔法（flame_burst、tailwind、sunfall…）、`mana_overload`、稀有魔法存的 `effects`，現在都學不到，但仍會被解析，也算在 content.ts:246 的每階檢查裡。之後清理，或標成「待做成教科書陣」。
9. 符文由用戶端上傳的 `defeatedBosses` 推出（circle-synth.ts:83）。這個欄位有經過稽核（魔王所在地點、關卡、最短時間），所以可以接受；但規格 3.9 寫的是「符文的取得是伺服器擁有的欄位」。建議在帳本補一條 Ruling 說明這個偏差。
10. GM 配方表把一般教科書陣標成「100%」（recipe-table.ts:28），實際上有 `FAIL_BASE` 10% 的大失敗。建議改寫成「成功時 100%」或顯示 90%。
11. 手機上星圖太小、詳情卡被框在面板裡（P3），App.css:201 的 `.node-card` 最高 60%。和舊技能樹的已知問題同類，留到試玩後處理。
12. 本機 `discoveries` 還保留 0008 之前的稀有首位（P6）。遠端連 0005 都還沒套用，所以上線時影響是零；只是本機驗收的「全服首次發現」要先清表。

### 帳本延後項目的分類
- **合併前要修：** key-items desc（上面第 2 項）。
- **可以延後（理由）：** parseCanonical 接受階級小於節點數的 id（`learned` 由伺服器擁有，見第 6 項）；resolveSpell 接受接不上的 id（只能由伺服器學會）；稀有魔法存的 effects、`reveals`／regions 沒在用（第 7、8 項）；深度被動不再有效（已從星圖隱藏）；低一級的道具在高一級之後失效（按鈕已隱藏）；d1 0008 的測試拿目前的初始狀態比較（將來加欄位時要改）；模擬沒有擲到稀有（worker 測試有涵蓋）；circleRules 是全域、沒有注入；spells↔circle-spell 互相 import；O(n²) 連線（68 顆星時 59 fps）；CircleTable 太長；各種測試脆弱與 RED 順序的問題。
- **驗收問題：** P1、P2、P5 合併前修；P3 延後到試玩；P4（連線密度）由使用者決定；P6 不是程式錯誤。

## 這次沒有評斷的項目
- 平衡數字（`FAIL_BASE`、`FAIL_PER_MISMATCH`、`RARE_CHANCE`、`RARE_BONUS`、分支表、相生相剋倍率）：規格寫明是佔位，最終值由使用者確認。
- 刷稀有的時間（rare-cost 只印報告，驗收時 1/81、期望約 1/55）：使用者的平衡決定。
- 星圖連線密度（P4）：帳本 Ruling 已交給使用者。
- 兩個不相鄰元素的平均落在第三個扇區（Task 6 Ruling 已接受）。
- 煉獄、萬雷改排（Task 1 Ruling）。
- 多形態名魔法壓成單一形態（規格 2.5，使用者已同意）。

## 結論
**可以合併嗎：修完再合併。** 防作弊的鏈條是完整的，每一步都有測試：擺法格式 → 規則（用伺服器的階級與符文）→ 成本 → 擲骰 → 錨點扣除 → 發現紀錄。用戶端與伺服器的判斷一致，舊系統沒有留下會被觸發的死路。合併前要修三個便宜的使用者可見問題：P1 黑色五芒星、P5 迷霧時代文案、P2 手機選擇器的「關閉」。`synthesisLog` 沒有上限是上線前一定要處理的潛在卡死，建議開票。
