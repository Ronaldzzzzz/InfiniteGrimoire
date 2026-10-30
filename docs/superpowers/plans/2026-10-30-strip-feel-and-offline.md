# Battle Strip Feel, Stage Ramp and Offline Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 2026-10-30 playtest feedback (slower foes, stop line further out, bigger hero, stages ramping from easy to hard) and add server-computed offline income.

**Architecture:** Feel and ramp are constants in `src/engine/combat.ts`, the hero size in `src/render/battle-view.ts`, and wave lists in `src/data/content/zones.json`, calibrated with the existing `tests/sim/measure.ts` stage measurement. Offline income is a pure engine module (`src/engine/offline.ts`) driven by three new server-owned save fields, exposed as two server actions (`POST /api/away`, `POST /api/offline`) through the existing `serverAction` pipeline; the client watches page visibility (hidden only; an unfocused but visible window is not away), claims on return and shows a card.

**Tech Stack:** TypeScript, Vitest, Hono (Cloudflare Worker), React, Pixi; zod for save parsing.

**Spec:** `docs/superpowers/specs/2026-10-29-side-scroll-battle-strip-design.md` sections 3.8 (offline income) and 3.9 (playtest feedback). Branch `feat/battle-strip` (continue on it; not pushed, not merged).

## Global Constraints

