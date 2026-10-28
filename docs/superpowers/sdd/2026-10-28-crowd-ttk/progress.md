# SDD ledger — plan: docs/superpowers/plans/2026-10-28-crowd-ttk.md

Spec: `docs/superpowers/specs/2026-10-28-crowd-ttk-and-number-scale-design.md`. Branch `feat/crowd-ttk` from `feat/rare-tuning` @ 22f27d0. Briefs and reports: `.superpowers/sdd/2026-10-28-crowd-ttk/` (git-ignored).

## Pre-flight scan

| Rows | Produces / consumes | Found |
|---|---|---|
| T1 ↔ T3 (`monsters.json`) | T1 ×10 hp/defense/regen; T3 multiplies hp by a zone factor | sequential, no conflict |
| T1 ↔ T3 (`tests/sim/pure-paths.test.ts`) | T1 may update numeric asserts; T3 splits `ENFORCE` | no conflict |
| T2 ↔ T3 (`crowd.test.ts`, `measure.ts`, `measure-dps.ts`) | T2 produces `ZONE_TIER`, `crowdStats`, `crowdClear`, `crowdReport`, `CROWD_OPTS`, `ENFORCE_CROWD=false`; T3 consumes, flips flag, reruns script | names match |
| T3 ↔ T4 | T4 screenshots the tuned data | no conflict |
| T1 self | tests (DEFENSE_SCALE, formatDps, old save) vs code | consistent |
| T2 self | boss spawning during 120 s runs not specified | Ruling P1 |
| T3 self | "same monster in several zones" — every zone lists distinct monsters | moot |
| T4 self | consistent | — |

- Ruling P1: `crowdStats` / `crowdClear` pin `zoneKills` to 0 every step (as `clean` in measure.ts does), so the boss never spawns and `alive` counts ordinary foes only — the spec judges ordinary monsters, the boss has its own scaling — if wrong, field numbers ignore the boss's presence, which is a small share of time anyway.
- Ruling P2: ledger lives at `docs/superpowers/sdd/2026-10-28-crowd-ttk/progress.md` (plan + project convention, committed); briefs/reports in the git-ignored skill workspace — costs nothing if wrong.

## Tasks
- Task 1 Ruling: the brief's linearity test compared two computeDamage calls under the new scale (invalid, 105 off); rewrote it against the pre-scale formula (50*100/130 vs computeDamage(500, def 300) x10) — the test must pin old-scale equivalence — cost if wrong: a weaker test only.
- Task 1 Ruling: persist legacy-save test runs in `mist_meadow`, not `ember_wastes` — fireball (Lv.2) is immune there (monsters Lv.5-6, same before the x10), so dealt would be 0 — still proves parse -> battle -> real damage — cost if wrong: none.
- Task 1 Ruling: `content-baseline.json` spell attacks x10 (pin of the scaled values) — content.test compares tier|attack|cooldown|depth — cost if wrong: baseline test noise.
- Task 1 Ruling: EmpowerPanel one-decimal test now uses a shrunk fireball (attack 12) — no shipped elemental spell has attack < 120 so the branch is unreachable with real content; branch kept (harmless) — cost if wrong: dead code.
- Task 1: minor (deferred): EmpowerPanel one-decimal branch unreachable with shipped content (smallest elemental attack 120); kept as guard, test uses synthetic fixture.
- Task 1: minor (deferred): combat-rules.test.ts new tests sit above the `mon`/`sp`/`plain` helpers they use.
- Task 1: complete (commits 262f2c6..5ab5c0b, review clean)
- Task 2 Ruling T2a: crowdClear 填滿場時 `equipped` 設成不存在的 id `__none__`（spellOf 回 null，不施法），填到 normals ≥ maxAlive 後才換成要量的魔法 — 最小改動、走真實生怪流程 — 若引擎之後對未知 id 報錯，這裡要改成直接放怪。
- Task 2 Ruling T2b: crowdStats 內部呼叫 crowdClear 時 limitMs 用 15_000（clearedShare 只看 ≤15 秒），超過就是 null — 省時間 — 若要看實際清場秒數需放大。
- Task 2 Ruling T2c: `touched` 是整段 ms（含暖機）內累計的不同怪 uid，不是平均；所以數字遠大於 maxAlive — 照介面「distinct」字面實作 — Task 3 把關 rel +1 `touched ≤ 2` 時要留意其窗口含暖機。
- Task 2 Ruling T2d: crowdReport 各階只取 named 且非 rare（Lv.10 取 rare）、排除 CURVE_EXEMPT；每種魔法 2 個種子都跑，沒有減少 — 整份 crowd.test 約 27 秒，可接受。

