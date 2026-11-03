# SDD ledger — plan: docs/superpowers/plans/2026-11-03-magic-circle-polish.md
Spec: docs/superpowers/specs/2026-10-31-magic-circle-polish-design.md. Branch feat/magic-circle, start a5510e8.

## Pre-flight scan
| Tasks | Shared | Produces → consumes | Found |
|---|---|---|---|
| T1↔T6 | CircleTable.tsx `charging` | T1 onCharging around run(); T6 turns charging into {ms, rare} | ok — T6 must keep onCharging calls at the same end points |
| T2→T3 | circle-draw.ts | shownPoint/openSlotCounts → RingPicker `at` | ok |
| T3→T4 | RingPicker.tsx, CircleTable Picker | T3 removes element branch of Picker; T4 removes rune branch + uses RingPicker | ok |
| T2→T6 | `.wire.clash` | T2 adds class + red stroke; T6 adds flash | ok |
| T4→T6 | `.rune-band` | T6 spins it | ok |
| T5→T6 | `.parchment-sheet` | T6 raises sheet z-index above `.rare-dim` | ok |
| T2..T7 | App.css | additive sections | ok — each task edits its own rules |
| T1 self | tests vs code | onCharging true/false at every exit; veil filter | ok |
| T2 self | loaded-placement test | needs core grade ≥中階 and ring-1 rune for 合成 enabled | ok (test must build a valid placement) |
| T3 self | grade label | test expects 「初階 ×3（上限 Lv.2）」 | Ruling below |
| T5 self | art-assets section already written | brief says check only | ok |
| T7 self | sector order test vs StarMap labels | both SECTOR_ORDER | ok |

Ruling: core grade label on the wheel is exactly `<階級> ×<n>（上限 Lv.<cap>）`, node grade label `<階級> ×<n>` — plan test text fixes it — cosmetic only.
Task 1: minor (deferred): App.test "a new runtime drops the veil" should assert 1 star before rerender (veil active) then 2 after
Task 1: minor (deferred): no CircleTable→App→StarMap integration test of hide-until-reveal
Task 1: complete (commits a5510e8..312b783, review clean)
Ruling: T2 clash test uses 土 as the non-clashing node instead of the plan's 風 — 火剋風 per COUNTERS, plan text was wrong — none.
Ruling: T2 "二環 序號 1" in plan means label 二環 第1格 = rule index 0 (RING2_DEFAULT[1] = [0]) — matches the plan's own table — none.
Task 2: minor (deferred): lost test for 「一環要先放滿五格才能放二環」 (add circleTier 7 tap 二環 第1格)
Task 2: minor (deferred): shownPoint maps unlisted j to position 0 silently
Task 2: complete (commits 312b783..f44f95d, review clean)
Ruling: T3 backdrop tap always closes the wheel (also on the grade step); Escape on the grade step goes back — spec §4 says 點圈外關閉, plan only made Escape step back — a misread costs one extra tap.
Task 3: minor (deferred): focus drops to body after a pick (old picker same); no aria-modal / Tab trap; double blank line circle-draw.ts; `choose` test helper parses option.source by regex; no RED run captured
Task 3: fix round 1/5 (3 addressed, 0 open — grade wheel overlap/clip, visible ring-2 reason, backdrop closes; commits c1cbe94..a641bf4)
Task 3: minor (deferred): grade-step wheel has no returnFocus; 11px 「上限 Lv.2」 fit inside ~45px item unverified in browser; wheel geometry assumes the .parchment stays square (Task 5 must keep it square)
Task 3: complete (commits f44f95d..a641bf4, review clean)
Ruling: spec §5 「選定的符文在合成前微微發光」 (resting glow on a filled .rune-band) moves to Task 6 with the other animations — Task 6 owns rune-band effects — none if Task 6 does it.
Task 4: minor (deferred): "inert while injecting" test leaves reply unsettled, has `void reply` noise, does not assert aria-disabled/tabIndex on the band
Task 4: minor (deferred): band <text> not aria-hidden (repeated glyphs may be read); band hit ring overlaps slot-button outer edges (slots win); textLength glyph spacing unchecked in browser
Task 4: complete (commits a641bf4..ee89175, review clean)
Task 5: minor (deferred): .parchment-sheet drop-shadow is cut by clip-path in the no-art fallback (no lift)
Task 5: fix round 1/5 (3 addressed, 0 open — ink filter user space, useArt unmount test, desk art via useArt+has-desk; commits 1a5dfbd..613eb35)
Task 5: complete (commits ee89175..613eb35, review clean)
Task 6: minor (deferred): charging swaps the .draw animation name so lines blink out and redraw 0.6 s at charge start/end and circle-bloom is lost during charging — check in browser
Task 6: minor (deferred): gold wires on parchment contrast unverified in browser
Task 6: fix round 1/5 (3 addressed, 0 open — reduced-motion charging spin, no-op expect, success rule; commits ce33992..c38494b). Controller ran npm test 81/926 pass, build ok.
Task 6: minor (deferred): .parchment charging/success/shake share `animation` at equal specificity (later wins if combined)
Task 6: complete (commits 613eb35..c38494b, review clean)
Task 7: minor (deferred): BACKDROP dots radius up to ~400 can fall outside the initial view; d489e9a committed with a failing test (fixed in e359989)
Task 7: fix round 1/5 (2 addressed, 0 open — phone node-card override order, phone viewBase 380; commits e359989..c31d99c)
Task 7: minor (deferred): phone width read at render (resize across 600px applies on next render); no test of narrow detection in GrimoirePanel
Task 7: complete (commits c38494b..c31d99c, review clean)
Task 8: complete (commits c31d99c..f34a9e2, docs-only acceptance; 9/9 functional pass; 5 UI problems listed in acceptance.md go to final review)
Final review: With fixes — 0 Critical, 3 Important (placeItem ring-2 index, 390px grade wheel overflow, Lv.10 ring-2 clipped), 9 Minor; all sent as one fix wave (final-findings.md)
Ruling: final-review "declined to judge" items (Pixi layer, placeholder numbers, visual vs rule adjacency, desk only on right column, committing art, old star-map density, Lv.4/6/8/10 wording, old progress-fill/picker-lock behaviour) stay out of this branch — spec defers them to the user — user decides after playtest.
Final fix wave: 13/13 addressed (commit f34a9e2..5888b9d), re-review clean. npm test 81/945, build ok.
Final: minor (deferred): module-level `short` shadowed inside CircleTable; wheel items ~42px at 390px (< 44px touch target) after .parchment 76%; ≤600px toasts fixed at top 112px assume topbar height
