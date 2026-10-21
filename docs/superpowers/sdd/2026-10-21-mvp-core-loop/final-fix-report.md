# Final fix wave report (base d8b6d47)

Status: DONE_WITH_CONCERNS (one deliberate deviation in finding 2, see Concerns)

Commits (oldest first):
- d0569ce fix(engine): defeatedBosses holds boss monster ids in parseState
- 5612b0e fix(worker): validate uploads against an anchor window
- 6d7a331 fix(worker): reject non-item synth inputs and never commit an unparseable state
- abfcd15 test(sim): drive the pure-path bots through the real worker app
- 501a9ba feat(sync): surface repeated upload failures as an error status
- cf75789 fix(ui): retry hint on null synth, disable current zone; tidy package.json
- 8c87449 docs: describe the MVP truthfully in the README

Final verification:
- `npm test` -> `Test Files  25 passed (25)` / `Tests  200 passed (200)`
- `npm run build` -> `✓ built in 343ms` (only the pre-existing >500 kB chunk notice from pixi)
- `npm run db:migrate:local` -> `0002_anchor.sql │ ✅`, `🚣 4 commands executed successfully.`
- Ad hoc type-check of `worker/`, `src/engine`, `tests/` (tests are outside `tsc -b`): clean.

No game balance numbers changed.

## 1. (Critical) defeatedBosses = boss monster ids

Change: `src/engine/save.ts` — `defeatedBosses.every(isBoss)` where bosses are the zones' `bossId`s. Also exports the item regex as `ITEM_ID_RE` (used by finding 6).

Tests:
- `src/engine/save.test.ts`: sample now uses `zones[0].bossId`; new test "defeatedBosses holds boss monster ids, not zone ids" (zone id, regular monster, unknown -> null; all boss ids -> roundtrip).
- `worker/app.test.ts` "uploads after the first boss falls are accepted": a `playHonestly` helper runs the real `stepBattle` with the fake clock and PUTs every 30 s until the first boss dies, then one more PUT and a GET.

RED: `npx vitest run worker/app.test.ts -t "first boss"` with save.ts reverted -> `AssertionError: 200,200,200,400: expected false to be true` (4th upload, the first one carrying the boss, got 400). save.test RED: `Tests  2 failed | 11 passed (13)`.
GREEN: `Tests  18 passed (18)` (app), `Tests  13 passed (13)` (save).

## 2. (Critical) Anchor window

Change:
- `migrations/0002_anchor.sql`: `anchor_state TEXT`, `anchor_at INTEGER` on `saves`, backfilled from `state` / `saved_at`.
- `worker/store.ts`: `SaveRow.anchorState/anchorAt`; `commitSave(playerId, baseRevision, state, now, advanceAnchor)` — same CAS on revision, anchor moves in the same write when asked. `createPlayer` sets anchor = initial state, anchor_at = now. `touchSave` removed.
- `worker/d1-store.ts`: same, as one UPDATE per variant (the anchor columns are in the same `WHERE revision = ?` statement). `getSave` falls back to state/saved_at if the columns are NULL.
- `worker/app.ts`: `MAX_WINDOW_MS = 180_000`, `ANCHOR_ADVANCE_MS = 60_000` exported, `MAX_ELAPSED_MS` removed. `checkUpload` (shared by PUT and synthesize): baseline = anchor state with current `learned` and `synthesisLog` overlaid; elapsed = clamp(now − anchor_at, 0, 180 000); `validateUpload(baseline, next, elapsed)`; plus `defeatedBosses` must not shrink vs the current save (learned/synthesisLog equality vs current is enforced by the overlay). Accept -> commit with `advanceAnchor = now − anchor_at ≥ 60 000`, to the committed state (for synthesize: the post-synthesis state). GET no longer touches the save.

