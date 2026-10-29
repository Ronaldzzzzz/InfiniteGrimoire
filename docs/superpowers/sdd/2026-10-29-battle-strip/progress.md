# SDD ledger — plan: docs/superpowers/plans/2026-10-29-battle-strip.md
Spec: docs/superpowers/specs/2026-10-29-side-scroll-battle-strip-design.md. Branch feat/battle-strip from main fe2a1bb.

## Preflight scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1→T3 | stages.ts (WALK_MS, BOSS_LIMIT_MS, stageTotal, minStageMs, isBossStage) | consistent |
| T1→T4 | old zone fields kept in T1, removed in T4; 0007 literal has zoneKills in T1, regenerated in T4 | consistent |
| T2→T3 | spawnPoint; T2 keeps timer spawning, T3 replaces | consistent |
| T2/T3→T7 | sim suites break once geometry/boss trigger change; T2 says skip crowd/tier-curve, T4 says bot must not throw | gap: pure-paths/rare-cost depend on zoneKills progression from T3 on → R0 |
| T3→T4 | T3 stops boss trigger by killsForBoss but audit boss-too-fast still uses killsForBoss until T4 | only sims affected (covered by R0); unit audit tests unchanged until T4 |
| T3→T5 | createBattle(zone, stage, {held}), enterStage, stage events | consistent; T3 touches runtime only for the signature |
| T4→T5 | ActionPayloads.stageClear in sync.ts (T4), claimStage (T5) | consistent |
| T4→T6 | BossCounter returns null (T4), deleted (T6) | consistent |
| T5→T6 | travel(zone, stage), enterBoss, setAutoAdvance, autoAdvance, lastResult | consistent |
| T6 | makeArena(w, h) drops maxFoeR | battle-view callers updated in same task; ok |
| T7 | stageTime/stageReport; values need user confirmation | stop point inside T7 by Global Constraints (user decision) |
| T8 | docs + acceptance | ok |
| T9 | gated on user discussion | → R1 |
| each task self-consistency | tests vs code vs files | T1–T8 agree with themselves |

