# Magic Circle Polish 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gacha-style synthesis effects for four outcomes, the 合成 button and side notes on the parchment, rune icons, a server-timed offline clear clock, and a centred equip toast with a countdown.

**Architecture:** Engine/worker changes only for offline timing (a new server-owned `pausedMs`, a fallback clear time, `none` reasons). Everything else is React/CSS in `src/ui`, plus one new Pixi overlay (`src/render/circle-fx.ts`) that only runs during a synthesis. No rule, probability or migration changes.

**Tech Stack:** React 19 + TypeScript, SVG/CSS, pixi.js ^8.22, Vitest/jsdom, Hono worker.

**Spec:** `docs/superpowers/specs/2026-11-03-magic-circle-polish-2-design.md` (decisions: `docs/superpowers/specs/2026-11-03-magic-circle-playtest-2.md` section 9).

## Global Constraints

- UI text in 繁體中文; commits Conventional Commits in English with the session's Co-Authored-By lines.
- All numbers are placeholders the user confirms later; name each as an exported constant.
- Server-owned fields only change on the server; `audit.ts` rejects client edits (AGENTS.md section 6). `tests/sim` routes stay at 0 rejections.
- React performance: narrow `useRuntime` selectors only (Profiler tests guard this).
- `MAX_ACTIVE_FX` (battle) is not touched; the circle overlay has its own cap.
- Development stage: always animate; no `prefers-reduced-motion` handling anywhere (spec section 3).
- Before each commit: `npm test` and `npm run build` pass.

## Review Focus

1. Server reply slower than 3 s: the charge must hold at the pause and reveal on arrival, never reveal a placeholder (Task 6 test).
2. Network error or rejection mid-charge: the orb fades, the circle stays, the existing message shows, and the Pixi layer stops (Task 6 test).
3. Leaving several times between two clears: every away span is subtracted exactly once, including an away still open at clear time (Task 1 test).
4. An old save without `pausedMs` loads with 0 and uploads are not rejected (Task 1 test via `readStored`/`parseState`).
5. Equip toast paused during a rare reveal: the countdown bar freezes and resumes from the remaining width, not from full (Task 4 test).

---

### Task 1: Offline clear clock (engine + worker)

**Files:**
- Modify: `src/engine/model.ts` (GameState), `src/engine/persist.ts`, `src/engine/audit.ts`, `src/engine/offline.ts`, `src/engine/stage-clear.ts`, `worker/app.ts` (upload baseline ~line 373)
- Test: `src/engine/offline.test.ts`, `src/engine/stage-clear.test.ts`, `src/engine/audit.test.ts` (or wherever server-owned field rejections are tested), `src/engine/persist.test.ts`

**Interfaces:**
- Produces: `GameState.pausedMs: number`; `CLEAR_TIME_FALLBACK = 2` exported from `offline.ts`; `OfflineResult` none variants become `{ kind: 'none'; reason: 'notCleared' | 'tooShort' } | { kind: 'none'; reason: 'cannotDamage'; zoneId: string }`.

- [ ] **Step 1: Write failing tests**
  - `stage-clear.test.ts` "subtracts away time from the recorded clear time": state with `lastClearAt = T`, `pausedMs = 600_000`; clear at `T + 900_000` records `max(minStageMs, 300_000)` and resets `pausedMs` to 0.
  - "records a clear even after an away": `offlineUntil > lastClearAt` no longer skips the record (only boss stages and `lastClearAt <= 0` skip).
  - "an away still open at clear time is subtracted": `awayAt = T + 100_000`, clear at `T + 400_000`, `pausedMs = 0` → recorded `max(minStageMs, 100_000)`.
  - `offline.test.ts` "claim adds the away span to pausedMs": `awayAt = A`, `lastClearAt < A`, claim at `A + 60_000` → `pausedMs` grows by 60_000 (also when the result is none); with `awayAt = 0` the span starts at `max(prevSavedAt, offlineUntil, lastClearAt)`.
  - "falls back to minStageMs × CLEAR_TIME_FALLBACK without records": the `ron` repro — `clearedStages {"mist_meadow":3}`, `clearTimes {}`, equipped spell that damages the zone, away 10 minutes → `kind: 'offline'` with loot.
  - "none reasons": nothing cleared → `notCleared`; equipped spell cannot damage → `cannotDamage` with the target `zoneId`; away < `OFFLINE_TICK_MS` → `tooShort`.
  - audit: an upload changing `pausedMs` is rejected with `'pausedMs changed'`.
  - persist: a stored save without `pausedMs` reads as 0.
