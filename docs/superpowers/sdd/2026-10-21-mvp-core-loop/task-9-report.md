# Task 9 report
Implemented src/game/{session,api,runtime,sync,loop}.ts with tests runtime/sync/session (16 tests).
RED: `npx vitest run src/game` -> 3 files failed (modules missing). GREEN: after impl + one test fix (events test needed longer advance), `npm test` 14 files / 138 tests pass; `npm run build` OK.
Design notes: uploadNow/synthesize no-op while another request, retry loop, or synth is pending; AuthError notifies onAuthError listeners and is not thrown; synthesize returns null on conflict/rejected after replaceState; NetworkError during synth -> offline + retry upload loop. api.ts has no dedicated tests (not in brief). loop.ts untested (glue).

## Fix round 1
- retry(): auth -> retrying cleared, stays paused, onAuthError notified; any other error -> online + unpaused. doUpload never throws (non-network/auth errors console.warn message only), so fire-and-forget calls cannot reject.
- synthesize awaits in-flight upload promise then proceeds with new revision; null only for synthPending/retrying.
- setRevision ignores lower revisions.
- Tests added (4). `npx vitest run src/game`: 3 files, 20 tests passed. `npm test`: 14 files, 142 tests passed. Build OK.
