# AGENTS.md：Infinite Grimoire 交接指南

本檔給任何接手的人或 AI agent（Claude Code、Codex 等）閱讀。**開始工作前先讀完本檔；結束工作前更新「目前狀態」與「交接紀錄」。**

## 1. 專案一句話

《無限魔導書》：必須聯網的網頁放置遊戲。小人自動打怪，玩家合成元素學魔法、換上後立刻看到戰鬥效果；伺服器保管存檔並檢查進度，防止作弊。

## 2. 必讀文件（依序）

| 文件 | 內容 |
|---|---|
| `docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md` | **設計規格（最高依據）**：完整遊戲系統、版本規劃、反目標 |
| `docs/superpowers/plans/2026-10-21-mvp-core-loop.md` | 第一版（MVP）的 14 個任務實作計畫 |
| `docs/superpowers/sdd/2026-10-21-mvp-core-loop/progress.md` | **實作帳本**：每個任務的完成狀態、審查結果、所有 Ruling（實作時的決策）、延後處理的小問題 |
| `docs/superpowers/sdd/2026-10-21-mvp-core-loop/task-N-brief.md`、`task-N-report.md` | 每個任務的需求原文與實作報告（含 TDD 證據） |
| `docs/superpowers/sdd/2026-10-21-mvp-core-loop/final-fix-report.md` | 最終審查後的修正報告（防作弊錨點窗口等） |
| `docs/superpowers/specs/2026-10-21-v2-roadmap.md` | **第二版路線**：拆成 A 帳號 → B 發現紀錄 → C+D 排行與至尊稱號；C+D 開始前必須先決定的兩個問題 |
| `docs/superpowers/specs/2026-10-21-v2a-accounts-design.md` | 第二版 A（帳號綁定）設計規格 |
| `docs/superpowers/plans/2026-10-21-v2a-accounts.md` | 第二版 A 的 11 個任務實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md` | 第二版 A 的帳本：Ruling、瀏覽器驗收結果、最終審查 |
| `docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md`、`docs/superpowers/plans/2026-10-21-playtest-ux-fixes.md`、`docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/` | 試玩回饋修正的規格、計畫、帳本與卡頓量測報告 |
| `docs/superpowers/specs/2026-10-22-core-rework-design.md` | **核心重做設計規格（目前玩法的最高依據）**：成群魔物、元素五階、名魔法與自創魔法、相性、強化、迷霧與關鍵道具、被動節點 |
| `docs/superpowers/plans/2026-10-22-core-rework.md` | 核心重做的 12 個任務實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-22-core-rework/progress.md` | 核心重做的帳本：Ruling R1～R17、各任務審查結果、模擬通關時間、延後的小問題 |
| `docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md` | **合成台介面改版設計規格（目前介面的最高依據）**：合成台、魔法泡泡與浮動詳情卡、技能樹縮放與拖曳 |
| `docs/superpowers/plans/2026-10-23-synthesis-altar.md` | 合成台介面改版的實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md` | 合成台介面改版的帳本：各任務審查結果、Ruling、延後的小問題 |
| `docs/prelaunch-checklist.md` | **上線前檢查清單**：部署必做事項、忘記密碼的管理員重設流程、延後的小問題；上線前逐項決定 |
| `docs/art-assets.md` | 美術素材清單與 AI 繪圖提示詞 |
| `docs/design/mockups/` | 設計討論時的草圖 |
| `README.md` | 啟動、測試、部署步驟 |

規格與計畫衝突時，以規格為準。計畫沒寫到的地方，看帳本中的 `Ruling:` 行。

## 3. 目前狀態（2026-10-23）

- **Branch：** `feat/core-rework`（從 `main` 分出）。合成台改版的 `feat/synthesis-altar` 已於 2026-10-23 依使用者指示 fast-forward 合併回 `feat/core-rework` 並刪除。`main` 已經包含 MVP 與第二版 A（`feat/mvp-core-loop`、`feat/v2a-accounts` 都是 `main` 的祖先）和文件；**還沒合併到 `main` 的只有 `feat/core-rework`**，**尚未 push**（遠端只有 `origin/main` 與 `origin/feat/mvp-core-loop`）。本機 `main` 有文件 commit 尚未 push。
- **跨電腦同步（Syncthing，Windows ↔ macOS）：**
  - Syncthing 的資料夾根目錄是 `~/syncthing/code`，忽略規則在 `~/syncthing/code/.stignore`（`**/node_modules`、`**/.wrangler`、`**/dist`）。
  - 每台電腦各自 `npm i`。如果看到 `Permission denied`（`.bin`）或 `Cannot find native binding`，代表 `node_modules` 是別的平台裝的：確認 `.stignore` 生效後，刪掉 `node_modules` 重新 `npm i` 即可。
  - `.gitattributes` 強制 LF 換行，避免 Windows 編輯後整個檔案都顯示為修改。
  - **開對話時自動檢查**：`.claude/settings.json` 的 SessionStart hook 會執行 `scripts/session-context.mjs`，把這台電腦的 git 狀態、`node_modules` 是否為本平台安裝、Syncthing 衝突檔和本節內容交給 agent。其他 agent 可以自己執行 `node scripts/session-context.mjs`。
  - 不要兩台電腦同時開這個專案（`.git` 也在同步）；換電腦前確認 Syncthing 顯示「最新」。
- **核心重做：** 12 個任務全部完成，每個任務都經過獨立審查，帳本在 `docs/superpowers/sdd/2026-10-22-core-rework/progress.md`。玩法改成：魔物成群出現、元素五階（升階成本 3／10／30／100）、名魔法＋自創魔法（任兩個輸入合成、有相性）、同元素強化與融合、魔法強化（`levels`）、魔導書迷霧＋關鍵道具（`revealed`）、被動節點（`passives`）。migration `0004_core_rework.sql` 本機已套用，**會重置所有存檔**；遠端未套用。
- **合成台介面改版（2026-10-23，`feat/synthesis-altar`）：** 規格 `docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md`，計畫 `docs/superpowers/plans/2026-10-23-synthesis-altar.md`，帳本 `docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md`。右欄改成方形合成台（`SynthesisAltar`：左右各放一個輸入、各依元素與魔法有不同特效、中間「合成」、按下後融合特效再揭曉結果；被拒絕時不播完整動畫、兩邊保留並顯示原因）；原本的合成區下拉選單與「嘗試紀錄」組合表已移除（伺服器的 `synthesisLog` 保留給第二版 B）。魔導書：單擊魔法冒出泡泡（放入合成／裝備／詳情）、雙擊直接放入合成台、詳情與強化合成一張浮動卡（`NodeCard`）、縮放按鈕移進技能樹並加「⌖ 回到中心」、滾輪只縮放不捲頁、拖曳與縮放不經過 React state。關鍵道具按鈕移到戰鬥畫面（`KeyItemBar`），訊息幾秒後自動消失。
- **測試：** `npm test` 51 個檔案、478 個測試通過；`npm run build` 通過（只有 Pixi 打包超過 500 kB 的提示）。
- **合成台驗收（headless Edge + puppeteer-core，2026-10-23，Windows）：** 規格第 9 節 10 項全過、無頁面錯誤。元素存量、已學會的魔法清單與一個關鍵道具是直接改本機存檔種進去的；放入、裝備、合成、強化、使用關鍵道具、解鎖被動、拖曳、滾輪都是實際操作。1280x900 下拖曳技能樹同時重複播放合成台特效約 149 fps（單幀最長 75 ms；戰場上只有少數怪，沒有重測 80 隻怪的情況）。驗收中發現泡泡在已學會魔法上高度估錯、會蓋住自己的節點，已修正（`fix(ui): reserve the real height of a learned spell's bubble`）。腳本與截圖在 `.superpowers/`（未進版本庫）。
- **模擬通關時間（Task 10 修正後，種子 20261021，模擬分鐘，0 次被拒）：** 火 90.4、風 111.8、雷 90.2、土 126.6、水 96.9、混合 93.2；每條純屬性路線落在 60～240 分鐘（R12）。
- **驗收（headless Chrome，2026-10-22）：** 遊客 → 合出火球 → 升階 → 同元素強化（烈焰爆發）→ 融合（火焰龍捲，出現「新發現！」）→ 自創魔法出現在筆記 → 強化 → 第一個魔王倒下拿到風暴之心 → 使用後迷霧散開 → 解鎖被動 → 綁定帳號後重新整理進度都在，全部通過、無頁面錯誤。元素存量與「差 1 隻到魔王」的擊殺數是直接改本機存檔種進去的（其餘都是實際操作）。截圖在工作區 scratchpad，未進版本庫。
- **之前的功能：** MVP、試玩回饋修正、第二版 A（帳號綁定，`feat/v2a-accounts`；migration 0003 已在本機套用）都已完成，見各自的帳本。