Tests (`worker/app.test.ts`):
- guest creation sets the anchor; GET leaves the row unchanged; MemoryStore CAS keeps the anchor on a stale commit and advances only when asked.
- (a) "300 PUTs at 100 ms each claiming the 100 ms bound stay under 2x the honest 30 s bound" — passes with rejections. Probe numbers with the fix: 2 of 300 accepted, first rejection at request #2; final gains fire 28 / wind 34 / thunder 28 / earth 42 / water 32 vs honest 30 s limits 42.25 / 47.25 / 42.25 / 73.5 / 44.75 (under 1x, test requires < 2x). Before the fix: 0 rejections (`expected 0 to be greater than 0`).
- same adversary through `POST /api/synthesize` (one-slot synth = 200 engine rejection that still commits the claim) -> rejected, under 2x.
- (b) honest real-engine client, PUT every 30 s for 10 min -> 20 × 200, no rejections recorded.
- anchor advance: 30 s upload keeps anchor; 60 s upload moves anchor_state/anchor_at.
- (c) synthesize 1 s after an accepted 30 s upload -> 200 `learned`; next PUT of the server state -> 200.
- server-owned fields vs current: dropping a spell learned after the anchor -> 422 `learned spells changed`; dropping a boss present in current but not the anchor -> 422 `defeatedBosses lost boss mist_stag`.
- (d) window cap: PUT and synthesize after 8 h with inflated inventory -> 422, no synth event.

RED: `npx vitest run worker/app.test.ts` -> `Tests  7 failed | 20 passed (27)`.
GREEN: `Tests  27 passed (27)`.

D1 SQL check (no D1 unit test in repo): ran the insert + both UPDATE variants + a stale-revision UPDATE via `npx wrangler d1 execute DB --local --json` -> row `{state: 'C', revision: 2, saved_at: 70, prev_state: 'B', prev_saved_at: 10, anchor_state: 'C', anchor_at: 70}` (stale CAS did not apply); test rows deleted afterwards.

## 3. Sim bot through the real server

Change: `tests/sim/bot.ts` — `runBot` is async; builds `createApp` with `MemoryStore`, fake `now = start + simMs`, seeded server rng; creates a guest via `POST /api/guest`, PUTs `{state, baseRevision}` every 30 s and synthesizes via `POST /api/synthesize` (all via `app.request` with JSON); server states are parsed with `parseState` like the client; any non-200 counts in `rejectedUploads` and the server state is adopted. Local `validateUpload`/local synthesis removed. Synthesis is only requested when inputs are in stock and an outcome's prerequisites are learned (same attempts the old bot made). New `serverCalls` counter; test asserts ≥ one PUT per 30 s + 3 synths so 0 rejections is not vacuous. `pure-paths.test.ts`: async, timeout 180 s per test; zone-3 ≥ 20 min and mana_bolt tests kept.

RED (gap closed): with the save.ts fix reverted, `npx vitest run tests/sim` -> all 7 tests fail (`× pure fire path ...` etc.).
GREEN: `Tests  7 passed (7)` (~4 s).

Sim results (seed 20261021, 3 h cap):

| path | cleared zones | sim min | zone 3 min | rejected | learned |
|---|---|---|---|---|---|
| fire | mist_meadow, thunder_gorge, ash_volcano | 38.0 | 34.7 | 0 | mana_bolt, fireball, flame_burst, explosion |
| wind | mist_meadow, thunder_gorge, ash_volcano | 27.5 | 24.0 | 0 | mana_bolt, wind_blade, whirlwind, vacuum_slash |
| thunder | mist_meadow, thunder_gorge, ash_volcano | 50.0 | 43.8 | 0 | mana_bolt, thunder_bolt, lightning, thunderstorm |
| earth | mist_meadow, thunder_gorge, ash_volcano | 49.0 | 43.8 | 0 | mana_bolt, pebble, rock_spear, earthquake |
| water | mist_meadow, thunder_gorge, ash_volcano | 39.5 | 35.3 | 0 | mana_bolt, water_shot, ice_spike, tsunami |
| mana_bolt only | mist_meadow | 180.0 | - | 0 | mana_bolt |

