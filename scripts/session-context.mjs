// Claude Code SessionStart hook: reports where the project stands on this machine.
// The folder is synced between Windows and macOS via Syncthing, so a session may
// resume on a different machine than the one it started on.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..');

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function gitSummary() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === null) return ['git: unavailable'];
  const lines = [`branch: ${branch}`];
  const counts = git('rev-list', '--left-right', '--count', '@{upstream}...HEAD');
  if (counts) {
    const [behind, ahead] = counts.split(/\s+/);
    lines.push(`vs upstream (last fetch): ahead ${ahead}, behind ${behind}`);
  } else {
    lines.push('vs upstream: no upstream set');
  }
  const status = git('status', '--short');
  lines.push(status ? `uncommitted changes:\n${status}` : 'working tree clean');
  const log = git('log', '--oneline', '-5');
  if (log) lines.push(`recent commits:\n${log}`);
  return lines;
}

/** Returns a problem description, or null when node_modules looks usable on this platform. */
function nodeModulesProblem() {
  const nm = join(root, 'node_modules');
  if (!existsSync(nm)) return 'node_modules missing — run `npm i`.';
  const scope = join(nm, '@rolldown');
  if (existsSync(scope)) {
    const want = `binding-${process.platform}-${process.arch}`;
    const bindings = readdirSync(scope).filter((d) => d.startsWith('binding-'));
    if (!bindings.some((d) => d.startsWith(want))) {
      return `node_modules was installed on another platform (has ${bindings.join(', ') || 'no bindings'}, needs ${want}*).`;
    }
  }
  if (process.platform !== 'win32') {
    const bin = join(nm, '.bin', 'vitest');
    try {
      accessSync(bin, constants.X_OK);
    } catch {
      if (existsSync(bin)) return 'node_modules/.bin has no execute permission (installed on Windows).';
    }
  }
  return null;
}

function syncConflicts() {
  const out = git('ls-files', '--others', '--exclude-standard');
  const tracked = git('ls-files');
  const all = [out, tracked].filter(Boolean).join('\n').split('\n');
  return all.filter((f) => f.includes('.sync-conflict-'));
}

function agentsStatus() {
  try {
    const text = readFileSync(join(root, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n');
    const m = text.match(/^## 3\..*?(?=^## )/ms);
    return m ? m[0].trim() : null;
  } catch {
    return null;
  }
}

const nmProblem = nodeModulesProblem();
const conflicts = syncConflicts();
const sections = [
  `# Session context (machine: ${hostname()}, ${process.platform}-${process.arch})`,
  'This project folder is synced between machines with Syncthing; the facts below are current for THIS machine and override anything remembered from earlier in the conversation.',
  '## Git',
  ...gitSummary(),
  '## node_modules',
  nmProblem
    ? `${nmProblem} The user pre-authorized reinstalling: confirm ~/syncthing/code/.stignore ignores node_modules, then \`rm -rf node_modules && npm i\`, then \`npm test\`.`
    : 'OK for this platform.',
];
if (conflicts.length > 0) {
  sections.push('## Syncthing conflict files (merge by hand, then delete)', ...conflicts);
}
const status = agentsStatus();
if (status) sections.push('## AGENTS.md — current status', status);

const notes = [];
if (nmProblem) notes.push('node_modules needs reinstall');
if (conflicts.length > 0) notes.push(`${conflicts.length} sync conflict file(s)`);

process.stdout.write(
  JSON.stringify({
    ...(notes.length > 0 ? { systemMessage: `Session context: ${notes.join('; ')}` } : {}),
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: sections.join('\n') },
  }),
);