**尚未完成（下一位接手者的待辦）：**
0. **使用者在真實瀏覽器試玩合成台**：合成台特效的手感與辨識度（元素與魔法看得出差別）、融合與揭曉的節奏、泡泡與浮動詳情卡的操作、拖曳與縮放順不順、關鍵道具按鈕在戰鬥畫面上的位置、手機版面。核心重做的試玩（成群清場手感、各元素特效、迷霧散開、卡頓、平衡）也還沒做；**平衡數值使用者明確表示之後再調**。再由使用者決定 push 與合併到 `main` 的方式（只剩 `feat/core-rework`，已包含合成台改版）。
1. **第二版 A 收尾**：使用者在真實瀏覽器試用帳號功能（兩個視窗同時登入、改密碼後另一邊被登出）。
2. **第二版 B（稀有魔法發現紀錄）**：要先做設計討論；核心重做的 `synthesisLog` 與自創魔法 id 是它的基礎（帳本 R5：`dormant` 結果不寫進 `synthesisLog`，B 可能想要）。
3. **部署（暫緩，使用者指示：遊戲還不是成品，等使用者明確指示才上線，不要主動提議部署）**：需要使用者本人執行 `npx wrangler login`、建立 D1、把 `database_id` 填進 `wrangler.jsonc`（目前是佔位值）、套用 remote migration、`npm run deploy`。**部署前要先取得使用者同意。** 遠端 D1 要依序套用 0001→0003→0004；0004 會重置所有存檔。見 `docs/prelaunch-checklist.md`。