調整前基準（CROWD_OPTS：種子 20261021、7，120 s，暖機 30 s；ENFORCE_CROWD = false）：
```
mist_meadow       rel  0 (Lv.2, 5 spells) 場上 59.9；碰線 199.5；15 秒清場 0%
mist_meadow       rel  1 (Lv.3, 5 spells) 場上 20.6；碰線 7.0；15 秒清場 0%
thunder_gorge     rel -1 (Lv.3, 5 spells) 場上 77.5；碰線 94.5；15 秒清場 0%
thunder_gorge     rel  0 (Lv.4, 11 spells) 場上 74.7；碰線 219.5；15 秒清場 0%
thunder_gorge     rel  1 (Lv.5, 11 spells) 場上 64.2；碰線 162.5；15 秒清場 0%
ember_wastes      rel -1 (Lv.5, 11 spells) 場上 77.7；碰線 121.5；15 秒清場 0%
ember_wastes      rel  0 (Lv.6, 6 spells) 場上 70.3；碰線 175.8；15 秒清場 0%
ember_wastes      rel  1 (Lv.7, 6 spells) 場上 54.4；碰線 112.3；15 秒清場 0%
sunken_temple     rel -1 (Lv.6, 6 spells) 場上 77.6；碰線 129.0；15 秒清場 0%
sunken_temple     rel  0 (Lv.7, 6 spells) 場上 74.7；碰線 99.0；15 秒清場 0%
sunken_temple     rel  1 (Lv.8, 5 spells) 場上 51.5；碰線 119.0；15 秒清場 0%
starfall_plateau  rel -1 (Lv.7, 6 spells) 場上 79.8；碰線 87.5；15 秒清場 0%
starfall_plateau  rel  0 (Lv.8, 5 spells) 場上 76.8；碰線 102.5；15 秒清場 0%
starfall_plateau  rel  1 (Lv.9, 5 spells) 場上 72.8；碰線 171.0；15 秒清場 0%
worlds_end        rel -1 (Lv.8, 5 spells) 場上 79.8；碰線 55.0；15 秒清場 0%
worlds_end        rel  0 (Lv.9, 5 spells) 場上 77.3；碰線 127.0；15 秒清場 0%
worlds_end        rel  1 (Lv.10, 7 spells) 場上 58.0；碰線 146.5；15 秒清場 0%
```
- Controller Ruling C2: keep T2c (`touched` counts the whole window incl. warm-up) — the spell is equipped from t=0, so a tier-up spell must keep every foe off the line from the start; stricter than counting after warm-up — cost if wrong: Task 3 tunes HP a bit lower than strictly needed.
- Task 2: minor (deferred): `crowdStats` always runs `crowdClear` though `crowdReport` only uses it for rel +1 (~2/3 wasted work).
- Task 2: minor (deferred): `measure.ts` `st` map has a pointless `const a = ...; return a;`.
- Task 2: complete (commits 22683b7..6c9f8d1, review clean)
- Task 3 Ruling T3a: 每個地點一個血量係數（一般魔物與魔王相同；每隻魔物只屬於一個地點，沒有共用），`hp = round(hp × k)`；係數取 2 位有效數字：迷霧草原 0.5、雷鳴峽谷 0.05、熔火荒原 0.10、沉沒神殿 0.15、星殞高原 0.14、世界盡頭 0.11 — 搜尋：先對全部地點掃 k = 0.7／0.5／0.35／0.25／0.18／0.12／0.08／0.05，再在 rel +1 剛好通過（碰線中位數 ≤ 2 且 15 秒清場 > 50%）的邊界附近細掃，取通過值裡、上下相鄰值也通過的那一個（留一格餘裕）；迷霧草原 rel +1 不隨血量改變，改用 rel 0 ≈ 40 決定 — 若錯：係數要重找（腳本在工作區 scratchpad，未進版本庫）。
- Task 3 Ruling T3-impossible（交給 controller／使用者決定）: 只靠血量無法同時滿足規格 4.3 的所有列，所以 `ENFORCE_CROWD` 維持 false（門檻沒改）。照「rel +1 優先」調完後：(1) rel 0 只有迷霧草原 39.2 在 30～50，其他五個地點 13.6～27.6；(2) rel −1 雷鳴峽谷 12.7、熔火荒原 31.7 低於 60（沉沒神殿以後 73～79 沒問題，因為打不動）；(3) 迷霧草原 rel +1 在 k = 0.7～0.05 都是碰線 6、清場 40%（不隨血量改變）。原因是同一階的魔法類型差很多，中位數由類型組成決定：(a) 單體 `bolt` 類一發只打一隻、受冷卻限制，一擊必殺時每秒擊殺數仍追不上約每秒 2.7 隻的出怪（迷霧草原的雷神之槌 Lv.3 場上 52～63 隻、碰線 200+；雷鳴峽谷的雷雲／感電之海 Lv.4 在 k 0.12 仍 74 隻）；(b) 會把魔物拉進中心的 `zone` 類（流沙、天穹風暴、斷空裂風、絕空裂風、蒼穹之息等）場上只剩 4～9 隻，但碰線 270～309，因為是被拉到停止圈、不是走過去（碰線量法把拉怪也算進去）；(c) 範圍類（`ring`、`meteor`、`field`）在 rel 0 就已經能清掉大半。所以「rel 0 約 40 隻」與「rel +1 碰線 ≈ 0」之間沒有一個血量係數能同時成立：rel +1 的中位數要降到 ≤ 2，要讓一半以上的高一階魔法壓住，此時同階的範圍類也會把場面清到 10～25 隻。可以考慮的槓桿（都超出本任務範圍，沒動）：碰線不計被 `zone` 拉進去的魔物；中位數改成只看範圍類或代表魔法；放寬 rel 0 下限；調整單體魔法的冷卻或出怪速度 — 若錯：目前這組係數讓同階魔法也能把畫面壓得很低（規格第 3 節反目標「同階魔法也把畫面清空」的邊緣），需要使用者試玩判斷。
- Task 3 Ruling T3b: `pure-paths.test.ts` 拆成 `ENFORCE_CLEAR = true`（六個地點清完、迷霧全開、`serverCalls`、混合路線學到的魔法）與 `ENFORCE_TIMES = false`（`FIRST_FOUR_*`、`SIX_HOURS`、`ZONE_MIN/MAX`）；`rare-cost.test.ts` 新增 `ENFORCE_TIMES = false` 只管 120 分鐘上限，「學到 Lv.9 魔法」與 0 次被拒照樣強制 — 使用者「4的掉落平衡後續再更動」 — 若錯：時間上限之後恢復時要一起重量。
- Task 3 Ruling T3c: 依 brief 覆寫 `docs/superpowers/specs/2026-10-27-dps-after.md`（不另開 10-28 檔），開頭加 2026-10-28 一節，原本 10-27 的手寫說明保留 — 若錯：只是檔名。