## 4. Non-network upload failures

Change: `src/game/sync.ts` — `ConnStatus = 'online' | 'offline' | 'error'`, `ERROR_AFTER_FAILURES = 2`. Consecutive non-network, non-auth upload failures are counted (in `uploadNow` and in the offline retry); at 2 the status becomes `'error'`, a success resets to `'online'`. Network errors and auth errors neither count nor reset. New `src/ui/SaveErrorBanner.tsx` (non-blocking `role="alert"` strip, `.save-error-banner` style) rendered under the HUD in `App.tsx`; text `存檔失敗，進度可能沒有保存，請重新整理` (`SAVE_ERROR_MESSAGE` in messages.ts).

Tests: `sync.test.ts` — two consecutive ApiErrors -> `'error'` (game not paused), next success -> `'online'`, statuses `['error','online']`; fail/success/fail/auth stays online; ApiError, NetworkError, retry ApiError -> `'error'` and resumed. `SaveErrorBanner.test.tsx` — shown only for `'error'`.
RED: `Tests  2 failed | 12 passed (14)` + banner file missing. GREEN: `Tests  44 passed (44)` (src/game + src/ui).

## 5. README

Change: intro now describes the MVP: online-only (pauses offline, no offline income), guest accounts with server-validated saves and server-rolled synthesis, current content, and "尚未提供：排行榜、帳號綁定與跨裝置續玩"; adds `清除瀏覽器資料會遺失遊客帳號（帳號綁定在第二版）`. Docs only, no test.

## 6. Self-corruption

Change: `worker/app.ts` synthesize inputs must each match `ITEM_ID_RE` else 400; the synthesized state is re-parsed with `parseState` before `commitSave` (500, nothing committed/recorded). `src/engine/inventory.ts` `addItems`/`removeItems` count only own properties (`Object.hasOwn`).

Tests: `inventory.test.ts` "inherited Object properties are never counted as stock" (`removeItems({}, ['constructor'])` -> null, `addItems` -> `{constructor: 2}`); app tests "inputs that are not item ids return 400" (`constructor`, `__proto__`, `el:dark:1`), and "a synthesis result that fails parseState is a 500 and is not committed" (test data with a recipe yielding an unknown spell).
RED: `Tests  3 failed | 32 passed (35)`. GREEN: `Tests  35 passed (35)`.

## 7. UI / package.json

Change: SynthesisPanel shows `存檔已同步，請再試一次` (`SYNTH_RETRY_MESSAGE`) when `sync.synthesize` returns null, keeping the slots; ZonePanel disables the current zone's button. package.json: one-line English description, `license: "MIT"` (LICENSE is MIT, Copyright 2026 Ron Lin; package-lock root entry updated too), removed `directories`, `keywords`, `author`.

Tests: SynthesisPanel "asks to retry when ... (null result)"; new `ZonePanel.test.tsx` (current + locked disabled, other unlocked enabled).
RED: `Tests  2 failed | 6 passed (8)`. GREEN: `Tests  22 passed (22)` (src/ui).

## Concerns

1. Deviation from the dispatch text in finding 2: the dispatch says also overlay `defeatedBosses` from current when the anchor's is a subset; the ledger's binding "Final: Ruling" line lists only `learned, synthesisLog`. I followed the ledger. Overlaying `defeatedBosses` alone breaks honest players: a boss killed after the anchor would no longer be "new", so its zone unlock would not be expected and the `unlockedZones` check plus the new zone's `zoneKills` growth would reject the honest upload. Overlaying `defeatedBosses` and `unlockedZones` together would work but lets each post-anchor boss be timed against the whole window separately (bosses could be chained faster). Without the overlay every boss since the anchor is re-timed against the anchor, which is stricter and passes all honest tests and sims. Shrinking vs current is still checked. If the controller wants the overlay, it is a 3-line change in `checkUpload`.
2. Remaining allowance by design: an adversary still gets one set of per-window constants per `ANCHOR_ADVANCE_MS` (60 s), not per request.
3. D1Store has no automated test (no D1 harness in the repo); its SQL was checked by hand against the local D1 (above).
4. Visual check of the new banner at 1280/360 not done (no browser; same as the earlier ruling handing visual checks to the user).

