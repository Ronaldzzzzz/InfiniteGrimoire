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
| `docs/art-assets.md` | 美術素材清單與 AI 繪圖提示詞 |
| `docs/design/mockups/` | 設計討論時的草圖 |
| `README.md` | 啟動、測試、部署步驟 |

規格與計畫衝突時，以規格為準。計畫沒寫到的地方，看帳本中的 `Ruling:` 行。

## 3. 目前狀態（2026-10-22）

- **Branch：** `feat/mvp-core-loop`（從 `main` 分出，含 `docs/initial-design` 的設計文件 commit），第二版 A 在 `feat/v2a-accounts`（從 `feat/mvp-core-loop` 分出）。兩者都**尚未合併到 `main`**。`feat/v2a-accounts` 尚未 push（使用者自己 push）。
- **跨電腦同步（Syncthing，Windows ↔ macOS）：**
  - Syncthing 的資料夾根目錄是 `~/syncthing/code`，忽略規則在 `~/syncthing/code/.stignore`（`**/node_modules`、`**/.wrangler`、`**/dist`）。2026-10-22 之前規則放錯在 `~/syncthing/.stignore`，沒有生效，所以 Windows 版 `node_modules` 被同步到 macOS 而無法執行測試。
  - 每台電腦各自 `npm i`。如果看到 `Permission denied`（`.bin`）或 `Cannot find native binding`，代表 `node_modules` 是別的平台裝的：確認 `.stignore` 生效後，刪掉 `node_modules` 重新 `npm i` 即可。
  - `.gitattributes` 強制 LF 換行，避免 Windows 編輯後整個檔案都顯示為修改。
  - **開對話時自動檢查**：`.claude/settings.json` 的 SessionStart hook 會執行 `scripts/session-context.mjs`（Claude Code 開始、接續、壓縮對話時都會跑），把這台電腦的 git 狀態、`node_modules` 是否為本平台安裝、Syncthing 衝突檔（`*.sync-conflict-*`）和本節內容交給 agent。其他 agent 可以自己執行 `node scripts/session-context.mjs` 看同樣的資訊。
  - 不要兩台電腦同時開這個專案（`.git` 也在同步）；換電腦前確認 Syncthing 顯示「最新」。
- **第一版（MVP）程式：** 14 個任務全部完成，每個任務都經過獨立審查；最終全 branch 審查找出的問題已修正並複審。
- **測試：** `npm test` 43 個檔案、343 個測試通過；`npm run build` 通過（只有 Pixi 打包超過 500 kB 的提示）。
- **試玩回饋修正：** 已完成（計畫 `docs/superpowers/plans/2026-10-21-playtest-ux-fixes.md`，帳本與量測報告在 `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/`）。新版面（戰鬥｜魔導書｜元素表＋合成，不再有分頁）、分類元素表、自製地點／魔法選擇器、正圓戰場、React 改用 selector 訂閱（戰鬥中重畫從每秒 20 次降到 0 次）。
- **模擬結果：** 五條單一屬性路線經由真實伺服器 API，都能打通三個地點，正常遊玩 0 次被拒。全程約 27～50 分鐘。

- **第二版 A（帳號綁定）：** 已完成，在 branch `feat/v2a-accounts`（從 `feat/mvp-core-loop` 分出，尚未 push、尚未合併）。帳號＋密碼綁定、多裝置 session、改密碼、登出其他裝置／這台裝置、登入嘗試限制、`/api/guest` 每 IP 每小時 10 個。migration `0003_accounts.sql`（本機已套用；遠端未套用）。本機 headless Chrome 驗收 7 項通過（帳本）。
  - **2026-10-22 密碼雜湊改版**（計畫 `docs/superpowers/plans/2026-10-22-v2a-client-hash.md`）：瀏覽器端 PBKDF2-SHA256 300,000 次（salt = `infinite-grimoire:v1:` + 帳號名稱 key，`src/game/password-hash.ts`），伺服器只收 43 字元雜湊，再用 secret pepper 做 HMAC-SHA256（`worker/password.ts`）。密碼不離開瀏覽器。pepper 是 Cloudflare secret `PASSWORD_PEPPER`，本機在 `.dev.vars`（不進 git，每台電腦自己建）；沒設定時帳號 API 回 500。**pepper 上線後不能更換**，換了所有帳號都無法登入。

