# Task 5 report
Implemented src/engine/battle.ts (+ battle.test.ts, 8 tests) per brief and controller rulings.
Decisions: spawn timer caps at spawnIntervalMs when blocked (maxAlive/boss), subtracts interval on spawn; status roll only on damaging hits (not immune, not killed); burn dps = 20% of hit damage, fractional hp; hit damage = max(1, round(base*mult)); boss spawn happens within the killing step; boss uses zone.bossId.
Tests: npm test 58/58 pass; npm run build ok.
TDD caveat: implementation was written in the same pass as tests; no separate RED run was captured.

## Fix round 1
- battle.ts: normal kills while bossActive no longer increment zoneKills (`else if (!bossActive)`).
- battle.test.ts: added spawn-rate bound test (full zone: <= floor(10000/500); continuous kills, interval 200, maxAlive 1: spawns <= floor(20000/200), kills > 10) and boss-leftover test (3 normals + boss killed by nova; zoneKills stays 0; next boss needs >= 2 normal kills).
- RED: with the battle.ts fix stashed, the boss test failed (spawn test also failed then due to my fixture index bug, since fixed). GREEN: `npx vitest run src/engine/battle.test.ts` 10/10; `npm test` 60/60.

## Fix round 2
- battle.ts: snapshot `bossWasActive` before kill resolution; normal kills count only if `!bossWasActive && !bossActive` (also covers a boss spawned mid-loop).
- battle.test.ts: new test with boss at lowest uid killed with 3 leftover normals in one nova cast (asserts no spawn, bossActive false, zoneKills 0, next boss needs >= 2 normal kills). Fixture zones re-sorted by order (zb after zo).
- RED (round-1 battle.ts stashed): `× boss resolved before leftover normals in the same step does not let them count`, `Tests 1 failed | 10 passed (11)`.
- GREEN: `npx vitest run src/engine/battle.test.ts` -> `Tests 11 passed (11)`; `npm test` -> `Test Files 8 passed (8)`, `Tests 61 passed (61)`.
