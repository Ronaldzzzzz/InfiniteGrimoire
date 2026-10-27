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
| `docs/superpowers/specs/2026-10-23-v2b-rare-discoveries-design.md` | **第二版 B 設計規格：稀有魔法與發現紀錄**：5 個新稀有魔法、全螢幕揭曉動畫、頂端鈴鐺與動態清單、`discoveries` 資料表、首位發現者 |
| `docs/superpowers/plans/2026-10-23-v2b-rare-discoveries.md` | 第二版 B 的 8 個任務實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-23-v2b-rare-discoveries/progress.md` | 第二版 B 的帳本：各任務審查結果、Ruling、稀有魔法刷取時間量測、延後的小問題 |
| `docs/superpowers/specs/2026-10-23-gm-tool-design.md` | **GM 工具設計規格**：Ctrl＋Shift＋` 叫出的浮動視窗、GM 名單與二次驗證、元素／地圖／配方表／玩家（重設密碼）四個分頁、`gm_used` 與 `gm_actions` |
| `docs/superpowers/plans/2026-10-23-gm-tool.md` | GM 工具的 8 個任務實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-23-gm-tool/progress.md` | GM 工具的帳本：各任務審查結果、Ruling、瀏覽器驗收、延後的小問題 |
| `docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md` | **魔法階級強度曲線的討論紀錄（已實作，見 2026-10-27 整合規格）**：已確認的原則（高一階至少 1.5～2 倍 DPS、同階同水準、只有相性差的自創魔法可以例外）、待討論事項、下一步 |
| `docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md` | **【目前最高優先討論文件】魔法深度拓展設計文件（建置中，共十大標的）**：涵蓋——(1) 名稱與 Lv.1～10 階級體系、(2) 施法形態 `Effect['kind']`、(3) 魔法定義（術式分類 `school`／面板透明化／詠唱詞）、(4) **天賦型「獨特技能（5%～10% 隨機覺醒，如雙刀流／大賢者）」vs 努力型「十里坡劍神（萬次詠唱極意／限制器解除／百敗成聖）」雙軌系統**、(5) 魔法隨機異變詞綴、(6) 元素共鳴反應與束縛契約、(7) 禁忌殘頁與儀式合成、(8) 施法媒介／本命魔導具（短杖／重杖／寶珠／黑書）、(9) 超位魔法／魔力充能解放（Overdrive）、(10) 元素道途體質與動態魔導尊號。**接手人員與其他 AI 請務必優先參閱本文件** |
| `docs/superpowers/specs/2026-10-25-spell-expansion-unified-report.md` | **魔法系統深度拓展：雙報告整合分析與落地總綱**：整合內部架構防作弊分析與外部 AI 評估報告（`網頁掛機遊戲魔法系統擴充分析與建議.md`），定調十大構想的四階段開發順序、三層分級異變詞綴、伺服器權威里程碑與七大驗收鐵律 |
| `docs/superpowers/specs/2026-10-25-phase1-spell-copywriting-spec.md` | **【Phase 1 定稿】第一階段魔導書全擴充總綱與文案規格（100 五屬本篇 ＋ 15 光暗秘典 ＝ 115 招全集）**：依使用者指示一口氣將名魔法拓展至 115 招——涵蓋無屬性(2)、五純屬×6階(30)、十雙屬×3階(30)、十組三屬×2階(20)、魔物素材與五屬萬象秘術(8)、光系6階(6)、暗系6階(6)、光暗交匯(2)與 Lv.10 神話禁咒(11)，完整包含名稱、英文、階級、學派(`school`)、顯隱(`hidden`)、配方、詞綴(`words`)、說明(`desc`)、殘卷(`hint`)與高階古語詠唱詞(`chant`) |
| `docs/superpowers/specs/2026-10-25-phase2-combat-expression-copywriting-spec.md` | **【Phase 2 文案定稿】第二階段戰鬥表現文檔與文案規格**：涵蓋四大新施法形態（`beam` 貫穿光束、`sigil` 延時符文結界、`orbit` 環繞護身星體、`detonate` 元素共鳴引爆）之術語、自創魔法描述模板、115 招魔導書中採用新形態之 38 招專屬演出指派表，以及「超位魔法解放（Overdrive）」之充能說明、冠名規則、五大術式學派殘響古語與 11 招 Lv.10 禁咒之【神話超位】文案 |
| `docs/superpowers/specs/2026-10-25-phase3-exploration-mutations-rituals-copywriting-spec.md` | **【Phase 3 文案定稿】第三階段探索變化文檔與文案規格**：涵蓋三層分級「魔法隨機異變詞綴（10 種視覺、8 種微機制、6 種終局神話異變）」、六大元素共鳴反應飄字與束縛契約銘文、6 招伺服器驗證條件之「禁忌夾頁古魔法（#116～#121：混沌歸零、悖論熔爐、沉沒神諭、熔核脈動、狂魔解放、赫密斯點金術）」以及結合待辦 1b 的「愚公移山・百敗成聖（殘卷推演保底）」完整文案 |
| `docs/superpowers/specs/2026-10-27-spell-expansion-green-items-review.md` | **【接手必讀】綠燈四項（標的 1、2、3、9）與 Phase 1～2 計畫的全面審查**：方向可行，但 Phase 1 配方有 6 個硬傷（神階元素拿不到、Lv.10 稀有比 Lv.8～9 便宜、強化與自創魔法越過階級上限、地圖只到 Lv.8、光暗不是元素、素材門檻讓低階魔法打不動）；第 4 節列出實作前要和使用者決定的 6 個骨架問題。Phase 1～3 文案的數值與參數都還沒量，視為草稿 |
| `docs/superpowers/specs/2026-10-27-tier-curve-and-map-expansion-design.md` | **魔法階級強度曲線與地圖擴充規格（已實作於 `feat/spell-tiers`，目前階級／地圖／強化規則的最高依據）**：`TIER_STEP` 1.8（第 15 節修訂；強化滿 ×1.4 另訂 `EMPOWER_MAX`）、兩情境各階中位數 1.6～2 倍與同階 ±25%、五純屬 Lv.2～9、稀有 Lv.10＝Lv.9＋素材 1:49、強化只改攻擊、自創上限 Lv.9、星殞高原與世界盡頭、神階掉落、距離魔王還差幾隻、放回上次組合、學會新魔法時詢問是否裝備 |
| `docs/superpowers/plans/2026-10-27-spell-tiers.md` | 上述規格的 12 個任務實作計畫（已執行完成） |
| `docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md` | 魔法階級強度曲線的帳本：各任務審查結果、Ruling（R1～R4、T3a～T12a、R-T7-x）、模擬時間、延後的小問題 |
| `docs/superpowers/specs/2026-10-27-dps-after.md` | 調平後的 DPS 表（和基準表對照；`scripts/measure-dps.ts`） |
| `docs/superpowers/specs/2026-10-27-dps-baseline.md` | 改動前的 DPS 基準表（工具 `scripts/measure-dps.ts`） |
| `docs/prelaunch-checklist.md` | **上線前檢查清單**：部署必做事項、忘記密碼（用 GM 工具重設）、延後的小問題；上線前逐項決定 |
| `docs/art-assets.md` | 美術素材清單與 AI 繪圖提示詞 |
| `docs/design/mockups/` | 設計討論時的草圖 |
| `README.md` | 啟動、測試、部署步驟 |

規格與計畫衝突時，以規格為準。計畫沒寫到的地方，看帳本中的 `Ruling:` 行。

## 3. 目前狀態（2026-10-27）

### 3.0 接手先看這裡（2026-10-27 更新）

**現在停在哪：** branch `feat/rare-tuning`（**未 push、未合併到 `main`**）。`feat/spell-tiers` 已在 2026-10-27 依使用者指示 fast-forward 合併回 `feat/rare-tuning`，branch 已刪除。`npm test` 68 個檔案 730 個測試全過、`npm run build` 通過（2026-10-27 量測）。瀏覽器驗收已做完（見下）。

**這個 branch 做了什麼（規格 `docs/superpowers/specs/2026-10-27-tier-curve-and-map-expansion-design.md`、計畫 `docs/superpowers/plans/2026-10-27-spell-tiers.md`、帳本 `docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`，12 個任務）：**
- **強度曲線：** 名魔法重排成 Lv.1～9（一般 60 招）＋稀有一律 Lv.10（7 招）；新增 20 招、改名 11 招，總共 67 招。每高一階約 **×1.68～×1.98**（`TIER_STEP` 1.8，使用者 2026-10-27 決定；強化滿 +50 攻擊 ×1.4＝`EMPOWER_MAX`，最多只到下一階中位數的 0.91；在 `feat/tier-step-18`，數字見帳本 `docs/superpowers/sdd/2026-10-27-tier-step-18/progress.md`）；同階 ×0.82～×1.14；Lv.10 稀有對 Lv.9 中位數 ×1.61～×1.81；強化 +50 約等於高一階剛合成。DPS 表在 `docs/superpowers/specs/2026-10-27-dps-after.md`，量測工具 `scripts/measure-dps.ts`，測試把關 `tests/sim/tier-curve.test.ts`。
- **規則：** 強化只改攻擊（`attack × (1 + (TIER_STEP − 1) × (L − 1) / 49)`）；自創魔法上限 Lv.9；稀有配方＝同屬性 Lv.9 名魔法＋素材、機率 1 : 49，這種「魔法＋素材」配方只扣 1 個素材、不收融合成本（R1）。
- **地圖：** 新地點星殞高原（Lv.8–9）與世界盡頭（Lv.9–10）、8 個新魔物、神階元素掉落、關鍵道具墮星之印、魔導書新區域星界（共 6 個區域、10 環）。
- **介面：** 技能樹 10 環（外環間距縮小，全部解開時畫面約 0.72 倍，可縮放）；光與暗分頁（光左暗右，聖光審判與深淵吞噬移到這裡，五元素樹上沒有）；魔法學派（`school`）、詠唱詞與數值顯示在詳情卡；戰鬥畫面顯示「魔王出現還差 N 隻」與「魔王現身！」；合成台「放回上次組合」按鈕（記在 `localStorage` `ig.lastCombo`）；學會一般新魔法跳 3 秒通知（只有「裝備」，最多 3 個、擠掉最舊的），稀有揭曉動畫播完停在「裝備／不裝備」（待辦 0c 已完成）。
- **模擬結果（種子 20261021，模擬分鐘，0 次被拒）：** 6 條路線全清 6 個地點；前四個魔王 64.1～116.2 分；全部 90.5～203.4 分；每個地點 5.5～82.2 分；刷稀有 24～68 分。餘裕小的地方：水草原 5.5（下限 5）、風水前四魔王 64～65（下限 60）、雷神殿 82.2（上限 90）。

**瀏覽器驗收（2026-10-27，headless Chrome＋puppeteer-core，macOS）：** 規格第 12.3 節各項都通過、無頁面錯誤；細節與截圖路徑見 `.superpowers/sdd/2026-10-27-spell-tiers/task-12-report.md`（截圖與腳本在 `.superpowers/sdd/2026-10-27-spell-tiers/accept/`，未進版本庫）。**種進去的：** 每個測試的存檔（已學會的魔法、元素與素材數量、已散開的迷霧區域、已開放的地點、`zoneKills`、關鍵道具墮星之印）都是直接改本機 D1 種的；**實際操作的：** 技能樹與迷霧、使用關鍵道具、切換分頁、詳情卡、泡泡、雙擊放入、合成（連續 4 個新魔法與稀有魔法）、按「裝備」、放回上次組合、換地點、GM 視窗。稀有魔法是真的用介面連續合成 121 次擲出焚世之焰（沒有調機率）。連續 4 個通知那次為了讓 4 次伺服器往返重疊，在頁面裡暫時把 3000 ms 的逾時放大成 15000 ms；通知單獨存活約 3 秒是另外用原本時間量的（3032 ms）。驗收用本機 D1 清過 `guest_creations`（遊客每小時 10 個的限制）。一個本機 GM 測試帳號已在本機 D1 綁定（密碼只是驗收用的臨時值）。

**驗收發現的小問題：** ~~學會新魔法的通知蓋住「魔王出現還差 N 隻」與 DPS 數字~~（最終審查修正：通知移到戰鬥畫面**右上角**，稀有揭曉動畫顯示期間通知的 3 秒暫停）；~~全部解開時預設縮放下名稱標籤重疊~~（最終審查修正：Lv.8 的五條主軸節點角度 +6°、雷光長槍與黑曜荊棘 −6°、被動疾速詠唱 +6°，並加了「標籤不壓到其他標籤或節點」的版面測試）；手機（390×844）上技能樹的節點與名稱很小，需要縮放才好讀；GM 地圖分頁只有三個批次按鈕，沒有列出地點名稱（列出新地點靠按鈕「開放所有地點」生效）。

**接下來的順序（使用者決定，照這個走）：**

| 順序 | 項目 | 狀態 | 去哪裡看 |
|---|---|---|---|
| 0 | 合併 `feat/rare-tuning`（已含 `feat/spell-tiers`）到 `main` | **等使用者在真實瀏覽器試玩後決定**（合併、push 都要先問；push 只能由使用者 `! git push`）；順序：先 `feat/rare-tuning`，再 `feat/spell-tiers`（後者是從前者分出來的） | 本節 |
| 0.5 | 魔法深度拓展（名稱、類型、定義）剩下的部分 | 第一批（20 招、強度曲線、地圖）**已在 `feat/spell-tiers` 完成**；Phase 1～3 文案的其餘招式、新施法形態、異變詞綴、Overdrive、禁忌殘頁等**都還沒做**，之後再討論 | `docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md`、`2026-10-27-spell-expansion-green-items-review.md` |
| 1 | 魔法階級強度曲線（含距離魔王還差幾隻、放回上次組合） | **已完成於 `feat/spell-tiers`**（待使用者試玩與確認 `TIER_STEP` 最終值） | 本節、規格與帳本 |
| **1b（下一個要討論）** | 稀有魔法落空的保底／補償 | **使用者試玩決定合併後，主動提出來和使用者討論**（驗收時刷到焚世之焰用了 121 次，平均 50 次） | `docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md`「稍後再討論」一節 |
| 1c | 學會新魔法時詢問是否裝備 | **已完成於 `feat/spell-tiers`**（待辦 0c） | 本節 |
| 1d | 玩法與「奇幻中古世紀大魔法師」沉浸感擴充（Gemini 提案 7 項） | 使用者決定納入待辦；細節與排程於實作前走設計討論 → spec | 下方待辦 0d |
| 1e | 實裝真正的光、暗元素 | 排程未定 | 下方待辦 0e |
| 2 | 第二版 C+D：排行榜與每日至尊稱號 | 開始前先和使用者決定「大魔導士稱號」與「內容太少會同分」 | `docs/superpowers/specs/2026-10-21-v2-roadmap.md` |
| 3 | 全面擴充內容（地圖、魔法數量、技能樹） | 之後 | — |

**下一步（給接手者）：** (1) 使用者在真實瀏覽器試玩（手感、各階換魔法的差距、通知、光暗分頁、手機版面）並確認 `TIER_STEP` 與魔王時間；(2) 問使用者要不要合併；(3) 主動提出待辦 0b（稀有落空保底）的討論。**遠端 D1 不需要新的 migration**（這個 branch 沒有改資料表；舊存檔若含 Lv.8 舊稀有或自創魔法，`parseState` 與深度檢查已有測試）。

**接手者務必遵守（摘要，全文見第 6、7 節與記憶）：** 用繁體中文溝通；**不部署、不主動提部署**；**push、合併、部署前都要先問**；只改文件可以直接在 `main` commit（但目前文件都跟著 `feat/rare-tuning`，合併後就會到 `main`）；不要 commit `.dev.vars`；平衡數值現在是進行中的工作，但倍率、機率等數字的最終值要給使用者確認；結束前更新本節與第 10 節交接紀錄。

- **Branch：** `main` 已整合 v0.2.0 並由使用者 push（遠端舊 branch 也已刪除）。目前在 `feat/rare-tuning`（從 `main` 分出；`feat/spell-tiers` 已合併進來並刪除），尚未 push、尚未合併。新功能照慣例從 `main` 開 branch。
- **跨電腦同步（Syncthing，Windows ↔ macOS）：**
  - Syncthing 的資料夾根目錄是 `~/syncthing/code`，忽略規則在 `~/syncthing/code/.stignore`（`**/node_modules`、`**/.wrangler`、`**/dist`）。
  - 每台電腦各自 `npm i`。如果看到 `Permission denied`（`.bin`）或 `Cannot find native binding`，代表 `node_modules` 是別的平台裝的：確認 `.stignore` 生效後，刪掉 `node_modules` 重新 `npm i` 即可。
  - `.gitattributes` 強制 LF 換行，避免 Windows 編輯後整個檔案都顯示為修改。
  - **開對話時自動檢查**：`.claude/settings.json` 的 SessionStart hook 會執行 `scripts/session-context.mjs`，把這台電腦的 git 狀態、`node_modules` 是否為本平台安裝、Syncthing 衝突檔和本節內容交給 agent。其他 agent 可以自己執行 `node scripts/session-context.mjs`。
  - 不要兩台電腦同時開這個專案（`.git` 也在同步）；換電腦前確認 Syncthing 顯示「最新」。
- **核心重做：** 12 個任務全部完成，每個任務都經過獨立審查，帳本在 `docs/superpowers/sdd/2026-10-22-core-rework/progress.md`。玩法改成：魔物成群出現、元素五階（升階成本 3／10／30／100）、名魔法＋自創魔法（任兩個輸入合成、有相性）、同元素強化與融合、魔法強化（`levels`）、魔導書迷霧＋關鍵道具（`revealed`）、被動節點（`passives`）。migration `0004_core_rework.sql` 本機已套用，**會重置所有存檔**；遠端未套用。
- **合成台介面改版（2026-10-23，`feat/synthesis-altar`）：** 規格 `docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md`，計畫 `docs/superpowers/plans/2026-10-23-synthesis-altar.md`，帳本 `docs/superpowers/sdd/2026-10-23-synthesis-altar/progress.md`。右欄改成方形合成台（`SynthesisAltar`：左右各放一個輸入、各依元素與魔法有不同特效、中間「合成」、按下後融合特效再揭曉結果；被拒絕時不播完整動畫、兩邊保留並顯示原因）；原本的合成區下拉選單與「嘗試紀錄」組合表已移除（伺服器的 `synthesisLog` 保留給第二版 B）。魔導書：單擊魔法冒出泡泡（放入合成／裝備／詳情）、雙擊直接放入合成台、詳情與強化合成一張浮動卡（`NodeCard`）、縮放按鈕移進技能樹並加「⌖ 回到中心」、滾輪只縮放不捲頁、拖曳與縮放不經過 React state。關鍵道具按鈕移到戰鬥畫面（`KeyItemBar`），訊息幾秒後自動消失。
- **GM 工具（2026-10-23，`feat/gm-tool`）：** 規格、計畫、帳本見第 2 節。遊戲畫面上**沒有任何 GM 入口**；按 Ctrl＋Shift＋`（或網址加 `?gm`）叫出紫色浮動視窗（`src/ui/GmWindow.tsx`，可拖曳、縮小，位置記在 `localStorage` `ig.gmWindow`），先在視窗內再驗證一次帳號密碼（瀏覽器雜湊，伺服器比對；GM 必須先以已綁定帳號登入），通過後發 30 分鐘的 GM token（只存在記憶體，重新整理要重驗）。四個分頁：元素（5×5 元素、素材、關鍵道具，按「套用」一次送出）、地圖（開放所有地點／散開所有迷霧／目前地點差 1 隻出魔王）、配方表（純用戶端，可搜尋，融合需求以 GM 自己的狀態用 `fusionNeeds` 計算）、玩家（重設其他玩家的密碼，臨時密碼只在視窗顯示一次）。**GM 名單**在伺服器設定 `GM_USERNAMES`（逗號分隔帳號名稱；本機寫進 `.dev.vars`，上線用 `wrangler secret put`）；沒設定時 `/api/gm/*` 一律 404。**只列已經綁定在你自己名下的帳號名稱**：GM 身分是「誰先綁定這個名稱」，列了但還沒人綁定的名稱，任何人都能搶先綁定而成為 GM；名單裡格式不合法的名稱會被忽略。上線時先不設名單部署、用強密碼綁定 GM 帳號，之後才設定名單。用過任何改存檔功能的帳號 `players.gm_used = 1`，之後不寫 `discoveries`、不成為首位（`excludedFromRecords`）。migration `0006_gm.sql` 新增 `gm_used`、`gm_tokens`、`gm_actions`，**不會重置存檔**（本機已套用，套用前後 `players` 都是 28 筆）；**遠端未套用，而且新 worker 部署前遠端一定要先套用 0005 與 0006**（每次讀玩家都會讀 `gm_used`）。**已知限制：** 配方表在前端 bundle 裡，GM 視窗隱藏配方表只是介面上的，不是安全邊界。
- **GM 工具驗收（headless Edge + puppeteer-core，2026-10-23，Windows）：** 規格第 9 節 9 項全過、無頁面錯誤。未設定 `GM_USERNAMES` 時所有 `/api/gm/*` 回 404（設定後同一路徑未登入回 401）；快捷鍵與 `?gm` 都能打開；非 GM 帳號用正確帳密得到「帳號或密碼錯誤」；改元素與關鍵道具後元素表立刻更新、掉落不丟、之後 60 秒上傳 200、`rejections` 沒增加、`gm_used = 1`；地圖三個按鈕都生效；配方表 57 筆、搜尋可用、火球＋疾風刃的融合需求與合成台顯示一致；重設玩家密碼（含已被連錯鎖住的帳號）舊密碼失敗、臨時密碼成功、舊裝置被登出、請求與 `gm_actions` 都沒有明文；重設自己回 403、不存在的帳號回 404；`gm_used` 的帳號合出聖光審判時沒有 `discoveries` 列、`rare.first = false`；GM token 過期後視窗回到登入表單、遊戲照常。**種進去的：** 聖光審判那次是把 `thunder_hammer` 直接寫進本機存檔的 `learned`，並用 GM 工具給足元素與日輝碎片；「差 1 隻出魔王」是看存檔的 `zoneKills`（39），沒有再打到魔王；token 過期那次把 `GM_TOKEN_TTL_MS` 暫時改成 15 秒（只在驗收用的本機伺服器，已還原、沒有 commit）。腳本與截圖在 `.superpowers/sdd/2026-10-23-gm-tool/accept/`（未進版本庫）。
- **測試：** `npm test` 68 個檔案、737 個測試全部通過（合併後的 `feat/rare-tuning`，2026-10-27；含 `tests/sim` 路線模擬、曲線檢查與稀有刷取成本）；`npm run build` 通過（只有 Pixi 打包超過 500 kB 的提示）。
- **合成台驗收（headless Edge + puppeteer-core，2026-10-23，Windows）：** 規格第 9 節 10 項全過、無頁面錯誤。元素存量、已學會的魔法清單與一個關鍵道具是直接改本機存檔種進去的；放入、裝備、合成、強化、使用關鍵道具、解鎖被動、拖曳、滾輪都是實際操作。1280x900 下拖曳技能樹同時重複播放合成台特效約 149 fps（單幀最長 75 ms；戰場上只有少數怪，沒有重測 80 隻怪的情況）。驗收中發現泡泡在已學會魔法上高度估錯、會蓋住自己的節點，已修正（`fix(ui): reserve the real height of a learned spell's bubble`）。腳本與截圖在 `.superpowers/`（未進版本庫）。
- **第二版 B：稀有魔法與發現紀錄（2026-10-23，`feat/v2b-rare-discoveries`）：** 規格、計畫、帳本見第 2 節。5 個新稀有魔法（焚世之焰、蒼穹之息、九天雷獄、泰坦之握、滄溟月潮，當時 Lv.8，每種屬性一個；**`feat/spell-tiers` 之後已改成 Lv.10，配方是「該屬性 Lv.9 名魔法＋素材」，1 : 49**），當時是「該屬性 Lv.5 魔法＋高階元素」的機率配方（稀有 1 : 落空 64，約 1/65；**後來改成 1 : 49**，見待辦 0a；**階級已在 `feat/spell-tiers` 改成 Lv.10**，見 3.0）；聖光審判、深淵吞噬也標為稀有（`spells.json` 的 `rare: true`，數值與配方不變）。合出稀有魔法時，發現者看到全螢幕揭曉動畫（`RareReveal`，首位「✦ 全服首次發現 ✦」、其餘「✦ 稀有魔法！✦」，點一下跳過），其他玩家在頂端鈴鐺（`DiscoveryBell`）看到動態（名稱、殘卷線索、發現者顯示名稱、時間；**沒有配方**），用戶端每 60 秒輪詢 `GET /api/discoveries`。migration `0005_discoveries.sql` 新增 `discoveries` 表，**不會重置存檔**（本機已套用，套用前後 `saves` 都是 26 筆）；首位由部分唯一索引保證只有一位，可疑帳號不寫入。**遠端未套用。**
- **第二版 B 驗收（headless Edge + puppeteer-core，2026-10-23，Windows）：** 兩個獨立的瀏覽器 context 當兩位玩家。玩家 1 合出焚世之焰：看到「✦ 全服首次發現 ✦」、點一下跳過、魔法已裝備；玩家 2 的鈴鐺約 50 秒後亮起未讀 1、清單有名稱、殘卷線索、「艾莉亞」與時間、沒有配方，打開後未讀歸零；玩家 2 自己合出時看到「✦ 稀有魔法！✦」；玩家 1 自己的發現不算未讀；`discoveries` 兩筆（`first` 1 與 0）；無頁面錯誤。**種進去的：** 兩位玩家的存檔（已學會煉獄、12 個高階火、迷霧區域已散開）直接改本機 D1；**擲骰方法：** 驗收期間把 `recipes.json` 的焚世之焰權重暫時改成 1000 : 1（只在驗收用的本機 dev server，已還原、沒有 commit），所以「合出稀有魔法」不是真的 1/65 機率；機率本身由 `worker/` 的單元測試以注入的亂數涵蓋。截圖與腳本在 `.superpowers/sdd/2026-10-23-v2b-rare-discoveries/accept/`（未進版本庫）。
- **模擬通關時間（Task 10 修正後，種子 20261021，模擬分鐘，0 次被拒）：** 火 90.4、風 111.8、雷 90.2、土 126.6、水 96.9、混合 93.2；每條純屬性路線落在 60～240 分鐘（R12）。
- **驗收（headless Chrome，2026-10-22）：** 遊客 → 合出火球 → 升階 → 同元素強化（烈焰爆發）→ 融合（火焰龍捲，出現「新發現！」）→ 自創魔法出現在筆記 → 強化 → 第一個魔王倒下拿到風暴之心 → 使用後迷霧散開 → 解鎖被動 → 綁定帳號後重新整理進度都在，全部通過、無頁面錯誤。元素存量與「差 1 隻到魔王」的擊殺數是直接改本機存檔種進去的（其餘都是實際操作）。截圖在工作區 scratchpad，未進版本庫。
- **之前的功能：** MVP、試玩回饋修正、第二版 A（帳號綁定，`feat/v2a-accounts`；migration 0003 已在本機套用）都已完成，見各自的帳本。