- Ruling R0: from Task 2 until Task 7, any tests/sim suite (crowd, tier-curve, pure-paths, rare-cost, measure) that breaks because of the geometry/stage change may be `describe.skip`ped with a "Task 7 rewrites" note; Task 7 must restore every one — why: the bot and measurements are rewritten once in Task 7, partial patches would be thrown away — cost if wrong: no sim coverage of the anti-cheat between Task 2 and Task 7 (unit audit/worker tests still run).
- Ruling R1: run the final whole-branch review after Task 8; Task 9 (offline income) starts with the user discussion when the branch is presented — why: Task 9 step 1 is a user decision, the four-stop rule — cost if wrong: offline income lands in a later branch.
Task 1: dispatched (BASE fe2a1bb, implementer a91ca2366c35e87c2, sonnet)
Task 1: implemented e857713 (DONE_WITH_CONCERNS: no separate RED run; old d1 migration tests bounded to their own range); review dispatched af4faff6fa87505c2 sonnet
Task 1: minor (deferred): 0004 migration test asserts via toMatchObject + undefined-keys string; a hard-coded literal would be clearer
Task 1: minor (deferred): stage count 10 hard-coded in persist.ts MAX_STAGES and content.ts .length(10)
Task 1: minor (deferred): zones.json one-number-per-line (~1,450 lines)
Task 1: note: currentStage vs clearedStages is checked by Task 4 audit (plan)
Task 1: complete (commits fe2a1bb..e857713, review clean)
Task 2: dispatched (BASE e857713, implementer a77a84c5e5a4c079d, sonnet)
Task 2: implemented 17e3ac0 (concerns: extra clamp x>=STOP_X+radius; pack spawns individual spawnPoint; crowd+tier-curve skipped R0)
Task 2: minor (deferred): combat.test.ts unused `dist` helper; test title still says "engage radius"
Task 2: minor (deferred): moveFoe `inView || f.x <= RIGHT_X` needs a comment; blind foes beyond RIGHT_X can drift in y until they enter view
Task 2: minor (deferred): battle-view.ts / arena.test.ts stale "stop ring" names (Task 6 redraws)
Task 2: Ruling: keep the extra in-view clamp x >= STOP_X + radius — stops blind/pull from carrying foes through the mage, spec 3.2 "怪不會穿過小人" — cost if wrong: none observed
Task 2: complete (commits e857713..17e3ac0, review clean)
Task 3: dispatched (BASE 17e3ac0, implementer ac3343dfe6b49e46d, sonnet)
Task 3: implemented a79da1b (concerns: createBattle opts.content; held only on boss stage; pure-paths routes, rare-cost, 2 measure tests skipped R0; worker honest-play helper advances stages)
Task 3: ⚠️ crowd.test.ts resolved: skipped under R0 since Task 2
Task 3: minor (deferred → Task 5 dispatch): runtime calls createBattle without { content: this.content }; createBattle defaults to shipped content
Task 3: minor (deferred): boss-stage test lacks WALK_MS-gap and boss-alone assertions; measure.ts double quotes; unknown defId would leave killed < total
Task 3: complete (commits 17e3ac0..a79da1b, review clean)
Task 4: dispatched (BASE a79da1b, implementer acdbb94d6abc52dc0, opus)
Task 4: implemented 429973a (concerns: boss min-time waived when anchor already in boss stage; GM boss_ready max(old,9); messages.ts texts; claim spam bounded only by minStageMs; bot lacks stage-clear → Task 7)
Task 4: Ruling: keep the boss min-time waiver when the anchor already stands on the boss stage — without it a real boss kill right after an anchor advance is rejected and counted suspicious; clearedStages >= 9 (server-owned) and canDamage still apply — cost if wrong: a client can claim a boss kill in 0 ms once it has legitimately reached stage 10 (security-good-enough)
Task 4: Ruling: GM boss_ready uses max(old, stageCount-1) — never lowers a GM's own progress — cost if wrong: none
Task 4: minor (deferred → final fix wave): claimStage does not require zoneId === state.currentZone nor that a learned spell can damage the zone's monsters; adding both narrows no-fight claim farming
Task 4: minor (deferred): audit.ts exports killRate with no users
Task 4: note for Task 5: the claim request carries the uploaded state, so defeatedBosses from the boss kill is in the same request (no ordering issue)
Task 4: note for Task 7: bot must call /api/stage-clear (plan Task 7 step 3 says so)
Task 4: complete (commits a79da1b..429973a, review clean)
Task 5: dispatched (BASE 429973a, implementer aaaa3aef53b0f90d4, sonnet)
Task 5: implemented b57c68f (concerns: claim reply replaces inventory; lost claim → currentStage > highestPlayable → upload rejected; claimStage returns ActionResult|null)
Task 5: review: Needs fixes — Important: advancing past the frontier before the server accepts the claim turns a lost/refused claim into an audit rejection on the next honest upload (can mark suspicious)
Task 5: Ruling: overrides my dispatch resolution "still moves on per auto-advance" — when the cleared stage was the frontier, a claim that does not end 'cleared' clamps the runtime back to min(currentStage, highestPlayable(local game)) (rebuild that stage), and doUpload always sends currentStage clamped to highestPlayable — spec: honest players must never be rejected (AGENTS.md 6) — cost if wrong: a lost claim replays the frontier stage
Task 5: Ruling: lastResult 'cleared' gains `pending: boolean` (true until the reply; refused/lost → kind 'unclaimed' or pending false with loot []) so Task 6 can tell pending/refused/nothing dropped — load-bearing for Task 6
Task 5: ⚠️ api.ts resolved: stageClear client was added in Task 4
Task 5: Ruling: lastResult is not cleared on auto-advance (notice must show); cleared on travel/enterBoss/rebuild — brief said "換關時清掉" — cost if wrong: a stale notice for ~3 s
Task 5: minor (deferred): claim-reply adopt overwrites drops gained during the round trip (same as other actions)
Task 5: minor (deferred): sync subscribes onEvents in constructor, so stop()/start() loses claims; 409 during claim drops the clear; runtime tests write real ig.autoAdvance
Task 5: fix round 1/5 (2 addressed, 0 open — frontier clamp on unsettled claim + clamped uploads; lastResult pending/claimed; commits b57c68f..178c33b)
Task 5: minor (deferred): an unrelated action reply while a frontier claim is pending can roll the local stage back to the frontier early (conservative)
Task 5: note for Task 6: LastResult = { kind:'cleared'; zoneId; stage; loot; pending; claimed } | { kind:'failed'; zoneId; stage; backTo } | null; render "not saved" for !pending && !claimed; claimStage returns Promise<ActionResult|null>
Task 5: complete (commits 429973a..178c33b, review clean after 1 fix round)
Task 6: dispatched (BASE 178c33b, implementer a41a9a9c18b28eef6, sonnet)
Task 6: implemented 1d21bd2 (concerns: lane margin 3px; effect circles of radius*0.75w overflow 180px strip; added boss banner; zone.order as 1-x)
Task 6: ⚠️ effect overflow resolved by reviewer: canvas sized to strip + overflow hidden (shapes crop; cosmetic, Task 7 radii)
Task 6: Ruling: at 601–1099 px the strip flows at the end of the page and may be off-screen — spec 1 wants it visible while researching; fix in the final fix wave (fixed/sticky bottom at all widths below the desktop grid) and check in Task 8 browser acceptance — cost if wrong: one CSS rule
Task 6: minor (deferred): 一網打盡 and boss banners can overlap on a 140 px strip; boss banner replays on mount mid-boss; unused ZONE_STATUS_LABEL; dead .boss-counter CSS
Task 6: complete (commits 178c33b..1d21bd2, review clean)
Task 7: Ruling: implementer commits calibrated values as proposals; controller shows the table to the user at branch hand-off instead of blocking mid-plan (Global Constraints: user confirms balance finals) — cost if wrong: one more balance commit
Task 7: dispatched (BASE 1d21bd2, implementer af5a1a1431966c441, opus)
Task 7: implemented df9b94a (concerns: +1 tier gate misses mist/ember/temple → KNOWN_GAPS; tier-curve 52 failures listed as KNOWN_GAPS; kill rate 140–245/min; worker test gap computed from minStageMs)

