# SDD ledger — plan: docs/superpowers/plans/2026-10-30-strip-feel-and-offline.md
Spec: docs/superpowers/specs/2026-10-29-side-scroll-battle-strip-design.md §3.8, §3.9. Branch feat/battle-strip, start f46aa87.

## Preflight scan
| Rows | Produces / consumes | Finding |
|---|---|---|
| T1 self | constants + waves + stage-time test + content test | consistent; T1 changes stage times that pure-paths/rare-cost only print — ok |
| T1↔T2 | T2 claimStage clear times use minStageMs (WALK_MS unchanged in T1) | ok |
| T2 self | tests cover offlineStage/claimOffline/offlineLoot/markAway; files list persist/audit/stage-clear/inventory | ok; "never pays key items" test needs stub content — allowed |
| T2↔T3 | T3 consumes markAway, claimOffline(state, prevSavedAt, now, content, rng), OfflineResult; serverAction apply widened | ok |
| T2↔T4 | T4 consumes OfflineResult, AWAY_DELAY_MS | ok |
| T3↔T4 | routes /api/away, /api/offline; response {result,state,revision} | ok |
| T3 self | tests use seeded clearTimes in save — needs store seeding helper (exists in app.test) | ok |
| T4 self | after hidden-only revision: no pause, StageBar untouched | ok |
| T5 self | docs only | ok |
Ruling: none needed at preflight.
Task 1: dispatched (base f46aa87, implementer sonnet)
Task 1: review — spec ✅, quality not approved (1 Important: GAP_SLACK x1.15 loosens known-gap check; 3 minor)
Task 1: Ruling: stage-time known gaps — replace the blanket GAP_SLACK x1.15 with a per-row recorded ceiling (each KNOWN_GAPS row stores its measured up/home ratio; assert up/home <= recorded + 0.03) — slower foes make walk-in dominate so rel+1 is genuinely not faster in 5 zones (mist x1.00, ember x1.07, sunken x1.10, starfall x0.79, worlds_end x0.76); a blanket slack hides regressions, a per-row ceiling keeps them pinned and visible to the user — cost if wrong: the user wants rel+1 clearly faster now, which needs monster HP retuning (out of this plan).
Task 1: known tier-curve gaps added (from report): sunken Lv.7->Lv.8 crowd x2.05 (limit 2.0); 岩槍 Lv.2 +49 = 905 vs Lv.3 median 844 (x1.07).
Task 2: Ruling: engine tests live next to the code (src/engine/*.test.ts), not tests/engine — plan paths were guesses; offline tests go to src/engine/offline.test.ts — cost if wrong: none.
Task 1: fix round 1/5 (2 addressed, 1 minor open — zone-pull bound STOP_X+radius+0.09 is 0.03 wider than reviewer wants; commits af186dc..51325f8)
Task 1: minor (deferred): src/engine/combat.test.ts:292 zone-pull bound includes foe radius (0.28 vs suggested STOP_X+0.09=0.25)
Task 1: complete (commits f46aa87..51325f8, review clean on Important; 1 minor deferred)
Task 2: dispatched (base 51325f8, implementer sonnet)
Task 2: Ruling: worker/app.ts baseline overlay of the 3 new fields done in Task 2 (needed for sim 0 rejections) — Task 3 keeps it — cost if wrong: none.
Task 2: review — spec ✅, quality needs fixes (1 Important, 5 minor). ⚠️ "never paid twice depends on when awayAt clears" — resolved by controller: claimOffline resets awayAt to 0 in both outcomes (brief rule), and Task 3 tests "offline twice pays once".
Task 2: Ruling: clear-time pollution after away/offline (Important) — claimStage measures the interval from max(lastClearAt, offlineUntil) and records nothing while awayAt > 0 — away/offline time must not count as a stage clear, else the next offline window pays ~1 run; cost if wrong: a stage cleared right after a long idle (no away signal) still records a long time, which only lowers income (safe direction).
Task 2: minor (deferred): offline.ts <-> stage-clear.ts import cycle (function-scope only).
Task 2: fix round 1/5 dispatched re-review (commits a85a2ae..2ec0f0a)
Task 2: fix round 1/5 (5 addressed, 0 open; commits a85a2ae..2ec0f0a)
Task 2: complete (commits 51325f8..2ec0f0a, review clean)
Task 3: dispatched (base 2ec0f0a, implementer sonnet)
Task 3: review — spec ✅, approved (0 Critical/Important)
Task 3: minor (deferred): worker tests only cover offlineUntil forgery, not awayAt/clearTimes; no worker test for the 8 h cap or awayAt vs savedAt after an intervening PUT (engine tests cover the cap); no recorded RED run.
Task 3: minor (deferred): a modified client polling /api/offline while playing gets 50% for the gap since its last save — controller note: uploads every 30 s and clear-time medians are minutes, so floor(gap/per) is 0 in honest-geometry play; bounded, accepted under "security good enough".
Task 3: complete (commits 2ec0f0a..4bbd84c, review clean)
Task 4: dispatched (base 4bbd84c, implementer sonnet)
Task 4: review — spec ✅ with ⚠️ (card backdrop fixed inset 0 covers the strip's stage info); quality needs fixes (2 Important, 5 minor)
Task 4: ⚠️ resolved by controller as a real gap: brief says the card is "over the main UI, not over the strip's stage info" — enters fix loop.
Task 4: minor (deferred): merged reports sum awayMs and OR capped (two 5 h absences show 10 h without cap line); no strict RED record.
Task 4: fix round 1/5 (6 addressed, 0 open; commits b1f8bc0..285f478)
Task 4: minor (deferred): a refused / 400 offline claim stays pending and is re-sent every 60 s tick (harmless, server refuses each time).
Task 4: minor (deferred): boot test restarts the same controller after stop() (relies on start() resetting stopped).
Task 4: complete (commits 4bbd84c..285f478, review clean)
Task 5: dispatched (base 285f478, implementer sonnet)