**尚未完成（下一位接手者的待辦）：**
000. **【部分完成】魔法深度拓展（十大標的）**：第一批（20 招新魔法、改名 11 招、Lv.1～10 階級、強度曲線、地圖擴充）**已在 `feat/spell-tiers` 實作**（見 3.0）；其餘約 58 招 Phase 1 魔法與其他標的（施法形態、異變詞綴、共鳴、禁忌殘頁、媒介、Overdrive、道途尊號等）**仍只有文案、沒有程式，等使用者核准後才實作**。見 `docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md` 與 `2026-10-27-spell-expansion-green-items-review.md`。原十大標的內容：使用者希望在實作強度曲線之前，將魔法內容拓展為十大維度：(1) 名稱與 Lv.1～10 階級體系、(2) 施法形態 `Effect['kind']` 拓展、(3) 魔法定義（術式分類 `school`／詠唱古語／詳情面板透明化）、(4) **天賦型「獨特技能（5%～10% 機率覺醒，如雙刀流／大賢者）」vs 努力型「十里坡劍神（萬次詠唱返璞歸真／迷霧草原苦修極意／凡人專屬限制器解除 +100／百敗成聖）」雙軌對抗體系**、(5) 魔法隨機異變詞綴（Spell Mutations）、(6) 戰場元素共鳴反應與束縛契約、(7) 禁忌殘頁與儀式合成（失落古魔法）、(8) 施法媒介／本命魔導具（短杖／重杖／寶珠／黑書流派切換）、(9) 超位魔法／魔力充能解放（Overdrive 戰鬥高潮）、(10) 元素道途體質與動態魔導尊號。**請所有接手 AI 或開發人員務必先參閱該文件，並協助使用者完成建置。**
00. **【已完成於 `feat/spell-tiers`（2026-10-27），待使用者試玩並確認 `TIER_STEP`】魔法階級強度曲線**：規格 `docs/superpowers/specs/2026-10-27-tier-curve-and-map-expansion-design.md`、計畫 `docs/superpowers/plans/2026-10-27-spell-tiers.md`、帳本 `docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`、調平後 DPS 表 `docs/superpowers/specs/2026-10-27-dps-after.md`；原始討論紀錄 `docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md`。`feat/rare-tuning` 與 `feat/spell-tiers` 尚未合併，等使用者決定。
0b. **【稍後與使用者討論】刷稀有魔法落空時的保底／補償機制**：使用者提出，尚未討論；紀錄與要一起考慮的事項在 `docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md` 的「稍後再討論」一節。排在強度曲線之後主動提出來討論。
0c. **【已完成於 `feat/spell-tiers`（2026-10-27），待使用者試玩】合成出新魔法時跳出限時通知，問要不要裝備**：原本每次學會新魔法都會直接裝備（`src/ui/App.tsx` 的 `if (result.kind === 'learned') runtime.equip(result.spellId)`），換裝會讓 DPS 歸零；這個 branch 已改成先詢問（`EquipToasts`、`RareReveal` 的裝備選擇）。使用者決定：(1) 一般新魔法跳出約 **3 秒**的通知（例如「裝備『火焰龍捲』？」），**時間到沒按就不裝備**，所以通知上**只有「裝備」一個按鈕**；(2) **稀有魔法**的全螢幕揭曉動畫播完後，下方顯示「裝備」與「不裝備」兩個按鈕，**畫面暫時卡住，等玩家選擇**（不會自動消失）；(3) 連續合出多個新魔法時，**新通知把舊的往下推，最多同時 3 個，第 4 個出現時直接擠掉最舊的那個**；(4) 「記住以後都自動裝備／都不裝備」的偏好**暫時不需要**。使用者原話：「大約3秒。時間到了不裝備，因此按鈕只顯示裝備即可。播完動畫後下面提示裝備與不裝備兩個按鈕，且暫時卡住畫面，等待玩家選擇。通知往下推，但上限為3個，超過三個則直接擠掉第一個通知。暫時不需要這功能。」
0d. **【待辦，Gemini 提案・使用者採納 2026-10-24】玩法與「奇幻中古世紀大魔法師」沉浸感擴充（共 7 項）**：
  - **（玩法 1）雙重詠唱／魔導迴路（共鳴槽）**：除了主詠唱（主動施放的魔法）外，新增副迴路（共鳴鑲嵌槽），可嵌入已學會的舊魔法或自創魔法，讓主魔法繼承部分屬性效果或詞綴（如隕石術附帶燃燒），避免低階與過渡魔法淪為倉庫擺設。
  - **（玩法 3）自創魔法的「真名刻印」與傳奇詞綴**：當合出「相性極佳」的自創魔法或強化達一定等級（如 +10）時，允許玩家為自創魔法刻印「真名」（或從中世紀神秘學古語字庫組合專屬稱號），並可顯示於排行榜或發現紀錄。
  - **（大魔法師氛圍 1）施法時的「古語詠唱殘響」與腳下幾何魔法陣**：隨裝備魔法階級（Lv.1～10）在小人腳下繪製不同繁複度的旋轉幾何魔法陣（Lv.1 單圓 → Lv.5 五芒星 → Lv.10 雙重十芒星與符文）；施放高階或 Lv.10 稀有禁咒時，浮現半透明琥珀金的古語詠唱詞。
  - **（大魔法師氛圍 2）高塔研究手札（Archmage's Chronicle）**：在魔導書或合成台區域加入隨遊戲進度與事件（初次散開迷霧、合成反噬、合出稀有禁咒等）變化的第一人稱中世紀魔導士手札獨白，強化孤高研究者的敘事感。
  - **（大魔法師氛圍 3）大魔法師的「魔力威壓（Arcane Presence）」**：當魔法階級遠高於區域魔物（觸發越級遞減時），將單純的越級提示轉化為「魔力威壓」表現——低階魔物靠近停止圈時因敬畏而微微顫抖、減速，甚至小機率直接被魔力靈光震碎。
  - **（大魔法師氛圍 4）「魔導書本體」視覺進化**：技能樹背景中心的紋章隨已學會魔法數量與禁咒解鎖而進化（從黯淡單圈學徒紋章 → 內圈符文刻度 → 外圈星象軌跡與緩慢自轉的金色秘文）。
  - **（大魔法師氛圍 5）王國／教廷／公會的火漆信件委託**：偶爾跳出羊皮紙火漆信件（如邊境騎士團請求支援特定元素或討伐魔物、煉金公會請求展示混合魔導術威力），完成可獲得稀有素材或金幣，營造「隱居高塔但受奇幻大陸敬仰」的世界互動感。