## Task 7 measurements (proposals, user to confirm)
| stage | wave size | waves (ratio to stage 5) |
|---|---|---|
| 1–3 | 15 | round(N5 × (0.9 + 0.2·(s−1)/8)) |
| 4–6 | 16 | same |
| 7–9 | 17 | same |
| 10 (boss) | 16 | round(N5/3) waves of adds, then the boss |

| zone | rel −1 | rel 0 (home) | rel +1 | boss kill, home tier (s from arrival) |
|---|---|---|---|---|
| mist_meadow (Lv.2) | 3.08 min (×1.23) | 2.50 min | 2.11 min (×0.84) ⚠ | 12.2 |
| thunder_gorge (Lv.4) | 3.16 (×1.26) | 2.50 | 1.60 (×0.64) | 16.7 |
| ember_wastes (Lv.6) | 4.07 (×1.63) | 2.50 | 2.41 (×0.96) ⚠ | 21.1 |
| sunken_temple (Lv.7) | never (cannot damage) | 2.50 | 2.11 (×0.84) ⚠ | 23.1 |
| starfall_plateau (Lv.8) | never | 2.55 | 1.79 (×0.70) | 21.9 |
| worlds_end (Lv.9) | never | 2.52 | 1.75 (×0.69) | 28.5 |

| route | full clear (sim min) | per zone | stage clears | boss failures | rejected |
|---|---|---|---|---|---|
| fire | 107.8 | 13.1 / 9.4 / 25.4 / 19.7 / 16.9 / 23.4 | 60 | 0 | 0 |
| wind | 101.9 | 12.1 / 21 / 24 / 18.3 / 11.3 / 15.1 | 60 | 0 | 0 |
| thunder | 117.8 | 15.3 / 16.5 / 26.2 / 21 / 16.6 / 22.2 | 60 | 0 | 0 |
| earth | 134.4 | 15.1 / 9.7 / 29.7 / 26.9 / 17.3 / 35.8 | 60 | 0 | 0 |
| water | 83.4 | 16.7 / 13.1 / 14.3 / 13.7 / 10 / 15.6 | 60 | 0 | 0 |
| mixed | 115.9 | 14.3 / 14 / 26.6 / 19.6 / 17 / 24.4 | 60 | 0 | 0 |

