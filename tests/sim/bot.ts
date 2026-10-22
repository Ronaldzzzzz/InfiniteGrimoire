import { createBattle, stepBattle, STEP_MS, type BattleState } from '../../src/engine/battle';
import { canDamage } from '../../src/engine/combat-rules';
import { gameData } from '../../src/engine/data';
import { upgradeElement } from '../../src/engine/inventory';
import { createRng } from '../../src/engine/rng';
import { parseState } from '../../src/engine/save';
import { equipSpell, travel, type GameState } from '../../src/engine/state';
import type { SynthResult } from '../../src/engine/synthesis';
import { elementItem, type ElementId } from '../../src/engine/types';
import { createApp } from '../../worker/app';
import { MemoryStore } from '../../worker/store';

export interface BotOptions {
  element: ElementId | null;
  seed: number;
  maxSimMs: number;
}
export interface BotResult {
  clearedZones: string[];
  learned: string[];
  simMs: number;
  /** requests sent to PUT /api/save and POST /api/synthesize */
  serverCalls: number;
  /** non-200 responses from PUT /api/save and POST /api/synthesize */
  rejectedUploads: number;
  /** simulated ms spent from first entering the last zone until its boss fell (null if never entered / not cleared) */
  lastZoneMs: number | null;
  rejectionReasons: string[];
}

const DECISION_MS = 1000;
const UPLOAD_MS = 30_000;

const CLOCK_START = 1_000_000_000;

/**
 * Plays like the real client against the real server: the worker app with an in-memory store
 * and a fake clock that follows simulated time. Saves go through PUT /api/save every 30 s and
 * synthesis through POST /api/synthesize, both as JSON; server replies are applied as the client
 * would (rejected / conflict -> adopt the server state).
 */
