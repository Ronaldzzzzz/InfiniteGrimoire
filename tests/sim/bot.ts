import { createBattle, stepBattle, STEP_MS, type BattleState } from '../../src/engine/battle';
import { canDamage } from '../../src/engine/combat-rules';
import { gameData } from '../../src/engine/data';
import { upgradeElement } from '../../src/engine/inventory';
import { createRng } from '../../src/engine/rng';
import { createInitialState, equipSpell, travel, type GameState } from '../../src/engine/state';
import { synthesize } from '../../src/engine/synthesis';
import { elementItem, type ElementId } from '../../src/engine/types';
import { validateUpload } from '../../src/engine/validate';

export interface BotOptions {
  element: ElementId | null;
  seed: number;
  maxSimMs: number;
}
export interface BotResult {
  clearedZones: string[];
  learned: string[];
  simMs: number;
  rejectedUploads: number;
  /** simulated ms spent from first entering the last zone until its boss fell (null if never entered / not cleared) */
  lastZoneMs: number | null;
  rejectionReasons: string[];
}

const DECISION_MS = 1000;
const UPLOAD_MS = 30_000;

export function runBot(opts: BotOptions): BotResult {
  const data = gameData;
  const battleRng = createRng(opts.seed);
  const synthRng = createRng(opts.seed ^ 0x9e3779b9);
  const lastZone = data.zones[data.zones.length - 1]!;

  let game: GameState = createInitialState(data);
  let battle: BattleState = createBattle(game.currentZone);
  let lastAccepted = game;
  let rejectedUploads = 0;
  const rejectionReasons: string[] = [];
  let simMs = 0;
  let lastZoneEnteredAt: number | null = null;
  let lastZoneClearedAt: number | null = null;

  // recipe chain for the chosen element: T2, T4, T5
  const chain = opts.element
    ? ['t2', 't4', 't5'].map((t) => data.recipes.find((r) => r.id === `${opts.element}_${t}`)!)
    : [];

  const blocked = new Set<string>();
  let blockedAtLearned = 0;

  const bestSpell = () =>
    game.learned.map((id) => data.spells[id]!).reduce((a, b) => (b.tier > a.tier ? b : a));

  const decide = (): void => {
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
        const res = synthesize(game, target.inputs, data, synthRng);
        if (res.result.kind === 'learned') {
          game = res.state;
          lastAccepted = game; // server commits the post-synthesis state
        }
      }
    }
    const best = bestSpell();
    if (game.equipped !== best.id) game = equipSpell(game, best.id);

    // a boss the equipped spells cannot hurt halts spawning for good: retreat and farm below
    // until something new is learned (a human player would do the same by travelling)
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
      decide();
    }
    if (simMs >= nextUpload) {
      nextUpload += UPLOAD_MS;
      const v = validateUpload(lastAccepted, game, UPLOAD_MS, data);
      if (v.ok) lastAccepted = game;
      else {
        rejectedUploads++;
        rejectionReasons.push(`@${simMs}: ${v.reasons.join('; ')}`);
        game = lastAccepted;
        battle = createBattle(game.currentZone);
      }
      // stop at the first upload after the last boss fell, so that final kill is validated too
      if (lastZoneClearedAt !== null) break;
    }
  }

  return {
    clearedZones: data.zones.filter((z) => game.defeatedBosses.includes(z.bossId)).map((z) => z.id),
    learned: game.learned,
    simMs,
    rejectedUploads,
    lastZoneMs: lastZoneEnteredAt !== null && lastZoneClearedAt !== null ? lastZoneClearedAt - lastZoneEnteredAt : null,
    rejectionReasons,
  };
}
