# SDD ledger — plan: docs/superpowers/plans/2026-10-23-v2b-rare-discoveries.md

Spec: docs/superpowers/specs/2026-10-23-v2b-rare-discoveries-design.md
Branch: feat/v2b-rare-discoveries (from feat/core-rework 3f44110; merged main ca839da for the spec and plan → 51628f4)
Briefs / reports / review packages: .superpowers/sdd/2026-10-23-v2b-rare-discoveries/ (git-ignored scratch)

Ruling: ledger in docs/ (project convention), scratch in the git-ignored workspace; the controller created the branch (Task 1 Step 0) — cost if wrong: none.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | 5 recipes + Lv.5 base spells → bot cost measurement | consistent |
| T1 → T4 | `Spell.rare` → synthesize onCommit | consistent |
| T3 → T4 | `recordDiscovery`, `recentDiscoveries`, `DiscoveryRow` → app | consistent |
| T4 → T5 | `SynthResult.learned.rare` (crafting.ts), `GET /api/discoveries` shape → api.ts | consistent |
| T5 → T6 | `rare` on learned results → altar/App | consistent |
| T6 → T7 | refresh callback slot in App → `useDiscoveryFeed().refresh` | consistent |
| T6 ↔ altar-data | `revealOf` returns null for rare learned | consistent with SynthesisAltar's null-reveal path (must still clear slots + onResult) |
| T1 self | "existing unchanged" test needs a snapshot taken before editing the JSON | noted |
| T2 self | if a route exceeds 120 min the plan says mark the test `it.skip` and report | see Ruling P1 |
| T3 self | MemoryStore can't race; D1-only race test in tests/d1 | consistent |
| T4 self | `rare` type lives in the engine's SynthResult though only the worker sets it | see Ruling P2 |
| T5–T7 self | consistent |
| T8 self | weights raised only inside the acceptance script's server instance, never committed | consistent |

Ruling P1: Task 2's `it.skip` on a ceiling breach is a deliberate hold for the user's decision (spec 2.1), not a vacuous test — the controller records the numbers as an open question — cost if wrong: a skipped test until the user decides.
Ruling P2: `rare?: { first: boolean }` is added to the engine `SynthResult` type (shared by worker and client) even though only the worker fills it — one shared result type is simpler than a worker-only wrapper — cost if wrong: an optional field the engine never sets.