0e. **【待辦，使用者決定 2026-10-27】實裝真正的光、暗元素**：魔法拓展這一輪光暗只是掛名的雙屬性線（光＝火＋雷、暗＝土＋水）；之後要把光、暗做成真正的元素。牽動 `ELEMENT_ORDER`、元素表介面、升階、相剋表、`ITEM_ID_RE`、`audit.ts` 的元素加總、GM 元素分頁與存檔 migration（見審查文件 1.5）。排程未定。
0a. **（已解決，2026-10-24）稀有魔法刷取時間：** 使用者決定稍微提高機率：5 個新稀有配方從 1 : 64 改成 1 : 49（2%，平均 50 次），接受其餘長度；量到 火 107、風 128、雷 122、土 162、水 141 模擬分鐘，`tests/sim/rare-cost.test.ts` 上限改 180 分鐘並恢復執行。機率配方落空時，合成台會提示「多試幾次也許會有不一樣的結果」（`rareStillHidden`，不提魔法名稱）。
0. **使用者在真實瀏覽器試玩合成台**：合成台特效的手感與辨識度（元素與魔法看得出差別）、融合與揭曉的節奏、泡泡與浮動詳情卡的操作、拖曳與縮放順不順、關鍵道具按鈕在戰鬥畫面上的位置、手機版面。核心重做的試玩（成群清場手感、各元素特效、迷霧散開、卡頓、平衡）也還沒做；**平衡數值使用者明確表示之後再調**。已整合進 `main`，由使用者自己 push。
1. **第二版 A 收尾**：使用者在真實瀏覽器試用帳號功能（兩個視窗同時登入、改密碼後另一邊被登出）。
2. **第二版 B 收尾**：使用者在真實瀏覽器試玩稀有魔法（全螢幕動畫的節奏與各屬性顏色、鈴鐺的位置與清單樣式、手機寬度）；上面的待辦 0a；遠端 D1 套用 0005（見上線前檢查清單）。第二版 C+D（排行榜）可以直接讀 `discoveries` 中 `first = 1` 的列。
2a. **GM 工具收尾**：使用者在真實瀏覽器用 GM 視窗（拖曳、縮小、手機寬度排版）；上線前用 GM 工具在本機 D1 測一次重設密碼（上線前檢查清單第 2 節，已驗收過一次）。
3. **部署（暫緩，使用者指示：遊戲還不是成品，等使用者明確指示才上線，不要主動提議部署）**：需要使用者本人執行 `npx wrangler login`、建立 D1、把 `database_id` 填進 `wrangler.jsonc`（目前是佔位值）、套用 remote migration、`npm run deploy`。**部署前要先取得使用者同意。** 遠端 D1 要依序套用 0001～0006（0001→0002→0003→0004→0005→0006）；0004 會重置所有存檔，0005、0006 不會；新 worker 部署前 0006 一定要先套用。另外要 `wrangler secret put GM_USERNAMES`，但要在部署並用強密碼綁定 GM 帳號**之後**才設（**只列已經綁定在你自己名下的帳號名稱**：GM 身分是「誰先綁定這個名稱」，列了但還沒人綁定的名稱，任何人都能搶先綁定而成為 GM；名單裡格式不合法的名稱會被忽略。）。見 `docs/prelaunch-checklist.md`。