- [ ] **Step 2: Run** `npx vitest run src/engine` — new tests FAIL.
- [ ] **Step 3: Implement** per spec section 5: add the field (default 0 in initial state, zod schema, `readStored` default), audit check next to `offlineUntil`, worker baseline copies `pausedMs: current.pausedMs`, `claimOffline` accumulates and falls back, `stageClear` subtracts `pausedMs` (+ `now − awayAt` when `awayAt > 0`) and resets it.
- [ ] **Step 4: Run** `npm test` (includes `tests/sim`, 0 rejections) and `npm run build` — PASS.
- [ ] **Step 5: Commit** `feat(engine): pause the clear clock while away and fall back without records`

### Task 2: Offline "no income" card

**Files:**
- Modify: `src/game/sync.ts` (offline listeners), `src/ui/AwayReport.tsx`, `src/ui/App.tsx`
- Test: `src/ui/AwayReport.test.tsx`, `src/game/sync.test.ts`

**Interfaces:**
- Consumes: Task 1's `none` reasons.
- Produces: `OfflineReport` widens to `Extract<OfflineResult, { kind: 'offline' }> | Extract<OfflineResult, { kind: 'none'; reason: 'notCleared' | 'cannotDamage' }>`; listeners receive none results except `tooShort`.

- [ ] **Step 1: Failing tests** — AwayReport renders 「還沒有通過任何關卡，離線時沒有收穫。」 for `notCleared` and 「裝備中的魔法打不動〈地點名〉，離線時沒有收穫。」 for `cannotDamage` (zone name from the result's `zoneId`); sync does not notify for `tooShort`.
- [ ] **Step 2–4:** implement, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): explain an away that earned nothing`

### Task 3: Always animate + locked runes show 「？」

**Files:**
- Modify: `src/ui/App.css` (remove both `@media (prefers-reduced-motion: reduce)` blocks, leave the one-line comment from spec section 3 at each spot), `src/ui/RareReveal.tsx` (drop the matchMedia branch), `src/ui/CircleTable.tsx` (`RuneWheel` items)
- Test: `tests/ui/layout-css.test.ts` (replace reduced-motion assertions with "App.css has no prefers-reduced-motion rule"), `src/ui/RareReveal.test.tsx` (delete the reduced-motion case), `src/ui/CircleTable.test.tsx`

- [ ] **Step 1: Failing tests** — css has no `prefers-reduced-motion`; a locked rune item's visible label is `？` and its aria-label is `未取得的符文`; it stays disabled; the note 「未取得的符文從魔王取得」 remains.
- [ ] **Step 2–4:** implement, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): always animate in development and hide locked rune names`

### Task 4: Equip toast centred with a countdown bar

**Files:**
- Modify: `src/ui/EquipToasts.tsx`, `src/ui/App.css` (`.equip-toasts`, `.strip-float .equip-toasts`, phone rule at ~line 249), `src/ui/App.tsx` only if the container must move
- Test: `src/ui/EquipToasts.test.tsx`, `tests/ui/layout-css.test.ts`

**Interfaces:** `EquipToasts` props unchanged.

- [ ] **Step 1: Failing tests** — each toast has `.equip-toast-bar` with `animation-duration` = remaining ms (`EQUIP_TOAST_MS` on first render) and `animation-play-state: paused` while `paused`; after pause/resume the remaining duration shrinks (fake timers); css: `.equip-toasts` is centred (`left: 50%` + `translateX(-50%)`, no `right:` offset), button `min-height: 44px`, toast text 15px; phone rule centred too.
- [ ] **Step 2: Implement** — bar animates `transform: scaleX(1 → 0)` with `transform-origin: left`; on resume re-key the bar with the remaining ms so it continues from the current width (`scaleX(remaining / EQUIP_TOAST_MS)` start value via a CSS variable). Position: top centre of the battle strip, below the stage bar row; must not cover stage bar, DPS or boss timer (check with the existing strip-float layout).
- [ ] **Step 3–4:** `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): centre the equip toast and show its countdown`