## Follow-up: synthesis re-roll hole in the anchor window (commit df2ca9e)

Problem (re-review): a synthesis inside one anchor window committed only to the current save; the anchor kept the pre-synthesis inputs, so a PUT restoring them had zero gain vs the anchor and was accepted, which allowed unlimited re-rolls.

Design (simplest correct, no new column, no migration 0003):
- `chargeAnchor(anchor, before, after)` in `worker/app.ts` applies the synthesis's net inventory delta (`after − before`, exactly as the engine applied it: inputs out, duplicate refund / noReaction consumption included) to the anchor's inventory.
- Counts may go negative. A negative count is the debt for inputs gained after the anchor, so restoring or re-acquiring them is gain against the anchor and must fit the window's bound (tolerance + slack included). The anchor is never run through `parseState`; `validateUpload` only does arithmetic on `prev.inventory`, which handles negatives linearly. When the anchor advances it is replaced by the committed (non-negative) state, so the debt goes away exactly when the spending becomes part of the baseline.
- `Store.commitSave(..., anchor: { state, at } | null)` replaces the boolean: the new anchor is written in the same CAS statement as the state (MemoryStore and D1Store). This is safe because the anchor only changes together with `revision`, so an anchor computed from the read row cannot overwrite a concurrent write. PUT passes `{committed, now}` on advance else `null`; synthesize passes `{committed, now}` on advance else `{charged anchor, old anchor_at}`.

Tests (`worker/app.test.ts`):
- (a) The probe, pushed past the bound: 100 cycles of restore-PUT + synthesize at 100 ms. Result: first restore 422 at PUT #15, 78 restore PUTs rejected, 22 synth events, 23 thunder actually spent vs window limit 24.75 (12.2 s). Asserts `put422` occurs, spent ≤ window limit, and spent = 2 + (synthEvents − 1) (every event paid for). The reviewer's original 10 cycles at 1 s now spend 11 thunder in ~20 s, which honest farming in mist_meadow can produce (limit ≈ 33.5), so accepting those is correct.
- "the anchor is charged with what a synthesis spent" → anchor inventory `{ 'el:thunder:1': -2 }`.
- (b) synthesize, then honest real-engine farming in the same window (PUT every 20 s for 60 s) → all 200.
- MemoryStore: commitSave writes the anchor only when given one (incl. charged anchor keeping the old anchor_at).
- (c) sims: `tests/sim` 7/7 pass, all five pure paths 0 rejections.

RED: `npx vitest run worker/app.test.ts -t "re-rolls"` with worker/{app,store,d1-store}.ts at the previous commit → `AssertionError: expected [ 'put200', 'syn200:learned', …(198) ] to include 'put422'` (all 200 accepted).
GREEN: `Tests  32 passed (32)` (worker/app.test.ts).

D1: anchor-write UPDATE checked on the local D1 → `{state: 'B', revision: 1, saved_at: 10, anchor_state: 'A-charged', anchor_at: 0}`.

Verification: `npm test` → `Test Files  25 passed (25)`, `Tests  203 passed (203)`; `npm run build` → `✓ built in 395ms`; `npm run db:migrate:local` → `✅ No migrations to apply!` (0002 already applied; no new migration needed).

Concern: within a window, a re-roll is still possible when it is paid for by the honest farming allowance (by design: the server cannot tell farmed elements from restored ones). The cost per re-roll equals its real input cost.
