# Task 10 report

Commit 41df180 `test: pure element path simulations, upload validation and MVP balance`.

## Implemented
- tests/sim/bot.ts: runBot({element, seed, maxSimMs}) -> {clearedZones, learned, simMs, rejectedUploads, lastZoneMs, rejectionReasons}.
  Decides every 1 s (upgrade grade-1 to 2 only when the next recipe lacks grade-2, synthesize T2/T4/T5, equip best, travel to highest unlocked zone where the best spell can hit every normal). Uploads every 30 s with validateUpload(last, current, 30000); after synthesis lastAccepted = post-synthesis state; on rejection continue from lastAccepted. Runs until the first upload after the last boss fell, so the final kill is validated.
  Retreat rule: if an active boss cannot be damaged by any learned spell (spawning pauses forever), the zone is blocked until a new spell is learned.
- tests/sim/pure-paths.test.ts: 5 pure-path tests, mana_bolt-only test, third-zone >= 20 min test (timeouts 60 s; whole file runs in ~1 s).

## Data changes (src/data only)
- cinder_wisp: element thunder -> fire; drops now fire:1 .6, thunder:2 .2, wind:2 .12, water:1 .3, crystal .08 (zone 3 still drops all 5 grade-1).
- thunder_lizard + fire:2 at 0.10; stone_golem + water:2 at 0.10 (zone 2 now gives grade-2 of every element).
- ash_dragon hp 4000 -> 28000, regenPerSec 6 -> 2.
- explosion, thunderstorm, earthquake, tsunami cooldownMs 2600 -> 2000.
- ash_volcano killsForBoss 25 -> 18 (see concern 1).
- mana_crystal rates left as is (zone 2 normals 5%, storm_roc 70%, zone 3 normals 8-10%): sim shows every path progresses.
- GAIN_TOLERANCE / GAIN_SLACK unchanged.

## Results (seed 20261021, rejectedUploads = 0 everywhere)
| element | simMs total | ms in zone 3 |
|---|---|---|
| fire | 2,250,000 (37.5 min) | 2,014,000 (33.6 min) |
| wind | 1,560,000 (26 min) | 1,353,450 (22.6 min) |
| thunder | 2,850,000 (47.5 min) | 2,609,150 (43.5 min) |
| earth | 2,970,000 (49.5 min) | 2,570,000 (42.8 min) |
| water | 2,250,000 (37.5 min) | 2,044,000 (34.1 min) |
Over 12 seeds per element: zone 3 min 20+ min wind (22.6 at test seed; lowest seen 23 min incl. kill phase), max total about 54 min; 0 rejections. mana_bolt only: clears only mist_meadow in 3 h.

## Tests
- `npx vitest run tests/sim`: 7 passed. `npm test`: 15 files, 149 tests passed. `npm run build`: ok.
- TDD note: tests and bot were written together; the first run failed on the 20-minute test (fire 801,950 ms in zone 3), then additional failures surfaced during tuning (see concerns).

## Concerns
1. Validator false rejection (real): validateUpload's boss min-time check uses killsForBoss*spawnIntervalMs for a boss defeated inside a window, ignoring prev.zoneKills. With zone 3 at 25*2000 = 50 s, every honest boss kill in a 30 s window was rejected ("defeated too fast: need 50000ms, got 30000ms"). I avoided touching rule code and tuned data so every zone's product <= 37.5 s (zone1 22.5, zone2 36, zone3 36). Fragile coupling: any data with product > 1.25 * upload interval will false-reject. Better fix (controller decision): account for prev.zoneKills in that bound, or raise GAIN_TOLERANCE to >= 1.67.
2. Game softlock risk: when the boss is immune to all learned spells, normal spawning stops and nothing can progress in that zone (seen at storm_roc with only T2). The player can escape by travelling; the UI should hint at that.
3. Spread between paths remains (wind 26 min vs earth 49 min total) because wind T5 is a 2-target beam and the boss is a single target.

## Fix report (controller rulings)
Commits: engine rules commit "fix: carry zoneKills into boss min-time bound; keep spawning normals during boss", then data/sim commit.

Changes:
- validate.ts: boss min time = (killsForBoss - clamp(prev.zoneKills[zone])) * spawnIntervalMs for the first new boss per zone, full for extras; new check that zoneKills growth in zones without a new boss <= (floor(elapsed/interval)+maxAlive)*GAIN_TOLERANCE+GAIN_SLACK (reason names the zone). Tests added: carried kills ok / no carried kills rejected / jump of 1000 rejected.
- battle.ts: normals keep spawning during a boss (boss excluded from maxAlive); new test "normals keep spawning while the boss is active...".
- DEVIATION (needed): the engine reset zoneKills to 0 when the boss spawned, so prev.zoneKills was 0 in the window where the boss actually died and the carried-kill credit never applied (all 5 paths still got "defeated too fast"). Now zoneKills stays at killsForBoss while the boss lives and resets to 0 on boss defeat (normal kills during the boss still do not count). Test added. Side effect: leaving and re-entering a zone mid-boss respawns the boss after the next normal kill.
- zones.json: ash_volcano killsForBoss restored to 25. Other data unchanged.
- Bot retreat kept: without it fire seed 3 and earth seed 2 stall in zone 2 (boss immune to T2, boss-time kills do not count, bot never leaves).

Results: `npm test` all pass (see commit), `npm run build` ok; 9 seeds x 5 elements: 0 rejected uploads, all clear 3 zones, zone 3 time >= 23.8 min.
Test seed 20261021 (total / zone 3, minutes): fire 38 / 34.7, wind 27.5 / 24.0, thunder 50 / 43.8, earth 49 / 43.8, water 39.5 / 35.3.

## Fix round 1
- validate.ts: carried-kill credit only for zones in prev.unlockedZones; zoneKills growth in a zone that is not available (prev unlocked + unlocked by validated bosses in this upload) is rejected; added total bound sum(jump*spawnIntervalMs) <= elapsed*GAIN_TOLERANCE + max(maxAlive*interval) + GAIN_SLACK*max(interval); per-zone bound kept.
- validate.test.ts: multi-zone inflation rejected, locked-zone growth rejected, pre-inflate-then-defeat-bosses rejected (inflation upload itself is rejected, and the follow-up upload too).
- bot.ts: uploads use real elapsed since baseline; synthesis first validates the pre-synthesis state (real elapsed), then commits post-synthesis state as baseline.
- pure-paths.test.ts: bot results memoized (no double runs, unused Map removed); direct assertion that mana_bolt cannot damage any thunder_gorge monster.
- Output: `npm test` -> Test Files 15 passed, Tests 156 passed; `npm run build` ok. 5 elements x 8 seeds: 0 rejected uploads, all clear 3 zones (see SUM line in reply).