### Task 5: Rune icons

**Files:**
- Create: `src/ui/RuneIcon.tsx` (8 placeholder SVG glyphs + optional art), `src/ui/RuneIcon.test.tsx`
- Modify: `src/ui/CircleTable.tsx` (rune band + `RuneWheel`), `src/ui/useArt.ts` (`runeArtSrc(id: RuneId): string` → `/assets/rune-<id>.webp`), `src/ui/App.css`, `docs/art-assets.md` (prompt section for 8 rune icons, 256×256, transparent, dark ink line)

**Interfaces:**
- Produces: `RuneIcon({ id, size }: { id: RuneId | null; size: number }): JSX.Element` — renders inside an SVG (`<g>`); `null` draws the 「？」 glyph; uses `<image href>` when `useArt(runeArtSrc(id))` is true, otherwise the placeholder path. `RUNE_BAND_COUNT = 12`.

- [ ] **Step 1: Failing tests** — each of the 8 ids renders a distinct placeholder (`data-rune` attr, non-empty path); with art loaded it renders `<image>`; the band of a ring with a rune renders `RUNE_BAND_COUNT` icons and no repeated Chinese text; the wheel shows icon + small name for known runes, 「？」 icon for locked (Task 3 behaviour kept); aria-labels unchanged.
- [ ] **Step 2: Implement** — placeholder shapes per spec 6.1 (射 arrow, 刃 crossed blades, 波 concentric arcs, 鏈 linked rings, 域 grid in circle, 墜 falling star, 嵐 spiral, 臨 inverted triangle with dot); band icons evenly spaced on `RUNE_BAND_R`, joined by a thin decorative dashed arc; keep the band's click hit area and the charge spin.
- [ ] **Step 3–4:** `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): draw runes as icons on the band and the wheel`

### Task 6: Parchment layout — seal button on the sheet, side notes

**Files:**
- Modify: `src/ui/CircleTable.tsx` (move `.circle-go-row` inside `.parchment-sheet`; split prediction/warning into a left note and add a cost note), `src/ui/App.css`
- Test: `src/ui/CircleTable.test.tsx`, `tests/ui/layout-css.test.ts`

**Interfaces:**
- Produces: `.circle-note.predict` (prediction + fail chance via `failChance` from `circle-synth.ts` + circuit state + `MISMATCH_WARNING`) and `.circle-note.cost` (rows per element/grade needed vs held, `.short` when held < needed, from `circleCost`); `SIDE_NOTE_MIN = 150` (px each side).