Task 3 調整後（CROWD_OPTS 同上；ENFORCE_CROWD 仍 false，見 T3-impossible）：
```
mist_meadow       rel  0 (Lv.2, 5 spells) 場上 39.2；碰線 102.0；15 秒清場 0%
mist_meadow       rel  1 (Lv.3, 5 spells) 場上 17.1；碰線 6.0；15 秒清場 40%
thunder_gorge     rel -1 (Lv.3, 5 spells) 場上 12.7；碰線 20.5；15 秒清場 40%
thunder_gorge     rel  0 (Lv.4, 11 spells) 場上 18.1；碰線 40.5；15 秒清場 9%
thunder_gorge     rel  1 (Lv.5, 11 spells) 場上 5.3；碰線 0.0；15 秒清場 55%
ember_wastes      rel -1 (Lv.5, 11 spells) 場上 31.7；碰線 74.5；15 秒清場 18%
ember_wastes      rel  0 (Lv.6, 6 spells) 場上 27.6；碰線 40.5；15 秒清場 33%
ember_wastes      rel  1 (Lv.7, 6 spells) 場上 3.9；碰線 0.0；15 秒清場 67%
sunken_temple     rel -1 (Lv.6, 6 spells) 場上 73.1；碰線 148.5；15 秒清場 0%
sunken_temple     rel  0 (Lv.7, 6 spells) 場上 13.6；碰線 93.0；15 秒清場 17%
sunken_temple     rel  1 (Lv.8, 5 spells) 場上 9.3；碰線 0.0；15 秒清場 60%
starfall_plateau  rel -1 (Lv.7, 6 spells) 場上 78.9；碰線 92.0；15 秒清場 0%
starfall_plateau  rel  0 (Lv.8, 5 spells) 場上 16.6；碰線 17.0；15 秒清場 20%
starfall_plateau  rel  1 (Lv.9, 5 spells) 場上 11.3；碰線 0.0；15 秒清場 60%
worlds_end        rel -1 (Lv.8, 5 spells) 場上 78.6；碰線 76.5；15 秒清場 0%
worlds_end        rel  0 (Lv.9, 5 spells) 場上 15.4；碰線 10.5；15 秒清場 40%
worlds_end        rel  1 (Lv.10, 7 spells) 場上 6.1；碰線 0.0；15 秒清場 71%
```
規格 4.3 各列：rel +1 五個地點通過（迷霧草原不通過）；rel 0 只有迷霧草原通過；rel −1 沉沒神殿、星殞高原、世界盡頭通過，雷鳴峽谷、熔火荒原不通過。