## 4. 本機啟動

```bash
npm i
npm run db:migrate:local   # 本機 D1（wrangler 模擬，存在 .wrangler/，不需要 Cloudflare 帳號）
echo 'PASSWORD_PEPPER=dev-only-pepper-not-for-production' > .dev.vars   # 第一次；沒有它帳號功能回 500
npm run dev                # http://localhost:5173 （網頁與 /api 一起跑）
npm test
npm run build
```

Node 22.13 以上（資料庫測試用到 `node:sqlite`）。新增 migration 後要重跑 `db:migrate:local`。

## 5. 架構地圖

```
src/engine/   純 TypeScript 遊戲邏輯（瀏覽器與伺服器共用；禁止 DOM/React/Pixi/Workers API）
  model.ts 內容與遊戲狀態的型別 · content.ts 內容載入與交叉檢查（zod）· types.ts 元素／階級／道具 id
  spells.ts 名魔法與自創魔法的解析（resolveSpell、craftedId、spellAtLevel、攻擊上限）
  crafting.ts 合成（配方、相性、融合成本、重擲不免費）· tree.ts 魔導書節點與迷霧、深度上限、被動解鎖
  empower.ts 魔法強化與被動加成 · inventory.ts 背包與升階
  combat-rules.ts 傷害門檻／越級遞減／相剋 · combat.ts 戰鬥模擬（成群魔物、各種魔法效果、狀態、ENGAGE_R 瞄準、MAX_ACTIVE_FX）
  persist.ts 初始存檔與存檔解析（zod）· audit.ts 防作弊：上傳上限檢查（取代舊的 validate.ts）· rng.ts
src/data/content/  魔法 spells、配方 recipes、魔物 monsters、地點 zones、素材 materials、關鍵道具 key-items、
              被動 passives、魔導書區域 regions（*.json；內容與數值都在這裡）
worker/       Cloudflare Worker（Hono）：遊客與帳號（sessions／credentials、password.ts 對瀏覽器雜湊做 HMAC＋pepper）、
              存檔上傳、伺服器擲骰合成、強化、使用關鍵道具、解鎖被動；
              store.ts / d1-store.ts / store-contract.ts（兩種 Store 共用的契約測試）
migrations/   D1 schema（0001 初始、0002 錨點窗口、0003 帳號、0004 核心重做：重置存檔）
src/game/     瀏覽器執行層：runtime（固定步進）、api、session（token）、sync（上傳／動作／斷線／錯誤）、loop、boot
src/render/   Pixi 戰鬥畫面（佔位圖形 + 選用貼圖 public/assets/<key>.png）；arena.ts 圓形戰場幾何；
              element-fx.ts 各元素的粒子語彙；effects.ts 特效視覺；motion.ts 怪物擺動
src/ui/       React 介面：TopBar（地點／魔法選擇器）、ElementTable、SynthesisAltar（方形合成台，資料與特效描述在 altar-data）、
              DiscoveryBanner（新發現、一網打盡）、Notebook（魔法筆記）、EmpowerPanel（強化）、
              GrimoirePanel（SVG 技能樹，含迷霧、泡泡 NodeBubble、浮動詳情卡 NodeCard）、KeyItemBar（戰鬥畫面上的關鍵道具按鈕）、
              Onboarding、OfflineOverlay；
              useGame.ts 的 useRuntime(selector)；開發用 PerfMeter
tests/sim/    專精路線模擬（機器人經由真實 createApp + MemoryStore 遊玩）
tests/d1/     node:sqlite 上的 D1Store 與 migration 測試
```

