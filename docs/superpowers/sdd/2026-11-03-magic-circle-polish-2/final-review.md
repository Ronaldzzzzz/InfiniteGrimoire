# Final review: magic-circle polish 2 (90b53e9..52f653d)

Reviewer: Opus 5.5, read-only. Spec `docs/superpowers/specs/2026-11-03-magic-circle-polish-2-design.md`, plan `docs/superpowers/plans/2026-11-03-magic-circle-polish-2.md`, ledger `progress.md`, acceptance `docs/superpowers/sdd/2026-11-03-magic-circle-polish-2/acceptance.md`.
Re-ran: `npx vitest run src/engine src/ui/CircleTable.test.tsx src/render/circle-fx.test.ts src/ui/EquipToasts.test.tsx src/ui/AwayReport.test.tsx tests/ui` → 22 files, 393 tests pass (working tree at 6412e17, which differs from 52f653d only in docs).

## Strengths

- **Offline clock is small and correct.** `claimOffline` computes one `start`/`awayMs` and uses it for both pay and `pausedMs`, so pay and the paused span can never disagree; `claimStage` subtracts `pausedMs` plus an away still open, then resets `pausedMs` and `awayAt`. Each away span is counted once: a claim zeroes `awayAt` and moves `offlineUntil` to now, and the next claim starts from `max(awayAt|prevSavedAt, offlineUntil, lastClearAt)`.
- **Server-owned rules are kept.** `audit.ts` rejects a changed `pausedMs`; `worker/app.ts` overlays `current.pausedMs` on the baseline; `persist.ts` defaults it in the zod schema and in `readStored`, so old saves load with 0 and need no migration. No client code reads or writes the field (`git grep` finds it only in engine and worker).
- **Anti-cheat question answered: no inflation past the floor.** A client can push `pausedMs` up (send away, claim, poll `/api/offline`), but the recorded time is still `max(minStageMs, played)`. So the best possible offline rate stays 30 s per tick ÷ `minStageMs`. A forged client could already reach that before this branch by reporting clears at the `minStageMs / GAIN_TOLERANCE` pace. The fallback (`minStageMs × 2`) is above that floor too.
- **`play()` handles cancellation cleanly.** Each charge gets a `playId`. Every timer and the reply handler check `live()`, `abort` bumps the id, and unmount bumps it and calls `fx.stop()`. A reply before 3 s waits for the 3 s mark, a late reply holds and then reveals when it arrives, and a refusal or error stops the charge and keeps the circle. Tests cover all three, with fake timers.
- **The Pixi overlay is built well.** It is lazy (built on the first charge), and its ticker stops when the sim goes idle. Destroy before init is handled. A failed init leaves a silent no-op. Particles are capped separately at 400 and `MAX_ACTIVE_FX` is untouched. The particle model (`FxSim`/`step`) is pure and tested without Pixi.
- **The tasks fit together.** Task 3's locked 「？」 survives Task 5's icons (`RuneIcon id={null}`). Task 8's host is a sibling inside `.parchment-sheet`, laid out by Task 6, and `pointer-events: none` lets the seal button still take clicks. Task 7's `CircleFxApi` matches Task 8 exactly. Task 1's `none` reasons flow to Task 2's card through a narrowed `OfflineReport`, and `mergeReports` never lets a no-income report hide a paid one.
- The tests are meaningful and pinned to the spec: same classes for every outcome before 3 s, hold then reveal, the mutation at 3 s with its card at 5 s, the preview only with DEV and `?fx`, the bar pausing, the `ron` repro, and the `none` reasons.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

None.

### Minor (Nice to Have)

1. **`src/render/circle-fx.ts:300` (`app.init`) has no `resolution`/`autoDensity`.** On the user's Retina Mac the particle canvas renders at 1x and is scaled up, so the dots look soft. Fix: pass `resolution: window.devicePixelRatio, autoDensity: true`. One line, worth doing before the playtest.
2. **Spec 2.2 says the orb fades on a refusal or error, but the CSS orb vanishes (`CircleTable.tsx` `abort` → `setCharging(null)` unmounts `.charge-orb`).** Pixi fades over 300 ms but the CSS orb pops out. Fix: keep a short-lived `fading` state that renders the orb with a fade-out class for about 300 ms.
3. **Spec 2.2 says particles freeze during the on-time pause, but the CSS sparks keep moving** (they freeze only under `.hold`). The Pixi particles do freeze. Fix: add a 90% to 100% keyframe or pause rule for `.spark`. This is cosmetic.
4. **Spec 4.2 wants the left note to say whether the circuit matches; it only speaks up on a mismatch** (`CircleTable.tsx` `.circle-note.predict`). A player cannot tell "matches" apart from "not checked". Fix: add a line such as 「迴路對得上」 when both rings match.
5. **`RuneIcon` calls `useArt` once per instance** (12 per band, 24 with two rings, plus 8 in the wheel). Each one probes `/assets/rune-<id>.webp`, and the locked glyph probes `rune-locked.webp` for nothing, which fills the dev console with 404s while the art is missing. Fix: cache the result per src at module level and skip the probe for `null`.
6. **The reload or reconnect claim (`awayAt = 0`) adds the online time since the last upload (up to `UPLOAD_INTERVAL_MS`, 30 s) to `pausedMs`.** That under-records the next clear by up to 30 s per reload and slightly overpays offline income, but it never goes below the `minStageMs` floor (the ledger already defers this). Fix, if wanted: on a closed-game claim, add only the span after `prevSavedAt + UPLOAD_INTERVAL_MS`, or accept it as is.
7. **Review Focus 3 has no end-to-end test.** No single test runs a claim, a second claim, then a clear with an away still open. Each step is unit-tested, so the risk is low. Fix: one `stage-clear` test that chains `markAway`, `claimOffline`, `markAway`, `claimOffline`, `markAway`, `claimStage` and asserts the recorded time.
8. **`circle-fx.ts` init can leak.** If `generateTexture` throws after `appendChild`, the app and canvas stay on the page. Fix: wrap the code after append in try/catch and call `app.destroy`.

