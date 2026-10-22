import { createBattle, stepBattle, STEP_MS, type BattleState } from '../../src/engine/combat';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { empowerCost } from '../../src/engine/empower';
import { upgradeElement } from '../../src/engine/inventory';
import type { Effect, GameState, Spell, Zone } from '../../src/engine/model';
import { parseState } from '../../src/engine/persist';
import { createRng } from '../../src/engine/rng';
import { resolveSpell, spellAtLevel } from '../../src/engine/spells';
import { visibleRegions } from '../../src/engine/tree';
import { elementItem, GRADE_UPGRADE_COST, type ElementId } from '../../src/engine/types';
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
  levels: Record<string, number>;
  revealed: string[];
  simMs: number;
  /** simulated ms at which each zone's boss first fell */
  clearedAt: Record<string, number>;
  /** requests sent to PUT /api/save and the action endpoints */
  serverCalls: number;
  /** non-200 responses from PUT /api/save and the action endpoints */
  rejectedUploads: number;
  rejectionReasons: string[];
  /** a short trace for assertion messages */
  summary: Record<string, unknown>;
}

const DECISION_MS = 1000;
const UPLOAD_MS = 30_000;
const EMPOWER_EVERY_MS = 5 * 60_000;

const CLOCK_START = 1_000_000_000;

/** Rough single-target damage per second of a spell, to pick what to equip and empower. */
function dps(spell: Spell): number {
  const hits = (e: Effect): number => {
    switch (e.kind) {
      case 'bolt': case 'blades': case 'meteor': return e.mult * e.count;
      case 'chain': return e.mult;
      case 'zone': return e.mult * (e.ms / e.tickMs) + (e.strikes > 0 ? 2 * e.mult * e.strikes : 0);
      case 'storm': return e.mult * (e.ms / e.tickMs);
      case 'ring': case 'field': return e.mult;
      default: return 0;
    }
  };
  return (spell.attack * spell.effects.reduce((n, e) => n + hits(e), 0)) / spell.cooldownMs;
}

/**
 * Plays like the real client against the real server: the worker app with an in-memory store
 * and a fake clock that follows simulated time. Saves go through PUT /api/save every 30 s;
 * synthesis, empower and reveal through their POST endpoints, all as JSON. Server replies are
 * applied as the client would (success -> adopt the returned state; rejected / conflict -> adopt
 * the server state).
 *
 * Pure-element route: el:X:1 + el:X:1 teaches the base spell, a grade-2 X element (upgraded from
 * grade 1) turns it into the same-element strengthening, and every 5 simulated minutes the spare
 * X elements empower the strongest spell. Key items are used as soon as they drop.
 */