**尚未完成（下一位接手者的待辦）：**
0. **第二版 A 收尾**：使用者在真實瀏覽器試用帳號功能（兩個視窗同時登入、改密碼後另一邊被登出）；由使用者決定 `feat/v2a-accounts` 的 push 與合併方式。下一個子專案是第二版 B（稀有魔法發現紀錄），要先做設計討論。**部署時注意：** 遠端 D1 要依序套用 0001→0003，套用 0003 前先備份。
1. **使用者試玩新版面**：自動化驗收（headless Edge）已確認 1280／768／360 寬無橫向捲動、選擇器清單留在畫面內、斷線遮罩出現並恢復、三欄版面與殘卷線索位置。**還沒在真實瀏覽器確認**：卡頓感是否消失、燃燒／麻痺／冰凍特效、`beam` 分支光束、連鎖閃電、換地點後怪物角度重新隨機、玩到第三個地點。
2. **部署（暫緩，2026-10-21 使用者指示：遊戲還不是成品，等使用者明確指示才上線，不要主動提議部署）**：需要使用者本人執行 `npx wrangler login`、建立 D1、把 `database_id` 填進 `wrangler.jsonc`（目前是佔位值）、套用 remote migration、`npx wrangler secret put PASSWORD_PEPPER`（隨機長字串，之後不能換）、`npm run deploy`。**部署前要先取得使用者同意。**
3. **合併**：畫面驗收通過後，由使用者決定合併 `main` 或開 PR。

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
  data.ts 資料載入與交叉檢查 · combat-rules.ts 傷害門檻/越級遞減/相剋 · battle.ts 戰鬥模擬
  synthesis.ts 合成 · inventory.ts 背包 · state.ts 遊戲狀態 · save.ts 存檔解析 · validate.ts 防作弊上限
src/data/     魔法、配方、魔物、地點 JSON（內容與數值都在這裡）
worker/       Cloudflare Worker（Hono）：遊客與帳號（sessions／credentials、password.ts 對瀏覽器雜湊做 HMAC＋pepper）、存檔上傳、伺服器擲骰合成；
              store.ts / d1-store.ts / store-contract.ts（兩種 Store 共用的契約測試）
migrations/   D1 schema（0001 初始、0002 錨點窗口、0003 帳號）
src/game/     瀏覽器執行層：runtime（固定步進）、api、session（token）、sync（上傳/斷線/錯誤）、loop、boot
src/render/   Pixi 戰鬥畫面（佔位圖形 + 選用貼圖 public/assets/<key>.png）；arena.ts 圓形戰場幾何
src/ui/       React 介面：TopBar（地點／魔法選擇器）、ElementTable、SynthesisPanel、GrimoirePanel（SVG）、
              Onboarding、OfflineOverlay；useGame.ts 的 useRuntime(selector)；開發用 PerfMeter
tests/sim/    專精路線模擬（機器人經由真實 createApp + MemoryStore 遊玩）
tests/d1/     node:sqlite 上的 D1Store 與 migration 測試
```

TS 分兩個專案：`tsconfig.app.json`（src，含 DOM）與 `tsconfig.worker.json`（worker + engine + data，無 DOM），這樣能強制引擎不碰 DOM。

## 6. 不能違反的規則

- **專精路線不能被內容卡住**：重要素材不能只從單一屬性取得；屬性相剋最多 ±10%。
- **傷害門檻**：魔法階級 ≥ 魔物階級 − 1，或攻擊力 ≥ 防禦 × 0.7，否則傷害為 0（畫面顯示「無效」）。
- **越級遞減**：d = 魔法階級 − 魔物階級，d ≥ 2 時掉落效益 = 0.5 + 0.5 × 0.5^(d−1)。
- **小人沒有血條、不會死。**
- **伺服器是銀行**：`learned`、`synthesisLog` 只能由伺服器改變；合成一律伺服器擲骰。
- **防作弊錨點窗口**：上傳以「錨點存檔 + 目前的伺服器欄位」為基準檢查增益；錨點每 60 秒前進一次，最多採計 180 秒；合成時把扣掉的材料也記到錨點（可為負，代表欠量）。改動 `validate.ts` 或 `worker/app.ts` 時，必須保持 `tests/sim` 的五條路線 0 次被拒，以及 worker 的對抗測試全部通過。
- **遊客 token 只在 401 時清除**，其他錯誤一律保留 token 並讓玩家重試。
- **不收集 email**；介面文字用繁體中文，資料名稱附 `nameEn`。
- 配色：背景 `#0d0f14`、符文綠 `#8fd16a`、琥珀金 `#e8b84a`；元素色見 `src/render/palette.ts`。

## 7. 工作方式與慣例

