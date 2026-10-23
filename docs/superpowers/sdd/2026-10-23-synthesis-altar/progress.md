# SDD ledger — plan: docs/superpowers/plans/2026-10-23-synthesis-altar.md

Spec: docs/superpowers/specs/2026-10-23-synthesis-altar-ui-design.md
Branch: feat/synthesis-altar (from feat/core-rework 2c98bfc; merged main 81bee37 for the spec and plan → 93ec04c)
Briefs / reports / review packages: .superpowers/sdd/2026-10-23-synthesis-altar/ (git-ignored scratch)

Ruling: the ledger lives here in docs/ (project convention, plan Global Constraints) while briefs, reports and review packages stay in the git-ignored SDD workspace — keeps the repo record small — cost if wrong: TDD evidence is not versioned (it never was required to be).
Ruling: the controller created the branch and this ledger (Task 1 Step 0) before dispatching — bookkeeping belongs to the controller — cost if wrong: none.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 (GrimoirePanel.tsx) | `.tree-stage`, `onGesture`, `bubblePlacement` → bubble/card positioning and closing | consistent |
| T2 → T3 (GrimoirePanel.tsx, GrimoirePanel.test.tsx) | T2 rewrites the Profiler test, which still asserts the key item button (大鵬之眼) → T3 removes key items from the panel | T3 must move that assertion to KeyItemBar.test — noted in T3 dispatch |
| T2 → T6 (App.test.tsx) | T2 rewrites hint test #2, keeps #1 (`殘卷線索` label) → T5 altar keeps `aria-label="殘卷線索"`, T6 rewrites slotTexts | consistent |
| T2 → T6 (App.tsx) | `slotsFull` prop → App passes it | consistent |
| T3 → T6 (App.tsx) | KeyItemBar + `lifting` state → kept when the altar is wired | consistent |
| T3 App test | tab switch test needs `sync.action` to resolve `{kind:'revealed', region}` and a key item in inventory | noted in T3 dispatch |
| T4 → T5 | `describeInput(id, content, levels)`, `lookOf`, `revealOf` | names and types match |
| T5 → T6 | T5 moves `Slots/emptySlots/fillSlot` to SynthesisAltar.tsx; App.tsx still imports them from SynthesisPanel | **conflict** — see Ruling P1 |
| T1 self | wheel test asserts width / 1.1 regardless of cursor point; jsdom has no getScreenCTM → centre fallback | consistent |
| T2 self | tests use slotsFull prop; setup() must pass it | consistent |
| T3 self | creates KeyItemBar, removes panel key items, App wiring | consistent |
| T4 self | pure functions, tests match signatures | consistent |
| T5 self | "不呼叫 onResult 以外的東西（rejected 照現狀呼叫 onResult）" reads oddly | see Ruling P2 |
| T6 self | deletes files T5 left importing from altar | consistent after P1 |
| T7 self | docs + acceptance | consistent |

Ruling P1: in Task 5, App.tsx switches its `Slots/emptySlots/fillSlot` import to SynthesisAltar.tsx (SynthesisPanel imports them too) — keeps every task compiling — cost if wrong: one extra line of churn.
Ruling P2: Task 5 on a refusal/null/throw: stop fusing at once, bounce, keep the inputs, show the message; call onResult only for `rejected` (as SynthesisPanel does today), never for null/throw — matches spec 3.4 and current behaviour — cost if wrong: App ignores rejected results anyway.

