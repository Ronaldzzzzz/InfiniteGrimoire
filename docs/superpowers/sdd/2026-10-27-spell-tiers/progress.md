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
