# SDD ledger — plan: docs/superpowers/plans/2026-11-03-magic-circle-polish-2.md
Spec: docs/superpowers/specs/2026-11-03-magic-circle-polish-2-design.md. Branch feat/magic-circle, start 90b53e9.

## Preflight scan
| Pair / task | Shared | Finding |
|---|---|---|
| T1→T2 | OfflineResult none variants (+zoneId on cannotDamage) | consistent after plan fix |
| T3→T5 | RuneWheel locked items 「？」 | T5 must keep T3 behaviour; plan says so |
| T3→T7 | App.css (reduced-motion removed, new effect CSS) | no conflict; T7 must not re-add reduced-motion |
| T6↔T7 | CircleTable.tsx (layout vs run/timing) | sequential, no interface conflict |
| T7→T8 | CircleFxApi, RevealKind | consistent |
| T4 | EquipToasts only | self-consistent |
| T1 | tests list vs spec 5 | consistent; open away at clear subtracted |
| T6 | failChance/circleCost signatures not named | implementer reads circle-synth.ts |
| T9 | acceptance | consistent |
Ruling: none needed at preflight.
Task 1: dispatched (base 90b53e9, implementer sonnet)
Task 1: implemented 9c53b3f (DONE_WITH_CONCERNS: no clean RED; reload claim now sets offlineUntil/pausedMs)
Task 1: minor (deferred): offline.ts !(per>0) guard now labels tooShort (dead path)
Task 1: minor (deferred): reload claim (awayAt=0) adds up to ~30 s online time to pausedMs, slightly under-records next clear (floored by minStageMs)
Task 1: minor (deferred): pausedMs uncapped (reset each clear; OFFLINE_CAP_MS still applies)
Task 1: complete (commits 90b53e9..9c53b3f, review clean)
Task 2: dispatched (base 9c53b3f)
Task 2: implemented ac4ab63; Ruling: claimOffline reports tooShort first when the away is under one OFFLINE_TICK_MS, before notCleared/cannotDamage — otherwise a new player sees a no-income card on every load — costs: none if wrong (card text only)
Task 2: ⚠️ App.tsx wiring checked by controller: generic (setAwayReport/mergeReports/AwayReport), no kind assumption — OK
Task 2: minor (deferred): OfflineReport notCleared hand-written instead of Extract; `as OfflineReport` cast in sync listener; test cast noise
Task 2: complete (commits 9c53b3f..15caa4f, review clean)
Task 3: dispatched (base 15caa4f)
Task 3: implemented 8597387
Task 3: minor (deferred): RareReveal embers JSX over-indented after guard removal; locked-rune test accepts aria-disabled too
Task 3: complete (commits 15caa4f..8597387, review clean)
Task 4: dispatched (base 8597387)
Task 4: implemented b35516a..3260ebe (toast fixed above strip, bottom 188px / phone 148px)
Task 4: review: Needs fixes — Important: phone toast overlaps KeyItemBar row; toast may cover prediction under the paper on stacked layouts
Ruling: toast stays centred just above the battle strip (spec 7 「長帶上方正中間」); the strip's top centre is taken by .stage-result, so it does not move inside. The prediction overlap is accepted: the toast lasts only 3 s and is checked in Task 9 screenshots. Costs if wrong: a small CSS move after the user plays.
Task 4: fix round 1 dispatched: lift toast above key-bar row (all widths where they share the row), strip-height CSS variables replace 188/148 literals, layout test ties toast bottom to strip height
Task 4: fix round 1 implemented fd9a0b9..2fd0638 (--strip-h/--key-row-h 56px estimate)
Task 4: fix round 1/5 (2 addressed, 0 open; commits 3260ebe..2fd0638)
Task 4: minor (deferred): --key-row-h 56px assumed; key-bar wraps could overlap toast — check in Task 9
Task 4: minor (deferred): layout-css phone test's toast line now duplicates the banner check (stale name); body padding 180px and away-report-backdrop 180px still literals
Task 4: minor (deferred): EquipToasts setBar in effect cleanup also fires on unmount
Task 4: complete (commits 8597387..2fd0638, review clean after 1 fix round)
Task 5: dispatched (base 2fd0638)
Task 5: implemented b39baf3
Task 5: minor (deferred): RuneIcon calls useArt per instance (12 per band + wheel), repeated 404 probes while art absent; 「？」 probes rune-locked.webp needlessly — cache by src / skip for null
Task 5: minor (deferred): no test that band/wheel switch to <image>; rune-dash is full circle; placeholder stroke may be thin at 14 px — check visually in Task 9
Task 5: complete (commits 2fd0638..b39baf3, review clean)
Task 6: dispatched (base b39baf3)
Task 6: implemented c0ba95d (concerns: phone band ~41px < 44px button; side threshold uses 64vh art width)
Task 6: review: spec ❌ — Important: seal row overlaps .parchment on sheets < ~386 px (517 with reason)
Ruling: resolve by moving the circle up inside the sheet (just below the top roll) so the band under it grows to ~0.35W, keep the circle size, keep the row on the sheet above the bottom roll; add a narrow-sheet geometry test — keeps spec 4.1 (button on the paper, circle unchanged) — costs if wrong: the circle sits off-centre on the paper (cosmetic)
Task 6: fix round 1 dispatched
Task 6: fix round 1 implemented 5558d1e
Task 6: fix round 1/5 (2 addressed, 0 open; commits c0ba95d..5558d1e)
Task 6: minor (deferred): layout test hard-codes 44px button + 15px reason; 10% bottom anchor vs art roll not checked visually (Task 9); aside+p double aria labelling; side threshold uses 64vh art width
Task 6: complete (commits b39baf3..5558d1e, review clean after 1 fix round)
Task 7: dispatched (base 5558d1e, implementer opus)
Task 7: implemented f0d172e
Task 7: minor (deferred): CSS sparks keep moving during the on-time 0.3 s pause (freeze only under .hold); PAUSE_MS unused, CSS hard-codes 90%; CSS orb vanishes on abort instead of fading; charging {ms} always PROGRESS_MS (dead flexibility); .parchment.success animation overrides reveal-great gold edge
Task 7: complete (commits 5558d1e..f0d172e, review clean)
Task 8: dispatched (base f0d172e, implementer opus)
Task 8: implemented 803bc45
Task 8: ⚠️ tex.destroy after app.destroy unverified — carried to Task 9 browser check (unmount with console open)
Task 8: minor (deferred): partial init (generateTexture throw) leaks app/canvas; first cast: Pixi init during charge → particle charge starts late, drifts from CSS; no tests for destroy-before-init / calls-before-init; no resolution/autoDensity (soft on Retina); non-mutation reveal snaps charge particles
Task 8: complete (commits f0d172e..803bc45, review clean)
Task 9: dispatched (base 803bc45)
Task 9: implemented 52f653d (acceptance: 5 problems listed, none fixed)
Task 9: review Needs fixes (stale AGENTS.md 3.0: reduced-motion note, confirm-spec step + 草稿, optional-Pixi wording, 46 s vs 36 s; minors: pausedMs reset clause, 390 fx evidence) — fix round 1 dispatched; final review dispatched in parallel on 90b53e9..52f653d (code unchanged by the docs fix)
Task 9: fix round 1 implemented 6412e17
Task 9: fix round 1/5 (6 addressed, 1 open — AGENTS.md:73 still 「決定要不要做 Pixi 特效層」; commits 52f653d..6412e17)
Ruling: fold the one-phrase AGENTS.md:73 leftover into the final fix wave instead of a second Task 9 round — docs only, nothing builds on it — costs if wrong: none
Task 9: complete (commits 803bc45..6412e17, 1 carried to final fix wave)
Final review: With fixes→ready (0 Critical, 0 Important, 8 Minor); final fix wave dispatched (base 6412e17) with: resolution/autoDensity, --key-row-h 64, AGENTS.md:73, orb fade on abort, spark freeze at pause, predict note circuit-ok line, RuneIcon art probe cache/skip null, partial-init cleanup, multi-away chained test
Final fix wave: implemented 607a133
Final fix wave: re-review all 9 addressed, 0 new Critical/Important (minor: useArt src-change lag); branch ready
