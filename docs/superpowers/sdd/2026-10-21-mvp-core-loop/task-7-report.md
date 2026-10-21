# Task 7 report
Implemented src/engine/validate.ts (GAIN_TOLERANCE, GAIN_SLACK, maxGain, validateUpload) and validate.test.ts (19 tests: all 10 brief cases plus maxGain, material, set-compare, chained-boss, unhittable-boss cases).
Rulings applied: boss drops x (floor(maxKills/killsForBoss)+1) only if a learned spell can damage the boss; elements in grade-1 equivalents; per-key bound with slack per element/material (including unknown materials, bound 0); negative elapsed = 0; learned as set; synthesisLog key-order-normalised JSON compare.
Detail: per-kill normal drop max is taken per key over damageable monsters of the zone (a kill is one monster), which is <= the brief's summed version; zone bound is the max over unlocked zones per key.
TDD note: tests and implementation were written in the same step; the RED run (module missing) was not captured separately. First GREEN attempt had 3 failures from test/reason-text mistakes (fixed: boss reason names the boss id; two test expectation errors).
GREEN: npx vitest run src/engine/validate.test.ts -> 19 passed; npm test -> 10 files, 92 passed; npm run build -> ok (tsc -b + vite).
Concern: bosses removed from defeatedBosses are not flagged (brief silent).

## Fix round 1
Changes (validate.ts): maxGain gains optional 4th param zoneIds (default prev.unlockedZones); per key bound = max over zones of (zone total + sum of other zones' maxAlive x per-kill-max burst). validateUpload passes prev.unlockedZones plus zones unlocked by new bosses that are in an available zone AND hittable. Reject shrinking defeatedBosses ("defeatedBosses lost boss X").
Tests (fixture data2, +10 tests): early-boss-then-farm-zone-2 ok; locked-zone gain rejected; boss-in-locked-zone now hittable so only the locked rule rejects; unhittable-boss drops excluded; per-monster max (28 water, not sum/per-entry); multi-zone max + burst (fire 28); zoneIds override; tolerance boundary (mat 9 ok/10 rejected, fire 13/14); defeatedBosses shrink.
Mutation checks (each mutation reverted afterwards), tests that failed:
- boss gate `if (canHit(zone.bossId))`->true: "excludes drops of a boss no learned spell can damage"
- locked-zone reason disabled: "boss in a locked zone rejected even though a spell can hit it"
- per-monster max -> sum: "per-monster maximum..." + 2 more
- burst term removed: "takes the max across zones and adds a maxAlive burst"
- zones passed = prev.unlockedZones: "boss killed early, then farming the newly unlocked zone, is ok"
- shrink check disabled: "defeatedBosses shrinking is rejected"
- tolerance +1: "tolerance boundary..." and an older test
- max-across-zones -> sum: "takes the max across zones..."
Results: `npx vitest run src/engine/validate.test.ts` -> 29 passed; `npm test` -> 10 files, 102 passed; `npm run build` ok.

## Fix round 2
Change: a zone's burst now also includes one boss kill's drop maxima when its boss is hittable by prev.learned (validate.ts).
Tests added (data3: zone A boss drops 20 water, killsForBoss 100; zone B normals drop water): maxGain water = 188 (B total 168 + 20); validateUpload with prev {A}, boss bA defeated, gain 230 water at 80000ms -> ok (without fix limit is 216).
Mutation (boss addition to burst removed): both new tests FAIL; restored.
Results: validate.test.ts 31 passed; npm test 10 files / 104 passed; npm run build ok.
