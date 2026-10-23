import { createBattle, stepBattle, STEP_MS, type BattleState } from '../../src/engine/combat';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { requiredGrade } from '../../src/engine/crafting';
import { empowerCost } from '../../src/engine/empower';
import { elementEquivalent, upgradeElement } from '../../src/engine/inventory';
import type { Effect, GameState, Spell, Zone } from '../../src/engine/model';
import { parseState } from '../../src/engine/persist';
import { createRng } from '../../src/engine/rng';
import { resolveSpell, spellAtLevel } from '../../src/engine/spells';
import { visibleRegions } from '../../src/engine/tree';
import { ELEMENT_ORDER, elementItem, GRADE_UPGRADE_COST, gradeValue, type ElementId, type ItemId } from '../../src/engine/types';
import { createApp } from '../../worker/app';
import { MemoryStore } from '../../worker/store';

/** A pure element route, the fire + wind combination route, or mana_bolt only (null). */
export type Route = ElementId | 'mixed' | null;
export interface BotOptions {
  route: Route;
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
  /** simulated ms at which each spell was learned */
  learnedAt: Record<string, number>;
  /** per element: cumulative grade-1 equivalents gained from drops (spending and upgrades not subtracted), sampled each simulated minute */
  gained: Record<ElementId, { atMs: number; eq: number }[]>;
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
 * The route is a list of recipes learned in order: pure X = base, strengthening and the two upper
 * layers of the X line (X_base, X_empower, X_pure_2, X_pure_3); mixed = fireball, wind_blade, fire
 * tornado, thunderfire hurricane and skyburner. Element inputs and fusion costs are upgraded from
 * lower grades on the client, like the element table. Every 5 simulated minutes the elements beyond
 * what the next recipe needs empower the strongest spell. Key items are used as soon as they drop.
 */
export const ROUTE_RECIPES: Record<Exclude<Route, null>, string[]> = {
  ...(Object.fromEntries(ELEMENT_ORDER.map((e) => [e, [`${e}_base`, `${e}_empower`, `${e}_pure_2`, `${e}_pure_3`]])) as Record<ElementId, string[]>),
  mixed: ['fire_base', 'wind_base', 'fire_wind', 'thunder_fire_hurricane', 'skyburner'],
};

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
  const learnedAt: Record<string, number> = {};

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
    for (const id of game.learned) if (!(id in learnedAt)) learnedAt[id] = simMs;
    return true;
  };

  const plan = (opts.route ? ROUTE_RECIPES[opts.route] : []).map((id) => {
    const r = content.recipes.find((x) => x.id === id);
    if (!r) throw new Error(`unknown route recipe ${id}`);
    return r;
  });
  const count = (id: string) => (Object.hasOwn(game.inventory, id) ? game.inventory[id]! : 0);
  const levelOf = (id: string) => (Object.hasOwn(game.levels, id) ? game.levels[id]! : 1);
  const fightAs = (id: string) => spellAtLevel(resolveSpell(id, content)!, levelOf(id));
  const zoneOf = (id: string) => content.zones.find((z) => z.id === id)!;
  const hitsAll = (s: Spell, z: Zone) => z.monsters.every((m) => canDamage(s, content.monsters[m]!));
  /** How far a spell gets: the highest unlocked zone whose normal monsters it can all damage (-1: none). */
  const reach = (id: string): number => {
    const s = fightAs(id);
    let best = -1;
    content.zones.forEach((z, i) => { if (game.unlockedZones.includes(z.id) && hitsAll(s, z)) best = i; });
    return best;
  };
  /** The spell that reaches the furthest zone, then the one with the most damage per second. */
  const bestSpell = (): string =>
    game.learned.reduce((a, b) => {
      const ra = reach(a), rb = reach(b);
      return rb > ra || (rb === ra && dps(fightAs(b)) > dps(fightAs(a))) ? b : a;
    });

  /** Upgrades lower grades of `e` until `need` grade-`grade` items are in stock (client-side, like the element table). */
  const stock = (e: ElementId, grade: number, need: number): boolean => {
    while (count(elementItem(e, grade)) < need) {
      if (grade === 1) return false;
      if (!stock(e, grade - 1, GRADE_UPGRADE_COST[grade - 2]!)) return false;
      const up = upgradeElement(game.inventory, e, grade - 1);
      if (!up) return false;
      game = { ...game, inventory: up };
    }
    return true;
  };
  /** Element items a route recipe consumes: its element inputs, plus the fusion cost when both inputs are spells. */
  const recipeElements = (r: (typeof plan)[number]): ItemId[] => {
    const items = r.inputs.filter((i) => i.startsWith('el:'));
    if (items.length > 0) return items;
    const out = content.spells[r.outcomes[0]!.spellId!]!;
    return out.elements.map((e) => elementItem(e, requiredGrade(out.depth)));
  };
  const nextStep = () => plan.find((r) => !game.learned.includes(r.outcomes[0]!.spellId!));
  /** Grade-1 equivalents per element held back for the next route recipe. */
  const reserve = (): Record<string, number> => {
    const out: Record<string, number> = {};
    const r = nextStep();
    if (!r) return out;
    for (const it of recipeElements(r)) {
      const [, e, g] = it.split(':');
      out[e!] = (out[e!] ?? 0) + gradeValue(Number(g));
    }
    return out;
  };

  const synthesizeStep = async (): Promise<void> => {
    const r = nextStep();
    if (!r) return;
    const out = content.spells[r.outcomes[0]!.spellId!]!;
    if (!out.prerequisites.every((p) => game.learned.includes(p))) return;
    const need = new Map<ItemId, number>();
    for (const it of recipeElements(r)) need.set(it, (need.get(it) ?? 0) + 1);
    // check the whole cost in grade-1 equivalents first, so a half-made upgrade never eats another input
    const eq: Record<string, number> = {};
    for (const [it, n] of need) { const [, e, g] = it.split(':'); eq[e!] = (eq[e!] ?? 0) + n * gradeValue(Number(g)); }
    if (Object.entries(eq).some(([e, v]) => elementEquivalent(game.inventory, e as ElementId) < v)) return;
    for (const [it, n] of need) {
      const [, e, g] = it.split(':');
      if (!stock(e as ElementId, Number(g), n)) return;
    }
    await act('/api/synthesize', { inputs: r.inputs });
  };

  const empowerStep = async (): Promise<void> => {
    if (!opts.route) return;
    const target = bestSpell();
    const keep = reserve();
    for (let guard = 0; guard < 50; guard++) {
      const spell = resolveSpell(target, content)!;
      if (spell.elements.length === 0) return;
      const cost = empowerCost(spell, levelOf(target));
      const grade = Number(cost[0]!.split(':')[2]);
      const per = cost.length / spell.elements.length;
      if (spell.elements.some((e) => elementEquivalent(game.inventory, e) - per * gradeValue(grade) < (keep[e] ?? 0))) return;
      if (!spell.elements.every((e) => stock(e, grade, per))) return;
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

  const gainedEq = Object.fromEntries(ELEMENT_ORDER.map((e) => [e, 0])) as Record<ElementId, number>;
  const gained = Object.fromEntries(ELEMENT_ORDER.map((e) => [e, [] as { atMs: number; eq: number }[]])) as BotResult['gained'];
  let nextSample = 60_000;
  let nextDecision = DECISION_MS;
  let nextUpload = UPLOAD_MS;
  let nextEmpower = EMPOWER_EVERY_MS;
  let lastClearedAt: number | null = null;
  while (simMs < opts.maxSimMs) {
    const r = stepBattle(game, battle, content, battleRng);
    // nothing is spent inside a battle step, so any rise in an element item is a drop
    for (const e of ELEMENT_ORDER) {
      for (let g = 1; g <= GRADE_UPGRADE_COST.length + 1; g++) {
        const id = elementItem(e, g);
        const was = Object.hasOwn(game.inventory, id) ? game.inventory[id]! : 0;
        const now = Object.hasOwn(r.game.inventory, id) ? r.game.inventory[id]! : 0;
        if (now > was) gainedEq[e] += (now - was) * gradeValue(g);
      }
    }
    game = r.game;
    battle = r.battle;
    simMs += STEP_MS;
    if (simMs >= nextSample) {
      nextSample += 60_000;
      for (const e of ELEMENT_ORDER) gained[e].push({ atMs: simMs, eq: gainedEq[e] });
    }
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
    learnedAt,
    gained,
    serverCalls,
    rejectedUploads,
    rejectionReasons,
    summary: { simMs, clearedAt, learned: game.learned, levels: game.levels, zone: game.currentZone, inventory: game.inventory },
  };
}