## Tasks
Task 1: implemented cf95d0e (base 51628f4), DONE (rare on NamedSpellDef not Spell; content-baseline.json snapshot added; one known app.test load flake on first run, re-run green)
Task 1: review spec ✅ (⚠️ layout/depth covered by reported layout test + green sim), quality Needs fixes — Important: ninefold_thunder ≈1.33× its Lv.7 (storm weighting `/10` fudge in the balance test hides it).
Ruling: the reviewer's Minor "hints name the exact Lv.5 spell and grade" is promoted into the fix round — the feed broadcasts hints and spec 2.1 + the anti-goal forbid publishing recipes — cost if wrong: vaguer hints than intended.
Task 1: minor (deferred): balance heuristic ignores field/burn damage (worldfire dps not comparable); 1.1–1.3 test band looser than 15–20%.
Task 1: minor (deferred): content-baseline.json fixture lives in src/engine (could sit next to the test).
Task 1: fix round 1/5 (2 addressed, 1 open — hints use 「極」 (grade-4 name) for a grade-3 recipe and worldfire still names 煉獄; commits cf95d0e..3d43afd)
Task 1: fix round 2/5 (1 addressed, 0 open; commits 3d43afd..a74300b)
Task 1: minor (deferred): hints still paraphrase input names closely (「真空裡的刃」≈真空刃); no test locks the no-grade-word rule in hints.
Task 1: complete (commits 51628f4..a74300b, review clean)
Task 2: implemented 82fbbec (base a74300b), DONE_WITH_CONCERNS — farm time per rare spell (seed 20261021, rate over 30 min after the Lv.5 spell): fire 139, wind 167, thunder 158, earth 211, water 183 sim-min — all over the 120 ceiling; five tests it.skip per plan.
OPEN QUESTION FOR USER (spec 2.1 cost check): every element exceeds 120 sim-minutes to farm one rare spell (139–211). Options to raise at the end: accept; raise the weight (e.g. 1:39 ≈ 40 tries, below the user's 50–80); or lower the per-attempt cost. Remaining tasks don't depend on it, so execution continues.
Task 2: review spec ✅, quality Approved; measurement verified correct (drops only, grade-weighted, per-minute samples, 30-min window after the Lv.5 spell). Note: it's the bot's own route rate, not a best-zone farm rate.
Task 2: minor (deferred): fallback start sample overcounts if the base spell were learned before minute 1 (theoretical); `it(name, options, fn)` order deprecated — switch when un-skipping.
Task 2: complete (commits a74300b..82fbbec, review clean)
Task 3: implemented ca8a70a (base 82fbbec), DONE (unique-hit detection matches /constraint|unique/i on the error message)
Task 3: review spec ✅, quality Approved; regex risk checked — other constraint errors re-throw on the identical fallback insert, nothing swallowed.
Task 3: minor (deferred): narrow the unique-hit regex to /UNIQUE constraint failed/i; stray blank line in MemoryStore fields; race test is pre-insert, not truly concurrent (index guarantees it).
Task 3: complete (commits 82fbbec..ca8a70a, review clean)
Task 4: implemented c9c588a (base ca8a70a), DONE (/api/discoveries auth via ACTION_PATHS list)
Task 4: review spec ✅, quality Approved; named risks checked: ACTION_PATHS only drives auth; onCommit only used by synthesize; client cannot forge `rare`.
Task 4: minor (deferred): rename ACTION_PATHS (now includes a GET feed) to AUTH_PATHS or give the feed its own auth line.
Task 4: minor (deferred): no test for the commitSave CAS-failure 409 right before onCommit (code path is safe by reading).
Task 4: minor (deferred): a throw in recordSynthesis/recordDiscovery after commit turns a successful learn into a 500 — consider try/catch falling back to rare.first=false (final review to triage).
Task 4: complete (commits ca8a70a..c9c588a, review clean)
Task 5: implemented 14c9353 (base c9c588a), DONE
Task 5: review spec ✅, quality Approved. ⚠️ SynthResult.rare added in Task 4 (crafting.ts) — verified; 401→AuthError via existing request() — covered by the new test.
Task 5: minor (deferred): `after` not guarded against NaN/non-integers in the URL; parser accepts negative/fractional id/at.
Task 5: complete (commits c9c588a..14c9353, review clean)
Task 6: implemented ceb013f (base 14c9353), DONE (hint read from NamedSpellDef; altar needed no change; skip-to-title keeps the 4 s clock)
Task 6: review spec ✅, quality Approved; queue/equip-once, callback stability and timer cleanup checked.
Task 6: minor (deferred): hint is fully readable only ~850 ms before the 4 s auto-close (0.55 s fade delay; synthetic italic on CJK) — candidate for the final fix wave.
Task 6: minor (deferred): RareReveal not memo'd (re-renders on every drop via App's whole-game subscription; animations don't restart); no focus trap / focus not returned on close; tab-switch mid-reveal untested; hint read through a cast.
Task 6: complete (commits 14c9353..ceb013f, review clean)
Task 7: implemented 991920e (base ceb013f), DONE (api/online kept in refs to stop a refetch loop; own finds matched by displayName)
Task 7: review spec ✅, quality Approved. ⚠️ parseDiscoveries whitelists five fields — confirmed by the Task 5 review.
Ruling: a 401 during feed polling is swallowed (list kept) — the read-only feed shouldn't own the token; the next sync upload hits the same 401 and runs the existing clear-token flow (AGENTS.md: guest token cleared only on 401) — cost if wrong: up to 30 s before a dead session is noticed.
Task 7: minor (deferred): latest-id written inside a setState updater; no 401 or duplicate-id merge test; "N 分鐘前" stale between renders; first visit (no key) counts every existing find as unread.
Task 7: complete (commits ceb013f..991920e, review clean)
Task 8: implemented 2e8c7a5 (base 991920e), DONE — browser items 6/7/8 pass (two contexts); roll landed by temporarily setting worldfire weights 1000:1 locally, reverted (verified recipes.json clean); 0005 kept 26 saves
Task 8: review spec ✅, quality Approved.
Task 8: minor (deferred): AGENTS.md §10 new entry sits above the "最新的放最上面" line; §9 roadmap still lists B as upcoming; §3 todo-2 forward-looking suggestion.
Task 8: complete (commits 991920e..2e8c7a5, review clean)

## Final review (3f44110..58b2e28, opus): With fixes — Critical 1
- C1: the new spell+element rare recipes give free retries after the first miss — the fall-through-duplicate branch in crafting.ts refunds the first item, which is the only item consumed (fused = false, no fusion cost); a rare costs ~2 高階 + ~65 requests. Breaks spec §2 per-attempt cost and R14/R14b; also makes the farm-time open question moot until fixed.
- Must-fix minors: post-commit throw → 500 (try/catch discovery part, fall back to rare.first=false); AGENTS.md §10 ordering and §9 roadmap; docs wording around the farm-time item.
Ruling: the fix wave also takes the Task 6 hint-readability minor (shorter fade delay, no synthetic italic) and two prelaunch-checklist lines (strip control/bidi chars from display names before launch; a future `players` rebuild must handle the discoveries FK) — cheap and visible to the user's playtest — cost if wrong: a slightly larger fix diff.
Ruling: other final-review minors stay deferred: feed `after` returns the latest 20 not "all since" (client caps at 20 anyway); RareReveal above OfflineOverlay; DiscoveryBell not memo'd; suspicious-after-the-fact keeps first slot; polling while the tab is hidden — cost if wrong: polish debt recorded here.
Final fix wave: commits 58b2e28..1d28cc5 (6ffd540 engine: a missed rare roll always spends its element; c9ad6ed discovery write failure no longer fails a committed learn; fd91fca reveal hint readable; 1d28cc5 docs + prelaunch items); scoped re-review: 4/4 addressed, no new breakage.
Ruling: a roll that lands on an already-known rare spell is a named duplicate that refunds the element — free but grants nothing (no learn, no discovery row), the server picks the outcome, and changing it would alter deterministic spell+element recipes — cost if wrong: pointless re-rolls are slightly cheaper.
Task 2 numbers remain valid after the fix: they measure the drop-income rate, not the (previously broken) per-attempt charge.
Controller verified: npm test 53 files passed / 1 skipped, 526 passed / 5 skipped; npm run build exit 0.
OPEN QUESTION FOR USER still stands (farm time 139–211 sim-min vs 120).