TS 分兩個專案：`tsconfig.app.json`（src，含 DOM）與 `tsconfig.worker.json`（worker + engine + data，無 DOM），這樣能強制引擎不碰 DOM。

## 6. 不能違反的規則

- **專精路線不能被內容卡住**：重要素材不能只從單一屬性取得；屬性相剋最多 ±10%。每條純屬性路線都要能通關，`tests/sim` 的通關時間要落在 60～240 模擬分鐘。
- **傷害門檻**：魔法階級 ≥ 魔物階級 − 1，或攻擊力 ≥ 防禦 × 0.7，否則傷害為 0（畫面顯示「無效」）。
- **越級遞減**：d = 魔法階級 − 魔物階級，d ≥ 2 時掉落效益 = 0.5 + 0.5 × 0.5^(d−1)。例外：`key:` 道具不受遞減影響（R13），每個魔王第一次擊倒一定掉關鍵道具。
- **小人沒有血條、不會死。**
- **伺服器是銀行**：`learned`、`levels`、`revealed`、`passives`、`synthesisLog` 只能由伺服器改變（合成、強化、使用關鍵道具、解鎖被動都是伺服器動作）；合成一律伺服器擲骰。被拒絕的動作回 422、不寫入、不算作弊（R9、R11）。
- **元素五階**：初階／中階／高階／極階／神階；升階成本 3／10／30／100 個低一階的元素。
- **隨機配方的重試不免費**（R14、R14b）：落空到已會的自創魔法時，照名魔法重複的方式扣成本。
- **自創魔法 id 只有一種寫法**：`c(<a>|<b>)`，兩個輸入 token 依字串排序（`craftedId`）；不照順序或只有素材的 id 解析成 null（R4）。深度上限 `HARD_MAX_DEPTH`，強化等級上限 `MAX_SPELL_LEVEL`，攻擊上限 `CEILING_FACTOR`。
- **特效上限**：場上同時存在的特效 `MAX_ACTIVE_FX = 24`（`combat.ts`），畫面與引擎共用；新增特效不要繞過它。
- **範圍魔法的瞄準**：最密、隨機、最強等目標只考慮中心 `ENGAGE_R = 0.4` 以內的魔物，沒有才退回全部（R16）；一網打盡一定要在畫面裡看得到。
- **防作弊錨點窗口**：上傳以「錨點存檔 + 目前的伺服器欄位」為基準檢查增益（`audit.ts`）；錨點每 60 秒前進一次，最多採計 180 秒；合成時把扣掉的材料也記到錨點（可為負，代表欠量）；`key:` 道具不給 `GAIN_SLACK`，必須來自真的魔王擊殺（R8）。改動 `audit.ts` 或 `worker/app.ts` 時，必須保持 `tests/sim` 各條路線 0 次被拒，以及 worker 的對抗測試全部通過。
- **React 效能**：魔導書與節點詳情用窄 selector 訂閱，不能訂閱整個 `game` 或背包（戰鬥中每次掉落會讓整個 SVG 重畫）；有 Profiler 測試把關。
- **「Lv.」永遠是魔法／魔物階級**；強化等級顯示成「強化 +N」（R17）。
- **遊客 token 只在 401 時清除**，其他錯誤一律保留 token 並讓玩家重試。
- **不收集 email**；介面文字用繁體中文，資料名稱附 `nameEn`。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`；元素色見 `src/render/palette.ts`。

## 7. 工作方式與慣例

- 使用者偏好以**繁體中文**溝通。
- 新功能流程（superpowers）：先討論設計並寫進 `docs/superpowers/specs/`，再寫計畫到 `docs/superpowers/plans/`，執行時用 `docs/superpowers/sdd/<plan名>/progress.md` 當帳本（每完成一個任務就記一行）。
- 採 TDD，任務完成前要跑 `npm test` 與 `npm run build`。
- 不要直接 commit 到 `main`；開功能 branch。**例外（2026-10-22 使用者指示）：只改文件的討論與紀錄（`docs/`、AGENTS.md）直接在 `main` commit，不開新 branch。****push、部署、合併前都要先問使用者。**
- Commit 訊息用 Conventional Commits（英文），結尾加上所用 agent 的 Co-Authored-By 標記。
- `.superpowers/` 是本機暫存（被 gitignore）；要保留的紀錄請放在 `docs/`。

## 8. 已知問題與延後項目

完整清單見各帳本的 `minor (deferred)` 行；最終審查判定都可以之後再處理。核心重做中玩家看得到的：
- 一個狀態中的怪切換成打不動牠的魔法後，牠身上已有的燃燒仍會跳傷害。
- 追上進度（卡頓後補算）時，擊殺時間用畫面時間記錄，可能誤報「一網打盡」。
- 最密／最強等多目標魔法在交戰圈內魔物很少時，目標數可能少於 n。
- 魔導書過載沒有橫幅。
- 兩個魔法名字重複用字（雷鳴、颶風）；「感電之海」的線索提到大地。
- 降級落空到已會的魔法時，畫面不可寫「全部退還」（實際只退第一個輸入）。
- 平衡數值的產生器（SCALE 表）不在版本庫；`tests/sim` 約 30 秒，模擬一小時約 3 秒。
- 美術貼圖只支援單張圖，不支援多格動畫；特效的貼圖流程已移除（沒有被要求）。
- 魔王打不動時，玩家要自己退回前一個地點；HUD 有提示，但沒有自動處理。
- 同一個 token 開多個分頁時，會互相以 409 覆蓋（不算作弊，資料一致）。
- 沒有 WebGL 時，Pixi 初始化失敗沒有提示。
- 魔導書：不支援雙指縮放。
- 合成台改版留下的小問題：手機上點未學會的魔法，上方的線索框高度改變會讓技能樹整個位移，泡泡位置在位移前算好，會偏離節點幾十 px（不會被裁掉）；手機上合成台是方形、把技能樹擠到第一屏之外（規格接受，放入時有提示）；合成台特效沒有針對名魔法各做專屬版本。

## 9. 下一步路線（規格第 6 節）

1. **第一版收尾**：畫面驗收 → 部署 → 合併。
2. **第二版**：拆成子專案依序做，詳見 `docs/superpowers/specs/2026-10-21-v2-roadmap.md`：A 帳號密碼（計畫已寫好）→ A2 Google 登入（之後）→ B 稀有魔法發現紀錄 → C+D 排行榜與每日 UTC+8 午夜結算的至尊稱號（開始前先決定「大魔導士稱號」與「內容太少會同分」兩個問題）。
3. **第三版**：煉金與熟練度、商店、金幣、玩家市集。
4. **之後**：稱號、轉生（退還 85%）、光暗魔導書、五芒星不相鄰混合、離線收益、禁忌配方卡、天賦、多魔法欄位。

每個版本開始前，都要先走設計討論 → spec → plan 的流程。

## 10. 交接紀錄

最新的放最上面。每次結束工作時新增一筆：日期、做了什麼、停在哪裡、下一步。

- **2026-10-23（Claude Code，Opus 5.5，Windows）**：使用者試玩核心重做後的回饋（合成選單不直覺、滾輪與拖拉衝突、嘗試紀錄失去意義；平衡之後再調）經設計討論寫成規格與計畫，以 subagent-driven-development 執行（見下一筆）。最終全 branch 審查：Critical 0、Important 3（帳本未 commit、缺「合成台已滿」提示、滾輪縮放不看捲動量），連同必修的拖曳卡住問題一次修正並複審通過；`npm test` 51 個檔案 478 個測試、`npm run build` 通過。使用者指示把 `feat/synthesis-altar` 合併回 `feat/core-rework`（fast-forward，branch 已刪）。停在：`feat/core-rework` 尚未 push、尚未合併到 `main`。下一步：使用者在真實瀏覽器試玩合成台 → 決定 push 與合併到 `main` → 第二版 B 設計討論。

- **2026-10-23（Claude Code，Sonnet 5.5，Windows）**：以 subagent-driven-development 在 branch `feat/synthesis-altar`（從 `feat/core-rework` 分出）執行合成台介面改版 7 個任務，帳本 `docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md`。內容：方形合成台取代合成區與嘗試紀錄、魔導書的泡泡／雙擊／浮動詳情卡、縮放按鈕進技能樹與滾輪只縮放、拖曳不經過 React、關鍵道具按鈕移到戰鬥畫面。最後一項任務在 headless Edge 驗收規格第 9 節 10 項全過，並修正一個泡泡高度估錯的問題。停在：全部 commit，`feat/core-rework` 與 `feat/synthesis-altar` 都尚未 push、尚未合併到 `main`（`main` 已含 MVP 與第二版 A）。下一步：使用者在真實瀏覽器試玩合成台，再決定 push 與合併；平衡數值使用者明確延後；之後是第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5 與 Sonnet 5.5，macOS）**：以 subagent-driven-development 在 branch `feat/core-rework` 執行核心重做計畫的 12 個任務（實作者與審查者分開，帳本 `docs/superpowers/sdd/2026-10-22-core-rework/progress.md`，Ruling R1～R17）。重要裁定：隨機配方重試要付成本（R14）、關鍵道具不受越級遞減（R13）、範圍魔法只瞄準交戰圈內的魔物（R16）、「Lv.」只代表階級、強化顯示「強化 +N」（R17）。最後一項任務在 headless Chrome 走完整條流程（火球 → 升階 → 同元素強化 → 融合 → 自創 → 強化 → 魔王 → 關鍵道具 → 被動 → 綁定帳號重整），全部通過；元素存量與魔王前的擊殺數是種進本機存檔的。migration 0004 會重置所有存檔，已寫進上線前檢查清單。停在：全部 commit，尚未 push、尚未合併。下一步：使用者在真實瀏覽器試玩核心重做（感受、平衡、卡頓）→ 決定 push 與合併 → 第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：與使用者確認目前不再投入基礎建設，把延後項目整理成 `docs/prelaunch-checklist.md`（含忘記密碼時管理員手動重設的流程，以及部署時要另外保存 pepper），上線前統整一次。使用者把「管理員重設密碼工具」列為上線前必做（或之後討論更合規的替代方案），並指示文件類的修改直接在 `main` commit。停在：已合併到 `main`，尚未 push。下一步：第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：雜湊改版的最終審查 Critical 0、Important 0（4 個 minor 記在帳本）。使用者指示把 `feat/mvp-core-loop` 與 `feat/v2a-accounts` 合併回 `main`：`main` 只有 Initial commit，以 fast-forward 合併到 `feat/v2a-accounts`（已包含 MVP branch）。停在：本機 `main` 已合併，尚未 push。下一步：使用者 push → 第二版 B 設計討論（從 `main` 開新 branch）。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：使用者問 PBKDF2 50k 次的 CPU 時間後，決定把慢的雜湊移到瀏覽器：瀏覽器 PBKDF2 300,000 次（headless Chrome 實測約 143ms）＋伺服器 HMAC-SHA256 與 secret pepper（使用者選擇；也確認安全性做到合理即可）。spec 已修訂，計畫 `docs/superpowers/plans/2026-10-22-v2a-client-hash.md` 4 個任務以 executing-plans 完成。舊的 `pbkdf2-sha256$` 雜湊不相容（沒有真實玩家），本機驗收用新帳號：綁定、另一台登入、改密碼、連錯限制、請求內無明文密碼、按鈕「處理中…」都通過。停在：全部 commit，尚未 push。下一步：使用者試用 → 決定 push／合併 → 第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：以 executing-plans 執行第二版 A 計畫的 11 個任務（branch `feat/v2a-accounts`），帳本 `docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md`。重要 Ruling：migration 0003 改成「複製 → DROP → 以原名重建 → 插回」，因為計畫的 RENAME 做法在 SQLite 上 commit 時觸發外鍵錯誤；限制視窗改成剛好滿 1 小時／15 分鐘即過期，與 retryAfterSec 一致。本機 headless Chrome 驗收 7 項通過；最終全 branch 審查的 2 個 Important（換帳號後舊同步仍上傳、已綁定切換帳號沒存檔與登出）已修正，4 個小問題記在帳本 `minor (deferred)`。停在：全部 commit，尚未 push。下一步：使用者試用帳號功能 → 決定 push／合併 → 第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：重新讀取專案進度並更新第 3 節。確認第二版 A 計畫尚未執行（沒有 `docs/superpowers/sdd/2026-10-21-v2a-accounts/`）、本機多 9 個 commit 未 push。發現跨電腦同步問題：從 Windows 同步來的 `node_modules` 在 macOS 不能跑測試，另有 7 個檔案只有換行變成 CRLF（詳見第 3 節）。之後經使用者同意：加 `.gitattributes`（LF）並還原換行、把 Syncthing 忽略規則建在正確的資料夾根目錄、在 macOS 重裝 `node_modules`（`package-lock.json` 的 name／version 同步成 `package.json` 的值）。macOS 上 `npm test` 36 個檔案 279 個測試通過，`npm run build` 通過。停在：使用者自己 push。下一步：第 3 節待辦 0（執行第二版 A 計畫）。

- **2026-10-21（Claude Code，Opus 5.5）**：第二版設計開始。與使用者確認把第二版拆成 A 帳號 → B 發現紀錄 → C+D 排行與至尊稱號（`docs/superpowers/specs/2026-10-21-v2-roadmap.md`）。完成 A 的設計討論與 spec（`2026-10-21-v2a-accounts-design.md`）：多裝置各自 session、遊客切換帳號先提醒再捨棄、這次不做 Google、免費方案所以 PBKDF2-SHA256 50,000 次（本機實測 50k≈5ms、100k≈10ms，免費方案 CPU 上限 10ms）、`/api/guest` 每 IP 每小時 10 個。寫計畫時發現並修正 spec：帳密錯誤改回 403（401 會讓用戶端清掉 token）。實作計畫 `docs/superpowers/plans/2026-10-21-v2a-accounts.md`（11 個任務，已確認 vitest 可用 `node:sqlite` 測真正的 SQL 與 migration）。停在：計畫寫好、尚未執行。下一步：執行計畫（見第 3 節待辦 0）。

- **2026-10-21（Claude Code，Opus 5.5）**：處理最終審查延後的 7 個小問題（帳本末段「Deferred minors — resolved」）：選擇器的鍵盤與無障礙（捲動到選中項、aria-activedescendant、焦點離開關閉）、浮字不再飄出畫面上緣、怪物畫面在 uid 重用時重建、元素表名稱欄寬、合成等待回應期間鎖住換地點／換裝備／升階。停在：全部 commit，尚未 push。部署仍暫緩。下一步：由使用者決定（第二版設計或其他試玩調整）。

- **2026-10-21（Claude Code，Opus 5.5）**：使用者試玩新版面後的三項回饋（bounded，對話中確認設計後實作，無 spec）：(1) 嘗試紀錄改成依階級切換的元素×元素組合表（`SynthesisMatrix`），只顯示玩家自己試過的結果、未試過顯示「？」，點格子放進合成槽，跨階級組合列在表下；(2) 怪物移動一格一格的原因是引擎每 50ms 一步、畫面直接畫最新一步——改成依 `runtime.stepAlpha()` 在前後兩步之間補間（實測每幀有位移的比例 17% → 67%）；(3) 怪物到停止圈後左右徘徊 ±12°、向外擺動 4px（`src/render/motion.ts`，純畫面）。另外修正 MVP 既有問題：每次合成或上傳衝突後 `runtime.replaceState` 都會重建戰鬥（場上怪物消失）；現在只有伺服器存檔在不同地點時才重建。停在：使用者試玩確認移動已順暢、合成不再清空戰場；branch 已由使用者手動 push。部署暫緩，等使用者指示。下一步：使用者決定下一個要做的功能或調整。

- **2026-10-21（Claude Code，Opus 5.5）**：以 executing-plans 在同一個 session 執行試玩回饋修正計畫的 11 個任務，並做了整個 branch 的最終審查（修正 2 個重要問題：手機上戰鬥畫面被裁切、手機上殘卷線索跑到畫面外；7 個小問題記在帳本的 `minor (deferred)`）。【待決策】的裁定記在帳本 R1～R10；其中 R9 是魔法選擇器的排序偏好存在 localStorage（`ig.spellSort`），使用者已同意。Claude in Chrome 沒有連上，所以畫面驗收與量測改用 headless Edge（puppeteer-core，腳本不進專案）。停在：等使用者在真實瀏覽器試玩新版面。下一步：使用者試玩 → 部署 → 合併。所有 commit 都還沒 push。

- **2026-10-21（Claude Code，Opus 5.5）**：使用者在本機試玩 MVP，回報戰鬥畫面太大、元素列表沒分類且離合成區遠、想要圓形戰場、有些微卡頓，另外原生下拉選單看不到魔法階級也不能排序。已寫成設計文件 `docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md`，草圖 `docs/design/mockups/layout-v1.html`（使用者選 B 案）。停在：等使用者審閱設計文件。下一步：寫實作計畫。

- **2026-10-21（Claude Code，Opus 5.5）**：完成設計規格、MVP 計畫，以及以 subagent-driven-development 執行全部 14 個任務、最終審查與修正（含防作弊錨點窗口、合成重擲漏洞）。branch `feat/mvp-core-loop` 已 push 到 GitHub。停在：畫面驗收與部署尚未進行。下一步：見第 3 節待辦。
