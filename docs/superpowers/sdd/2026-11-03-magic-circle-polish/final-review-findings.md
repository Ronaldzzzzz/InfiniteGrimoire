# Final review findings to fix (one fix wave)

## Important
1. src/ui/CircleTable.tsx:229-238 `placeItem` puts a ring-2 element into the first empty RULE index (`indexOf(null)`), not into an open slot. Ring-2 defaults are RING2_DEFAULT (2→[1,4], 3→[0,2,3], 4→[1,2,3,4]); at Lv.8 placing a 高階 element from the element table lands at index 0, so shownSlots draws an extra slot. Fix: pick the first empty index from `shownSlots(ring, openSlotCounts(tier)[ring], filledIdx)`. Test: circleTier 8, ring 1 full, `placeItem('el:fire:3')` → ring 2 shows exactly 2 slots and the element is at rule index 1. Also add the missing test for 「一環要先放滿五格才能放二環」 (circleTier 7, tap 二環 第1格).
2. Acceptance (1): at 390px the core grade wheel's three 11px lines (e.g. 初階 / ×1200 / 上限 Lv.2) overflow the ~47px item. Spec §4 「手機：元素圈放大、不被紙邊裁掉」. Fix: item font-size `clamp(8px, 3.4cqi, 11px)` (.parchment has container-type inline-size); shorten the core's visible third line to `≤Lv.2` keeping the full 「上限 Lv.N」 in ariaLabel (update tests that assert the visible label accordingly — the ruled label text now lives in ariaLabel); abbreviate large counts (×1200 → ×1.2k, ≥1000). Verify at 390×844 that each item's scrollHeight <= clientHeight.
3. Acceptance (4): at Lv.10 ring-2 slots 2 and 5 are clipped by the parchment edge (1280 and 390). Spec §2 「仍要能完整看到陣」. Fix in CSS only (do not change geometry): shrink `.parchment` within the sheet (e.g. width 76%) or adjust per `.has-art` safe area; verify with a Lv.10 screenshot at both widths.

## Minor (fix in the same wave)
4. Acceptance (2): ≤600px the 「新發現！」 banner and equip toasts cover the result panel and prediction. Move `.discovery-banner` toward the top of the viewport on ≤600px (e.g. top: 12%) and the equip toasts so they don't cover the parchment's result/prediction.
5. Acceptance (3): rune-band glyphs collide at the 12 o'clock seam under ring-1 slot 1. Start the band path between slots (e.g. 36°) and set textLength one glyph shorter (circumference(r) − 14) to leave a gap.
6. Acceptance (5): without parchment.webp the desktop placeholder sheet is taller than the panel (width min(100%, 64vh) × 4:5 = 80vh). Make it fit (e.g. min(100%, 52vh) or max-height with aspect-ratio). Note public/ art is not in git, so other machines see the placeholder.
7. src/ui/picker-data.ts:48 TopBar spell picker is not veiled: during the 5 s rare charge the new spell name shows there. Pass the veil to the TopBar picker data too (same filter as GrimoirePanel/Notebook), with a test.
8. CircleTable.tsx:303-311 `run()` does not `setSuccess(false)`; re-synthesising within 0.9 s lets `.parchment.success` override the charging glow. Clear it at run start.
9. Focus drops to body after a pick, and after 關閉/backdrop on the grade step: pass `returnFocus` to the grade-step RingPicker and call it after setNode/setRune too. Spec §4 「焦點與鍵盤操作保留」. Test it.
10. Rune wheel: locked runes only have title 從魔王取得 (invisible on touch) — add a visible note (like the ring-2 note) when any rune is locked, e.g. 「未取得的符文從魔王取得」.
11. Reduced motion: `.light-pillar` shows as a static full pillar for 0.9 s; hide it (display: none) under reduced motion.
12. Rune band `<text>` add aria-hidden; remove the double blank line around CircleTable.tsx:532-533.
13. (from ledger) App.test "a new runtime drops the veil": assert 1 star before rerender (veil active), 2 after.