export async function runBot(opts: BotOptions): Promise<BotResult> {
  const battleRng = createRng(opts.seed);
  const serverRng = createRng(opts.seed ^ 0x9e3779b9);
  const lastZone = content.zones[content.zones.length - 1]!;

  let simMs = 0;
  const app = createApp({ store: new MemoryStore(), now: () => CLOCK_START + simMs, rng: () => serverRng, content, pepper: 'sim-pepper' });
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
    const s = parseState(raw, content);
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
  const clearedAt: Record<string, number> = {};

  /** Non-200: count it and adopt the server's state, like the client does. */
  const adoptServer = (what: string, r: { status: number; body: Record<string, unknown> }): void => {
    rejectedUploads++;
    const reasons = Array.isArray(r.body.reasons) ? r.body.reasons.join('; ') : JSON.stringify(r.body.result ?? r.body);
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
  /** A server action; on success the battle keeps running on the returned state (ours plus the action). */
  const act = async (path: string, payload: Record<string, unknown>): Promise<boolean> => {
    serverCalls++;
    const r = await call('POST', path, { state: game, baseRevision: revision, ...payload });
    if (r.status !== 200) {
      adoptServer(`POST ${path} ${JSON.stringify(payload)}`, r);
      return false;
    }
    game = serverState(r.body.state);
    revision = r.body.revision as number;
    return true;
  };

  const el = opts.element;
  const baseId = el ? content.baseSpells[el] : null;
  const strongId = baseId ? content.recipes.find((r) => r.inputs.includes(baseId) && r.inputs.includes(elementItem(el!, 2)))?.outcomes[0]?.spellId ?? null : null;
  const count = (id: string) => (Object.hasOwn(game.inventory, id) ? game.inventory[id]! : 0);
  const levelOf = (id: string) => (Object.hasOwn(game.levels, id) ? game.levels[id]! : 1);
  const fightAs = (id: string) => spellAtLevel(resolveSpell(id, content)!, levelOf(id));
  const zoneOf = (id: string) => content.zones.find((z) => z.id === id)!;
  const hitsAll = (s: Spell, z: Zone) => z.monsters.every((m) => canDamage(s, content.monsters[m]!));
  const bestSpell = (): string =>
    game.learned.reduce((a, b) => (dps(fightAs(b)) > dps(fightAs(a)) ? b : a));

  /** Upgrades grade-1 elements of `el` until `need` grade-`grade` items are in stock (client-side, like the element table). */
  const stock = (grade: number, need: number): boolean => {
    while (count(elementItem(el!, grade)) < need) {
      if (grade === 1) return false;
      if (!stock(grade - 1, GRADE_UPGRADE_COST[grade - 2]!)) return false;
      const up = upgradeElement(game.inventory, el!, grade - 1);
      if (!up) return false;
      game = { ...game, inventory: up };
    }
    return true;
  };

  const synthesizeStep = async (): Promise<void> => {
    if (!el || !baseId) return;
    if (!game.learned.includes(baseId)) {
      if (count(elementItem(el, 1)) >= 2) await act('/api/synthesize', { inputs: [elementItem(el, 1), elementItem(el, 1)] });
      return;
    }
    if (strongId && !game.learned.includes(strongId) && stock(2, 1)) {
      await act('/api/synthesize', { inputs: [baseId, elementItem(el, 2)] });
    }
  };

  const empowerStep = async (): Promise<void> => {
    if (!el || !baseId) return;
    // keep the grade-2 element for the strengthening recipe until it is learned
    if (strongId && !game.learned.includes(strongId)) return;
    const target = bestSpell();
    for (let guard = 0; guard < 50; guard++) {
      const spell = resolveSpell(target, content)!;
      if (spell.elements.length === 0) return;
      const cost = empowerCost(spell, levelOf(target));
      const grade = Number(cost[0]!.split(':')[2]);
      if (!stock(grade, cost.length)) return;
      if (!(await act('/api/empower', { spellId: target }))) return;
    }
  };

  const revealStep = async (): Promise<void> => {
    const visible = visibleRegions(game, content);
    for (const key of Object.values(content.keyItems)) {
      if (count(key.id) > 0 && !visible.has(key.reveals)) await act('/api/reveal', { keyItem: key.id });
    }
  };

  const blocked = new Map<string, string>();
  const decide = async (doEmpower: boolean): Promise<void> => {
    await synthesizeStep();
    await revealStep();
    if (doEmpower) await empowerStep();
    const best = bestSpell();
    if (game.equipped !== best) game = { ...game, equipped: best };

    // a boss the equipped spell cannot hurt never dies: retreat and farm below until the spell changes
    const spell = fightAs(game.equipped);
    const sig = `${game.equipped}@${levelOf(game.equipped)}`;
    for (const [z, s] of blocked) if (s !== sig) blocked.delete(z);
    const here = zoneOf(game.currentZone);
    if (battle.bossActive && !canDamage(spell, content.monsters[here.bossId]!)) blocked.set(here.id, sig);
    // go to the highest unlocked zone where the spell can damage every normal monster
    let dest = game.currentZone;
    for (const z of content.zones) {
      if (game.unlockedZones.includes(z.id) && !blocked.has(z.id) && hitsAll(spell, z)) dest = z.id;
    }
    if (dest !== game.currentZone) {
      game = { ...game, currentZone: dest };
      battle = createBattle(dest);
    }
  };

  let nextDecision = DECISION_MS;
  let nextUpload = UPLOAD_MS;
  let nextEmpower = EMPOWER_EVERY_MS;
  let lastClearedAt: number | null = null;
  while (simMs < opts.maxSimMs) {
    const r = stepBattle(game, battle, content, battleRng);
    game = r.game;
    battle = r.battle;
    simMs += STEP_MS;
    for (const z of content.zones) if (!(z.id in clearedAt) && game.defeatedBosses.includes(z.bossId)) clearedAt[z.id] = simMs;
    if (lastClearedAt === null && game.defeatedBosses.includes(lastZone.bossId)) lastClearedAt = simMs;
    if (simMs >= nextDecision) {
      nextDecision += DECISION_MS;
      const doEmpower = simMs >= nextEmpower;
      if (doEmpower) nextEmpower += EMPOWER_EVERY_MS;
      await decide(doEmpower);
    }
    if (simMs >= nextUpload) {
      nextUpload += UPLOAD_MS;
      await upload();
      // stop at the first upload after the last boss fell, so that final kill is validated too
      if (lastClearedAt !== null) break;
    }
  }

  return {
    clearedZones: content.zones.filter((z) => game.defeatedBosses.includes(z.bossId)).map((z) => z.id),
    learned: game.learned,
    levels: game.levels,
    revealed: game.revealed,
    simMs,
    clearedAt,
    serverCalls,
    rejectedUploads,
    rejectionReasons,
    summary: { simMs, clearedAt, learned: game.learned, levels: game.levels, zone: game.currentZone, inventory: game.inventory },
  };
}
