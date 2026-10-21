# Task 14 report
Done: README.md rewritten (zh-TW), docs/art-assets.md (hero, 12 monsters, 4 fx), src/render/assets.test.ts. Steps 4/5 skipped per ruling; wrangler.jsonc untouched.
RED: `npx vitest run src/render/assets.test.ts` failed (docs/art-assets.md missing). GREEN: `npm test` 23 files/180 tests pass; `npm run build` OK.
Deviation: test uses `import ... '?raw'` (vite/client types) instead of node:fs, because no @types/node and tsc -b failed on node:fs. Runs in node env under vitest.
Note: art doc states the game currently uses the whole PNG as one image (no sprite slicing), so multi-frame sheets are for later.

## Fix round 1
1. battle-view.ts: `fxSprite(key, color)` now sets `s.tint = tint(color)`; all 4 call sites pass `spellColor(spell)`. Placeholders untouched.
2. art-assets.md: fx_beam described as stretched along its length.
3. art-assets.md: all prompts request a single static frame; frame counts/sheet layout moved into "現階段 ... 單張；之後建議 ..." notes.
`npm test`: Test Files 23 passed, Tests 180 passed. `npm run build`: succeeds (only the existing chunk-size warning).
