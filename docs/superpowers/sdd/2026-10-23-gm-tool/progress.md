# SDD ledger — plan: docs/superpowers/plans/2026-10-23-gm-tool.md

Spec: docs/superpowers/specs/2026-10-23-gm-tool-design.md
Branch: feat/gm-tool (from feat/core-rework 13b5b4c; merged main 29e92b0 for the spec and plan → 38eb029)
Briefs / reports / review packages: .superpowers/sdd/2026-10-23-gm-tool/ (git-ignored scratch)

Ruling: ledger in docs/ (project convention), scratch in the git-ignored workspace; the controller created the branch (Task 1 Step 0) — cost if wrong: none.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2/T3/T4 | Store GM methods, `PlayerRow.gmUsed`, `MemoryStore.gmActions` → app routes/tests | consistent |
| T2 → T3/T4 | GM middleware (`gmPlayer` in context), `GM_TOKEN_TTL_MS` → edit and reset routes | consistent |
| T3 → T5 | `{kind:'gm'}` ActionResult (api.ts) and `/api/gm/inventory|zones` request shape (state + baseRevision + gm token header) → gmInventory/gmZones + sync.send | consistent; both T3 and T5 touch api.ts (T3 only the union + synthMessage) |
| T4 → T5 | reset-password body `{username, password(hash)}` → gmResetPassword hashes in the api layer | consistent |
| T5 → T6/T7 | `gmLogin`, `GmExpiredError`, sync GM kinds → GmWindow, tabs | consistent |
| T6 → T7 | `GmContext` → tab components | consistent |
| T2 self | GM enablement check must run before the per-path `auth` middleware | noted in dispatch |
| T3 self | `resetAnchor` option on serverAction; audit.ts unchanged | consistent |
| T6 self | window renders no DOM while closed; no GM text on the game screen | consistent |
| T8 self | `.dev.vars` GM_USERNAMES edited locally, never committed; TTL shortened only in the acceptance server instance | consistent |