## 4. 本機啟動

```bash
npm i
npm run db:migrate:local   # 本機 D1（wrangler 模擬，存在 .wrangler/，不需要 Cloudflare 帳號）
echo 'PASSWORD_PEPPER=dev-only-pepper-not-for-production' > .dev.vars   # 第一次；沒有它帳號功能回 500
echo 'GM_USERNAMES=<你的帳號名稱>' >> .dev.vars   # 選用：GM 工具的帳號名單（逗號分隔）；只列已經綁定在你名下的名稱，未綁定的名稱任何人都能搶先綁定成為 GM；不設定則 /api/gm/* 回 404
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
              store.ts / d1-store.ts / store-contract.ts（兩種 Store 共用的契約測試）；`discoveries`（稀有魔法的發現紀錄：`recordDiscovery`／`recentDiscoveries`、部分唯一索引保證每個魔法只有一位首位、可疑帳號不寫入）與 `GET /api/discoveries?after=<id>`（最多 20 筆、不回傳 player_id）；GM 端點 `POST /api/gm/login`、`/api/gm/inventory`、`/api/gm/zones`、`/api/gm/reset-password`（`GM_USERNAMES` 未設定時全部 404，檢查在 session 驗證之前；GM token 以 `X-GM-Token` 傳，雜湊後存 `gm_tokens`；`gm_actions` 只寫入、不含密碼）、`excludedFromRecords(player)`（`suspicious || gmUsed`）
migrations/   D1 schema（0001 初始、0002 錨點窗口、0003 帳號、0004 核心重做：重置存檔、0005 發現紀錄 `discoveries`：不動存檔、0006 GM 工具 `gm_used`／`gm_tokens`／`gm_actions`：不動存檔）
src/game/     瀏覽器執行層：runtime（固定步進）、api、session（token）、sync（上傳／動作／斷線／錯誤）、loop、boot
src/render/   Pixi 戰鬥畫面（佔位圖形 + 選用貼圖 public/assets/<key>.png）；arena.ts 圓形戰場幾何；
              element-fx.ts 各元素的粒子語彙；effects.ts 特效視覺；motion.ts 怪物擺動
src/ui/       React 介面：TopBar（地點／魔法選擇器）、ElementTable、SynthesisAltar（方形合成台，資料與特效描述在 altar-data）、
              DiscoveryBanner（新發現、一網打盡）、Notebook（魔法筆記）、EmpowerPanel（強化）、
              GrimoirePanel（SVG 技能樹，含迷霧、泡泡 NodeBubble、浮動詳情卡 NodeCard）、KeyItemBar（戰鬥畫面上的關鍵道具按鈕）、
              Onboarding、OfflineOverlay；
              useGame.ts 的 useRuntime(selector)；開發用 PerfMeter；戰鬥畫面的 DPS 數字在 src/render/dps.ts（BattleView 左上角）
              BossCounter（戰鬥畫面左上「魔王出現還差 N 隻」）、EquipToasts（學會新魔法的 3 秒裝備通知，戰鬥畫面右上角）、
              last-combo（合成台「放回上次組合」，localStorage `ig.lastCombo`）、spell-facts＋SpellFactsView（詳情卡的學派／數值／詠唱詞）、
              grimoire-layout（五元素樹 layoutGrimoire 與光暗樹 layoutLightDark）
              GmWindow 與 gm/（GM 浮動視窗與四個分頁：GmInventoryTab、GmMapTab、GmRecipesTab＋recipe-table、GmPlayersTab＋temp-password、run-gm）、
              RareReveal（稀有魔法的全螢幕揭曉動畫，React＋CSS，不算戰鬥特效）、DiscoveryBell（頂端鈴鐺與動態清單）、useDiscoveryFeed（60 秒輪詢；未讀記在 localStorage `ig.feedSeen`）
tests/sim/    專精路線模擬（機器人經由真實 createApp + MemoryStore 遊玩）；measure.ts（強度曲線量測 curveReport，含 Lv.9／稀有兩兩自創的檢查）、
              tier-curve.test.ts（強度曲線把關）
scripts/      measure-dps.ts（只讀的 DPS 表產生器，用 esbuild 打包後以 node 執行）、session-context.mjs
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
- **GM 端點與 `gm_used`**：`GM_USERNAMES` 未設定時 `/api/gm/*` 一律 404，而且檢查在 session 驗證之前；改存檔的 GM 動作都是伺服器動作，把變更套在稽核過的用戶端狀態上，寫回時把防作弊錨點設成新存檔並同時設 `players.gm_used = 1`（`audit.ts` 不改）；紀錄與排行只看 `excludedFromRecords`；GM token 失效回 **403 `{ error: 'gm_expired' }`，絕不能回 401**（401 會讓用戶端清掉遊戲 session）；明文密碼與雜湊不寫進 `gm_actions`；不能重設自己或 GM 名單內的帳號；遊戲畫面上不加任何 GM 入口。
- **稀有魔法只能機率取得**（`spells.json` 的 `rare: true`，`content.ts` 檢查每個稀有魔法都只出現在有 `spellId: null` 落空結果的配方裡）；**動態清單與發現紀錄不公布配方**，只有魔法名稱、殘卷線索、發現者顯示名稱（不是登入名稱）；**可疑帳號不寫入 `discoveries`**（不上清單、不當首位），`rare.first` 以資料庫是否成功寫入 `first = 1` 為準；`discoveries` 在存檔寫入成功之後才寫（409／422 什麼都不寫）。

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
- GM 登入刻意不洩漏「誰是 GM」：非 GM 帳號在 GM 表單輸入自己正確的密碼，會和密碼錯誤一樣回 403，**也會計入該帳號的登入失敗限制**（連錯 5 次會被暫時鎖住）。這是刻意的，避免 GM 表單變成查詢 GM 名單的管道。
- GM 工具留下的小問題（驗收時發現，都是外觀或提示）：元素分頁的數字欄清空後會變 0，接著輸入 5 會顯示成「05」（數值正確）；玩家分頁輸入不合法的帳號名稱（例如含 `-`）時只顯示「連線失敗，請稍後再試」，沒有說明是名稱格式；其他見帳本 `docs/superpowers/sdd/2026-10-23-gm-tool/progress.md` 的 `minor (deferred)`。
- 合成台改版留下的小問題：手機上點未學會的魔法，上方的線索框高度改變會讓技能樹整個位移，泡泡位置在位移前算好，會偏離節點幾十 px（不會被裁掉）；手機上合成台是方形、把技能樹擠到第一屏之外（規格接受，放入時有提示）；合成台特效沒有針對名魔法各做專屬版本。
- 第二版 B 留下的小問題（見帳本 `docs/superpowers/sdd/2026-10-23-v2b-rare-discoveries/progress.md`）：存檔寫入成功後、用戶端沒收到回應（斷線）時不補播全螢幕動畫（資訊欄仍有紀錄）；`discoveries` 在存檔寫入之後才寫、不是同一個交易，伺服器剛好在中間當掉最多少記一筆；已經會聖光審判／深淵吞噬的舊存檔不回填 `discoveries`；動態清單的「自己的發現不算未讀」以顯示名稱比對，兩位玩家同名時對方的發現也會被當成自己的；鈴鐺一次只顯示最近 20 則，沒有「更多」；稀有魔法的戰鬥特效與全螢幕動畫只在 headless Edge 看過，沒有在真實瀏覽器與手機上看過；刷取時間超標見待辦 0a。

## 9. 下一步路線（規格第 6 節）

1. **第一版收尾**：畫面驗收 → 部署 → 合併。
2. **第二版**：拆成子專案依序做，詳見 `docs/superpowers/specs/2026-10-21-v2-roadmap.md`：A 帳號密碼（計畫已寫好）→ A2 Google 登入（之後）→ B 稀有魔法發現紀錄（已實作，待試玩）→ C+D 排行榜與每日 UTC+8 午夜結算的至尊稱號（開始前先決定「大魔導士稱號」與「內容太少會同分」兩個問題）。
3. **第三版**：煉金與熟練度、商店、金幣、玩家市集。
4. **之後**：稱號、轉生（退還 85%）、光暗魔導書、五芒星不相鄰混合、離線收益、禁忌配方卡、天賦、多魔法欄位。

每個版本開始前，都要先走設計討論 → spec → plan 的流程。

## 10. 交接紀錄

最新的放最上面。每次結束工作時新增一筆：日期、做了什麼、停在哪裡、下一步。

- **2026-10-27（Claude Code，Opus 5.5，macOS，TIER_STEP 1.8）**：使用者決定 `TIER_STEP` 1.8、強化滿改為攻擊 ×1.4（`EMPOWER_MAX`，與每階倍率脫鉤，推翻「強化滿 ≈ 高一階」；原話：強化是同階進步、跳階要有感）、自創配合問題暫緩到副魔法實裝時。規格第 15 節、討論紀錄第六輪、計畫 `docs/superpowers/plans/2026-10-27-tier-step-18.md`、帳本 `docs/superpowers/sdd/2026-10-27-tier-step-18/progress.md`。在 branch `feat/tier-step-18`（從 `feat/rare-tuning` 分出）重調：相鄰倍率 ×1.68～×1.98、強化 +50 最多到下一階中位數 0.91、稀有為 Lv.9 的 ×1.73～×1.93；模擬前四魔王 69.5～119.3 分、全部 ≤ 211.8、每地點 6.0～71.6、刷稀有 ≤ 63、0 次被拒；墮星龍神階 0.9。`npm test` 68 檔 737 個、build 通過。停在：未 push、未合併。下一步：使用者決定合併，之後試玩。

- **2026-10-27（Claude Code，Opus 5.5，macOS，合併）**：依使用者選擇，把 `feat/spell-tiers` fast-forward 合併回 `feat/rare-tuning`，刪除 `feat/spell-tiers`；合併後 `npm test` 68 個檔案 737 個測試全過。停在：`feat/rare-tuning` 未 push、未合併到 `main`。待使用者決定：(1) 自創魔法的效果配合（66 組 Lv.9＋稀有自創中 22 組超過上限，檢查目前只印報告）——使用者提議之後用「雙重詠唱／先後施放」承接元素反應、再降低自創的係數，排進下一次設計討論；(2) `TIER_STEP` 1.7 是否定案。

- **2026-10-27（Claude Code，Opus 5.5，macOS，最終審查修正）**：`feat/spell-tiers` 最終審查的修正一輪。Ruling F1：自創魔法每一邊的效果改成保留該輸入自己的攻擊（`spells.ts` 的 `scaleEffect`），較弱的一邊不再被拉到較強一邊的攻擊；`curveReport` 加上 Lv.9／稀有兩兩自創的檢查，但**目前只印報告、沒有強制**（66 組裡仍有 22 組超過上限，原因是效果之間的連動：拉怪的領域把魔物聚到環擊與隕石底下、濕潤讓雷系 ×2，不是攻擊被放大；需要使用者或設計者決定要不要限制）。另外：學會新魔法的通知移到戰鬥畫面右上角、稀有揭曉時暫停；刷稀有落空成魔力過載時合成台只說「這次沒有成功，素材已消耗。」（Ruling F2，只改介面）；技能樹幾個節點角度微調讓標籤不重疊。停在：已 commit，未 push、未合併。下一步：決定自創連動的處理方式，其餘同下一筆。

- **2026-10-27（Claude Code，Opus 5.5，macOS，續二）**：使用者決定待辦 0c（學會新魔法時詢問是否裝備）這次一起做，並指示光暗系魔法不放五元素技能樹、改獨立的左右形式技能樹。規格更新為第二版：新增 9.3、9.4、內容檢查第 8 項、驗收項目、第 14 節第 12～13 項、附錄名魔法總表（實作後共 67 招：五元素樹 65＋光暗樹 2）。停在：等使用者確認總表與規格 → writing-plans。

- **2026-10-27（Claude Code，Sonnet 5.5，macOS）**：魔法階級強度曲線與地圖擴充（branch `feat/spell-tiers`，從 `feat/rare-tuning` 分出）12 個任務全部完成並各自審查（帳本 `docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`）。Task 12 在 headless Chrome（puppeteer-core 裝在專案外）逐項驗收規格 12.3：10 環技能樹（桌面 1280×900、手機 390×844 圓點都不重疊、無橫向捲動）、星界迷霧與解開動畫、詳情卡的學派／數值／詠唱詞、魔王倒數與「魔王現身！」、放回上次組合（無紀錄與材料不足時停用且有原因）、3 秒通知與連續 4 個擠掉最舊、稀有揭曉停在裝備選擇、光暗分頁左右佈局與迷霧、五元素樹沒有聖光審判／深淵吞噬、新地點可進入、GM 配方表與地圖分頁，全部通過、無頁面錯誤；發現 4 個外觀小問題（記在 3.0）。`npm test` 68 個檔案 730 個測試、`npm run build` 通過。文件：AGENTS.md（第 2、3、10 節）、`2026-10-24-spell-tier-balance-notes.md` 標記已實作。停在：`feat/rare-tuning` 與 `feat/spell-tiers` 都 commit，未 push、未合併；Task 12 本身只做驗收與文件，沒有改遊戲程式與數值（這個 branch 的 Task 1～11 有改遊戲程式與內容資料）。下一步：使用者試玩、確認 `TIER_STEP`、決定合併，之後主動提出待辦 0b（稀有落空保底）。

- **2026-10-27（Claude Code，Opus 5.5，macOS，續）**：記錄使用者對 6 個骨架問題與 4 個確認的回答（審查文件第 5、5.1 節）；寫只讀量測 `scripts/measure-dps.ts`，產出基準表 `2026-10-27-dps-baseline.md`；使用者要求「照預設寫、地圖細節你決定」，寫出整合規格草稿 `2026-10-27-tier-curve-and-map-expansion-design.md`（沒有派 subagent 做 builder check，改由自己以實作者角度審過一次）。停在：`feat/rare-tuning` 已 commit，未 push、未合併；沒有改遊戲程式與數值。下一步：使用者確認規格（特別是第 14 節 11 項設計者決定）→ writing-plans。

- **2026-10-27（Claude Code，Opus 5.5，macOS）**：更新進度與記憶；對魔法深度拓展的綠燈四項（標的 1 命名與 Lv.1～10、標的 2 新施法形態、標的 3 `school`／詠唱詞／面板／對王補正、標的 9 Overdrive）與 Phase 1～2 文案做全面審查，寫成 `docs/superpowers/specs/2026-10-27-spell-expansion-green-items-review.md`（用腳本解析 Phase 1 的 115 招交叉檢查配方、階級、深度、元素需求，並試算元素取得時間）。主要發現：神階元素在現有掉落下 1 個約要 4,000 模擬分鐘；五個屬性禁咒仍是 Lv.5＋高階元素、聖光審判仍是 Lv.3＋素材，比 Lv.8～9 便宜；`spellAtLevel` 強化 +50 攻擊 ×4.92 且階級 +4、自創魔法相性好可到 Lv.10 且攻擊上限含稀有；地點只到 Lv.8；光暗不是元素（實為火＋雷、土＋水）；日輝碎片、深淵珍珠的出處讓 Lv.3 魔法一拿到就打不動；設計文件 3.2「多段被重複扣防」與實際的乘法公式不符。Overdrive 已確認不影響 `audit.ts`（`maxKills` 只看出怪速度）。把 2026-10-25 Gemini 留下未 commit 的文件與審查一起 commit 到 `feat/rare-tuning`（只有文件）。停在：未 push、未合併；沒有改程式。下一步：請使用者決定審查文件第 4 節的 6 個骨架問題，再量 DPS 表。

- **2026-10-25（Gemini 4 Argon，Windows）**：依使用者指示新增「奇幻中古世紀大魔法師」沉浸感與玩法擴充待辦（`待辦 0d` 共 7 項），建立最高優先討論文件 `docs/superpowers/specs/2026-10-25-spell-depth-expansion-design.md`，整合外部 AI 評估報告產出雙報告整合總綱 `docs/superpowers/specs/2026-10-25-spell-expansion-unified-report.md`，並更新 `README.md`。隨後依使用者指示「在未同意前只執行文案建設、不實作程式碼」，依序完成：(1) **Phase 1 魔導書全擴充文案規格** `docs/superpowers/specs/2026-10-25-phase1-spell-copywriting-spec.md`（100 招五屬本篇 ＋ 15 招光暗秘典 ＝ 115 招完整文案）；(2) **Phase 2 戰鬥表現文案規格** `docs/superpowers/specs/2026-10-25-phase2-combat-expression-copywriting-spec.md`（四大新施法形態與 Overdrive 超位魔法文案）；(3) **Phase 3 探索變化文案規格** `docs/superpowers/specs/2026-10-25-phase3-exploration-mutations-rituals-copywriting-spec.md`（三層共 24 種異變詞綴、六大元素共鳴與三種束縛契約、6 招禁忌夾頁古魔法 `#116～#121`，以及結合待辦 1b 的「百敗成聖・殘卷推演保底」文案）。停在：Phase 1～3 文案建設完成，準備接續建設 Phase 4（最終階段：獨特技能 vs 十里坡極意進化、本命魔導具、動態魔導尊號與大魔法師高塔手札／火漆信件）文案（完全未動程式碼）。下一步：依使用者指示推進第四階段（Phase 4）之文檔與文案建設。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：使用者約 2 天不在，統整交接：新增第 3.0 節「接手先看這裡」（目前位置、使用者決定的順序表、強度曲線的具體起手步驟與牽連、必守規則摘要）；記錄待辦 0b（保底／補償，待討論）、0c（學會新魔法時詢問裝備，細節已決定）。停在：`feat/rare-tuning` 全部 commit，未 push、未合併；沒有改程式。下一步：見第 3.0 節（先問使用者合併，再量 DPS 表）。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：記錄使用者第四輪回答：強度曲線修正時把一般魔法重新拉開到 Lv.1～9；另外要補「距離魔王出現還差幾隻」與「合成台記住上一次的選擇」兩個小功能，併入同一份規格。停在：`feat/rare-tuning` 已 commit，尚未 push、尚未合併；尚未量測。下一步：量 DPS 表 → 給使用者看 → 規格。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：開始「魔法階級強度曲線」的設計討論，因使用者用量暫停，把已確認的原則、待討論事項與下一步寫進 `docs/superpowers/specs/2026-10-24-spell-tier-balance-notes.md`，並列為第 3 節待辦 00。停在：`feat/rare-tuning` 已 commit（含本紀錄），尚未 push、尚未合併；強度曲線尚未量測。下一步：量每個名魔法的 DPS 表 → 與使用者討論 → 規格。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：使用者已 push v0.2.0 並刪除遠端舊 branch。依使用者決定處理待辦 0a：5 個新稀有配方 1 : 64 → 1 : 49（2%，平均 50 次），`rare-cost` 上限 180 分鐘並恢復執行（火 107／風 128／雷 122／土 162／水 141）；新增「機率配方落空時提示多試幾次」（引擎 `rareStillHidden`、合成台 `RETRY_HINT`，不提魔法名稱）。在 `feat/rare-tuning` commit；`npm test` 62 個檔案 646 個測試全過、`npm run build` 通過。停在：尚未 push、尚未合併。下一步：使用者回饋「各階魔法沒有決定性差異（焚世之焰 Lv.8 的 DPS 和 Lv.7 墜日差不多、比 Lv.7 大洪水還低）」——要先討論階級之間的強度曲線（設計討論中），之後實作新功能，再全面擴充遊戲內容。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：`worker/app.test.ts` 的 anchor window 測試在完整套件負載高時偶爾超過 5 秒，整組時限放寬到 15 秒（連跑三次全過）。依使用者指示整合一個版本：`feat/core-rework` fast-forward 合併進 `main`，刪除所有已併入的本機 branch，只剩 `main`；`main` 上 `npm test` 61 個檔案 635 個測試（5 個跳過）、`npm run build` 通過。停在：`main` 比 `origin/main` 多 98 個 commit，尚未 push（使用者自己 push）。下一步：使用者 push、試玩；待辦 0a（稀有魔法刷取時間）仍待決定；之後第二版 C+D。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：戰鬥畫面左上角加 DPS 數字（使用者選「最近 10 秒的平均」）：`src/render/dps.ts` 的 `DpsMeter`（`DPS_WINDOW_MS = 10_000`；視窗未滿時除以已經過的時間、至少 1 秒；換地點或重新載入時歸零）與 `formatDps`（沒有傷害顯示「DPS —」，10 萬以上顯示 k）；`BattleView` 把非無效的 `hit` 與 `dot` 事件傷害加進去，每 250 ms 更新一次文字。之後依使用者要求改成「實際打掉的血量」：`hit` 事件新增 `dealt`（實際扣掉的血，不含溢出；`damage` 仍是飄字顯示的全額），DPS 用 `dealt`；換裝魔法時 DPS 歸零，讓數字只代表目前裝備的魔法。直接在 `feat/core-rework` commit；`npm test` 61 個檔案 635 個測試（5 個跳過）、`npm run build` 通過；headless Edge 截圖確認顯示正常、無頁面錯誤（換裝歸零沒有在瀏覽器實測）。另外 `worker/app.test.ts` 的「high-frequency synthesize calls…」在完整套件負載高時偶爾超過 5 秒逾時（單獨跑都過），與本次修改無關。停在：尚未 push。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：為了之後在戰鬥畫面顯示 DPS，先補引擎的缺口：燃燒每步直接扣血、不發 `hit` 事件，所以只算 `hit` 會低估火系。`combat.ts` 新增 `{ type: 'dot', damage }` 事件，把所有怪的燃燒傷害（只算實際扣掉的血，不算溢出）每 `DOT_REPORT_MS = 1000` 彙總一次；`BattleState` 多 `dotDamage`／`dotMs` 兩個累計欄位。直接在 `feat/core-rework` commit；`npm test` 60 個檔案 628 個測試（5 個跳過，含模擬路線）、`npm run build` 通過。停在：尚未 push。下一步：DPS 顯示本身（等使用者決定要穩定的近 10 秒平均還是跳動的即時數字）。

- **2026-10-24（Claude Code，Opus 5.5，Windows）**：GM 工具最終審查（安全）Critical 0、Important 1（GM 身分是先綁先贏的帳號名稱，原本文件的部署順序會在綁定前就設名單）已修正：文件改成「先不設名單部署 → 綁定 GM 帳號 → 最後才設 `GM_USERNAMES`」，程式忽略不合法的名稱；另修切換帳號清掉 GM 狀態、GM 紀錄先寫再生效、重設密碼前確認。使用者指示把 `feat/gm-tool` fast-forward 合併回 `feat/core-rework`（branch 已刪）；`npm test` 60 個檔案 625 個測試（5 個跳過）、`npm run build` 通過。停在：`feat/core-rework` 尚未 push、尚未合併到 `main`；待辦 0a 仍待決定。下一步：使用者詢問戰鬥畫面顯示 DPS 的可行性（討論中）。

- **2026-10-23（Claude Code，Sonnet 5.5，Windows）**：以 subagent-driven-development 在 branch `feat/gm-tool`（從 `feat/core-rework` 分出）執行 GM 工具的 8 個任務（規格 `docs/superpowers/specs/2026-10-23-gm-tool-design.md`，帳本 `docs/superpowers/sdd/2026-10-23-gm-tool/progress.md`）。最後一項任務在 headless Edge 驗收規格第 9 節全部 9 項（兩個 context：GM 帳號與一般玩家），未設定 `GM_USERNAMES` 的 404 也另外驗過；驗收沒有發現需要修的 bug，只有兩個外觀小問題記在第 8 節。文件同步：上線前檢查清單把手動重設流程與「管理員重設密碼工具」改成「用 GM 工具」，加入 `GM_USERNAMES` secret 與遠端 D1 套用 0005、0006。停在：全部 commit，尚未 push、尚未合併。下一步：使用者在真實瀏覽器試用 GM 視窗與試玩合成台／核心重做；待辦 0a（稀有魔法刷取時間 139／167／158／211／183 對 120 模擬分鐘）仍待使用者決定；之後第二版 C+D。

- **2026-10-23（Claude Code，Opus 5.5，Windows）**：使用者指示把 `feat/v2b-rare-discoveries` 合併回 `feat/core-rework`（fast-forward，branch 已刪）；合併後 `npm test` 53 個檔案 533 個測試（5 個跳過）、`npm run build` 通過。停在：`feat/core-rework` 尚未 push、尚未合併到 `main`；稀有魔法刷取時間仍待使用者決定。下一步：GM 工具的設計討論（進行中）。

- **2026-10-23（Claude Code，Opus 5.5，Windows）**：使用者問「魔法與魔法合成時為何材料不足」：兩個魔法融合要另外付融合成本（結果每種屬性各 1 個元素，階級依結果深度），合成台原本不知道這筆成本，按鈕會亮但伺服器回 422。新增引擎的 `fusionNeeds`（與 `synthesize` 共用同一套 `plan`／`outcomeCosts`，隨機配方取每種可能結果的最大需求），合成台在兩邊都是魔法時顯示「另外需要：中階火 ×1（持有 0）」、缺的標紅並停用合成。直接在 `feat/v2b-rare-discoveries` commit；`npm test` 53 個檔案 533 個測試（5 個跳過）、`npm run build` 通過；沒有做瀏覽器截圖。停在：尚未 push。下一步同下一筆。

- **2026-10-23（Claude Code，Sonnet 5.5，Windows）**：以 subagent-driven-development 在 branch `feat/v2b-rare-discoveries`（從 `feat/core-rework` 分出）執行第二版 B 的 8 個任務（帳本 `docs/superpowers/sdd/2026-10-23-v2b-rare-discoveries/progress.md`）：5 個稀有魔法與配方、`discoveries` 表（migration 0005，不重置存檔）、伺服器記錄與 `GET /api/discoveries`、全螢幕揭曉動畫、頂端鈴鐺與清單。最後一項在 headless Edge 以兩個獨立 context 驗收通過（擲骰是暫時調高本機權重，沒有 commit）。**重要未決事項：** 稀有魔法的刷取時間量測為 火 139／風 167／雷 158／土 211／水 183 模擬分鐘，超過規格要求的 120，5 個相關測試先 `it.skip`，等使用者決定（接受／提高權重／降低成本）。停在：全部 commit，`feat/v2b-rare-discoveries` 與 `feat/core-rework` 都尚未 push、尚未合併；`npm test` 53 個檔案 523 個測試（5 個跳過）、`npm run build` 通過。最終審查修正（落空重試不再免費、發現紀錄寫入失敗不會讓已學會的合成變 500、揭曉動畫的線索更早出現）後為 526 個測試。下一步：使用者決定刷取時間 → 在真實瀏覽器試玩 → 決定 push 與合併 → 第二版 C+D 設計討論（開始前先決定「大魔導士稱號」與「內容太少會同分」兩個問題）。

- **2026-10-23（Claude Code，Opus 5.5，Windows）**：使用者反映元素表每列只有一個「升階」按鈕（固定升最低可升的那階），無法升想要的階級。改成相鄰兩階之間的「›」箭頭（獨立一欄、與格子同高，避免誤觸數量格子）：左邊那格夠成本（3／10／30／100）才亮起，點了只升那一階；Shift＋點能升多少就升多少（`upgradeCount`）。每列右邊的「升階」按鈕移除。直接在 `feat/core-rework` commit（小改動，對話中確認做法）；`npm test` 51 個檔案 481 個測試、`npm run build` 通過，headless Edge 實際點擊確認。停在：尚未 push。下一步同上一筆。

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
