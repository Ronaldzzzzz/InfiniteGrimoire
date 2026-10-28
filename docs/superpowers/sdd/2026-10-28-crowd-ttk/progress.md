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
