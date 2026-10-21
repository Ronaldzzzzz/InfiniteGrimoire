# Task 8 report

Implemented: migrations/0001_init.sql, worker/{store,d1-store,auth,crypto-rng,app,index}.ts, wrangler.jsonc (ASSETS binding, run_worker_first ["/api/*"]), tests worker/app.test.ts (health test updated to full deps, R1) and worker/auth.test.ts.
Behavior per brief and rulings: 64 KiB limit (Content-Length + actual) -> 413; bad JSON/shape -> 400; shared checkUpload for PUT/synthesize (400/409/422); synthesize = validate -> synthesize -> single commitSave -> recordSynthesis (result `kind` or `kind:spellId`); engine rejected = 200; MemoryStore.commitSave is a synchronous CAS; generic error messages, tokens never logged.

Tests: `npm test` 11 files / 120 tests pass; `npm run build` OK.
TDD note: implementation was written in the same pass as tests; the only failing run observed was after first full run (3 failures: HttpError did not extend Error so Hono's onError was bypassed -> fixed by extending Error). A clean RED-before-implementation run was not captured.

Step 5 (local D1 + wrangler dev via vite, secrets redacted):
POST /api/guest -> 201 {token,playerId,state(initial),revision:0}
GET /api/save -> 200 {state,revision:0}; without token -> 401 {"error":"unauthorized"}
PUT /api/save {state,baseRevision:0} -> 200 {"revision":1}
PUT again baseRevision 0 -> 409 {"reason":"conflict",state,"revision":1}
GET / -> 200 (assets served). Dev server stopped.

Concerns: `rejected` engine results still commit (revision bump, touches savedAt) per ruling; D1Store untested beyond the curl run. Committed as e65345d.

## Fix round 1
- Concurrency test now uses a GatedStore (getSave holds both requests until both read) so only commitSave CAS can stop the second; added MemoryStore.commitSave stale-revision unit test. With CAS removed from MemoryStore both tests FAIL ("× concurrent synthesize...", "× stale baseRevision returns false..."; 2 failed | 17 passed); restored -> pass.
- Added MAX_ELAPSED_MS = 120_000 in worker/app.ts; elapsedMs = min(max(0, now-savedAt), cap) for PUT and synthesize. New test "caps credited time ... after 8h without GET" expects 422 (confirmed it needs the cap: with cap disabled it fails).
- "ignores client-claimed learned spells" asserts reasons contains 'learned spells changed'.
- `npx vitest run worker`: 19 passed. Full `npm test`: see commit.
