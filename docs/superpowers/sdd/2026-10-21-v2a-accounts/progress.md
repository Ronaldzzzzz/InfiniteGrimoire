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
Task 11: complete (commits 732b1f8..5edd365, tests: .superpowers/sdd/2026-10-21-v2a-accounts/suite.sh →       Tests  332 passed (332))
Final review: 新 context 審查（Fable 5.1）：Critical 0、Important 2、Minor 4。
Final: fixed 換帳號後舊 SyncController 的離線重試鏈仍會用新帳號的 token 上傳舊存檔 — start() 的 stop 函式設 stopped 旗標，retry／uploadNow 檢查 — sync.test.ts「stopping the controller also stops the offline retry chain」RED→GREEN，suite 335/335
Final: fixed 已綁定玩家「切換帳號」沒上傳最後進度、舊 session 留著 — 改成登入新帳號成功 → beforeLogout → api.logout（失敗忽略）→ onSwitched；登入失敗不動舊裝置 — AccountDialog.test.tsx「switching from a bound account saves, logs this session out, then switches」RED→GREEN（「a failed switch login keeps this device logged in」為護欄），suite 335/335
Final: minor (deferred): 帳號對話框內收到 401 只顯示「發生錯誤」，要等下一次同步上傳（最多 30 秒）才回到開始畫面；可把 onAuthError 傳進 App／AccountDialog。
Final: minor (deferred): /api/guest 限制是「先數再建」不是原子操作，同一 IP 並發請求可能超過 10 個。
Final: minor (deferred): 登出前的 uploadNow 在上傳進行中、重試中或合成中會直接返回，最後幾秒進度可能沒上傳；可先 await 進行中的上傳。
Final: minor (deferred): /api/login 用目前的密碼長度規則檢查，之後若收緊規則，舊密碼會收到 400；登入時可只檢查 128 上限。
Final: Ruling: 任何人可用 5 次錯誤登入把某帳號名稱鎖 15 分鐘 — 規格明定每名稱限制，屬已知取捨 — 被惡意鎖帳時玩家要等 15 分鐘（已登入的裝置不受影響）。
Final: Ruling: 綁定時 409 taken 會透露名稱已存在 — 規格定義的行為，名稱不是公開身分 — 可被列舉帳號名稱。
Final: Ruling: /api/account/bind 沒有頻率限制 — 規格未要求，且需已登入 — 可被用來大量測試名稱是否存在。

## 2026-10-22 修訂：瀏覽器端密碼雜湊（plan docs/superpowers/plans/2026-10-22-v2a-client-hash.md）

Pre-flight: Task 1 的 clientPasswordHash 供 Task 3 使用，簽章一致；Task 2 的 CLIENT_HASH_RE（43 字元 base64url）符合 Task 1 的 32 bytes 輸出 — clean。
Task 1: complete — src/game/password-hash.ts，3 個測試 RED→GREEN。
Task 2: complete — worker/password.ts 改 HMAC＋pepper；app 只收 43 字元雜湊（否則 400 invalid_password）、移除假雜湊與 rehash；pepper 空字串回 500。suite 339/339。
Task 2: Ruling: app.test.ts 用 SHA-256 base64url 代替瀏覽器 PBKDF2 當測試雜湊（ph()），bind/login helper 自動雜湊、bindRaw/loginRaw 送原始值 — 伺服器只看格式，不需跑 30 萬次 — 無。
Task 3: complete — api.ts 送出前雜湊，changePassword(username, current, next)；綁定／改密碼／登入按鈕忙碌時顯示「處理中…」（登出按鈕不雜湊，維持原文字）。suite 343/343。
Task 4: 驗收（npm run dev，本機 D1，headless Chrome）：1 綁定 PASS；2 另一台登入同存檔 PASS；登入按鈕出現「處理中…」PASS；4 改密碼後舊密碼「帳號或密碼錯誤」、新密碼可登入、另一台被登出 PASS；5 連錯 5 次後「嘗試次數過多，請 15 分鐘後再試」PASS；23 個 /api 請求 body 都沒有明文密碼 PASS。Chrome 實測 300k 次 PBKDF2 ≈ 143ms。
Task 4: 之前的 minor「/api/login 用目前的密碼長度規則檢查」已不存在：伺服器不再檢查密碼長度。
Final: minor (deferred): 舊格式 `pbkdf2-sha256$` 的帳號無法登入（只影響本機驗收資料，沒有真實玩家）。

Final review（雜湊改版）: 新 context 審查（Opus）：Critical 0、Important 0、Minor 4。
Final: minor (deferred): 沒設 pepper 時，login 對不存在的名稱回 403、存在的名稱回 500（`!cred ||` 短路），設定錯誤時可看出名稱是否存在；可在 login 開頭先檢查 pepper。
Final: minor (deferred): 非 HTTPS（如 `vite --host` 用手機連 http://192.168.x.x）時 crypto.subtle 不存在，綁定／登入只顯示「發生錯誤」；正式環境是 HTTPS 不受影響。
Final: minor (deferred): 沒設 pepper 回 500 只測了綁定，login 與改密碼沒測。
Final: minor (deferred): 舊版前端送明文會收到 400 invalid_password，畫面顯示「密碼需要 8～128 個字」，原因說明不準確（只影響快取舊 bundle）。
