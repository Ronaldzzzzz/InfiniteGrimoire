# Task 12 report
Implemented all UI files in src/ui plus the real boot flow in src/main.tsx (loading, onboarding, offline-retry, auth-error back to onboarding, runtime+sync+loop wiring).
RED: `npx vitest run src/ui` failed on unresolved imports (SynthesisPanel/Onboarding not yet created), expected.
GREEN: `npx vitest run src/ui` 11 passed; full `npm test` 19 files / 170 tests passed; `npm run build` OK.
Step 5: dev server booted; GET / 200, /src/main.tsx 200, POST /api/guest returns token, GET /api/save with token 200. No visual check (controller does it).
Decisions: slots state lifted to App (SynthesisPanel is controlled); HUD overlevel is measured against the strongest regular (non-boss) monster tier of the zone; HUD has an equip <select> (grimoire tab is a placeholder div); slots cleared after a non-null synth result, kept on throw/null.
Concern: any non-network loadSave error clears the token and returns to onboarding.

## Fix round 1
Added src/game/boot.ts `classifyBootError` (AuthError -> 'auth', everything else -> 'retry') with test src/game/boot.test.ts; main.tsx clears token only on 'auth', otherwise shows 「需要連線才能遊玩」+重試. Grimoire placeholder now says 魔導書（敬請期待）.
`npx vitest run src/game/boot.test.ts`: Tests 1 passed. `npm test`: Test Files 20 passed, Tests 171 passed. `npm run build`: built OK.
