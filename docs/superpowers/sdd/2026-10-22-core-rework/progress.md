# SDD ledger — plan: docs/superpowers/plans/2026-10-22-core-rework.md

Branch feat/core-rework from main b9e74db. Spec: docs/superpowers/specs/2026-10-22-core-rework-design.md.

## Pre-flight scan
| Rows | Produces vs consumes | Found |
|---|---|---|
| T1→T2 | ITEM_ID_RE (el 1-5, mat:, key:) used by content schemas | consistent |
| T2→T3 | Content, Spell, Material, Effect, baseSpells | consistent |
| T3→T4 | craftedId, inputToken, resolveSpell, HARD_MAX_DEPTH | consistent |
| T4→T5 | synthesize opts.depthCap ← depthCap(state,content) | consistent (caller passes) |
| T3→T5 | spellAtLevel, MAX_SPELL_LEVEL, attackCeiling | consistent |
| T5→T6 | passiveBonuses | consistent |
| T2→T4 | named spell `depth` values needed by T4 fusion-cost rule | T2 brief lacks values → Ruling R1 |
| T6→T7 | combat.stepBattle, BattleState used by bot | consistent |
| T2→T7 | first zone mist_meadow in initial state / migration literal | consistent |
| T2→T7 | thunder_gorge tiers 3-4 so mana_bolt is immune (sim test) | consistent |
| T7→T8 | API endpoints / ActionOutcome; T8 deletes validate.ts (T1 edits it earlier) | consistent |
| T1 self | tests vs code | consistent |
| T2 self | content.test cases vs minimal content | consistent |
| T3 self | ceiling test "some layer exceeds named max" needs CEILING_FACTOR>1 | consistent (1.25) |
| T4 self | fire_tornado test expects fusion cost; rule 2 now says fusion cost applies to named spell+spell | consistent after plan fix |
| T5 self | ember_affinity in region outer | consistent with T2 |
| T6 self | immune test needs tier-4 monster | consistent with T2 gorge |
| T7–T12 self | — | consistent |

