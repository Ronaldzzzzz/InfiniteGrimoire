# Final review: strip feel + offline income (f46aa87..03d3f0b)

Reviewer: Claude Opus 5.5 (single pass over the diff package plus the surrounding code in worker/app.ts, src/game/sync.ts, src/game/loop.ts, src/ui/App.css). Engine/worker/game/ui suites re-run: 63 files, 787 tests pass.

## Strengths

- Server-owned fields are handled the right way: `clearTimes`, `awayAt` and `offlineUntil` are covered by the checkUpload baseline overlay (worker/app.ts:377-379), by audit equality (src/engine/audit.ts:158-160) and by zod defaults, so old saves parse without a migration and an upload cannot forge them (worker test `upload cannot set offline fields`).
- Offline loot goes through `serverAction`, so `chargeAnchor` adds it to the anchor in the same CAS; later uploads are not penalised and `audit.ts` did not need loosening. The worker test re-uploads after a payout and checks 0 rejections.
- Double pay is closed: `claimOffline` always zeroes `awayAt` and sets `offlineUntil = now` on payout; `start = max(awayAt | savedAt, offlineUntil, lastClearAt)` keeps online stage clears and earlier payouts out of the window (`offline twice pays once`).
- Key items never pay offline, the boss stage never pays, the 8 h cap is applied to counted time while the card still shows real time.
- Client pending logic is careful: a single pending slot where the claim replaces an unsent away, the claim is flushed before the periodic upload, the claim never throws, and the per-controller `stopped` flag stops a switched-out account.
- Ruling to replace the blanket GAP_SLACK with per-row recorded ceilings is the right call.
- The card backdrop leaves the bottom 180 / 140 px uncovered, which matches the strip at every width (≥1100 the app is 100vh with the strip last; ≤1099 it is fixed at the bottom).

## Issues

### Critical
None.

### Important

1. **The first clear after an offline payout records only the time after the player came back, so offline income can grow by up to about 10x in a normal play pattern** — src/engine/stage-clear.ts:84 (with src/engine/offline.ts:80).
   - What happens: after a payout, `offlineUntil = now` (the return time). The battle resumes in the middle of the stage the player left (the hidden tab paused it), so the next clear is recorded as `now − offlineUntil`, which is only the rest of that stage. The part played before leaving (`awayAt − lastClearAt`) is dropped.
   - Why it matters: with auto-advance the player is usually on the frontier stage when they leave. When they come back and finish it, its key gets a single short entry, and that stage becomes the new highest cleared stage, i.e. the next offline stage. The median of one short entry is that entry, floored only at `minStageMs` = waves × `WALK_MS` 1500 ms (about 15 s for a stage 9 that really takes about 180 s). The next 8 h window then pays up to about 12 times more runs. No modified client is needed: this is the ordinary "play, close at night, come back, finish the stage" loop, and doing it on purpose is easy.
   - Fix (cheapest): record nothing when `offlineUntil > lastClearAt`, the same way an away mark is treated. Exact alternative: store where the paid window started and record `(windowStart − lastClearAt) + (now − offlineUntil)`. Update the test `measures from offlineUntil after an offline claim` (src/engine/stage-clear.test.ts) to match.
   - Related: `minStageMs` is a physics floor for anti-cheat and gives almost no protection as an income floor. Consider also flooring the offline `per` at something closer to real time (see Minor 4).

### Minor

1. **The reconnect path uploads before it flushes a pending claim, so the window for a closed game can be lost** — src/game/sync.ts:183-190. If the claim at boot hits a network error, `resume` runs `doUpload()` first, which moves `savedAt` to now, and only then calls `flushPresence()`, so the claim pays nothing. A window that started with an away mark is not affected. Fix: call `flushPresence()` before `doUpload()` in the resume path, the same order as the periodic tick.
2. **A stale `awayAt` pays online time without stage clears.** Case: the player comes back and the claim never lands, for example the tab closes right after the return. The next claim then starts from the old `awayAt`, bounded only by `lastClearAt` / `offlineUntil`, so boss attempts or crafting time with no stage claim in between is paid as offline (8 h cap). src/engine/offline.ts:80. Fix: clear `awayAt` in `claimStage` and in the other server actions, or ignore an `awayAt` older than `savedAt` by more than the upload interval. The ledger's accepted note covers the modified-client version of this; this is the honest-client version. It is rare.
3. **`AGENTS.md:220` has a garbled sentence ("2026-10-29 橫向戰鬥帶量到2026-10-30 …"), and the 3.0 heading at `AGENTS.md:61` still says 2026-10-29.** These are deferred Task 5 minors, but AGENTS.md is the hand-off document. They are a one-line fix: fix them before merge.
4. **`WALK_MS` stayed at 1500 while `LANE_SPEED` dropped from 4 to 2.5**, so `minStageMs` is now an even looser floor. That is fine for anti-cheat (safe direction), but it is the only floor on the offline `per` (src/engine/stage-clear.ts:84). This is tied to Important 1.
5. The deferred ledger minors stay deferred: the import cycle; worker test gaps for `awayAt` vs `savedAt` across an intervening PUT and for the 8 h cap (worth one worker test when Important 1 is fixed); merged report `awayMs`/`capped`; a refused claim re-sent every tick; restarting a stopped controller; the 0.03 zone-pull bound.

## Deferred-minor triage (must fix before merge?)

| Ledger item | Before merge? |
|---|---|
| combat.test.ts:292 zone-pull bound | No |
| offline.ts ↔ stage-clear.ts import cycle | No (function-scope only; works) |
| worker tests miss `awayAt`/`clearTimes` forgery, cap, `awayAt` vs `savedAt` | No, but add one test together with the Important 1 fix |
| modified client polling /api/offline while playing | No (accepted; bounded) |
| merged reports sum `awayMs` / OR `capped` | No |
| refused/400 claim re-sent every tick | No |
| boot test restarts a stopped controller | No |
| AGENTS.md:220 garbled line, 3.0 date | **Yes** (one-line doc fix) |

## Declined to judge

- Balance of the proposed wave counts, the 1→3 min ramp and the known gaps (rel+1 not faster in 5 zones, tier-curve gaps): these are proposals for the user to decide, per spec §3.9.
- Pre-existing behaviour: a stage-clear claim checks only time, not kills, so a modified client can claim every `minStageMs/1.25`. Offline income amplifies this, but the root is outside this range and is covered by "security good enough".
- The away-report backdrop covers `.strip-float` (key item bar, equip toasts), which sit above the strip: an acceptable effect of a modal card.
- Local drops lost when `replaceState` adopts the server state after an away/offline round trip: the same as every other server action.
- Visual sizing of the hero (34×58 on a 140 px strip) and the stop line: there was no browser check in this range, so I did not judge how they look.

## Assessment

**Ready to merge: With fixes.** Fix Important 1 (one condition in `claimStage` plus a test update) and the AGENTS.md line. Minor 1 is cheap and worth doing in the same round. The anchor and audit handling, double-pay protection and client retry logic are otherwise sound.
