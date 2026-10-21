# SDD ledger — plan: docs/superpowers/plans/2026-10-21-mvp-core-loop.md

Spec: docs/superpowers/specs/2026-10-21-infinite-grimoire-design.md
Branch: feat/mvp-core-loop (merge base main = 0a51834)

## Preflight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 ↔ T8 (worker/app.ts) | T1 `createApp({})` health test; T8 redefines AppDeps | T1 health test breaks when AppDeps gains required fields → ruling R1 |
| T1 (tsconfig) | DOM app + Workers code in one `tsc --noEmit` | type lib conflict (DOM vs workers-types) → ruling R2 |
| T1 ↔ T14 (wrangler.jsonc) | T1 placeholder database_id; T14 fills real id | needs a concrete placeholder → ruling R3 |
| T3 ↔ T6/T7/T8/T9/T10 (GameState) | same shape everywhere | consistent |
| T3 ↔ T7 (elementEquivalent) | defined T3, used T7 | consistent |
| T4 ↔ T8/T9/T12 (synthesize/SynthResult) | engine fn used by server; result type to client & messages | consistent |
| T5 ↔ T7 (boss min time) | killsForBoss × spawnIntervalMs | consistent |
| T5 ↔ T9/T11 (STEP_MS, BattleState, BattleEvent) | consistent |
| T6 ↔ T8 (parseState) | server parses uploads, rejects (no filtering) | consistent |
| T7 ↔ T8/T10 (validateUpload) | consistent |
| T9 ↔ T12 (AuthError) | T9 comment mentions AuthError, not in Produces; T12 needs it | → ruling R4 |
| T9 ↔ T12/T13 (runtime.equip, sync.synthesize) | consistent |
| T11 (Pt type) | `Pt` used, never defined | → ruling R5 |
| T12 ↔ T8 (display name 1–16) | consistent |
| T14 Step 5 (deploy) | outward-facing publish | stop & ask user before deploy (stop class) |
| T1..T14 each self-consistent | tests vs code vs files checked | no other contradictions found |

