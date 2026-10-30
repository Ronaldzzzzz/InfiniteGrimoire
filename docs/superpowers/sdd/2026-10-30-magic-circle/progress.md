# SDD ledger — plan: docs/superpowers/plans/2026-10-30-magic-circle.md
Spec: docs/superpowers/specs/2026-10-30-magic-circle-design.md. Branch feat/magic-circle from main e7c28de.

## Preflight scan
| Rows | Produces / consumes | Finding |
|---|---|---|
| T1 self | circle.ts rules + circle-rules.json + content validation | ok |
| T1↔T2 | T2 consumes parseCanonical/relations/RuneId | ok |
| T2 self | removes c(…) resolution while crafting.ts/worker still call synthesize until T3 | conflict: T2 removing crafted resolution breaks crafting.ts/worker tests before T3 removes them |
| T2↔T3 | T3 removes crafting.ts/recipes; T2 adds `circle` on named defs | ok once T2 keeps old code compiling |
| T2↔T4 | T2 skips route sims, T4 re-enables | ok (ruling R0 below) |
| T3 self | revealed→circleTier touches tree/audit/worker/UI (GrimoirePanel/KeyItemBar use revealed) | conflict: UI still reads revealed until T6 |
| T3↔T5 | T5 consumes synthesizeCircle action + /api/circle | ok |
| T3↔T6 | T6 consumes circleTier & key-item use | ok |
| T5↔T6 | T6 consumes loadPlacement from T5 | ok |
| T7 self | docs + acceptance | ok |
Ruling: T2 keeps `c(…)` resolution and the old crafting path compiling (only adds `m:` resolution and textbook `circle` fields); removal of crafted ids, crafting.ts and recipes happens in T3 together with the endpoint swap — keeps each task green — cost if wrong: one extra task of dead code.
Ruling: T3 may leave UI references to the removed `revealed`/fog compiling by minimal shims (e.g. treat every region as visible) until T6 replaces the tree; the old altar UI may call a removed endpoint only if its tests are updated/removed in T3 or it is switched to /api/circle in T5 — T3 must keep `npm run build` green — cost if wrong: brief UI dead paths between T3 and T5/T6.
Ruling R0: tests/sim route files may be describe.skip from T2 until T4 (as the plan says) — sims are the anti-cheat net; cost: no route coverage for T2–T3.
Task 1: dispatched (base e7c28de, implementer sonnet)
Task 1: Ruling: brief test "[水,土,火,雷,風] → 0 相剋" was wrong (with 相生 on the circle every star line is 相剋); implementer's 5/5 expectation stands — cost: none.
Task 1: Ruling: spec 2.5 examples 煉獄 (火 core + 風 node, 火剋風) and 萬雷 (雷 core + 水 node, 雷剋水) break the circuit rule; Task 2 re-lays them with non-counter companion elements (spec 2.5 table is "only to align 陣→效果") — cost: those two textbook spells lose the exact node mix shown to the user.
Task 1: review — spec ✅, approved. ⚠️ resolved: 煉獄/萬雷 conflict already ruled (re-lay in Task 2). ⚠️ branch table: thunder ring-1 nodes only match a thunder core, earth ring-1 only earth ring-2 — Ruling: Task 2 may tune circle-rules.json branch numbers (placeholders) so its dual-element textbook circles connect, keeping the "uniform single-element circle always connects" invariant — cost: branch personalities shift.
Task 1: minor (deferred): parseCanonical accepts tier < 1+nodes (ids from over-cap layouts); runesUnlocked takes content but reads module-global rules (inconsistent injection); node grade / ring length not validated in Placement (Task 3 must validate client placements); no test for ring1↔ring2 branch mismatch or slotShift; core.out is a total, UI must pick what to show.
Task 1: complete (commits e7c28de..0d4907c, review clean)
Task 2: dispatched (base 0d4907c, implementer opus)
Task 2: review — spec ❌ (rare spells outside any curve check), quality needs fixes (1 Important: rare weaker than its own circle's normal Lv.10; mult raise hid it; 8 minor)
Task 2: Ruling: rare spells are derived from their own circle's generated Lv.10 spell with a fixed RARE_BONUS (attack ×1.5, placeholder) plus the rare name/text, instead of hand data with patched mults; curve rule added: rare ≥ its circle's normal spell and ≥ ×1.5 the Lv.9 median (DPS, not stage time) — a 2% roll must never be worse than the miss; cost: rare spells lose their hand-made effect flavour until project 3 multi-form.
Task 2: ⚠️ carried to Task 3: server must check placementProblems and circuitMismatches on the client placement.
Task 2: minor (deferred): node bonuses ignore core-cap tier; resolveSpell accepts non-connecting canonical ids (persist validity ≠ craftable); circleSpell reads global circleRules; spells.ts↔circle-spell.ts import cycle; named overlay keeps old desc (mismatch e.g. 岩槍/湧泉之環); content.ts doesn't validate circle circuits at load; measure.ts output label confusion; TDD order.
Task 3: note — a non-connecting circuit is NOT a refusal; it raises big-failure chance (spec 3.3/3.4, parent design 4.1 '對不上不是不能合成'). placementProblems are refusals.
Task 2: fix round 1/5 (3 addressed, 0 open; commits 81e302d..876bf1f)
Task 2: minor (deferred): rare spells' stored `effects` in spells.json are now dead data.
Task 2: complete (commits 0d4907c..876bf1f, review clean)
Task 3: dispatched (base 876bf1f, implementer opus)
Task 3: implementer concerns noted — depth passive bonus now inert (depthCap removed); KeyItem.reveals/regions still in content; learned-count passive now counts m: ids; rare roll of an already-known rare returns plain `known`; shims: SyncController.synthesize refuses 'retired', GrimoirePanel all regions visible, KeyItemBar sends keyItem; sims pure-paths + rare-cost skipped.
Task 3: review — spec ✅, approved. ⚠️ resolved by controller: circle-rules.json tierUnlocks = storm_heart 4, thunder_eye 6, magma_seal 8, titan_crown 9, star_sigil 10 (matches); circle.ts helpers were reviewed in Task 1.
Task 3: minor (deferred): a lower key item after a higher one is refused noEffect and stays as a dead item; CircleReply type allows rare on known; d1 0008 test compares to current initial state (breaks on future fields); depth passives inert (Task 6); worker "refuses" test near the 10-guest/hour limit; no RED for worker/d1 tests.
Task 3: complete (commits 876bf1f..3a2e256, review clean)
Task 4: dispatched (base 3a2e256, implementer opus)
Task 4: Ruling: mixed route changed from fire+wind to thunder+wind (fire–wind are 相剋 and the old named recipe is gone) — accepted; rare-cost print-only (old bound assumed 1-material cost); pure-paths checks circleTier 10 instead of all regions revealed — cost if wrong: weaker gates on rare farming time.
Task 4: review — spec ✅, approved. ⚠️ GRADE_CAP last = 10 checked by controller.
Task 4: minor (deferred): mixed-route ofPath filter near-tautological; bot routeCircle reduce over empty runes / unchecked resolveSpell!; sim never exercises the rare roll.
Task 4: complete (commits 3a2e256..f186dbd, review clean)
Task 5: dispatched (base f186dbd, implementer opus)
Task 5: review — spec ✅ but 1 Important (disabled slot reason only in aria-label/title, invisible on phones); minors: ring shrink on 3→5 s (accepted), ring until reply on refusal (accepted, "no full animation"), old 放入合成 copy + slotsFull prop for Task 6, CircleTable 480 lines, Picker below parchment / no focus / no Escape, circle-draw helpers only used by tests, no RED for circle-draw.
Task 5: Ruling: a rare roll of an already-known rare also runs 5 s — it is still the rare event the 5 s marks — cost: none.
Task 5: fix round 1/5 (3 addressed, 0 open; commits baa08da..e45d958)
Task 5: minor (deferred): message-line test finds role=status with empty name (fragile); 390 px picker/guide not seen in a browser (Task 7).
Task 5: complete (commits f186dbd..e45d958, review clean)
Task 6: dispatched (base e45d958, implementer opus)
Task 6: Ruling: star links kept literal ("share node elements on the same ring" → 109 faint lines with all 31 textbook circles); the user decides at playtest whether to thin them — cost: busy map.
Task 6: Ruling: two non-adjacent elements (e.g. 火+土) average into a third element's sector — accepted for now (inherent to 5 sectors on a circle) — cost: a dual spell may look like it belongs to another element.
Task 6: Ruling: CircleTable's hint box (「在魔導書點未學會的魔法」) removed since the star map shows no unlearned spells — cost: none.
Task 6: review — spec ✅, approved. ⚠️ label overlap in crowded sectors → Task 7 browser check.
Task 6: minor (deferred): links O(n²) uncapped (measure fps with many learned in Task 7); StarMap test re-implements App pick (App.test covers); NodeCard chant type assertion; BUBBLE_SIZE.locked unused; key-items.json desc still fog-era copy shown on KeyItemBar; no star-map label layout test; RED by moving the file.
Task 6: complete (commits e45d958..210b2e2, review clean)
Task 7: dispatched (base 210b2e2, implementer sonnet)
Task 7: acceptance — spec 5 items 1–9 pass in headless Chrome; problems routed to the final fix wave: P1 parchment guide path no fill:none (black pentagram); P2 390 px element picker shows ~3.5 of 7 options, 關閉 only by inner scroll; P3 390 px star map small, detail card clipped; P5 key-items desc fog-era copy. P4 hairball with ~100 random learned circles → user decision (links ruling). P6 local discoveries already had a 焚世之焰 first finder (local data, not a bug).
Task 7: review — docs need fixes (stale rare-recipe rule in §6, deploy migrations 0001～0006, old altar/tree todos, GM recipes tab description, heading date) → fix round 1 dispatched
Task 7: fix round 1/5 (4 addressed, 1 partly — minor leftovers routed to the final fix wave: AGENTS.md:175 stale "0001→…→0006 / 0006 一定要先套用" parenthetical; AGENTS.md:277 降級落空 and :275 魔導書過載 items still read as live; fix report wrongly claims a recipe-table.ts change; commits a43145c..9f49874)
Task 7: complete (commits 210b2e2..9f49874, minors routed to final fix wave)
Final review: dispatched (range e7c28de..9f49874, opus)
Final review: fix before merge — 0 Critical; Important: P1 guide fill, P5 key-item copy, P2 390 px picker actions, synthesisLog unbounded (save > 64 KB after ~300 circles → 413, account stuck).
Final review: Ruling: synthesisLog compacted to an attempts count per canonical circle (project 3 proficiency needs only that; the DB keeps recordSynthesis detail) with a cap of 1000 entries (drop the least-attempted); persist/audit follow — cost if wrong: per-result history in the save is lost.
Final review: Ruling: runes derive from the audited upload's defeatedBosses (a boss kill is audited: key items and boss-before-stages checks) instead of a separate server-only field — accepted; spec 3.9 "server-owned" satisfied by the audit — cost if wrong: a forged boss kill would also unlock runes (already blocked by audit).
Final review: fix wave dispatched (P1, P5, P2, synthesisLog cap, GM recipe table shows 90% after FAIL_BASE, AGENTS.md:175/:275/:277 leftovers, stale fog comments in audit.ts/content.ts).
Final review: minor (deferred): resolveSpell('fireball') returns old hand-tuned numbers (unused path); parseCanonical accepts non-minimal tier ids; dead named spells / mana_overload / rare effects data still in per-tier content check; P3 phone star map/card size (playtest); P6 local discoveries leftover.
Final review: fix wave 3dad160 re-reviewed — 6/6 addressed, no new Critical/Important.
Final review: minor (deferred): persist.ts now imports SYNTH_LOG_CAP from circle-synth; AGENTS.md:175 repeats the 0007/0008 reset note.
