# Task 3 report

Implemented src/engine/{combat-rules,inventory,state}.ts with tests (combat-rules/inventory/state .test.ts).
Decisions: removeItems deletes zero-count keys (used by addItems/upgradeElement); equipSpell on unlearned returns same reference; travel only for unlockedZones; createInitialState unlockedZones = [zones[0].id].

RED: `npx vitest run <3 new tests>` -> 3 files failed (modules not found), expected.
GREEN: `npm test` -> 6 files, 41 tests passed. `npm run build` -> succeeded (tsc -b + vite build).
Commit: 15b9595 feat(engine): combat rules, inventory and game state
Concerns: none.