export async function runBot(opts: BotOptions): Promise<BotResult> {
  const data = gameData;
  const battleRng = createRng(opts.seed);
  const serverRng = createRng(opts.seed ^ 0x9e3779b9);
  const lastZone = data.zones[data.zones.length - 1]!;

  let simMs = 0;
  const app = createApp({ store: new MemoryStore(), now: () => CLOCK_START + simMs, rng: () => serverRng, data, pepper: 'sim-pepper' });
  let token = '';
  const call = async (method: string, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const serverState = (raw: unknown): GameState => {
    const s = parseState(raw, data);
    if (!s) throw new Error(`server sent a state the client cannot parse: ${JSON.stringify(raw)}`);
    return s;
  };

  const created = await call('POST', '/api/guest', { displayName: 'SimBot' });
  if (created.status !== 201) throw new Error(`guest creation failed: ${created.status}`);
  token = created.body.token as string;
  let game: GameState = serverState(created.body.state);
  let revision = created.body.revision as number;
  let battle: BattleState = createBattle(game.currentZone);
  let rejectedUploads = 0;
  let serverCalls = 0;
  const rejectionReasons: string[] = [];
  let lastZoneEnteredAt: number | null = null;
  let lastZoneClearedAt: number | null = null;

  // recipe chain for the chosen element: T2, T4, T5
  const chain = opts.element
    ? ['t2', 't4', 't5'].map((t) => data.recipes.find((r) => r.id === `${opts.element}_${t}`)!)
    : [];

  /** Non-200: count it and adopt the server's state, like the client does. */
  const adoptServer = (what: string, r: { status: number; body: Record<string, unknown> }): void => {
    rejectedUploads++;
    const reasons = Array.isArray(r.body.reasons) ? r.body.reasons.join('; ') : JSON.stringify(r.body);
    rejectionReasons.push(`@${simMs} ${what} ${r.status}: ${reasons}`);
    if (r.body.state) {
      game = serverState(r.body.state);
      revision = r.body.revision as number;
      battle = createBattle(game.currentZone);
    }
  };
  const upload = async (): Promise<void> => {
    serverCalls++;
    const r = await call('PUT', '/api/save', { state: game, baseRevision: revision });
    if (r.status === 200) revision = r.body.revision as number;
    else adoptServer('PUT /api/save', r);
  };
  const synthesizeOnServer = async (inputs: string[]): Promise<SynthResult | null> => {
    serverCalls++;
    const r = await call('POST', '/api/synthesize', { state: game, baseRevision: revision, inputs });
    if (r.status !== 200) {
      adoptServer('POST /api/synthesize', r);
      return null;
    }
    // the battle keeps running: the server state is ours plus the synthesis
    game = serverState(r.body.state);
    revision = r.body.revision as number;
    return r.body.result as SynthResult;
  };

  const blocked = new Set<string>();
  let blockedAtLearned = 0;

  const bestSpell = () =>
    game.learned.map((id) => data.spells[id]!).reduce((a, b) => (b.tier > a.tier ? b : a));

  const decide = async (): Promise<void> => {
    if (opts.element) {
      // upgrade grade-1 -> grade-2 only when the next recipe needs grade-2 and lacks it
      const target = chain.find((r) => !game.learned.includes(r.outcomes[r.outcomes.length - 1]!.spellId) &&
        !r.outcomes.some((o) => game.learned.includes(o.spellId)));
      if (target) {
        const need: Record<string, number> = {};
        for (const i of target.inputs) need[i] = (need[i] ?? 0) + 1;
        const g2 = elementItem(opts.element, 2);
        if ((need[g2] ?? 0) > (game.inventory[g2] ?? 0)) {
          const up = upgradeElement(game.inventory, opts.element, 1);
          if (up) game = { ...game, inventory: up };
        }
        // ask the server only when the attempt can succeed: inputs in stock and an outcome whose
        // prerequisites are learned (no outcome is learned yet, so the roll always teaches a spell)
        const have: Record<string, number> = {};
        for (const i of target.inputs) have[i] = (have[i] ?? 0) + 1;
        const affordable = Object.entries(have).every(([i, n]) => (game.inventory[i] ?? 0) >= n);
        const eligible = target.outcomes.some((o) =>
          (data.spells[o.spellId]?.prerequisites ?? []).every((p) => game.learned.includes(p)));
        if (affordable && eligible) await synthesizeOnServer([...target.inputs].sort());
      }
    }
    const best = bestSpell();
    if (game.equipped !== best.id) game = equipSpell(game, best.id);

    // a boss the learned spells cannot hurt never dies and its fight does not count toward kills:
    // retreat and farm below until something new is learned (a human would travel the same way)
    const spells = game.learned.map((id) => data.spells[id]!);
    if (blockedAtLearned !== game.learned.length) blocked.clear();
    const bossDef = data.monsters[data.zones.find((z) => z.id === game.currentZone)!.bossId]!;
    if (battle.bossActive && !spells.some((s) => canDamage(s, bossDef))) {
      blocked.add(game.currentZone);
      blockedAtLearned = game.learned.length;
    }
    // go to the highest unlocked zone where the best spell can damage every normal monster
    let dest = game.currentZone;
    for (const z of data.zones) {
      if (!game.unlockedZones.includes(z.id) || blocked.has(z.id)) continue;
      const ok = z.monsters.every((m) => spells.some((s) => canDamage(s, data.monsters[m]!)));
      if (ok) dest = z.id;
    }
    if (dest !== game.currentZone) {
      const t = travel(game, dest);
      if (t) {
        game = t;
        battle = createBattle(dest);
      }
    }
  };

  let nextDecision = DECISION_MS;
  let nextUpload = UPLOAD_MS;
  while (simMs < opts.maxSimMs) {
    const r = stepBattle(game, battle, data, battleRng);
    game = r.game;
    battle = r.battle;
    simMs += STEP_MS;
    if (game.currentZone === lastZone.id && lastZoneEnteredAt === null) lastZoneEnteredAt = simMs - STEP_MS;
    if (lastZoneClearedAt === null && game.defeatedBosses.includes(lastZone.bossId)) {
      lastZoneClearedAt = simMs;
    }
    if (simMs >= nextDecision) {
      nextDecision += DECISION_MS;
      await decide();
    }
    if (simMs >= nextUpload) {
      nextUpload += UPLOAD_MS;
      await upload();
      // stop at the first upload after the last boss fell, so that final kill is validated too
      if (lastZoneClearedAt !== null) break;
    }
  }

  return {
    clearedZones: data.zones.filter((z) => game.defeatedBosses.includes(z.bossId)).map((z) => z.id),
    learned: game.learned,
    simMs,
    serverCalls,
    rejectedUploads,
    lastZoneMs: lastZoneEnteredAt !== null && lastZoneClearedAt !== null ? lastZoneClearedAt - lastZoneEnteredAt : null,
    rejectionReasons,
  };
}
