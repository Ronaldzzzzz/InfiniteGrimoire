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
| `docs/art-assets.md` | 美術素材清單與 AI 繪圖提示詞 |
| `docs/design/mockups/` | 設計討論時的草圖 |
| `README.md` | 啟動、測試、部署步驟 |

規格與計畫衝突時，以規格為準。計畫沒寫到的地方，看帳本中的 `Ruling:` 行。

## 3. 目前狀態（2026-10-21）

- **Branch：** `feat/mvp-core-loop`（從 `main` 分出，含 `docs/initial-design` 的設計文件 commit）。**尚未合併到 `main`。**
- **第一版（MVP）程式：** 14 個任務全部完成，每個任務都經過獨立審查；最終全 branch 審查找出的問題已修正並複審。
- **測試：** `npm test` 33 個檔案、253 個測試通過；`npm run build` 通過（只有 Pixi 打包超過 500 kB 的提示）。
- **試玩回饋修正：** 已完成（計畫 `docs/superpowers/plans/2026-10-21-playtest-ux-fixes.md`，帳本與量測報告在 `docs/superpowers/sdd/2026-10-21-playtest-ux-fixes/`）。新版面（戰鬥｜魔導書｜元素表＋合成，不再有分頁）、分類元素表、自製地點／魔法選擇器、正圓戰場、React 改用 selector 訂閱（戰鬥中重畫從每秒 20 次降到 0 次）。
- **模擬結果：** 五條單一屬性路線經由真實伺服器 API，都能打通三個地點，正常遊玩 0 次被拒。全程約 27～50 分鐘。

**尚未完成（下一位接手者的待辦）：**
1. **使用者試玩新版面**：自動化驗收（headless Edge）已確認 1280／768／360 寬無橫向捲動、選擇器清單留在畫面內、斷線遮罩出現並恢復、三欄版面與殘卷線索位置。**還沒在真實瀏覽器確認**：卡頓感是否消失、燃燒／麻痺／冰凍特效、`beam` 分支光束、連鎖閃電、換地點後怪物角度重新隨機、玩到第三個地點。
2. **部署**：需要使用者本人執行 `npx wrangler login`、建立 D1、把 `database_id` 填進 `wrangler.jsonc`（目前是佔位值）、套用 remote migration、`npm run deploy`。**部署前要先取得使用者同意。**
3. **合併**：畫面驗收通過後，由使用者決定合併 `main` 或開 PR。

## 4. 本機啟動

```bash
npm i
npm run db:migrate:local   # 本機 D1（wrangler 模擬，存在 .wrangler/，不需要 Cloudflare 帳號）
npm run dev                # http://localhost:5173 （網頁與 /api 一起跑）
npm test
npm run build
```

Node 22。新增 migration 後要重跑 `db:migrate:local`。

## 5. 架構地圖

```
src/engine/   純 TypeScript 遊戲邏輯（瀏覽器與伺服器共用；禁止 DOM/React/Pixi/Workers API）
  data.ts 資料載入與交叉檢查 · combat-rules.ts 傷害門檻/越級遞減/相剋 · battle.ts 戰鬥模擬
  synthesis.ts 合成 · inventory.ts 背包 · state.ts 遊戲狀態 · save.ts 存檔解析 · validate.ts 防作弊上限
src/data/     魔法、配方、魔物、地點 JSON（內容與數值都在這裡）
worker/       Cloudflare Worker（Hono）：遊客帳號、存檔上傳、伺服器擲骰合成；store.ts / d1-store.ts
migrations/   D1 schema（0001 初始、0002 錨點窗口）
src/game/     瀏覽器執行層：runtime（固定步進）、api、session（token）、sync（上傳/斷線/錯誤）、loop、boot
src/render/   Pixi 戰鬥畫面（佔位圖形 + 選用貼圖 public/assets/<key>.png）；arena.ts 圓形戰場幾何
src/ui/       React 介面：TopBar（地點／魔法選擇器）、ElementTable、SynthesisPanel、GrimoirePanel（SVG）、
              Onboarding、OfflineOverlay；useGame.ts 的 useRuntime(selector)；開發用 PerfMeter
tests/sim/    專精路線模擬（機器人經由真實 createApp + MemoryStore 遊玩）
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
- `/api/guest` 沒有速率限制（第二版處理）。
- 沒有 WebGL 時，Pixi 初始化失敗沒有提示。
- 魔導書：滾輪縮放可能捲動頁面、不支援雙指縮放。

## 9. 下一步路線（規格第 6 節）

1. **第一版收尾**：畫面驗收 → 部署 → 合併。
2. **第二版**：帳號密碼與 Google 綁定（不存 email）、稀有魔法發現紀錄（首位發現者）、排行榜、每日 UTC+8 午夜結算的至尊稱號（Cron Triggers）。
3. **第三版**：煉金與熟練度、商店、金幣、玩家市集。
4. **之後**：稱號、轉生（退還 85%）、光暗魔導書、五芒星不相鄰混合、離線收益、禁忌配方卡、天賦、多魔法欄位。

每個版本開始前，都要先走設計討論 → spec → plan 的流程。

## 10. 交接紀錄

最新的放最上面。每次結束工作時新增一筆：日期、做了什麼、停在哪裡、下一步。

- **2026-10-21（Claude Code，Opus 5.5）**：以 executing-plans 在同一個 session 執行試玩回饋修正計畫的 11 個任務，並做了整個 branch 的最終審查。【待決策】的裁定記在帳本 R1～R10；其中 R9 是魔法選擇器的排序偏好存在 localStorage（`ig.spellSort`），使用者已同意。Claude in Chrome 沒有連上，所以畫面驗收與量測改用 headless Edge（puppeteer-core，腳本不進專案）。停在：等使用者在真實瀏覽器試玩新版面。下一步：使用者試玩 → 部署 → 合併。所有 commit 都還沒 push。

- **2026-10-21（Claude Code，Opus 5.5）**：使用者在本機試玩 MVP，回報戰鬥畫面太大、元素列表沒分類且離合成區遠、想要圓形戰場、有些微卡頓，另外原生下拉選單看不到魔法階級也不能排序。已寫成設計文件 `docs/superpowers/specs/2026-10-21-playtest-ux-fixes-design.md`，草圖 `docs/design/mockups/layout-v1.html`（使用者選 B 案）。停在：等使用者審閱設計文件。下一步：寫實作計畫。

- **2026-10-21（Claude Code，Opus 5.5）**：完成設計規格、MVP 計畫，以及以 subagent-driven-development 執行全部 14 個任務、最終審查與修正（含防作弊錨點窗口、合成重擲漏洞）。branch `feat/mvp-core-loop` 已 push 到 GitHub。停在：畫面驗收與部署尚未進行。下一步：見第 3 節待辦。
