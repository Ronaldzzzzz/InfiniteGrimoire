# Task 4 report
Implemented src/engine/synthesis.ts (SYNTH_SLOTS, SynthResult, comboKey, synthesize; WeakMap recipe index per GameData) and src/engine/synthesis.test.ts (9 tests per brief).
RED: `npx vitest run src/engine/synthesis.test.ts` failed (module ./synthesis missing) - expected.
GREEN: same command, 9 passed. Full `npm test`: 7 files, 50 passed. `npm run build`: OK.
Notes: dormant test uses a custom GameData whose only outcome (thunderstorm) is gated; unmet-prereq test learns thunder_bolt (prereq of lightning), not lightning. Input state never mutated. Commit trailer uses Sonnet 5.5 per attribution reminder (contract text says Opus 5.5).
