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