## Triage of deferred minors and acceptance problems

**Fix before merge:** none are required. Recommended before the user's playtest because they are cheap and visible: Minor 1 (Retina resolution) and acceptance problem 3 (`--key-row-h` 56 → 64 px, giving the toast room above a 59 px key bar on phones).

**Can wait:**
- T1: dead `!(per > 0)` path labelled tooShort; reload adds online time to pausedMs (Minor 6); pausedMs uncapped. It resets on every clear, and the pay is capped by `OFFLINE_CAP_MS`.
- T2: hand-written `OfflineReport` union and the cast. Type tidiness only.
- T3: RareReveal indentation; the locked-rune test also accepts aria-disabled.
- T4: the 56 px key-row estimate (see the recommendation above); a stale test name; `setBar` running on unmount, which is harmless in React 18+; the 180 px literals.
- T5: repeated art probes (Minor 5); no `<image>` test for the band or wheel; a full-circle dash; thin strokes at 14 px. Acceptance shows the strokes read fine.
- T6: hard-coded 44 px and 15 px in the layout test; the `64vh` threshold ignores the no-art sheet width; double aria labelling.
- T7: CSS sparks during the pause (Minor 3); `PAUSE_MS` duplicated as 90% in CSS; the orb vanishing on abort (Minor 2); `charging.ms` is always 3000; `.parchment.success` overrides the gold edge on `reveal-great`, which only the preview can show today.
- T8: partial-init leak (Minor 8); on the first cast the Pixi charge starts late, but acceptance #10 shows particles at 0.6 s; no tests for calls before init; no Retina resolution (Minor 1, recommended); charge particles snap away on a non-mutation reveal.
- Acceptance 1 (preview buttons over the paper at 390 px): DEV-only, so it can wait.
- Acceptance 2 (desktop `KeyItemBar` over the paper's lower-right corner): cosmetic, it only shows when a key item is usable, and it does not touch the seal or the circle. Can wait for the playtest.
- Acceptance 3 (toast 4 px above the key bar on phones): there is no overlap today. Can wait, though the 1-line change above is recommended.
- Acceptance 4 (side notes about 152 px wide at 1920, and they only switch beside the sheet at about 1750 px or wider): the user should judge this in the playtest.
- Acceptance 5: a race in the acceptance script, not in the game.
- Acceptance 6 (no real phone, reduced-motion and star map not rechecked): out of scope for this round.

## Declined to judge

- Whether the `notCleared` card on every return of 30 s or more before the first clear is annoying: spec 5.3 asks for that card.
- Whether `cannotDamage` should name the farthest cleared zone instead of the current one: `offlineStage` targets the farthest zone, which is existing design.
- Whether the fallback `minStageMs × 2` truly "only under-pays": a very weak spell can clear slower than 2× the minimum, so it can overpay slightly. The spec chose this placeholder, and it is still above the cheat floor.
- Old cached clients uploading saves without `pausedMs` after a deploy: nothing is deployed, deployment is out of scope, and the same applied to earlier server-owned fields.
- Removing all reduced-motion handling: spec section 3 orders it for development; whether to restore it before launch is a later decision.
- Placeholder numbers (`CLEAR_TIME_FALLBACK`, `CIRCLE_FX_MAX`, `PAUSE_MS`, `SIDE_NOTE_MIN`, `RUNE_BAND_COUNT`, the toast size): the user will confirm these.
- Whether the effects feel gacha-like enough and how readable the rune glyphs are: these are for the user's playtest.
- The level-curve note (feedback item 5): out of scope according to spec section 1.
- AGENTS.md staleness: a parallel fix is landing.
- Unmounting `CircleTable` during the mutation's 2 s skips `RareReveal` even though the server already applied the result. This already happened during the old 5 s charge, and the table does not unmount during normal play.

## Assessment

**Ready to merge: Yes.** Every spec item is in place and checked in the browser. The `pausedMs` design cannot pay out above the existing `minStageMs` floor, and the charge, cancellation and overlay lifetimes are correct and tested. All remaining items are minor polish; I recommend applying the Retina resolution and the `--key-row-h` margin before the user's playtest.