Task 3 路線通關時間（種子 20261021，模擬分鐘，0 次被拒，6 條路線都清完 6 個地點、迷霧全開；時間只印報告）：

| 路線 | 迷霧草原 | 雷鳴峽谷 | 熔火荒原 | 沉沒神殿 | 星殞高原 | 世界盡頭（全清） |
|---|---|---|---|---|---|---|
| 火 | 5.7 | 7.3 | 13.0 | 49.7 | 53.9 | 61.4 |
| 風 | 10.0 | 11.0 | 13.6 | 45.4 | 48.4 | 51.6 |
| 雷 | 5.1 | 7.4 | 9.4 | 39.4 | 44.7 | 51.2 |
| 土 | 6.6 | 8.6 | 13.1 | 45.5 | 52.6 | 56.1 |
| 水 | 3.8 | 5.5 | 8.1 | 39.5 | 44.1 | 49.4 |
| 混合 | 16.7 | 17.7 | 22.5 | 45.6 | 49.9 | 53.3 |

（調整前：前四魔王 69.5～119.3、全部 ≤ 211.8。）每個地點 1.0～36.8 分，沉沒神殿 23.1～36.8 分最長（原因沒有查）。刷稀有（只印報告）：火 38、風 15、雷 27、土 100、水 83 分。`tier-curve` 四項 0 條未通過；自創 Lv.9／稀有兩兩組合超標 21／66（只印報告，之前 22）。
- Task 3: minor (deferred): 雷鳴峽谷調整後一般魔物血量 180～306，比迷霧草原的 210～420 還低（防禦較高，所以低階魔法仍打不動）；看起來怪，但不影響規則。
- Controller Ruling C3（2026-10-28，使用者選「維持現狀並先試玩」）: 保留 Task 3 的血量係數、不重調；(1) `touched` 不算被拉怪效果（`zone` 且 `pull > 0`：流沙、天穹風暴、斷空裂風、絕空裂風、蒼穹之息…）拉到停止圈的魔物，只算走進來的，C2（整段含暖機）不變；(2) 把關改成：rel 0 場上 10～35；rel +1 碰線 ≤ 2 且清場 > 50%，迷霧草原例外只要求 rel +1 場上 < rel 0 場上；rel −1 場上 > 同地點 rel 0 場上；`ENFORCE_CROWD = true`；(3) 改完仍不通過的列不再放寬，記錄下來；(4) 使用者試玩時要看「同階偏簡單」與低一階魔法能清掉前面地點（雷鳴峽谷、熔火荒原）。規格 4.3 加了同日修訂說明。
- Task 3 Ruling T3d: 「被拉」的判斷 = 這一步之前（`battle.fx`）或之後（`r.battle.fx`）魔物在任一個 `pull > 0` 的 `zone` 效果的拉力範圍內（`radius × ZONE_REACH + 魔物半徑`，和引擎 `within` 相同），那一步就不算碰線；同一隻魔物之後自己走到線上（不在拉力範圍內）仍會算 — 用效果範圍而不是速度判斷，因為拉力是直接改位置（不是 `kx/ky`），沒有速度可看；`ZONE_REACH` 改成從 `combat.ts` export（只加 export，數值不變）— 若錯：拉力範圍內剛好自己走到線上的魔物會少算。
- Task 3 Ruling T3e: 修正後仍不通過的兩列在 `crowd.test.ts` 以 `KNOWN_GAPS` 跳過並印出（不放寬門檻）：迷霧草原 rel 0 場上 39.2（> 35）、雷鳴峽谷 rel −1 場上 12.7（≤ rel 0 的 18.1）— 依 C3 第 3 點 — 若錯：這兩列之後要靠重調或改門檻處理。

