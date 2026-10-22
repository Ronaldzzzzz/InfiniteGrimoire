# Final fix report — core rework whole-branch review

## I1 (Important): random recipes re-rollable for free

**Change** (`src/engine/crafting.ts`): the crafted fall-through lookup (input tokens → `craftedId` → `resolveSpell` → grade check → fusion cost) moved into a local `craftedOutcome()` helper. In the recipe branch, before `pickWeighted`, every eligible outcome is checked against the stock left after removing the inputs:
- named outcome not yet learned → its fusion cost must be removable;
- named outcome already learned → skipped (a named duplicate pays no fusion);
- `null` fall-through → `craftedOutcome()` must succeed (else reject with its `unknownInput`/`grade` reason) and its fusion cost must be removable (R14/R14b: a fall-through to a known crafted spell keeps the fusion cost paid, so its cost is always required).
Any failure returns `rejected` with the state unchanged and the RNG untouched. Post-roll paths unchanged (R14/R14b duplicate charging kept; the post-roll `insufficient` checks remain as defence but are unreachable for recipes).

**Tests** (`src/engine/crafting.test.ts`, new `describe` using shipped holy_judgment recipe `thunder_hammer + mat:sun_shard`):
- outcomes really differ: holy_judgment depth 3, `c(mat:sun_shard|thunder_hammer)` depth 2;
- stock covering only the crafted side (fire:2 + thunder:2) → seeds 1..40 all `rejected insufficient`, state equal;
- stock covering only the named side (fire:3 + thunder:3) → seeds 1..40 all `rejected insufficient`, state equal;
- stock covering both → seeds 1..60 all `learned`, the matching grade pair spent, both outcomes seen.

### RED (before the engine change)
```
       × stock covering only the crafted fall-through is rejected on every seed, spending nothing 8ms
       × stock covering only the named outcome is rejected on every seed, spending nothing 1ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
      Tests  2 failed | 20 passed (22)
```
(the "every outcome affordable" case already passed before the fix, as expected)

### GREEN
```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

## Flake: App.test.tsx `opens the account dialog from the top bar`
Smaller change chosen: an explicit `{ timeout: 5000 }` on the two `findByRole` waits in that test (the only findBy calls in the file), with a comment. No global setup change.

## Verification
- `npx vitest run src/engine/crafting.test.ts` → 22 passed
- `npx vitest run tests/sim` → 1 file, 7 passed
- `npm test` run 3 times → each 49 files, 443 tests passed
- `npm run build` → passed (only the usual >500 kB chunk notice)

## Concerns
None. Behaviour change: a random-recipe attempt now needs the larger of the outcome costs on hand; the UI already shows 「材料不足」 for `insufficient`.