## Tasks
Task 1: implemented ffeb438 (base 38eb029), DONE (0003 migration test switched to raw SQL since D1Store now selects gm_used; findGmToken treats expiresAt <= now as expired)
Task 1: review spec ✅, quality Approved. Note for Task 8 docs: every player read now needs 0006 — remote D1 must apply 0005 and 0006 before this worker deploys; fix the "0001→0003→0004" order text in AGENTS.md §3.
Task 1: minor (deferred): recordGmAction contract calls assert nothing (Task 2 tests read gmActions); no cross-player isolation test for deleteGmTokens/findGmToken; 0003 test no longer asserts the suspicious mapping.
Task 1: complete (commits 38eb029..ffeb438, review clean)
Task 2: implemented dd11d04 (base ffeb438), DONE (concerns: logout-others doesn't revoke GM tokens; token bound to player not session; GM login failures count toward the account's login limit; probe path test)
Task 2: review spec ✅, quality Approved; middleware order, path variants (Hono decodeURI), no GM oracle, hashed tokens all checked. ⚠️ Tasks 3–4 must register routes under /api/gm/ after the GM middlewares — check in their reviews.
Ruling: Task 2 minors 1 (token guard re-checks the player is still in GM_USERNAMES) and 2 (logout-others also revokes GM tokens) are carried into the Task 3 dispatch — cheap defense in depth in the same file — cost if wrong: one extra query per GM request.
Task 2: minor (deferred): test title over-promises (wrong-session lockout not asserted); no regression test pinning /api/gm/login/ and /api/gm path variants.
Task 2: complete (commits ffeb438..dd11d04, review clean)
Task 3: implemented 6bcc142 (base dd11d04), DONE (empty items accepted and still marks gmUsed; detail logs the sent map; unlock_all leaves defeatedBosses unchanged)
Task 3: review spec ✅, quality Approved; resetAnchor only reachable from /api/gm/*, edits only the session player's save, prototype keys rejected.
Ruling: Task 3 minors 1 (mark gm_used BEFORE the commit — a spurious mark is harmless, a missing one lets a GM-edited account claim a first discovery) and 2 (empty `items` → 400) are carried into the Task 4 dispatch — same file, cheap — cost if wrong: a GM request that 409s still marks gm_used.
Task 3: minor (deferred): no raw-JSON `__proto__` test; boss_ready with an unknown zone is a logged no-op; detail is the requested map, not a diff.
Task 3: complete (commits dd11d04..6bcc142, review clean)
Task 4: implemented 7b38d77 (base 6bcc142), DONE (target logged as stored cred.username; non-atomic reset like password change; no reset rate limit; markGmUsed via new beforeCommit option)
Task 4: review spec ✅, quality Approved; route behind GM middlewares, normalization can't bypass self/GM checks, reset scoped to the target, no secrets logged, beforeCommit only via gmEdit.
Ruling: `gm_actions.target` logs the stored bound name (`cred.username`, a normalizeUsername result) rather than the GM's typed casing — it identifies the account unambiguously — cost if wrong: one line.
Task 4: minor (deferred): reset steps not atomic (same as password change; GM can retry); no bystander-player test; GM's own token survival checked indirectly; no reset rate limit (GM trusted, every reset logged).
Task 4: complete (commits 6bcc142..7b38d77, review clean)
Task 5: implemented 6915cb9 (base 7b38d77), DONE (first full npm test run had 2 unidentified failures; two reruns green — known load flake suspected)
Task 5: review spec ✅, quality Approved. ⚠️ server body shapes and `{kind:'gm'}` (added to api.ts in Task 3) — verified against the Task 3/4 briefs and their tests.
Task 5: minor (deferred): no test that a 401 on a GM endpoint still maps to AuthError; payload casts in sync.send (existing style).
Task 5: complete (commits 7b38d77..6915cb9, review clean)
Task 6: implemented e3fb09c (base 6915cb9), DONE (tabs are placeholders; 'no GM entry' test renders GmWindow alone, not App)
Task 6: review spec ✅, quality Approved; token state-only, hotkey narrowly scoped, closed window renders nothing.
Ruling: Task 6 minors 1 (vacuous container assertion → assert on document.body and add an App-level "no GM entry" test), 2 (clear the password after a failed login), 3 (clamp the window inside the viewport on load/move) and 5 (ignore key repeat) go into the Task 7 dispatch — same file, cheap — cost if wrong: a slightly larger Task 7 diff.
Task 6: minor (deferred): drag still runs on narrow screens (CSS overrides position); closing with ✕ keeps the GM token until expiry/reload (spec only requires state-only storage).
Task 6: complete (commits 6915cb9..e3fb09c, review clean)
Task 7: implemented a0518bd (base e3fb09c), DONE (inventory tab subscribes to s.game.inventory; added gm/run-gm.ts; window widened 340→440px; fusion column '—' when inputs unlearned)
Task 7: review spec ✅, quality Approved. ⚠️ reset salt for differently-cased usernames — verified: passwordSalt uses usernameKey (src/game/password-hash.ts:10).
Ruling: the GM inventory tab subscribes to the whole inventory — a GM-only panel open by choice, drafts survive drops, the battle canvas and other panels are unaffected; AGENTS.md's rule targets always-mounted views — cost if wrong: re-renders of ~40 inputs per drop while that tab is open.
Task 7: minor (deferred): number inputs show 0 when cleared (clumsy retyping); drafts lost when the GM token expires; recipe percentages are nominal (ignore prerequisite gating — could add 「需先學會 X」); per-row find in GmRecipesTab; RateLimitedError branch order in the players tab.
Task 7: complete (commits e3fb09c..a0518bd, review clean)
Task 8: implemented 9b3670a (base a0518bd), DONE — spec §9 9/9 pass in headless Edge; temp TTL edit reverted (verified), GM_USERNAMES removed from .dev.vars; thunder_hammer seeded; 4 test accounts left in local D1
Task 8: review spec ✅, quality Approved. Controller stopped two leftover vite dev servers (ports 5173/5174) from the acceptance run.
Task 8: minor (deferred): AGENTS.md §5 GM line splits the UI list; checklist "所有請求都會 500" overclaims (only player-reading requests).
Task 8: complete (commits a0518bd..9b3670a, review clean)