Task 3 碰線修正後（CROWD_OPTS；ENFORCE_CROWD = true；場上、清場不變，只有碰線改變）：
```
mist_meadow       rel  0 (Lv.2, 5 spells) 場上 39.2；碰線 102.0；15 秒清場 0%     ← 已知缺口（> 35）
mist_meadow       rel  1 (Lv.3, 5 spells) 場上 17.1；碰線 6.0；15 秒清場 40%      （例外：17.1 < 39.2 通過）
thunder_gorge     rel -1 (Lv.3, 5 spells) 場上 12.7；碰線 20.5；15 秒清場 40%     ← 已知缺口（≤ 18.1）
thunder_gorge     rel  0 (Lv.4, 11 spells) 場上 18.1；碰線 32.0；15 秒清場 9%
thunder_gorge     rel  1 (Lv.5, 11 spells) 場上 5.3；碰線 0.0；15 秒清場 55%
ember_wastes      rel -1 (Lv.5, 11 spells) 場上 31.7；碰線 0.0；15 秒清場 18%
ember_wastes      rel  0 (Lv.6, 6 spells) 場上 27.6；碰線 7.3；15 秒清場 33%
ember_wastes      rel  1 (Lv.7, 6 spells) 場上 3.9；碰線 0.0；15 秒清場 67%
sunken_temple     rel -1 (Lv.6, 6 spells) 場上 73.1；碰線 32.5；15 秒清場 0%
sunken_temple     rel  0 (Lv.7, 6 spells) 場上 13.6；碰線 0.0；15 秒清場 17%
sunken_temple     rel  1 (Lv.8, 5 spells) 場上 9.3；碰線 0.0；15 秒清場 60%
starfall_plateau  rel -1 (Lv.7, 6 spells) 場上 78.9；碰線 39.3；15 秒清場 0%
starfall_plateau  rel  0 (Lv.8, 5 spells) 場上 16.6；碰線 0.0；15 秒清場 20%
starfall_plateau  rel  1 (Lv.9, 5 spells) 場上 11.3；碰線 0.0；15 秒清場 60%
worlds_end        rel -1 (Lv.8, 5 spells) 場上 78.6；碰線 52.5；15 秒清場 0%
worlds_end        rel  0 (Lv.9, 5 spells) 場上 15.4；碰線 10.5；15 秒清場 40%
worlds_end        rel  1 (Lv.10, 7 spells) 場上 6.1；碰線 0.0；15 秒清場 71%
```
修訂後的把關：17 列中 15 列通過，2 列是已知缺口（上面標示）。
- Task 3: minor (deferred): `crowd.test.ts` prints a console.warn per KNOWN_GAPS row every run (test noise, deliberate).
- Task 3: minor (deferred): a KNOWN_GAPS row that starts passing is not flagged as stale.
- Task 3: minor (deferred): `inPull` ignores knockback / `METEOR_PUSH` (correct, not pulls) — deserves a one-line comment.
- Task 3: complete (commits 196cbf6..852aacb, review clean; 2 KNOWN_GAPS rows per Ruling C3)
- Task 4 (畫面確認, headless Chrome, 無程式變更): sunken_temple，Lv.7 墜日 60 秒場上 40～55 隻（預期 10～35，偏多）；切到 Lv.8 赤獄焚城後 15 秒內 37→17→16→4→16→15 隻、最後截圖只剩魔王 1 隻（預期 <= 5，未穩定達到，約 15）。DPS 4,534 / 3,457（千位數，符合）；無頁面錯誤。種的：新遊客存檔的 learned、equipped、currentZone、unlockedZones、revealed（本機 D1）；實際操作：開戰 60 秒、點技能樹節點與氣泡「裝備」換魔法、再戰 15 秒；怪數用 React fiber 讀 runtime snapshot。細節見 `.superpowers/sdd/2026-10-28-crowd-ttk/task-4-report.md`。