Ruling R1: T2 minimal content sets named depth: mana_bolt, mana_overload and base spells 0; self and dual spells (incl. fire_tornado) 1 — plan T4 rule 2 defines this scale — cost if wrong: re-tune data depths.
Task 1: dispatched (BASE b9e74db, implementer sonnet)
Task 1: complete (commits b9e74db..f66c58e, review clean)
Task 1: minor (deferred): validate.ts keyOf ignores key: ids (old validator; audit.ts in T7 must bound key: gains)
Task 1: minor (deferred): gradeValue/upgradeElement give NaN for out-of-range grade (unreachable: schemas limit 1-5)
Task 1: minor (deferred): report lacks captured RED output
Task 2: dispatched (BASE f66c58e)
Task 2: review Approved (0 Critical/Important). 
Task 2: Ruling R2: Effect.status becomes `status?: StatusDef[]` (array) so one effect can apply several statuses (water_wave = slow + wet per spec 5.1) — plan's single StatusDef cannot express spec 5.1 — cost if wrong: one type change across T3/T6.
Task 2: parked — reviewer minor "el:water:2 / el:earth:2 never dropped, recipes unreachable" — Ruling: not a defect, grade-2 elements come from upgradeElement (3 × grade 1) — none.
Task 2: minor (deferred): knownItem accepts any el: prefix (ITEM_ID_RE guards ids); awkward unlock cast content.ts:1458; untested loader branches (unknown prerequisite, unknown zone boss, passive boss/learned), duplicate recipe input pairs unchecked
Task 2: fix round 1/5 (2 addressed, 0 open — R2 status arrays, water_wave slow+wet; commits 23634f3..c96add9)
Task 2: minor (deferred): non-array status test only checks an issue mentions 'fireball'
Task 2: complete (commits f66c58e..c96add9, review clean)
Task 3: dispatched (BASE c96add9)
Task 3: Ruling R3: backfire may be appended after the 4 behaviour effects (5 total) — brief order is truncate-then-append; backfire costs nothing at runtime — cost if wrong: one-line cap change
Task 3: review Needs fixes — Important: (1) c(mat|mat) yields zero-cooldown spell; (2) unsorted ids resolve (non-canonical). Ruling R4: c(mat:x|mat:y) resolves to null — spec 6.3 says material+material without recipe is "no reaction" — cost if wrong: none.
Task 3: minor (deferred): memo caches nulls/substrings without bound on adversarial ids; depth check after children resolve; thin coverage for spellAtLevel on chain/zone/meteor
Task 3: fix round 1/5 (2 addressed, 0 open — material-only ids null, canonical order enforced; commits 62768fa..af323f8). Controller checked craftedId uses `<=`, same comparator as derive's `ta > tb` guard.
Task 3: minor (deferred): right-side nested unsorted case not truly exercised; no positive test for c(fireball|fireball) or c(fireball|mat:ember_core)
Task 3: complete (commits c96add9..af323f8, review clean)
Task 4: dispatched (BASE af323f8)
Task 4: controller ran npm test twice → 389/389 both; unidentified earlier failure not reproduced (watch for flake)
Task 4: Ruling R5: `dormant` results are not written to synthesisLog — matches MVP synthesis.ts (dormant returned unchanged state) and avoids marking a combo as tried when nothing was spent — cost if wrong: one log line; B discovery record may want it.
Task 4: minor (deferred): no tests for dormant, crafted spell+spell fusion cost, named duplicate with two spell inputs, named recipe skipping grade check; grade parsed via split(':') instead of shared parser; no clean RED run
Task 4: complete (commits af323f8..4fdc557, review clean)
Task 5: dispatched (BASE 4fdc557)
Task 5: minor (deferred): empower trusts levels[] (negative level → free empower) and depthCap doesn't dedupe passives — T7 parseState must enforce levels int 1..50 and unique passives/revealed (carried into T7 dispatch); tests lack duplicate/unknown revealed
Task 5: complete (commits 4fdc557..8d51d12, review clean)
Task 6: dispatched (BASE 8d51d12, implementer opus)
Task 6: Ruling R6: haste and backfire act immediately and create no ActiveFx — brief says both "立即生效" — cost if wrong: renderer gets no fx for them (events cover backfire).
Task 6: Ruling R7: wet ×2 applies to lightning-shaped hits (chain hops, storm strikes, zone strikes) regardless of the spell's elements — spec 5.1 ties the bonus to lightning; those shapes are lightning — cost if wrong: small balance change.
Task 6: flake seen again (1 unreproduced failure in a full run) — must identify before final review.
Task 6: balance note: mana_bolt alone never kills mist_meadow boss in 1 h (T7/T9 tuning).
Flake hunt: 6 consecutive full runs 428/428 — not reproduced; likely load-dependent timing (both sightings were by implementers running other work concurrently). Keep watching; final review to note.
Task 6: review Needs fixes — Important: burn spread on death ignores canDamage (immune foes incl. boss take burn damage).
Task 6: minor (deferred): meteor delayMs 0 never lands; burn from 0-damage hit has power 0; densest cache may target a foe that died same step; retargeted bolt can "teleport"; no own tests for blades, blind, chain explode
Task 6: fix round 1/5 (1 addressed, 0 open — burn spread gated by canDamage; commits 302817c..b141744)
Task 6: minor (deferred): a foe already burning keeps its own burn tick after switching to a spell that cannot damage it
Task 6: complete (commits 8d51d12..b141744, review clean)
Task 7: dispatched (BASE b141744, implementer opus)
Task 7: Ruling R8 (implementer): key: items get no GAIN_SLACK allowance (materials keep 6) — a fog key must come from a real boss kill — cost if wrong: a legit edge-case upload with an extra key is rejected.
Task 7: Ruling R9 (implementer): a rejected action (insufficient, grade, …) is 422 that writes nothing and is not recorded as a cheating rejection — game-rule refusals are not cheating — cost if wrong: none for anti-cheat (uploads still audited).
Task 7: Ruling R10 (implementer): GainBound.materials renamed items (covers mat: and key:) — cost if wrong: naming only.
Task 7: sim (seed 20261021, sim minutes, 0 rejections): fire 1.2/4.1, wind 10.5/20.6, thunder 1.2/3.5, earth 4.0/8.5, water 2.0/8.1; mana_bolt-only meadow 109.1, gorge not cleared in 3 h. Local db:migrate:local not run yet (do in T8).
Task 7: review Approved (0 Critical/Important); reviewer agrees with R8–R10.
Task 7: Ruling R11: action-rejection 422 and audit 422 share reason 'rejected'; the client tells them apart by the body — `result` present = game-rule refusal (keep local state, show message), `reasons` present = audit rejection (adopt server state) — avoids a server change — cost if wrong: client could drop legit progress (covered by a T8 test).
Task 7: minor (deferred): maxKills ignores up to 1 + pack.size spawns already due at window start (absorbed by GAIN_TOLERANCE); action endpoints' forged-field tests only cover learned; pacing floor test dropped (re-add in T9); resolveSpell memo grows per upload
Task 7: complete (commits b141744..eb7de97, review clean)
Task 8: dispatched (BASE eb7de97, implementer opus)
Task 8: review Approved (0 Critical/Important).
Task 8: minor (deferred): sync.action ignores stopped flag; "Lv." shows tier in TopBar but empower level in messages (T11 must pick one); MAX_FLOAT_TEXTS can drop 「無效」; battle-view content lookups without hasOwn; unused wander + fx_* asset keys (T10); R11 tests written after impl
Task 8: complete (commits eb7de97..e855f3e, review clean)
Task 9: Ruling R12: pacing floor for T9 sim — each pure route clears all zones in 60–240 simulated minutes (spec 9: step 1 tuned for "一次遊玩數小時"; plan cap 4 h) — cost if wrong: retune numbers.
Task 9: dispatched (BASE e855f3e, implementer opus)
Task 9: sim (seed 20261021, all-zones clear in sim minutes, 0 rejections): fire 92.0, wind 111.8, thunder 90.2, earth 99.8, water 98.6, mixed 97.1 (seeds 7 / 99 also 90–116). tests/sim wall ≈30 s.
Task 9: Ruling R13 (implementer): key: drops ignore overlevel efficiency (combat.ts) — brief says each boss first kill must drop its key; an overleveled wind bot lost key:storm_heart — cost if wrong: one line.
Task 9: review Approved for content; Important (pre-existing engine rule exposed): random recipes retry free (crafted duplicate refunds everything).
Task 9: Ruling R14: when a named recipe's roll falls through (spellId null) to a crafted spell the player already knows, charge it like a named duplicate (refund only the first item input) — spec 6.5 "合了不一定成功" and 6.6 partial refund; plain crafted duplicates (no recipe) keep the full refund since they are deterministic — cost if wrong: one branch in crafting.ts.
Task 9: Ruling R15: promote reviewer minor "順風 deals no damage" into the fix — spec anti-goal "魔法換上去後戰鬥看起來差不多"; a same-element strengthening that does nothing reads as a downgrade — cost if wrong: wind route timing shifts.
Task 9: minor (deferred): 感電之海 hint mentions 大地; duplicate name words (雷鳴, 颶風); sim ~3 s per simulated hour; balance generator (SCALE table) not in repo
Task 9: Ruling R14b: on a failed random retry the fusion cost also stays paid (not refunded) — both random recipes are spell+material, so refunding the first item alone left the retry free — cost if wrong: retries cost more than intended.
Task 9: fix round 1/5 (2 addressed, 0 open — R14/R14b random retry charged, R15 tailwind blades; commits b90c806..c62ad25)
Task 9: minor (deferred): UI must not say "全部退還" for a fall-through duplicate (refunded lists one item)
Task 9: complete (commits e855f3e..c62ad25, review clean)
Task 10: dispatched (BASE c62ad25, implementer opus)
Task 10: perf (headless Chrome + swiftshader, 1280x900, sunken_temple crowd at maxAlive 80 + 雷火颶風 30 s): avg frame 19.7 ms, p50 16.7, p95 33.4, worst 66.7, 0 frames > 100 ms, PerfMeter 41–57 fps, 0 page errors. swiftshader is CPU rendering; no long stalls.
Task 10: review Needs fixes — Important: (1) area effects aimed at densest/random/strongest foes land off-screen (packs spawn at r=1, view shows ~|x|<=0.4); (2) 一網打盡 banner wider than view.
Task 10: Ruling R16: engine targeting for area effects (densest, random, strongest) only considers foes within ENGAGE_R = 0.4 of the centre, falling back to all foes when none are inside — spec §4.1/§5.3 the wipe must be seen; view-side clamping would draw where damage isn't — cost if wrong: re-tune; sims must stay 0 rejections within 60–240 min.
Task 10: minor (deferred): false multi-kill on catch-up (kill times stamped with render time); dead banner-y logic; small per-frame allocations; same-step field shows no wash; no test for fieldOverlay mode; immune texts capped at 24 with Text churn; fx_* sprite pipeline removed (not requested)
Task 10: fix round 1 (R16 ENGAGE_R=0.4 area targeting; banner fit) commit e7b9393; sim fire 90.4 wind 111.8 thunder 90.2 earth 126.6 water 96.9 mixed 93.2, 0 rejections
Task 10: fix round 1/5 (2 addressed, 0 open — R16 ENGAGE_R targeting, banner fits view; commits 21d3e6b..e7b9393)
Task 10: minor (deferred): multi-target densest/strongest may return fewer targets than n when the engaged set is small
Task 10: complete (commits c62ad25..e7b9393, review clean)
Task 11: Ruling R17: "Lv." keeps meaning spell/monster tier (TopBar, pickers, zone ranges already use it); empower level is shown as 「強化 +N」 (N = level − 1, hidden at level 1) everywhere incl. messages — avoids two meanings of Lv. — cost if wrong: label text only.
Task 11: dispatched (BASE e7b9393, implementer opus)
Task 11: review Needs fixes — Important: GrimoirePanel subscribes to inventory and NodeDetail to whole game → full SVG re-renders on every drop (undoes playtest perf fix; PerfMeter React 5-6/s idle).
Task 11: minor (deferred): keyMessage 「迷霧散開了」 never clears; overload has no banner; no back-to-back banner test; ⚠️ double-click guard relies on synthPending being set synchronously
Task 11: fix round 1/5 (1 addressed, 0 open — narrow selectors, Profiler test; commits 0226dee..3699262)
Task 11: complete (commits e7b9393..3699262, review clean)
Task 12: dispatched (BASE 3699262, implementer sonnet)
Task 12: minor (deferred): AGENTS.md §9 roadmap stale; ledger header vs AGENTS §3 branch origin wording; 一網打盡 banner not asserted in T12 run
Task 12: complete (commits 3699262..e101141, review clean)
Final review: dispatched (merge-base b9e74db, opus)
Final review: Critical 0, Important 1 (I1 random recipe free re-roll via outcome-dependent fusion cost: unaffordable outcome → rejected insufficient, nothing spent, retry), flake root cause found (App.test.tsx:52 findByRole 1000 ms default timeout under sim CPU load).
Final: Ruling: flake fix enters the fix pass with I1 — reviewer found its cause; a flaky gate erodes every later run — cost if wrong: one test option.
Final: minor (deferred): M1 learned-count passives count only named spells while UI text says 「學會 N 個魔法」; M2 balanced depth-5 crafted ids may exceed 512 chars → 「無法辨識」; M3 runtime.test real-time <50 ms assertion; M4 resolveSpell cache unbounded (consider LRU before launch)
Final: fix dispatched (BASE e101141)
Final: fixed I1 random recipe free re-roll — crafting.test "stock covering only one outcome is rejected on every seed" RED→GREEN, suite 443/443 ×3
Final: fixed flake App.test account dialog findByRole timeout 5000 — suite 443/443 ×3
Final: re-review — all findings addressed (commits e101141..b651a5a)