- 使用者偏好以**繁體中文**溝通。
- 新功能流程（superpowers）：先討論設計並寫進 `docs/superpowers/specs/`，再寫計畫到 `docs/superpowers/plans/`，執行時用 `docs/superpowers/sdd/<plan名>/progress.md` 當帳本（每完成一個任務就記一行）。
- 採 TDD，任務完成前要跑 `npm test` 與 `npm run build`。
- 不要直接 commit 到 `main`；開功能 branch。**push、部署、合併前都要先問使用者。**
- Commit 訊息用 Conventional Commits（英文），結尾加上所用 agent 的 Co-Authored-By 標記。
- `.superpowers/` 是本機暫存（被 gitignore）；要保留的紀錄請放在 `docs/`。

## 8. 已知問題與延後項目

完整清單見帳本 `progress.md` 的 `minor (deferred)` 行；最終審查判定都可以之後再處理。重點：
- 美術貼圖目前只支援單張圖，不支援多格動畫。
- 各屬性通關時間差距大：風約 27 分鐘，雷、土約 50 分鐘。原因是魔王只有一隻，能同時打兩個目標的魔法佔便宜。
- 魔王打不動時，玩家要自己退回前一個地點；HUD 有提示，但沒有自動處理。
- 同一個 token 開多個分頁時，會互相以 409 覆蓋（不算作弊，資料一致）。
- 沒有 WebGL 時，Pixi 初始化失敗沒有提示。
- 魔導書：滾輪縮放可能捲動頁面、不支援雙指縮放。

## 9. 下一步路線（規格第 6 節）

1. **第一版收尾**：畫面驗收 → 部署 → 合併。
2. **第二版**：拆成子專案依序做，詳見 `docs/superpowers/specs/2026-10-21-v2-roadmap.md`：A 帳號密碼（計畫已寫好）→ A2 Google 登入（之後）→ B 稀有魔法發現紀錄 → C+D 排行榜與每日 UTC+8 午夜結算的至尊稱號（開始前先決定「大魔導士稱號」與「內容太少會同分」兩個問題）。
3. **第三版**：煉金與熟練度、商店、金幣、玩家市集。
4. **之後**：稱號、轉生（退還 85%）、光暗魔導書、五芒星不相鄰混合、離線收益、禁忌配方卡、天賦、多魔法欄位。

每個版本開始前，都要先走設計討論 → spec → plan 的流程。

## 10. 交接紀錄

最新的放最上面。每次結束工作時新增一筆：日期、做了什麼、停在哪裡、下一步。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：使用者問 PBKDF2 50k 次的 CPU 時間後，決定把慢的雜湊移到瀏覽器：瀏覽器 PBKDF2 300,000 次（headless Chrome 實測約 143ms）＋伺服器 HMAC-SHA256 與 secret pepper（使用者選擇；也確認安全性做到合理即可）。spec 已修訂，計畫 `docs/superpowers/plans/2026-10-22-v2a-client-hash.md` 4 個任務以 executing-plans 完成。舊的 `pbkdf2-sha256$` 雜湊不相容（沒有真實玩家），本機驗收用新帳號：綁定、另一台登入、改密碼、連錯限制、請求內無明文密碼、按鈕「處理中…」都通過。停在：全部 commit，尚未 push。下一步：使用者試用 → 決定 push／合併 → 第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：以 executing-plans 執行第二版 A 計畫的 11 個任務（branch `feat/v2a-accounts`），帳本 `docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md`。重要 Ruling：migration 0003 改成「複製 → DROP → 以原名重建 → 插回」，因為計畫的 RENAME 做法在 SQLite 上 commit 時觸發外鍵錯誤；限制視窗改成剛好滿 1 小時／15 分鐘即過期，與 retryAfterSec 一致。本機 headless Chrome 驗收 7 項通過；最終全 branch 審查的 2 個 Important（換帳號後舊同步仍上傳、已綁定切換帳號沒存檔與登出）已修正，4 個小問題記在帳本 `minor (deferred)`。停在：全部 commit，尚未 push。下一步：使用者試用帳號功能 → 決定 push／合併 → 第二版 B 設計討論。

- **2026-10-22（Claude Code，Opus 5.5，macOS）**：重新讀取專案進度並更新第 3 節。確認第二版 A 計畫尚未執行（沒有 `docs/superpowers/sdd/2026-10-21-v2a-accounts/`）、本機多 9 個 commit 未 push。發現跨電腦同步問題：從 Windows 同步來的 `node_modules` 在 macOS 不能跑測試，另有 7 個檔案只有換行變成 CRLF（詳見第 3 節）。之後經使用者同意：加 `.gitattributes`（LF）並還原換行、把 Syncthing 忽略規則建在正確的資料夾根目錄、在 macOS 重裝 `node_modules`（`package-lock.json` 的 name／version 同步成 `package.json` 的值）。macOS 上 `npm test` 36 個檔案 279 個測試通過，`npm run build` 通過。停在：使用者自己 push。下一步：第 3 節待辦 0（執行第二版 A 計畫）。