Task 7: minor (deferred): tier-curve KNOWN_GAPS prefixes ignore direction/magnitude (52 rows can worsen unchecked); stage-time known-gap rows assert nothing (keep +1 ≤ home)
Task 7: minor (deferred → final fix wave): bot.ts can resend stage-clear forever when a non-200 reply lacks state; boss-retry/stage-9 path never exercised
Task 7: note for user: kill rate 140–245/min roughly doubles drops and settlement loot; full clear 83–134 sim min (was ~50); tier-curve 52 known gaps on the lane
Task 7: complete (commits 1d21bd2..df9b94a, review clean)
Task 8: dispatched (BASE df9b94a, implementer a983ddb926bb29670, sonnet)
Task 8: implemented b261907 (acceptance done; BLOCKING: strip off-screen at 601–1099 px → final fix wave; found: after a boss kill auto-advance stays on X-10 held instead of moving to the next zone's 1 → final fix wave; foes ~60 px overlap/crop on strip → final fix wave (cosmetic))
Task 8: Ruling: the spec ❌ (acceptance report not under docs/superpowers/sdd/2026-10-29-battle-strip/) and the AGENTS.md housekeeping minors go to the final fix wave together with the blocking CSS fix, since AGENTS.md will be edited again there — cost if wrong: none (same edits, one pass)
Task 8: minor (→ final fix wave): section 3 heading date 2026-10-28; stale 3.0 bullets on walkedTouch/crowd gates/KNOCK_MAX_R; "Task 8 已完成" wording; server currentStage still 10 after a boss timeout (uninvestigated)
Task 8: complete (commits df9b94a..b261907, 1 routed to final fix wave)
Final review: dispatched (fe2a1bb..b261907, a66793244be868d73, opus)
Final review: Needs fixes before merge — Important: strip off-screen 601–1099 px; boss kill does not advance to next zone; stage-clear farmable without being able to damage the zone. Plus minors routed.
Final: Ruling: server currentStage staying 10 after a boss timeout is not a bug — currentStage is client-owned and uploaded every 30 s; a reload in that window lands on X-10 held — cost if wrong: none
Final: Ruling: spec 3.5 "擊殺數相符" is not implemented; stage-clear is bounded by time (tooFast) plus the new cannotDamage check — the server cannot see battles; a cheater can claim ~6× faster than honest play (25 s vs 150 s on 1-1), acceptable under "security good enough" — cost if wrong: farmed settlement loot
Final: Ruling: zoneId === currentZone is added as planned but is not a real guard (the client rewrites currentZone in the claim's sendState); the cannotDamage check is the real one
Final: minor (deferred): action replies (synthesize etc.) can pull the local stage back to the one at send time
Final: minor (deferred): sim never exercises boss failure → stage 9 retry (runtime unit tests cover it)
Final fix wave: dispatched (BASE b261907, af3e181b06530a7fb, opus) with final-findings.md items 1–9
Final fix wave: done — 464d4dc strip fixed at <=1099px (body padding 180px; tests/ui/layout-css.test.ts) and foe room on the lane (FOE_MAX_R_H 0.12, y-only squeeze yScale so x = 1 stays on the right edge; arena.test.ts)
Final fix wave: done — f441cbd boss kill with auto-advance moves to the next unlocked zone at highestPlayable (last zone / auto off: X-10 held; runtime.test.ts 3 tests, sync.test.ts boss-claim tests); SyncController subscribes battle events in start() (stop/start test)
Final fix wave: done — 4e497ae stage-clear rejects 'elsewhere' (zoneId != currentZone) and 'cannotDamage' (equipped spell at its level cannot damage every zone monster), order locked → elsewhere → notReached → cannotDamage → tooFast → bossAlive; messages.ts texts; stage-clear.test.ts + worker 422 test
Final fix wave: done — f83ee02 removed killRate, ZONE_STATUS_LABEL, .boss-counter; combat test title; bot replays the stage after a stateless refusal; stage-time known gaps assert rel+1 <= home
Final fix wave: npm test 73 files 835 tests pass (no suite skipped, sims 0 rejections); npm run build passes; items 1 and 4 not re-checked in a browser
Ruling: final-fix: strip uses position: fixed, not sticky (html/body overflow-x: hidden makes body a non-scrolling scroll container, so sticky would not stick)
Ruling: final-fix: foe room uses a y-only scale (Arena.yScale) because a uniform scale with 0.12h room would move x = 1 to 1080 px on a 1280x180 strip
