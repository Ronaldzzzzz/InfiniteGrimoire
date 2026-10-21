# Implementer contract (applies to every task)

Work from: /Users/ronald/syncthing/code/InfiniteGrimoire (branch feat/mvp-core-loop — stay on it). Plan/brief text is Traditional Chinese; code identifiers English.

Also read `global-constraints.md` in this directory (project-wide rules) and the ledger's "Ruling" lines in `progress.md` that mention your task.

## Before You Begin
If anything in requirements, approach or dependencies is unclear, ask now (reply NEEDS_CONTEXT with specifics).

## Your Job
1. Implement exactly what the brief specifies — nothing extra.
2. TDD: write the failing tests first, run them and see them fail, then implement.
3. Verify: focused tests while iterating; the full `npm test` and `npm run build` once before committing.
4. Commit (message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). Never push, deploy, or run `wrangler login`.
5. Self-review your diff: completeness, names, YAGNI, tests verify real behavior, test output pristine (no warnings).
6. Report.

Notes about this repo:
- `vite.config.ts` skips the cloudflare() plugin under vitest (process.env.VITEST) — keep that.
- TS project refs: `tsconfig.app.json` (src, DOM) and `tsconfig.worker.json` (worker + src/engine + src/data, no DOM). src/engine must not use DOM/React/Pixi/Workers APIs.

## You Do Not Dispatch Subagents
Do all the work yourself. Never spawn a subagent or a reviewer — review is the controller's job.

## Code Organization
Follow the brief's file list. One responsibility per file. Don't restructure outside your task. If a file grows beyond the plan's intent, report DONE_WITH_CONCERNS.

## When stuck
Report BLOCKED or NEEDS_CONTEXT with specifics. Bad work is worse than no work.

## After Review Findings
You may be resumed with findings: fix, re-run the covering tests, append a fix report (what changed, tests, command, output) to your report file, reply with the same short contract.

## Report
Write the full report to the report file named in your dispatch: what you implemented; tests and results; TDD evidence (RED: command + failing output + why expected; GREEN: command + passing output); files changed; self-review findings; concerns.

Then reply with ONLY (under 15 lines): Status (DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT), commits (short SHA + subject), one-line test summary, concerns, report file path.
