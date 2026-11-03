# Final fix report (polish 2)
Commands: focused `npx vitest run <file>` per item; final `npm test` -> 84 files, 996 tests pass; `npm run build` passes (only the chunk-size warning).
1. circle-fx.ts app.init gets resolution devicePixelRatio||1 + autoDensity. Test: circle-fx.test "sharp on a dense screen".
2. App.css --key-row-h 64px (layout-css test does not assert the value; still passes).
3. AGENTS.md: removed 「決定要不要做 Pixi 特效層 →」.
4. CircleTable: abort sets `fading` for 300 ms (ORB_FADE_MS), renders `.charge-orb.fade` (CSS fade keyframes). Test: "a refusal mid-charge fades the orb for 300 ms".
5. CircleTable: `pausing` state set at PROGRESS_MS - PAUSE_MS, class on sheet; CSS pauses `.spark` under `.pausing`. Test: "sparks freeze for exactly the last PAUSE_MS" (299/300 boundary).
6. Predict note shows `.circle-ok` 「迴路對得上」 when a placement has no mismatch. Tests added/extended in CircleTable.test.
7. useArt: module-level cache + shared probe per src, accepts null (no probe); RuneIcon passes null for the locked glyph; resetArtCache for tests. Tests: useArt.test, RuneIcon.test (12 icons + locked -> one probe).
8. circle-fx init: post-init setup wrapped in try/catch -> canvas.remove(), app.destroy, rethrow (failed flag). Test: "a throw after init destroys the app and removes the canvas".
9. stage-clear.test: two settled aways + one open away at the clear; recorded time = 300 s, pausedMs/awayAt reset.
