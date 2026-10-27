# SDD ledger — plan: docs/superpowers/plans/2026-10-27-spell-tiers.md

（魔法階級曲線、第一批魔法與地圖擴充）

- 規格：`docs/superpowers/specs/2026-10-27-tier-curve-and-map-expansion-design.md`
- 計畫：`docs/superpowers/plans/2026-10-27-spell-tiers.md`
- Branch：`feat/spell-tiers`（從 `feat/rare-tuning` 分出）
- 使用者 2026-10-27 確認規格（含 0c 與光暗獨立技能樹）並下實作指令。

## 計畫層級 Ruling
- Ruling R1：有配方的「魔法＋素材」不收融合成本，每次嘗試只扣 1 個素材（見計畫）。
- Ruling R2：配方 `comboKey` 不得重複。
- Ruling R3：新手引導不依賴自動裝備，不需改。
- Ruling R4：量測與模擬目標斷言在 Task 7 前以 `ENFORCE` 關閉。

## Pre-flight scan

| 範圍 | 生產 → 消費 | 發現 |
|---|---|---|
| T1 ↔ Global「每任務 npm test 全過」 | T1 改強化會讓 sim 變慢 | 計畫允許 sim 暫時 skip → Ruling P1 |
| T1 → T3/T6/T7 | `TIER_STEP`、R1 落空只扣素材 | 一致 |
| T2 → T3 | `NAMED_DEPTH`、`School`、`chant`、`words` 唯一檢查 | T3 新魔法要遵守 pre/noun 唯一；一致 |
| T2 → T4 | `astral` 區域在 T2 建、`key:star_sigil` 在 T4 | T2～T3 期間 astral 無法解開，可接受 |
| T2 ↔ T3 | 稀有暫留舊配方（T2）、T3 改輸入並加檢查 2 | 一致 |
| T3 → T6 | 配方 id `${e}_lv4/6/8/9`、`${e}_pure_2/3` | 一致 |
| T4 → T5 | `HOME_ZONE` 用 T4 的新地點 id | 一致 |
| T5/T6 → T7 | `ENFORCE` 常數 | 一致 |
| T2 → T8 | `School`、`chant` | 一致 |
| T8 ↔ T9 | 都動 `GrimoirePanel.test.tsx` | 依序執行，無衝突 |
| T9/T10/T11 | 都動 `App.tsx`、`App.css`、`App.test.tsx` | 依序執行，無衝突 |
| T10 ↔ T11 | `SynthesisAltar` 回呼 vs `onSynthResult` | 不同函式，無衝突 |
| 計畫帳本位置 vs 技能 workspace | 計畫指定 docs 帳本 | Ruling P2 |
| 每任務自洽 | T1～T12 測試與實作檔案、建立後再修改的檔案 | 未發現自相矛盾 |

- Ruling P1: Task 1～5 期間 sim 若因數值未調而失敗，可暫時 `describe.skip` `pure-paths`／`rare-cost`，Task 6 恢復 — 計畫本身允許，Task 7 才調平 — 若錯：中間 commit 的 sim 不可信，但最終 Task 7 會驗證。
- Ruling P2: 帳本用 `docs/superpowers/sdd/2026-10-27-spell-tiers/progress.md`（AGENTS.md 慣例、會 commit）；briefs、reports、review packages 放 `.superpowers/sdd/2026-10-27-spell-tiers/` — 照專案慣例 — 若錯：只是位置不同。

