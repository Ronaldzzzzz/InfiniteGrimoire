# Task 8 report: browser acceptance and docs

Method: `npm run db:migrate:local` (0007 applied), `npm run dev` (port 5174 because 5173 was taken by another dev server; stopped afterwards), headless Chrome 
driven by puppeteer-core installed outside the project (scratchpad accept-strip). Screenshots: `.superpowers/sdd/2026-10-29-battle-strip/accept/` (not committed). The blocking items below were fixed in the final fix pass (see progress.md).

## Results by spec section 4
1. Layout, strip visible without scrolling (viewport -> result):
   - 1280x900: VISIBLE (strip top 720, bottom 900, position relative, no horizontal scroll).
   - 900x900: **OFFSCREEN - BLOCKING.** strip top 994, bottom 1174 (page height 1174, viewport 900). `.battle-strip` is `position: relative` between 601 and 1099 px (`@media (max-width: 1099px) .app {height:auto}`), so it sits at the end of the page flow. Screenshot `layout-900.png`. Not fixed here; controller routes it.
   - 390x844: VISIBLE (position fixed, 140 px, bottom 844; no horizontal scroll; page height 1557 with body padding).
2. Walk/stop/no pass-through: strip screenshots show the mage on the left, foes stopping before it at the right of the stop line; no foe passes the mage in any capture. Knockback right-edge limit not separately probed in browser (unit-tested).
3. Effects: strip screenshots of 10 effect kinds (fireball bolt, lightning chain, meteor, water_wave ring, wind_blade blades, mire zone, thunder_cloud storm, sandstorm field, tailwind haste, mana_overload backfire) in `fx-<kind>-<spell>.png`. Ring (arc ahead of mage), zone (ground patch) and chain/bolt are distinguishable; I did not judge all 10 in detail.
4. Normal stage: 迷霧草原 1-1 with fireball (Lv.2) cleared in ~128 s real time (matches 2-3 min). Auto-advance OFF: after clear the strip stays 1-1 (restarts); ON: strip moves to 1-2. Notice order observed with a 2.5 s delay on /api/stage-clear: "通過 1-1　結算中…" then "通過 1-1　戰利品：…". Server `clearedStages` 0 -> {"mist_meadow":1} after first clear; clearing 1-1 again keeps 1. Progress bar grows with kills (screens normal-fight-*.png).
5. Boss stage (seed clearedStages 9, currentStage 10): after load the "進入魔王關" button shows and the strip holds (no walking); after pressing, 8 walking/fighting waves, the boss clock was absent until the boss wave appeared (first seen 56 s after entering), then "魔王剩餘 180 秒" counts down. Kill with fireball: notice 通過 1-10 + loot, server clearedStages 10, defeatedBosses [mist_stag], key item key:storm_heart, unlocked adds thunder_gorge. Timeout: equipped 魔力過載 (backfire only, no damage) after the boss wave appeared, game clock sped up 10x in-page: countdown 180 -> 24, then notice "時間到，退回 1-9", strip title 迷霧草原 1-9. Note: server `currentStage` was still 10 a second after the failure (client upload not yet sent), not investigated.
6. Re-entering cleared stages: picker lists 1-1..1-10 with 已通過/目前所在/先通過 N; locked zones listed with unlock text; selecting 1-1 while at 1-2 switched the strip to 1-1.
7. `npm test`: 72 files, 823 tests passed (full suite, no timeouts). `npm run build` passes (only the Pixi >500 kB notice). Sim "0 rejections" was covered by the tests/sim suites in the full run.

Page errors: none in any script (console.error / pageerror captured).

## Seeded vs operated
Seeded (local D1 sqlite edits on `saves`): learned spells (mana_bolt, fireball, lightning etc.), equipped spell, unlockedZones, currentStage, clearedStages (9 for the boss tests, 3 for the picker/fx test). Everything else was operated: guest creation, strip checkbox, boss button, picker selection, spell picker, real server stage-clear and boss-kill claims. Test helpers: in-page rAF override (virtual clock, 10x) was used for the timeout, settlement-notice and boss-wave tests only (the boss kill and the two normal clears were real time); /api/stage-clear delayed 2.5 s by request interception to make the settling notice observable (it was also caught once on a boss clear at 10x).

## Observations (non-blocking)
- Placeholder foes are large (~60 px squares) on a 180 px strip, heavily overlapping and cut by the strip's top/bottom edge; the lane band looks much narrower than the sprites.
- After the boss kill the strip stays on 1-10 held with the "進入魔王關" button visible (can re-enter); the next zone is only unlocked, no auto-travel.
- Dev PerfMeter overlaps the DPS readout in the strip (dev only).

## Docs changed
AGENTS.md (3.0 new "現在停在哪", section 5 combat/stages/stage-clear/StageBar/arena/migration 0007, section 6 replaced ENGAGE_R rule with RANGE/lane rule, added stage and server-owned `clearedStages`/`lastClearAt` rules, section 10 entry), README.md (strip/stage description), docs/prelaunch-checklist.md (remote D1 must apply 0007, resets saves; list now 0001-0007).