Ruling R1: T8 must update T1's health test to pass full test deps (MemoryStore etc.) — AppDeps becomes required by spec of T8 — cost if wrong: one test rewrite.
Ruling R2: use TS project references: `tsconfig.app.json` (src/**, DOM lib, excludes worker), `tsconfig.worker.json` (worker/** + src/engine/** + src/data/**, lib ES2022 + @cloudflare/workers-types, no DOM), root `tsconfig.json` references both; build script `tsc -b && vite build` — Global constraint says engine must not use DOM, this enforces it — cost if wrong: config churn.
Ruling R3: wrangler.jsonc database_id placeholder `"00000000-0000-0000-0000-000000000000"` until T14 — local D1 works keyed by binding — cost if wrong: local dev rename.
Ruling R4: T9 `api.ts` exports `class AuthError extends Error {}` thrown on 401 — T12 depends on it — cost if wrong: trivial.
Ruling R5: T11 defines `export interface Pt { x: number; y: number }` in effects.ts — cost if wrong: trivial.

## Progress
Task 1: dispatched (base fcd44c1, implementer agent a06232362b204be89, sonnet)
Task 1: verified ⚠️ items myself: npm test 6/6, build ok, versions vite 8.3.4 / vitest 5.0.5 / ts 7.0.2
Task 1: minor (deferred): package.json npm-init leftovers (description blurb, keywords, author, ISC license vs repo LICENSE)
Task 1: minor (deferred): worker/app.ts inert eslint-disable comment
Task 1: minor (deferred): vite.config.ts not type-checked by any tsconfig
Task 1: note: cloudflare() vite plugin skipped when process.env.VITEST set (conflict with vitest)
Task 1: complete (commits fcd44c1..ea883a7, review clean)
Task 2: dispatched (base ea883a7, implementer a3aa0576f0ce19b4f, sonnet)
Task 2: minor (deferred): data.ts ITEM_RE hardcodes element names instead of ELEMENT_ORDER
Task 2: minor (deferred): "unknown drop item" test uses malformed id; unregistered mat:foo drop passes silently
Task 2: minor (deferred): extra validations (dup ids, chainCount, bossId flag, max<min, order sort) untested; no checks for dup zone order / boss in monsters list / prereq cycles
Task 2: minor (deferred): monsters.json cinder_wisp named 餘燼火靈 but element thunder
Task 2: minor (deferred → Task 10): grade-2 fire/water only drop in zone 3; mana_crystal 4-5% in zone 2 — tune in Task 10
Task 2: complete (commits ea883a7..179711f, review clean)
Task 3: dispatched (base 179711f, implementer a17db09d5fda154a0, sonnet)
Task 3: ⚠️ resolved: gameData exported & zones[1] exists (Task 2 data, 41 tests passed)
Task 3: minor (deferred): no direct test for mixed-element 0.9 affinity precedence
Task 3: minor (deferred): createInitialState throws on empty zones (static data, acceptable)
Task 3: complete (commits 179711f..15b9595, review clean)
Task 4: dispatched (base 15b9595, implementer a3f761d5aa9d610bd, sonnet)
Task 4: minor (deferred): outcome spellId missing from data treated as no-prereq (data validated elsewhere); duplicate comboKey recipes → last wins (no uniqueness check)
Task 4: minor (deferred): no tests for 0/3 inputs, repeated attempts accumulation
Task 4: note: implementer commit trailer says Claude Sonnet 5.5 (subagent's own attribution reminder) — Ruling: leave trailers as each agent's harness set them — accurate attribution of who wrote the commit — cost if wrong: cosmetic history
Task 4: complete (commits 15b9595..53eeaee, review clean)
Task 5: Ruling: ActiveStatus gains optional dps (burn) ; spawn never faster than 1/spawnIntervalMs (anti-cheat bound T7) ; castTimer capped at cooldown when idle — brief silent on these, T7 depends on spawn bound — cost if wrong: small battle refactor
Task 5: dispatched (base 53eeaee, implementer af93450fb26bb5fdf, sonnet)
Task 5: review: Important 1 = spawn-rate bound untested. Ruling: promote reviewer Minor 3 (normal kills during active boss accumulate zoneKills → next boss spawns instantly) into the fix loop — it lets legit play beat T7's boss min-time bound → false anti-cheat rejections — cost if wrong: small extra fix
Task 5: minor (deferred): spawned monster moved same step (x=0.995 vs boss x=1); missing tests for burn/freeze/beam/nova/immune-under-chain; bossActive stuck if bossId missing; comment on max(1,…)
Task 5: fix round 1/5 (1 addressed, 1 open — boss-first same-step ordering still counts leftover kills; commits 924a5d3..cfcf1ff)
Task 5: fix round 2/5 (1 addressed, 0 open; commits cfcf1ff..294625e)
Task 5: minor (deferred): battle.test.ts boss-step helper duplication
Task 5: complete (commits 53eeaee..294625e, review clean)
Task 6: dispatched (base 294625e, implementer a76177dce0c32f6d3, sonnet)
Task 6: minor (deferred): grade regex char class breaks at MAX_ELEMENT_GRADE ≥10; mat id excludes digits; __proto__ probe nominal; unchecked cast
Task 6: Ruling: Task 8 server rejects request bodies > 64 KiB (413) — parseState arrays/records are unbounded (reviewer minor 3) — cost if wrong: legit saves later exceed limit, raise it
Task 6: complete (commits 294625e..31ffaba, review clean)
Task 7: Ruling: maxGain allows floor(maxKills/killsForBoss)+1 boss drops per zone (plan said "once") — a long window can legitimately contain several bosses → avoid false rejections — cost if wrong: slightly looser bound
Task 7: dispatched (base 31ffaba, implementer ac0ad1121406eb7d1, sonnet)
Task 7: review: Needs fixes — Important 1 zones unlocked in same upload give no bound (false rejection); Important 2 tests don't isolate locked-zone rule / boss-hittability gate / per-monster max / multi-zone max / tolerance boundary
Task 7: Ruling: maxGain gains optional 4th param `zoneIds?: string[]` (default prev.unlockedZones); validateUpload passes prev.unlockedZones ∪ zones unlocked by validated new bosses; bound = max single-zone bound + for each other considered zone a maxAlive-kill burst of that zone's per-kill max; also reject shrinking defeatedBosses — honest zone-switch mid-window must pass (anti-goal) — cost if wrong: looser bound
Task 7: fix round 1/5 (3 addressed, 1 new open — other-zone burst omits boss drops; commits 847859c..a3578b7)
Task 7: fix round 2/5 (1 addressed, 0 open; commits a3578b7..c284e42). Re-reviewer slack doubt resolved by controller: limit = 188×1.25+6 = 241 ≥ 230, without fix 168×1.25+6 = 216 < 230
Task 7: minor (deferred): two adjacent identical canHit(boss) blocks in maxGain could merge; non el:/mat: item prefixes unvalidated
Task 7: complete (commits 31ffaba..c284e42, review clean)
Task 8: Ruling: wrangler assets.binding ASSETS + run_worker_first ["/api/*"] — SPA fallback could otherwise shadow API routes — cost if wrong: config tweak
Task 8: Ruling: synthesize = validate upload → synthesize → single commitSave (one revision bump) — plan silent on revision count — cost if wrong: client revision bookkeeping
Task 8: dispatched (base c284e42, implementer a6559e6df04cfc2d7, sonnet)
Task 8: review (opus): Needs fixes — Important 1 concurrent test doesn't exercise CAS (probe: removing CAS still passes); Important 2 elapsedMs uncapped (skip GET → 8h window = de facto offline income)
Task 8: Ruling: cap elapsedMs at MAX_ELAPSED_MS = 120_000 (4× the 30s upload interval) in PUT and synthesize — MVP has no offline income and honest clients pause when disconnected — cost if wrong: honest upload after >2min gap gets a tighter bound (excess rejected, state rolled back to server)
Task 8: minor (deferred): commitSave+recordSynthesis not atomic; body read before size check when Content-Length forged; displayName lacks control/zero-width filtering; createApp per request
Task 8: fix round 1/5 (3 addressed, 0 open; commits e65345d..8f100b8)
Task 8: minor (deferred): elapsed-cap test PUT only (no synthesize variant); D1Store paths beyond guest/GET/PUT unexercised against real D1
Task 8: complete (commits c284e42..8f100b8, review clean)
Task 9: Ruling: api.ts adds ApiError (400/413) + upload opts {keepalive}; SyncController adds onAuthError; interval-upload ok only bumps revision — plan silent — cost if wrong: small interface churn in T12
Task 9: dispatched (base 8f100b8, implementer af4baa703f590576d, sonnet)
Task 9: review: Needs fixes — Important 1 offline retry deadlocks on ApiError/AuthError; Important 2 synthesize dropped silently while upload in flight
Task 9: minor (deferred): setRevision not monotonic; api.ts untested; 2xx bad JSON → NetworkError; listeners not isolated; synth reply lost on network → result not shown
Task 9: fix round 1/5 (3 addressed, 0 open; commits 2aaea3e..4aa09d1)
Task 9: note → Task 12: sync.synthesize can still throw ApiError — UI must catch and show a message
Task 9: complete (commits 8f100b8..4aa09d1, review clean)
Task 10: dispatched (base 4aa09d1, implementer a378cc2363da4075e, sonnet)
Task 10: implementer concerns: validator boss min-time ignores carried zoneKills (false rejects; worked around with ash_volcano killsForBoss 18); boss immune → normals stop spawning → softlock in zone
Task 10: Ruling: fix validateUpload boss time = Σ max(0, killsForBoss − clamp(prev.zoneKills[z],0,killsForBoss)) × spawnIntervalMs (first new boss per zone; full killsForBoss for each further one), and bound zoneKills growth per zone (≤ floor(elapsed/interval)+maxAlive, ×tol+slack) since zoneKills is client-owned — honest play must not be rejected (anti-goal) — cost if wrong: looser bound
Task 10: Ruling: normal monsters keep spawning while a boss is active (boss not counted in maxAlive); kills during boss still don't count — unbeatable boss otherwise freezes all farming in the zone, contradicting spec "打不動的地點只能慢慢磨" — spawn-rate bound unchanged — cost if wrong: battle rule revert
Task 10: sent concerns back to implementer before review (correctness)
Task 10: Ruling: accept implementer deviation — zoneKills stays at killsForBoss while boss alive, resets on boss defeat (needed for carried-kill credit to work) — side effect: leaving mid-boss and returning respawns boss on next normal kill — cost if wrong: minor UX oddity
Task 10: note → Task 12: UI should hint "打不動魔王時可以回到前一個地點" (bot needed retreat rule)
Task 10: review (opus): Needs fixes — Important 1 zoneKills growth bounded per-zone only and allowed in locked zones → pre-inflate all zones, then 3 bosses in 1s (exploit verified)
Task 10: minor (deferred): bot skips validate on synth & uses fixed 30s elapsed (reviewer re-ran server-faithful bot: 0 rejections); mana_bolt test outcome decided by bot entry rule; unused results Map / duplicate bot runs; single seed in tests; cinder_wisp element change is semantic not numeric (accepted per controller dispatch)
Task 10: fix round 1/5 (3 addressed, 0 open; commits 4c7adb2..6f756d9) — original exploit re-run: rejected
Task 10: minor (deferred): bounded leak — zone chain-unlocked in same upload can get zoneKills growth while boss time is counted against the same elapsed (≈1 upload of time, ≤2× in MVP); fix: subtract boss minMs from weighted budget
Task 10: complete (commits 4aa09d1..6f756d9, review clean)
Task 11: Ruling: effects.ts has no pixi import (node tests); visual Step 5 deferred to Task 12/14 real App — no harness yet — cost if wrong: visual bugs found later
Task 11: dispatched (base 6f756d9, implementer af86e7f74153d7ca3, sonnet)
Task 11: minor (deferred): app.init rejection unhandled (no WebGL); events before init / same-frame spawn+die dropped; hard-coded colors bypass COLORS; immune text wiring untested (visual check in T12/14)
Task 11: complete (commits 6f756d9..8546282, review clean)
Task 12: Ruling: itemName() display names (初階火…, 魔晶); synth throw → 連線異常，請稍後再試; HUD boss hint when boss undamageable; visual browser check done by controller after implementation — plan silent on item names / needs browser — cost if wrong: copy tweaks
Task 12: dispatched (base 8546282, implementer aa04a33c64fc48665, sonnet)
Task 12: review: Needs fixes — Important 1 token wiped on any non-network loadSave failure (only AuthError should clear)
Task 12: minor (deferred): overflow-x hidden masks overflow; equip select relies on runtime.equip validation
Task 12: fix round 1/5 (2 addressed, 0 open; commits 0c8bbcb..7ae6c7a); retry button verified at src/main.tsx:87
Task 12: visual check NOT done — Chrome extension not connected and controller's background dev server unreachable from shell; Ruling: defer visual 1280/360/offline check to user at finish — cost if wrong: layout bugs surface later
Task 12: complete (commits 8546282..7ae6c7a, review clean)
Task 13: dispatched (base 7ae6c7a, implementer a90a04ed0b52cd8ac, sonnet)
Task 13: minor (deferred): no tests for T4/T5 positions, drag-guard sequence, equipped style, zoom clamp; no onPointerCancel; stale hint after learning; passive wheel may scroll page; aria-label omits equipped; no pinch
Task 13: complete (commits 7ae6c7a..47bbea5, review clean)
Task 14: Ruling: implementer does Steps 1-3 + 6 only; Step 4 browser play-through and Step 5 Cloudflare login/deploy are left to the user (no browser; deploy is outward-facing) — cost if wrong: none
Task 14: review: Needs fixes — Important: doc claims fx sprites are tinted per element, code doesn't tint
Task 14: Ruling: add tint in code (fxSprite tinted with spellColor) rather than drop the claim — 4 shared fx textures must serve 5 elements + hybrids — cost if wrong: one-line revert
Task 14: fix round 1/5 (3 addressed, 0 open; commits 9ebf93b..d8b6d47)
Task 14: minor (deferred): fx_beam prompt contains an engineering note inside the prompt text
Task 14: complete (commits 47bbea5..d8b6d47, review clean)
Final review: dispatched (range 0a51834..d8b6d47, opus, agent a754db670c881caf1)
Final review (opus): No — Critical 1 parseState requires defeatedBosses to be zone ids but engine stores boss monster ids → every upload 400 after first boss (verified via real app probe); Critical 2 per-upload constants not amortized → high-frequency uploads gain ~100× (verified); Important 3 non-network upload failures silent; Important 4 README claims rankings/cross-device; Important 5 visual check not done
Final: Ruling: anti-cheat uses an anchor window — saves gain anchor_state/anchor_at (migration 0002); gains/zoneKills/boss-time validated against base = anchor state with current server-owned fields (learned, synthesisLog) overlaid, elapsed = min(now − anchor_at, 180_000); anchor advances to the accepted state when now − anchor_at ≥ 60_000; immutability checks (learned, synthesisLog, defeatedBosses not shrinking) vs current save; GET touch removed — per-upload constants granted once per anchor, honest synth right after upload stays valid — cost if wrong: anti-cheat window semantics change
Final: Ruling: sim bot must go through real createApp + MemoryStore with a fake clock (HTTP JSON, PUT + synthesize endpoints) — closes the gap that hid Critical 1 — cost if wrong: slower sims
Final: Ruling: visual 1280/360/offline check handed to the user (no browser available to controller)
Final: fix wave dispatched (base d8b6d47, opus, agent a70c2c5cf8a786b28)
Final: Ruling: accept fixer deviation — base does NOT overlay current defeatedBosses (stricter: post-anchor bosses re-timed against anchor; sims 0 rejections); defeatedBosses non-shrink still checked vs current — cost if wrong: possible false reject in an edge case not covered by sims
Final: fix wave re-review: 7/7 findings addressed & probed (Critical 1 e2e 200s; adversary 3000×100ms → ~1× honest 5-min bound; D1 SQL CAS + anchor ok)
Final: residual (Important, load-bearing): within one anchor window a client can restore consumed synth inputs in the next PUT (baseline = anchor inventory) → unlimited re-rolls with the same materials (probe: 10 synths for 2 elements). Ruling: not fixed in this wave (no second wave per process); surface to user; suggested fix = apply each synthesis's net inventory delta to anchor_state in the same CAS + regression test (restore-after-synth PUT → 422)
Final: user approved fixing residual synth re-roll; resumed fixer a70c2c5cf8a786b28 (base 8c87449)
Final: residual fix df2ca9e (anchor inventory charged with synth net delta, negative = debt); 203 tests pass
Final: residual fix re-review (opus): ADDRESSED — negative anchor counts never hit parseState; delta covers all result kinds; D1 single-statement CAS; sims 0 rejections
Final: minor (deferred): worker restore-attack test (a) depends on 100 ms timing + current data numbers — may get brittle after rebalancing
Final: review clean. Records copied to docs/superpowers/sdd/ for handoff (user request: multi-machine / multi-agent continuity)