- UI copy in Traditional Chinese; "Lv." only means spell/monster tier.
- Server is the bank: the new fields `clearTimes`, `awayAt`, `offlineUntil` are server-owned exactly like `clearedStages` / `lastClearAt` (upload changing them is rejected by `audit.ts`; `worker/app.ts` overlays them from the current save).
- Offline: `OFFLINE_RATE = 0.5`, `OFFLINE_CAP_MS = 8 * 3_600_000`, `AWAY_DELAY_MS = 30_000`, `CLEAR_TIMES_KEEP = 5`.
- Offline never advances stages, never fights a boss, never yields `key:` items, never unlocks zones. Boss stages never take part (not as the farmed stage, not in `clearTimes`).
- `tests/sim` routes 0 rejections and the worker adversarial tests stay green. `npm test` and `npm run build` pass at the end of every task.
- No migration: existing local saves must keep parsing (new fields default).
- Balance values (speed, stop line, hero size, wave counts) are proposals for the user to confirm; record measured values in the ledger.
- Commits: Conventional Commits in English, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01BbLnQR1oxFiq58K5QZz56M`.

## Review Focus

1. A return with no recorded clear of the farmed stage (or a spell that cannot damage the zone) gives nothing and shows no card — Task 2 test `none without clear times` / `none when the spell cannot damage`.
2. Two returns in a row (two tabs, a retried request) must not pay the same time twice — Task 2 test `second claim pays nothing` (via `offlineUntil`).
3. On page load the offline claim must be the first upload; a PUT before it would move `savedAt` and erase the closed-game window — Task 4 test `boot claims offline before the first upload`.
4. A window that is visible but unfocused (second monitor) keeps fighting online and must never send away, so online and offline income never overlap — Task 4 test `blur while visible never fires onAway`.
5. Clock edge cases: `now` earlier than the start gives 0; more than 8 h is capped and flagged — Task 2 tests `clamps negative time` / `caps at 8 hours`.

---

### Task 1: Feel constants, bigger hero, stages ramp from easy to hard

**Files:**
- Modify: `src/engine/combat.ts` (`LANE_SPEED`, `STOP_X`)
- Modify: `src/render/battle-view.ts` (`HERO_W`, `HERO_H`)
- Modify: `src/data/content/zones.json` (`stages[].waves` of every zone)
- Modify: `tests/sim/measure.ts`, `tests/sim/stage-time.test.ts`
- Modify: `tests/engine/content.test.ts` (or wherever zone content is checked; find with `grep -rn "stages" tests/engine`)

**Interfaces:**
- Consumes: `stageReport(opts)` / `bossReport(opts)` / `STAGE_OPTS` / `MEASURE_STAGE` in `tests/sim/measure.ts`.
- Produces: `stageReport` accepting a stage number (add `stage?: number` to its options, default `MEASURE_STAGE`); nothing else downstream depends on this task.

- [ ] **Step 1: Change the feel constants (proposals):** `LANE_SPEED` 4 → **2.5**, `STOP_X` 0.08 → **0.16**, `HERO_W` 22 → **34**, `HERO_H` 38 → **58** (hero ×~1.5; it must still fit the 180 px strip — check `makeArena` keeps the hero and `FOE_MAX_R_H` foes inside the strip; adjust the eye rects proportionally). `WALK_MS` stays 1500 (it is an anti-cheat floor; slower foes only make honest stages longer).

- [ ] **Step 2: Rewrite the stage-time targets in `tests/sim/stage-time.test.ts`.** Replace the single 2–3 min home check with a ramp. Home-tier median targets: stage 1 **1.0 min**, stage 5 **2.0 min**, stage 9 **3.0 min**, each within **±20%** (assert `[0.8, 1.2]`, `[1.6, 2.4]`, `[2.4, 3.6]` minutes), and stage 1 < stage 5 < stage 9 per zone. Keep the rel ±1 and boss tests at `MEASURE_STAGE` (5) with the same rules and `KNOWN_GAPS` mechanism (re-measure; update the gap list and its measured comment to whatever is true after calibration — a gap may only be added with its ratio recorded in the ledger).

- [ ] **Step 3: Add a content test `ordinary stages ramp up`:** for every zone, the foe count `stageTotal(zone, s)` is strictly increasing for s = 1..9, and the boss stage keeps about a third of stage 9's waves before the boss (assert `waves(10).length` between `0.25×` and `0.45×` `waves(9).length`).

- [ ] **Step 4: Run both tests to see them fail** — `npx vitest run tests/sim/stage-time.test.ts tests/engine/content.test.ts`. Expected: FAIL on the new ramp checks.

- [ ] **Step 5: Calibrate `zones.json`.** Keep wave sizes 15/16/17 for stages 1–3/4–6/7–9; choose wave counts so stage 1, 5, 9 hit the targets and stages in between interpolate linearly; boss stage ≈ one third of stage 9's waves, then the boss. Measure with the sim (`stageReport` at stages 1, 5, 9).

- [ ] **Step 6: Run the full suite** — `npm test` then `npm run build`. Expected: all pass; `tests/sim` 0 rejections. Record in the ledger: the four constants, per-zone wave counts for stages 1/5/9/10, measured medians (stage 1/5/9 home, rel ±1, boss), and full-route times printed by `pure-paths` (print-only).

- [ ] **Step 7: Commit** — `feat(battle): slower foes, further stop line, bigger hero, stages ramp up`.

---

### Task 2: Offline income engine

**Files:**
- Create: `src/engine/offline.ts`, `tests/engine/offline.test.ts`
- Modify: `src/engine/model.ts` (GameState fields), `src/engine/persist.ts` (initial state, zod with defaults), `src/engine/audit.ts` (server-owned checks), `src/engine/stage-clear.ts` (record clear times; export `LOOT_ROLLS`), `src/engine/inventory.ts` (`addCounts`)
- Test: `tests/engine/stage-clear.test.ts`, `tests/engine/persist.test.ts`, `tests/engine/audit.test.ts` (extend existing files; find exact paths with `ls tests/engine`)

**Interfaces:**
- Produces (Task 3 and 4 rely on these exact names):
  - `GameState.clearTimes: Record<string, number[]>` — key `` `${zoneId}:${stage}` ``, newest last, at most `CLEAR_TIMES_KEEP` entries, ordinary stages only.
  - `GameState.awayAt: number` — server ms when the client said it left; 0 = not away.
  - `GameState.offlineUntil: number` — server ms where the last offline settlement ended; 0 = never.
  - `export const OFFLINE_RATE = 0.5; OFFLINE_CAP_MS = 28_800_000; AWAY_DELAY_MS = 30_000; CLEAR_TIMES_KEEP = 5;` in `offline.ts`.
  - `export function offlineStage(state: GameState, content: Content): { zoneId: string; stage: number } | null`
  - `export function offlineLoot(zone: Zone, stage: number, runs: number, equippedTier: number, content: Content, rng: Rng): Record<ItemId, number>`
  - `export type OfflineResult = { kind: 'none' } | { kind: 'offline'; zoneId: string; stage: number; runs: number; awayMs: number; capped: boolean; loot: Record<ItemId, number> }`
  - `export function markAway(state: GameState, now: number): { state: GameState; result: { kind: 'away' } }` — sets `awayAt = now` only when it is 0.
  - `export function claimOffline(state: GameState, prevSavedAt: number, now: number, content: Content, rng: Rng): { state: GameState; result: OfflineResult }`
  - `export function addCounts(inv: Inventory, counts: Record<ItemId, number>): Inventory` in `inventory.ts`.

Rules (spec 3.8, exact):
- `offlineStage`: walk `content.zones` in order, take the last zone with `clearedStages[id] > 0`; stage = `min(cleared, stageCount(zone) - 1)` (never the boss stage). No such zone → null.
- Clear times: in `claimStage`, on success for an **ordinary** stage and when `state.lastClearAt > 0`, push `max(minStageMs(zone, stage), min(now - state.lastClearAt, OFFLINE_CAP_MS))` to `clearTimes[key]`, keeping the newest `CLEAR_TIMES_KEEP`.
- `claimOffline`: `start = max(state.awayAt > 0 ? state.awayAt : prevSavedAt, state.offlineUntil, state.lastClearAt)`; `awayMs = max(0, now - start)`; `counted = min(awayMs, OFFLINE_CAP_MS)`; `capped = awayMs > OFFLINE_CAP_MS`; `per` = median of `clearTimes[key]` (even count: mean of the middle two). Result `none` when: no offline stage, no clear times for it, the equipped spell (at its empower level) cannot damage every ordinary monster of the zone (reuse the check `claimStage` uses — export it from `stage-clear.ts` rather than duplicating), or `floor(counted / per) < 1`. `none` only resets `awayAt` to 0 (does **not** move `offlineUntil`). Otherwise `runs = floor(counted / per)`, loot from `offlineLoot`, inventory `addCounts`, `offlineUntil = now`, `awayAt = 0`.
- `offlineLoot` (aggregate, not per-foe rolls — the worker CPU budget cannot roll 8 h of foes): foes per monster id `m` = `runs × stageTotal(zone, stage) / zone.monsters.length`; per non-`key:` drop `d` of `m`: `expected = foes × (LOOT_ROLLS + 1) × d.chance × overlevelEfficiency(tier, m.tier) × (d.min + d.max) / 2 × OFFLINE_RATE` (`+1` is the kill's own drop); quantity = `floor(expected)` plus 1 with probability `expected - floor(expected)` (one `rng.next()`); omit zeros.
- `persist.ts`: zod `clearTimes` = record of arrays (≤ `CLEAR_TIMES_KEEP` non-negative ints, keys must be `zone:stage` with a known zone and an ordinary stage), `awayAt` / `offlineUntil` non-negative ints, all with `.default(...)` so saves without them parse; initial state `{}` / 0 / 0.
- `audit.ts`: reject uploads that change any of the three (`'clearTimes changed'`, `'awayAt changed'`, `'offlineUntil changed'`), same style as `lastClearAt`.

- [ ] **Step 1: Write failing tests in `tests/engine/offline.test.ts`:**
  - `offlineStage`: cleared `{mist_meadow: 10, thunder_gorge: 5}` → `thunder_gorge` 5; `{mist_meadow: 10, thunder_gorge: 0}` → `mist_meadow` 9; `{mist_meadow: 10}` with gorge unlocked but absent → `mist_meadow` 9; `{}` → null.
  - `claimOffline`: one hour away with clear times `[150_000, 150_000, 200_000]` (median 150 s) → `runs` 24, `capped` false, `offlineUntil === now`, `awayAt === 0`, inventory grew by exactly the summed `loot`.
  - `uses awayAt when set` (awayAt later than prevSavedAt shortens the window); `lastClearAt later than awayAt wins`.
  - `caps at 8 hours`: 10 h away → runs = `floor(28_800_000 / per)`, `capped` true.
  - `clamps negative time`: `now < start` → `none`.
  - `none without clear times`, `none when the spell cannot damage` (equip `mana_bolt` vs a late zone), `none below one run` — each leaves `offlineUntil` unchanged and `awayAt` 0.
  - `second claim pays nothing`: claim, then claim again at the same `now` → `none`.
  - `never pays key items or boss stages`: zone whose monsters drop a `key:` item (stub content) → no `key:` in loot.
  - `offlineLoot` expectation: with a seeded rng over many runs, total of one item is within 5% of the formula's expected value; and `OFFLINE_RATE` halves it versus rate 1 (compute expected directly).
  - `markAway` sets once: second call keeps the first `awayAt`.
- [ ] **Step 2: Extend existing tests:** `claimStage` records a clear time for an ordinary stage (value clamped to `minStageMs` floor), none for the boss stage, none when `lastClearAt` is 0, keeps only 5; `parseState` accepts a save without the three fields and rejects a `clearTimes` key for a boss stage or unknown zone; audit rejects each changed field.
- [ ] **Step 3: Run them to see them fail** — `npx vitest run tests/engine`.
- [ ] **Step 4: Implement** per the rules above.
- [ ] **Step 5: Run** `npm test` and `npm run build`. Expected: all pass, `tests/sim` 0 rejections.
- [ ] **Step 6: Commit** — `feat(engine): offline income settlement and recorded clear times`.

---

### Task 3: Offline endpoints

**Files:**
- Modify: `worker/app.ts` (`Checked` gains `savedAt`, baseline overlay, two routes, `ACTION_PATHS`)
- Test: `worker/app.test.ts`

**Interfaces:**
- Consumes: `markAway`, `claimOffline`, `OfflineResult` from Task 2; `store.getSave(...).savedAt` (already in `worker/store.ts`).
- Produces: `POST /api/away` → `{ result: { kind: 'away' }, state, revision }`; `POST /api/offline` → `{ result: OfflineResult, state, revision }`. Both take the usual `{ baseRevision, state }` body and go through `serverAction` (so the upload is audited and loot is charged into the anchor by `chargeAnchor`).

- [ ] **Step 1: Write failing tests in `worker/app.test.ts`** (use the existing injected `now` / rng / MemoryStore helpers):
  - `away then offline pays the window`: seed a save with `clearedStages {mist_meadow: 3}`, `clearTimes {'mist_meadow:3': [60_000]}`; PUT at t0; `POST /api/away` at t0; `POST /api/offline` at t0 + 10 min → `result.kind 'offline'`, `runs` 10, state inventory grew, next PUT of that state at t0 + 11 min is accepted (anchor charged, no rejection).
  - `closed game uses the last save time`: no away; last PUT at t0, `POST /api/offline` at t0 + 10 min → runs 10.
  - `offline twice pays once`.
  - `upload cannot set offline fields`: PUT with `offlineUntil` changed → 422 `offlineUntil changed`.
  - `nothing to pay is 200 with kind none` (not 422, not counted as rejection).
- [ ] **Step 2: Run to see them fail** — `npx vitest run worker/app.test.ts`.
- [ ] **Step 3: Implement.** Add `savedAt: save.savedAt` to `Checked`; overlay `clearTimes`, `awayAt`, `offlineUntil` from `current` in the baseline (next to `lastClearAt`); the `apply` callback for `/api/offline` needs the previous `savedAt`, so pass `checked` (or `savedAt`) into `serverAction`'s `apply` — widen `apply` to `(state, ctx: { savedAt: number }) => …` and keep existing callers working. Add both paths to `ACTION_PATHS`.
- [ ] **Step 4: Run** `npm test`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** — `feat(worker): away and offline settlement endpoints`.

---

### Task 4: Client presence, claim on return, report card

**Files:**
- Create: `src/game/presence.ts`, `src/game/presence.test.ts`, `src/ui/AwayReport.tsx`, `src/ui/AwayReport.test.tsx`
- Modify: `src/game/api.ts` (`away`, `offline`), `src/game/sync.ts` (`goAway`, `claimOffline`, `onOfflineReport`), `src/game/boot.ts` and/or `src/game/loop.ts` (wire presence; boot claim), `src/ui/App.tsx` (render card)

**Interfaces:**
- Consumes: Task 3 routes; `OfflineResult`, `AWAY_DELAY_MS` from `src/engine/offline.ts`.
- Produces:
  - `watchPresence(opts: { delayMs: number; onAway: () => void; onReturn: () => void }, doc?: Document): () => void` — away means `document.visibilityState === 'hidden'` only (focus/blur is ignored: a visible unfocused window keeps fighting); after `delayMs` continuously hidden it calls `onAway` once; on becoming visible after `onAway` fired it calls `onReturn`; becoming visible before the delay cancels the timer. Returns a disposer.
  - No runtime pause: a hidden page gets no animation frames and `loop.ts` already resets its clock on return (no catch-up), so the battle does not advance while away.
  - `SyncController.goAway(): Promise<void>` (uploads via `/api/away`), `SyncController.claimOffline(): Promise<OfflineResult | null>` (via `/api/offline`; adopts the returned state like other actions), `SyncController.onOfflineReport(cb: (r: Extract<OfflineResult, { kind: 'offline' }>) => void): () => void`.

Behaviour:
- `onAway`: `sync.goAway()`. `onReturn`: `sync.claimOffline()`.
- Boot: right after the save is loaded and before the periodic upload starts, call `sync.claimOffline()` once (this is how a closed game is paid).
- `AwayReport` card (modal over the main UI, not over the strip's stage info): title「離開期間的收穫」; 「離開 {X 小時 Y 分}」(under 1 h:「離開 Y 分」); 「在 {地點名稱} {zoneIndex}-{stage} 刷了 {runs} 次」; the loot list with the existing item-name/element display used elsewhere (`ElementTable` / settlement notice — reuse, don't re-invent); when `capped`:「已達上限（8 小時），超過的時間不計」; one button「知道了」that closes it. No auto-dismiss. `kind: 'none'` shows nothing. If several reports arrive before the player closes the card, merge into one (sum runs and loot, keep the latest stage).

- [ ] **Step 1: Write failing tests:**
  - `presence.test.ts` with fake timers and a stub doc: `hidden for 30 s fires onAway once`; `hidden 29 s then visible fires nothing`; `blur while visible never fires onAway`; `onReturn only after onAway`; `disposer removes listeners`.
  - sync test: `boot claims offline before the first upload` — the first request after load is `/api/offline`, not `PUT /api/save`; `onOfflineReport` fires for `kind 'offline'` and not for `none`.
  - `AwayReport.test.tsx`: renders the copy above for a 2 h 5 m report (「離開 2 小時 5 分」), shows the cap line only when `capped`, stays until「知道了」is clicked.
- [ ] **Step 2: Run to see them fail** — `npx vitest run src/game src/ui/AwayReport.test.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** — `feat(game): claim offline income on return and show the report`.

---

### Task 5: Docs and hand-off

**Files:**
- Modify: `AGENTS.md` (3.0, section 5 architecture: `offline.ts`, `presence.ts`, `AwayReport`; section 6 rules: offline is server-computed, the three server-owned fields; section 10 entry), `docs/superpowers/specs/2026-10-29-side-scroll-battle-strip-design.md` (mark 3.8/3.9 implemented with the measured values), `README.md` if it lists endpoints or rules, `docs/prelaunch-checklist.md` (no new migration; note the fields default)
- Copy the ledger to `docs/superpowers/sdd/2026-10-30-strip-feel-and-offline/progress.md`.

- [ ] **Step 1: Update the docs** with the measured numbers from the ledger (constants, wave counts, stage medians, route times) and mark them "proposal, user to confirm".
- [ ] **Step 2: Run** `npm test` and `npm run build`; record counts in AGENTS.md 3.0.
- [ ] **Step 3: Commit** — `docs: strip feel, stage ramp and offline income`.
