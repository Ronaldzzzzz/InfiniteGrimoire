# SDD ledger — plan: docs/superpowers/plans/2026-10-21-v2a-accounts.md

Spec: docs/superpowers/specs/2026-10-21-v2a-accounts-design.md
Branch: feat/v2a-accounts（從 feat/mvp-core-loop 2e0cbe1 分出）
Executor: executing-plans（inline，Claude Opus 5.5，macOS）

## Rulings
Ruling: 開新 branch feat/v2a-accounts（從 feat/mvp-core-loop 分出），不在 MVP branch 上做 — 讓 MVP 能獨立驗收合併 — 錯了只需 merge 兩 branch。
Ruling: 帳本在 .superpowers 工作區記錄，結束時複製到 docs/superpowers/sdd/2026-10-21-v2a-accounts/progress.md（AGENTS.md 指定位置）— 沿用前一個計畫的做法 — 無。

## Progress
Pre-flight: T1 規則 → T6/T9/T10 消費：名稱一致。T2 password.ts → T6：一致。T3 Store 介面 → T4 D1Store/T5/T6/T7：同一組方法名，一致。T6 loginBlocked/readCredentials（T6 程式碼內定義，Produces 未列）→ T7：同層 helper 可用，無衝突。T8 ApiClient/LoginResult/AccountInfo → T9/T10：一致。
Task 1: complete (commits 2e0cbe1..81ee2f5, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  283 passed (283))
Task 2: complete (commits 81ee2f5..cff5e04, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  288 passed (288))
Task 3: Ruling: app.test.ts 的 MemoryStore.commitSave 測試（計畫沒提到）也用舊 PlayerRow（含 tokenHash）與 3 參數 createPlayer — 移除 tokenHash、補 session hash 'h' 參數 — 錯了只是測試寫法。
Task 3: complete (commits cff5e04..cac9535, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  294 passed (294))
Task 4: Ruling: 計畫的 migration（建 players_new → DROP players → RENAME）在 SQLite 上 commit 失敗「FOREIGN KEY constraint failed」：DROP 的隱含刪除讓 deferred FK 計數增加，RENAME 不會讓它歸零。改成「複製到 players_copy → DROP players → 以原名 CREATE players → INSERT 回去 → DROP players_copy」，重新插入的父列會清掉計數；外鍵仍開著（未關閉）。node:sqlite 契約與搬移測試、wrangler 本機 migration 都通過 — 錯了：遠端 D1 套用時仍可能失敗，部署前要在遠端前先備份。
Task 4: complete (commits cac9535..ba95ef6, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  300 passed (300))
Task 5: Ruling: 計畫的視窗 `since = t0 - HOUR_MS`（含剛好滿 1 小時的紀錄）與計畫自己的測試（retryAfterSec=3600、+1 小時後放行）矛盾 — 改成 `t0 - HOUR_MS + 1`，滿 1 小時即過期，與 retryAfterSec 一致；Store 契約不變 — 錯了只差 1ms。Task 6 的登入視窗同樣處理。
Task 5: complete (commits ba95ef6..e148efc, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  301 passed (301))
Task 6: complete (commits e148efc..a36c96e, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  308 passed (308))
Task 7: complete (commits a36c96e..aa95f72, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  313 passed (313))
Task 8: Ruling: sync.test.ts 的 fakeApi 回傳完整 ApiClient，新方法補 vi.fn()（計畫允許的兩個選項之一，改動最小）— 無成本。
Task 8: complete (commits aa95f72..3490ea6, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  318 passed (318))
Task 9: complete (commits 3490ea6..f5dd2cb, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  322 passed (322))
Task 10: Ruling: 計畫用到 `.tag.warn` 但 App.css 沒有 .tag 樣式 — 新增 .tag／.tag.warn（小框、琥珀金）— 錯了只改 CSS。
Task 10: complete (commits f5dd2cb..732b1f8, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  332 passed (332))
Task 11: Ruling: README.md 沒有提到 Node 版本 — 不改 README；engines 與 AGENTS.md 已更新 — 無。
Task 11: Ruling: Claude in Chrome 未使用；驗收用本機 Google Chrome headless + puppeteer-core（腳本在 scratchpad，不進專案），4 個 browser context 當 4 台裝置 — 計畫允許的替代方案 — 真實視窗瀏覽器的手感仍待使用者確認。
Task 11: 驗收（npm run dev，本機 D1）：1 綁定後「未綁定」消失 PASS；2 B 以帳號登入，learned/inventory 與 A 相同 PASS；3 A、B 同時遊玩 31 秒無斷線遮罩／錯誤提示條 PASS；4 B 改密碼後 A 重新整理回到開始畫面，password1 顯示「帳號或密碼錯誤」、password2 可登入，B 仍可用 PASS；5 C 用不存在的名稱連錯 5 次，第 6 次「嘗試次數過多，請 15 分鐘後再試」PASS；6 360px 帳號對話框完整在畫面內、scrollWidth=360 PASS；7 遊客「登入其他帳號」提醒含名稱與「已學 1 個魔法」PASS。