- [ ] **Step 1: Failing tests** — `.circle-go` is a descendant of `.parchment-sheet` and positioned below `.parchment` (css: absolute, bottom within the sheet's lower 19% band, `min-height: 44px`); the reason text sits under it inside the sheet; the predict note shows the fail percentage and the mismatch warning; the cost note marks a short element; layout: a container query on the workbench puts the notes left/right of the sheet when the workbench is ≥ sheet width + 2 × `SIDE_NOTE_MIN`, otherwise stacked under the sheet (assert both rules exist in css); 清空魔法陣 stays outside the sheet.
- [ ] **Step 2: Implement** — notes styled as small paper slips on the desk; button styled as a wax seal; nothing overlaps `.parchment`.
- [ ] **Step 3–4:** `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): put the seal button on the parchment and notes beside it`

### Task 7: Charge and reveal timing, five reveal states, dev preview

**Files:**
- Modify: `src/ui/CircleTable.tsx` (`run`, effect state, `shownOf`), `src/ui/App.css`
- Create: `src/ui/circle-reveal.ts` (pure timing + kind mapping), `src/ui/circle-reveal.test.ts`
- Test: `src/ui/CircleTable.test.tsx`

**Interfaces:**
- Produces: `type RevealKind = 'fail' | 'success' | 'learned' | 'great' | 'mutation'`; `revealKindOf(r: ActionResult, content: Content): RevealKind` (failed→fail, rare→mutation, learned→learned, known→success); `PAUSE_MS = 300`; `MUTATION_MS = RARE_PROGRESS_MS - PROGRESS_MS`. `CircleTable` accepts an optional `fx?: CircleFxApi` prop (`{ charge(colours: string[], ms: number): void; hold(): void; reveal(kind: RevealKind): void; stop(): void }`) — Task 8 supplies the Pixi implementation; default is a no-op.

- [ ] **Step 1: Failing tests** (fake timers):
  - every outcome charges for exactly `PROGRESS_MS` with the same classes (no `rare` class before 3 s);
  - a reply arriving at 4 s: at 3 s the sheet has `.hold`, the reveal happens at reply time;
  - fail/success/learned reveal at 3 s with classes `.reveal-fail` / `.reveal-success` / `.reveal-learned`; `fx.reveal` called with the kind;
  - mutation: at 3 s `.reveal-mutation` (reverse: dim + starfield), result card and `onResult` at 5 s;
  - error/rejection mid-charge: `fx.stop()` called, circle kept, message shown;
  - dev preview: with `import.meta.env.DEV` and `?fx` in the URL, five buttons (失敗、成功、新魔法、大成功、異變) play the sequence without calling `sync`; absent otherwise;
  - `great` shows the kicker 「大成功！」.
- [ ] **Step 2: Implement** — CSS for spec 2.2 phases (brightening, centre orb growing, continuous small shake 60–90%, pause dim) driven by `--dur` and one `.charging` class; reveal classes per spec 2.3 (fail: white flash, ink smoke, ash ~1.5 s, shake 0.4 s; success: pillar + gold ring; learned: + element ring; great: white-gold double pillar, gold edge, scale 1.05 bounce; mutation: light pulled back in, dim, starfield, purple/element cracks, burst at 5 s).
- [ ] **Step 3–4:** `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(ui): same charge for every outcome and a distinct reveal for each`

### Task 8: Pixi particle overlay

**Files:**
- Create: `src/render/circle-fx.ts`, `src/render/circle-fx.test.ts`
- Modify: `src/ui/CircleTable.tsx` (or its parent) to create one `CircleFx` lazily on the first charge, mounted in `.parchment-sheet`

**Interfaces:**
- Consumes: `CircleFxApi`, `RevealKind` (Task 7).
- Produces: `class CircleFx implements CircleFxApi { constructor(host: HTMLElement); destroy(): void }`; `CIRCLE_FX_MAX = 400`.

- [ ] **Step 1: Failing tests** — with a mocked Pixi `Application` (follow how `battle-view` is tested, or test the pure particle model): particle count never exceeds `CIRCLE_FX_MAX`; `charge` spawns inward-moving particles in the given colours, density rising over `ms`; `hold` freezes velocities; each `reveal` kind spawns its pattern (fail: rising grey smoke then falling ash; success: gold burst ring; learned: + element ring, ×2 count; great: upward fountain; mutation: inward pull then burst at `MUTATION_MS`); ticker stops when no particles remain; `init` failure (rejecting promise) leaves a no-op instance and no throw.
- [ ] **Step 2: Implement** — transparent `Application` (`backgroundAlpha: 0`, `resizeTo: host`), canvas `pointer-events: none`, keep particle logic in a pure `step(particles, dt)` for testing.
- [ ] **Step 3–4:** `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(render): particle overlay for the magic circle`

### Task 9: Browser acceptance and docs

**Files:**
- Create: `docs/superpowers/sdd/2026-11-03-magic-circle-polish-2/acceptance.md`
- Modify: `AGENTS.md` (sections 3.0, 5, 6 for `pausedMs`, 10)

- [ ] **Step 1:** `npm run dev` + headless Chrome (puppeteer-core outside the repo) at 1280×900 and 390×844: preview each of the 5 reveals via `?fx` (screens at mid-charge, pause, reveal); one real fail and one real success; seal button not over the circle; side notes in both layouts; equip toast position and bar; away ≥ 30 s then back → income card, and a cannotDamage card; locked rune 「？」; no page errors. Seeds into local D1 must be listed in the report.
- [ ] **Step 2:** write the report and update AGENTS.md; `npm test`, `npm run build`.
- [ ] **Step 3: Commit** `docs: polish 2 acceptance and hand-off`