## 任務
- Task 1: dispatched (BASE 216e161, implementer adc5b0d022b37f211, sonnet)
- Task 1: minor (deferred): crafting.ts `fused` 只看 recipe 存在，不看是否有 eligible 結果；前置未學時落空自創也免融合成本（小漏洞）。
- Task 1: minor (deferred): `fusionNeeds` 與 `synthesize` 一致性測試少了素材配方案例。
- Task 1: minor (deferred): EmpowerPanel 低等級顯示「攻擊 12 → 12」（四捨五入）；交給 Task 8 處理。
- Task 1: complete (commits 216e161..cb009f6, review clean)
- Task 2: dispatched (BASE b27ce3a, implementer af6b74b58bab5a473, sonnet)
- Task 2: minor (deferred): content.test「existing spells and recipes are unchanged」對稀有整筆跳過（只該跳 tier）。
- Task 2: minor (deferred): content.test 部分錯誤斷言用寬鬆子字串（'fireball'、'passive'）。
- Task 2: note: pure-paths 暫時排除 astral 區域，Task 4 必須移除。4 個改名的英文 words 是實作者自取（Tempest/Canopy、Voltaic/Surge、Devouring/Sands、Thunderfire/Maelstrom）。
- Task 2: complete (commits b27ce3a..5906fe0, review clean)
- Task 3: dispatched (BASE 5906fe0, implementer a4587ea29aa6711d7, sonnet)
- Ruling T3a: 沒有深度被動時，稀有落空（Lv.9 深度 3 ＋ 素材 → 自創深度 4）會變成魔力過載，仍只扣 1 個素材 — 規則照舊（過載本來就是深度超限的結果），R1 讓成本只有素材 — 若錯：玩家刷稀有時會頻繁看到過載訊息，Task 11/驗收時再看是否要改訊息。
- Ruling T3b: 新魔法攻擊暫用與舊資料連續的值（Lv.4 40、Lv.6 55、Lv.8 80、Lv.9 90），不用 TIER_STEP 粗估 — 粗估值會打破 attack ceiling 測試，Task 7 本來就重調 — 若錯：Task 7 前量測報告數字不具意義。
- Task 3: minor (deferred): baseline「unchanged」測試跳過 _pure_2/3 與 Lv.5/7 前置（由鏈測試補）；check 3 只看單屬非稀有；abyssal_crush 說明「最後」與實際不同時（Task 7 重寫 desc 時一起修）。
- Task 3: complete (commits 5906fe0..c1826cd, review clean)
- Task 4: dispatched (BASE d5a695a, implementer a91711ad130c07e93, sonnet)
- Ruling T4a: 規格 6.1「每個地點五種屬性都出現在魔物或魔王」做不到（每地點 3 一般＋1 魔王＝4 種，舊地點也是）→ 改成「每個地點都有五種元素的掉落列」＋相鄰地點主屬性不同 — 規格原意是純屬路線不被卡、相剋影響有限，掉落列才是 R12 的關鍵 — 若錯：某地點對某屬性特別順或特別難（相剋 ±10%），Task 7 時間目標會反映。
- Task 4: minor (deferred): 新魔物防禦測試只斷言 defense*0.7 > 90，沒驗「Lv.N−1 打得動」；「每地點五元素掉落」測試只看一般怪。
- Task 4: complete (commits d5a695a..456edc8, review clean)
- Ruling T5a: 曲線檢查細節——每招量自己主場與低一階主場；同階 ±25% 用 A、B 幾何平均對該階中位數；中位數不含例外招；打不動算 0 並列為失敗 — 規格 7.2/7.3 的直接解讀 — 若錯：Task 7 調平目標偏差，可在 measure.ts 改一處。
- Task 5: dispatched (BASE 456edc8, implementer af0e532f2772fde1e, sonnet)
- Task 5: first curve report: 93 failures；非例外中位數（單挑／群怪）Lv1 7.0/13.3、Lv2 11.4/50.6、Lv3 9.4/168、Lv4 22.7/283、Lv5 113/566、Lv6 55.8/454、Lv7 107/1091、Lv8 88.5/769、Lv9 106/1389、Lv10 81/1240。
- Task 5: minor (deferred → Task 7): measure.ts 強化值為 0 且高一階全為 0 時檢查 4 會默默通過；m9=0 時檢查 3 默默通過；mana_overload 等不直接傷害的例外招會被列為「打不動」；單一種子短窗口對隨機目標招有雜訊；measure.test 依賴 mana_bolt 數值。
- Task 5: complete (commits 456edc8..980f538, review clean)
- Ruling T6a: 模擬中「清完 6 個地點、所有區域解開」也放進 ENFORCE（未調平前可能做不到）；0 次被拒與只學該屬性維持硬性 — 計畫只把時間放 ENFORCE，但清關依賴數值 — 若錯：Task 6 期間少一道防線，Task 7 打開後補上。
- Task 6: dispatched (BASE 980f538, implementer a05d8fe60ab086f5a, sonnet)
- Task 6: 未調平量測：只有風清完 6 地點（289.9 分）；火、雷、水、混合 5/6，土 4/6；星殞高原 58～139 分；只有風學到 Lv.9（189.3 分），刷稀有 125 分。tests/sim 約 134 秒。
- Task 6: minor (deferred): rare-cost 窗口不足 30 分時雜訊大；clearMinutes 假設依序清關；每條路線在 pure-paths 與 rare-cost 各模擬一次。
- Task 6: complete (commits 980f538..96e9057, review clean)
- Task 7: dispatched (BASE 4987b10, implementer a572f9fbddd90fdee, opus)
- Ruling R-T7-1: pure-paths 的「前 4 個魔王 60～240」改成檢查第 4 個魔王倒下的累計時間（原寫法要求每個地點都 ≥ 60，和「每個地點 5～90」矛盾）— 對齊規格 6.4 — 若錯：前期節奏可能太快，但每地點下限 5 分仍把關。
- Task 7: review → Needs fixes: Important 1 規格 12-2 要求完整版（60/30 秒）量測也滿足 7.3，目前 33 條不通過、Lv.7→8 群怪 ×0.90～0.94。
- Ruling T7a: 採做法 (a)：tier-curve 測試改用與完整版相同的 60/30 秒窗口（原本整檔只要 1.5 秒，負擔得起），重調到兩者一致通過；不採「以短量法為準」— 短窗口曲線不穩，正是使用者抱怨的「高一階反而弱」— 若錯：多一輪調平時間。
- Ruling R-T7-2: 沒有改 combat.ts，storm/field 用每招 mult 與形狀收斂 — 規格 7.4 允許但不需要 — 若錯：無。
- Ruling R-T7-3: 沒有傷害效果的例外招（魔力過載）不算「打不動」 — 無東西可量 — 若錯：無。
- Ruling R-T7-4: 7 招稀有攻擊統一 100（mult 等比縮小，DPS 不變）— 面板會顯示攻擊，原本 80 低於 Lv.9 的 90 — 若錯：只是顯示值。
- Ruling R-T7-5: 世界盡頭 3 隻一般怪各掉 3 種素材、各 2%，7 種都有（補潮汐鱗片；餘燼核心只剩灰燼巨人）— 原本純水刷不到滄溟月潮 — 若錯：某屬性刷稀有較慢，rare-cost 測試把關。
- Ruling R-T7-7: 曲線檢查用 60/30 秒、2 個種子（20261021、7）平均，與 measure-dps.ts 共用 CURVE_OPTS — T7a — 若錯：測試約 4.5 秒，負擔小。
- Ruling R-T7-8: 墮星龍神階掉率 0.8（仍 < 1）— 0.4 時雷路線運氣差會超過時間目標 — 若錯：神階太容易拿。
- Ruling R-T7-9: measure-dps.ts 中位數摘要排除 CURVE_EXEMPT，和 measure.ts 一致 — 若錯：無。
- Task 7: fix round 1/5 (1 Important + 4 Minor addressed, 0 open; commits ba8c9ad..fd8a66d)
- Task 7: 結果：曲線 0 條未通過（60/30 秒、2 種子）；相鄰倍率 ×1.57～×1.79（幾何平均約 1.67）；同階最大／最小 1.14／0.82；6 條路線全清、0 次被拒；前四魔王 64.1～116.2 分、全部 90.5～203.4 分、每地點 5.5～82.2 分；刷稀有 24～68 分。
- Task 7: minor (deferred): 模擬餘裕小（水草原 5.5/下限 5、風水前四魔王 64～65/下限 60、雷神殿 82.2/上限 90）；調平腳本不在版本庫（係數表在 task-7 報告，已併入本帳本摘要）。
- Task 7: complete (commits 4987b10..fd8a66d, review clean after 1 fix round)
- Task 8: dispatched (BASE 74d97a7, implementer aa2f9bb15b6459308, sonnet)
- Task 8: minor (deferred): GrimoirePanel.test 的「燃燒」「攻擊」斷言可能被 desc／強化面板滿足，應限定在 .spell-facts；EmpowerPanel 小數測試依賴火球數值。
- Task 8: complete (commits 74d97a7..6dc45c3, review clean)
- Task 9: dispatched (BASE 6dc45c3, implementer ae60528aa66b02af8, sonnet)
- Ruling T9a: 外環間距 65→35（RING_RADIUS 到 550），全部解開時技能樹畫面縮成約 0.72 倍 — 讓 HOME 看得到 10 環；可以縮放 — 若錯：手機上節點偏小，驗收時看。
- Task 9: minor (deferred): 切換分頁 key={tab} 會重設縮放與選取；光暗迷霧矩形高度寫死 220；外環迷霧帶沒有專門測試。
- Task 9: complete (commits 6dc45c3..454dc4c, review clean)