- **2026-10-21（Claude Code，Opus 5.5）**：第二版設計開始。與使用者確認把第二版拆成 A 帳號 → B 發現紀錄 → C+D 排行與至尊稱號（`docs/superpowers/specs/2026-10-21-v2-roadmap.md`）。完成 A 的設計討論與 spec（`2026-10-21-v2a-accounts-design.md`）：多裝置各自 session、遊客切換帳號先提醒再捨棄、這次不做 Google、免費方案所以 PBKDF2-SHA256 50,000 次（本機實測 50k≈5ms、100k≈10ms，免費方案 CPU 上限 10ms）、`/api/guest` 每 IP 每小時 10 個。寫計畫時發現並修正 spec：帳密錯誤改回 403（401 會讓用戶端清掉 token）。實作計畫 `docs/superpowers/plans/2026-10-21-v2a-accounts.md`（11 個任務，已確認 vitest 可用 `node:sqlite` 測真正的 SQL 與 migration）。停在：計畫寫好、尚未執行。下一步：執行計畫（見第 3 節待辦 0）。

- **2026-10-21（Claude Code，Opus 5.5）**：處理最終審查延後的 7 個小問題（帳本末段「Deferred minors — resolved」）：選擇器的鍵盤與無障礙（捲動到選中項、aria-activedescendant、焦點離開關閉）、浮字不再飄出畫面上緣、怪物畫面在 uid 重用時重建、元素表名稱欄寬、合成等待回應期間鎖住換地點／換裝備／升階。停在：全部 commit，尚未 push。部署仍暫緩。下一步：由使用者決定（第二版設計或其他試玩調整）。

- **2026-10-21（Claude Code，Opus 5.5）**：使用者試玩新版面後的三項回饋（bounded，對話中確認設計後實作，無 spec）：(1) 嘗試紀錄改成依階級切換的元素×元素組合表（`SynthesisMatrix`），只顯示玩家自己試過的結果、未試過顯示「？」，點格子放進合成槽，跨階級組合列在表下；(2) 怪物移動一格一格的原因是引擎每 50ms 一步、畫面直接畫最新一步——改成依 `runtime.stepAlpha()` 在前後兩步之間補間（實測每幀有位移的比例 17% → 67%）；(3) 怪物到停止圈後左右徘徊 ±12°、向外擺動 4px（`src/render/motion.ts`，純畫面）。另外修正 MVP 既有問題：每次合成或上傳衝突後 `runtime.replaceState` 都會重建戰鬥（場上怪物消失）；現在只有伺服器存檔在不同地點時才重建。停在：使用者試玩確認移動已順暢、合成不再清空戰場；branch 已由使用者手動 push。部署暫緩，等使用者指示。下一步：使用者決定下一個要做的功能或調整。

- **2026-10-21（Claude Code，Opus 5.5）**：以 executing-plans 在同一個 session 執行試玩回饋修正計畫的 11 個任務，並做了整個 branch 的最終審查（修正 2 個重要問題：手機上戰鬥畫面被裁切、手機上殘卷線索跑到畫面外；7 個小問題記在帳本的 `minor (deferred)`）。【待決策】的裁定記在帳本 R1～R10；其中 R9 是魔法選擇器的排序偏好存在 localStorage（`ig.spellSort`），使用者已同意。Claude in Chrome 沒有連上，所以畫面驗收與量測改用 headless Edge（puppeteer-core，腳本不進專案）。停在：等使用者在真實瀏覽器試玩新版面。下一步：使用者試玩 → 部署 → 合併。所有 commit 都還沒 push。

- **2026-10-21（Claude Code，Opus 5.5）**：使用者在本機試玩 MVP，回報戰鬥畫面太大、元素列表沒分類且離合成區遠、想要圓形戰場、有些微卡頓，另外原生下拉選單看不到魔法階級也不能排序。已寫成設計文件 `docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md`，草圖 `docs/design/mockups/layout-v1.html`（使用者選 B 案）。停在：等使用者審閱設計文件。下一步：寫實作計畫。

- **2026-10-21（Claude Code，Opus 5.5）**：完成設計規格、MVP 計畫，以及以 subagent-driven-development 執行全部 14 個任務、最終審查與修正（含防作弊錨點窗口、合成重擲漏洞）。branch `feat/mvp-core-loop` 已 push 到 GitHub。停在：畫面驗收與部署尚未進行。下一步：見第 3 節待辦。