## Tasks
Task 1: implemented 8f33fad (base 93ec04c); review: spec ❌ 1 Important (drag scale uses rect width only — non-square stage lags the cursor). ⚠️ `.grimoire-tabs`/`.grimoire` class names verified in App.tsx/GrimoirePanel.tsx.
Task 1: minor (deferred): press, leave the svg before 4px, release outside → `drag.current` stays set; re-entering with no button pans (guard on `e.buttons === 0`).
Task 1: minor (deferred): drag reads the `base` closure while applyView reads `baseRef`.
Task 1: minor (deferred): wheel useEffect has no deps array (re-adds the listener every render).
Task 1: minor (deferred): no component test for cursor-centred wheel zoom; `.grimoire-col > :not(...)` selector is brittle.
Task 1: fix round 1/5 (1 addressed, 0 open; commits 8f33fad..402268b)
Task 1: complete (commits 93ec04c..402268b, review clean)
Task 2: implemented 4532b32 (base 402268b), DONE_WITH_CONCERNS (extra onClose prop on NodeBubble; runAction copied into NodeCard to avoid a cycle; bubble placement untested in jsdom)
Task 2: review spec ✅, quality Approved.
Task 2: minor (deferred): runAction duplicated in NodeCard.tsx and GrimoirePanel.tsx — Task 3 dispatch asks to share it once key items leave the panel.
Task 2: minor (deferred): same spell placed twice within 1.5 s doesn't restart the toast timer / replay the flash.
Task 2: minor (deferred): BUBBLE_SIZE.h = 96 fixed; a locked-spell bubble with a long hint can be taller (check in browser, Task 7).
Task 2: minor (deferred): Esc only works while focus is inside `.grimoire` (svg not focusable after a blank click).
Task 2: minor (deferred): stray blank lines in App.css where `.node-detail` rules were removed.
Ruling: (Task 2 ⚠️) the 「已放入合成台」 toast fires on every onPick even if App.pick no-ops during synthPending — carried into Task 6: placement entry points (bubble, card, double-click) are disabled/no-op while synthPending so the toast never lies — cost if wrong: a misleading toast on mobile.
Ruling: (Task 2 ⚠️) real-getScreenCTM bubble placement near edges is checked in the Task 7 browser pass — jsdom cannot reach it — cost if wrong: a clipped bubble found later.
Task 2: complete (commits 402268b..4532b32, review clean)
Task 3: implemented 9f697a2 (base 4532b32), DONE (no separate RED for KeyItemBar.test)
Task 3: review spec ✅, quality Approved. ⚠️ `.battle { position: relative }` verified in App.css; 140px fit → Task 7 browser pass.
Task 3: minor (deferred): two key uses with the same message text don't restart the 3 s timer (key the message with a counter).
Task 3: minor (deferred): a key button isn't disabled while its own request is in flight (double click → second reveal 422).
Task 3: minor (deferred): keyList selector runs visibleRegions on every snapshot change (was memoised per `revealed`).
Task 3: minor (deferred): App's FOG_LIFT_MS clear timer has no test.
Task 3: complete (commits 4532b32..9f697a2, review clean)
Task 4: implemented 867c3a2 (base 9f697a2), DONE (ActionResult imported from src/game/api.ts — plan named model.ts)
Task 4: review spec ✅, quality Approved. ⚠️ ActionResult is exported from src/game/api.ts (App.tsx already imports it there) — verified; build green per report.
Task 4: minor (deferred): verbose level clamp; `detail` thunk; tests hard-code hex colours (compare against COLORS/particleStyle); empowered/unlocked null cases untested.
Task 4: complete (commits 9f697a2..867c3a2, review clean)
Task 5: implemented a605452 (base 867c3a2), DONE (ELEMENT_NAMES exported from messages.ts; headless Edge screenshots checked by implementer; fps not yet measured → Task 7)
Task 5: review spec ✅, quality Approved. ⚠️ fps next to Pixi → Task 7; Review Focus 1 → Task 6.
Task 5: minor (deferred): bounce timer has no seq guard (a second refusal within 400 ms gets its shake cut short).
Task 5: minor (deferred): an applied reply landing after the altar unmounts skips onSlotsChange/onResult — harmless while the altar is always mounted (App never unmounts it); carried into Task 6 as a constraint.
Task 5: minor (deferred): the reveal is dismissable by click only, not keyboard (it still times out / ends on placement).
Task 5: minor (deferred): `isItem` duplicated in SynthesisPanel.tsx (deleted in Task 6).
Task 5: complete (commits 867c3a2..a605452, review clean)
Task 6: implemented ccccfca (base a605452), DONE_WITH_CONCERNS (no screenshots — no puppeteer in project; reply→reveal window where synthPending is already false).
Ruling: the reply→reveal window (≤800 ms, synthPending false) needs no extra guard — a synthesis only starts with both sides filled, both stay filled until the reveal, so slotsFull blocks the bubble/card/double-click and fillSlot is a no-op — cost if wrong: a placement wiped by the reveal.
Task 6: review spec ✅, quality Needs fixes — 1 Important (App pending-guard test is vacuous: both sides already full). ⚠️ altar sides locked while fusing and slots cleared at reveal — confirmed by Task 5 review (SynthesisAltar.tsx sides disabled while fusing; clear inside show()).
Task 6: minor (deferred): Notebook 放進合成槽 gives no disabled state while pending (click is a silent no-op).
Task 6: fix round 1/5 (1 addressed, 0 open; commits ccccfca..a1e0dc8)
Task 6: complete (commits a605452..a1e0dc8, review clean) — the re-reviewer's reply→reveal-window note is covered by the Task 6 Ruling above.
Task 7: implemented 3123ee0, 4ba7d6e (base a1e0dc8), DONE — 10/10 acceptance in headless Edge; fps 160 idle / 149 dragging+altar (few monsters); fixed learned-bubble height (96→132)
Task 7: review spec ❌ 1 Important — AGENTS.md branch stack wrong (main already contains MVP + v2a; only feat/core-rework → feat/synthesis-altar are unmerged/unpushed); the error came from the controller's own dispatch text.
Task 7: minor (deferred): bubble-height test only guards constants (≥128/≥94), not bubbleAt choosing learned vs locked.
Task 7: fix round 1/5 (1 addressed, 0 open; commits 4ba7d6e..1d27e9b)
Task 7: minor (deferred): AGENTS.md "再多 13 個" commit count drifts as commits land (drop the exact number).
Task 7: minor (deferred): on <768px clicking a locked spell grows the hint box above the tree (~18px shift), so the open bubble sits offset from its node (not clipped).
Task 7: complete (commits a1e0dc8..1d27e9b, review clean)

## Final review (2c98bfc..1d27e9b, opus): With fixes — Critical 0, Important 3
- I1: ledger not committed; AGENTS.md §2 reading table lacks the new spec/plan/ledger → controller commits the ledger; §2 rows go into the fix wave.
- I2: spec 3.3 「合成台已滿」 hint missing from bubble/card (plan gap) → fix wave.
- I3: wheel zoom ignores delta size (trackpad jumps to 3× in 0.2 s) and treats deltaY 0 as zoom-out → fix wave.
- Must-fix deferred minors: Task 1 stuck drag (`e.buttons === 0`); Task 7 AGENTS.md commit count → fix wave.
Ruling: the fix wave also takes final-review minors M1 (memo SynthesisAltar/KeyItemBar + stable onSynthResult — the spec §3.2/§7 narrow-render guarantee should hold in the real app), M3 (wheel listener on `.tree-stage` — spec §6 says the wheel over the tree only zooms) and M6 (closeAll clears `selected`) — each is small and spec-aligned — cost if wrong: a slightly larger fix diff.
Ruling: final-review minors M2 (result lights the tree before the reveal), M4 (bubble keyboard focus order), M5 (bubble position not recomputed on fog lift/resize), M7 (reveal announced twice), M8 (side aria-label hides tier/stock) stay deferred — polish, none blocks the user's playtest — cost if wrong: accessibility/polish debt recorded here.
