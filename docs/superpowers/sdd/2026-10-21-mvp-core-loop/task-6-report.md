# Task 6 report
Implemented src/engine/save.ts (serialize, parseState) with zod v4 strictObject schema + reference checks (spells, zones, item-id regex, equipped in learned, non-negative int counts). Never throws, returns null on any problem; no DOM/Workers APIs.
Tests: src/engine/save.test.ts, 12 tests.
RED: `npx vitest run src/engine/save.test.ts` -> "Test Files 1 failed, no tests" (./save missing).
GREEN: same command -> 12 passed. Full `npm test` 73 passed; `npm run build` ok; tsc worker project clean.
Notes: synthesisLog keys and results keys are only validated as strings (results keys include 'none'); currentZone is not required to be in unlockedZones (not in spec).
