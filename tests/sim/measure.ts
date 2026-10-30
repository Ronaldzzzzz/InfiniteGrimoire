/**
 * Shared measurement on the battle strip: DPS for the spell tier curve on magic circle spells (tier-curve.test.ts) and stage / boss times for the
 * pacing gate (stage-time.test.ts); scripts/measure-dps.ts prints both. Read-only: changes no game data. Damage counted is what actually came off foes' hit points (hit.dealt + burn).
 */
import { createBattle, LANE_Y, stepBattle, STEP_MS, type BattleState } from '../../src/engine/combat';
import { content } from '../../src/engine/content';
import type { Content, GameState, RuneId } from '../../src/engine/model';
import { ELEMENT_ORDER } from '../../src/engine/types';
import type { ElementId } from '../../src/engine/types';
import { canonicalCircle, parseCanonical } from '../../src/engine/circle';
import type { Placement } from '../../src/engine/circle';
import { createInitialState } from '../../src/engine/persist';
import { createRng } from '../../src/engine/rng';
import { BOSS_LIMIT_MS } from '../../src/engine/stages';
import { MAX_SPELL_LEVEL, resolveSpell, TIER_STEP } from '../../src/engine/spells';

export const HOME_ZONE: Record<number, string> = {
  1: 'mist_meadow', 2: 'mist_meadow', 3: 'mist_meadow', 4: 'thunder_gorge', 5: 'thunder_gorge',
  6: 'ember_wastes', 7: 'sunken_temple', 8: 'starfall_plateau', 9: 'worlds_end', 10: 'worlds_end',
};

/** The windows and seeds of the curve checks (spec 7.3), shared by tier-curve.test.ts and scripts/measure-dps.ts (ledger T7a). */
export const CURVE_OPTS = { seeds: [20261021, 7], soloMs: 60_000, crowdMs: 30_000 };

/** Control / bad-affinity named spells: left out of the stage-time tiers (tierSpells) and the DPS summary. */
export const CURVE_EXEMPT = ['mire', 'sandstorm', 'steam', 'grounding', 'mana_overload'];

/** A fresh save with only `spellId` learned and equipped at `level`, standing in `zoneId`, every zone unlocked. */
const stageGame = (spellId: string, level: number, zoneId: string): GameState => ({
  ...createInitialState(content),
  learned: [spellId], equipped: spellId, levels: level > 1 ? { [spellId]: level } : {},
  currentZone: zoneId, unlockedZones: content.zones.map((z) => z.id),
});

/**
 * Damage per second dealt to the given foes (hits plus burn) over `ms`, or until they all fall. The foes stand in the lane
 * in front of the mage (x 0.3-0.75, spread across it) and walk in from there; the battle starts past the last wave, so
 * they are all there is.
 */
export function clean(spellId: string, level: number, zoneId: string, seed: number, foes: { defId: string; hpMul: number }[], ms: number): number {
  let game: GameState = stageGame(spellId, level, zoneId);
  const rng = createRng(seed);
  let battle: BattleState = { ...createBattle(zoneId, 1), phase: 'fight', wave: 1e9, nextUid: foes.length + 1 };
  battle.foes = foes.map((f, i) => {
    const def = content.monsters[f.defId]!;
    const x = foes.length === 1 ? 0.6 : 0.3 + 0.45 * ((i * 7) % 10) / 9;
    const y = foes.length === 1 ? 0 : (((i * 3) % 7) / 3 - 1) * LANE_Y;
    return { uid: i + 1, defId: f.defId, x, y, hp: def.hp * f.hpMul, maxHp: def.hp * f.hpMul, statuses: [], kx: 0, ky: 0, wander: 0 };
  });
  return dealtPerSec(game, battle, content, rng, ms);
}

/** Steps the battle for `ms` (or until no foe is left) and returns hit points removed per second (hit.dealt plus burn). */
function dealtPerSec(game: GameState, battle: BattleState, c: Content, rng: ReturnType<typeof createRng>, ms: number): number {
  let t = 0, dealt = 0;
  while (t < ms) {
    const r = stepBattle(game, battle, c, rng);
    game = r.game; battle = r.battle; t += STEP_MS;
    for (const e of r.events) {
      if (e.type === 'hit') dealt += e.dealt;
      if (e.type === 'dot') dealt += e.damage;
    }
    if (battle.phase === 'fight' && battle.foes.length === 0) break;
  }
  return dealt / (t / 1000);
}

/** The hardest ordinary monster of a zone (highest tier, then defense). */
export function toughestNormal(zoneId: string): string {
  const zone = content.zones.find((z) => z.id === zoneId)!;
  return [...zone.monsters].sort((a, b) => content.monsters[b]!.tier - content.monsters[a]!.tier || content.monsters[b]!.defense - content.monsters[a]!.defense)[0]!;
}

/** Scenario A: the zone's boss alone, hit points x1000. */
export function soloBossDps(spellId: string, level: number, zoneId: string, opts: { seed: number; ms: number }): number {
  const zone = content.zones.find((z) => z.id === zoneId)!;
  return clean(spellId, level, zoneId, opts.seed, [{ defId: zone.bossId, hpMul: 1000 }], opts.ms);
}

/** The zone's content with every ordinary monster's hit points x`mul` (the boss is left alone). */
function toughened(zoneId: string, mul: number): Content {
  const zone = content.zones.find((z) => z.id === zoneId)!;
  const monsters = { ...content.monsters };
  for (const id of zone.monsters) monsters[id] = { ...monsters[id]!, hp: monsters[id]!.hp * mul };
  return { ...content, monsters };
}

/**
 * Scenario B, the stage crowd: the real stage MEASURE_STAGE of the zone (its first wave walks in from the right edge across
 * the lane), ordinary monsters' hit points x1000 so the wave never falls; damage per second over `ms`.
 */
export function crowdDps(spellId: string, level: number, zoneId: string, opts: { seed: number; ms: number }): number {
  const c = toughened(zoneId, 1000);
  return dealtPerSec(stageGame(spellId, level, zoneId), createBattle(zoneId, MEASURE_STAGE, { content: c }), c, createRng(opts.seed), opts.ms);
}

/** One circle measured for the tier curve: a textbook circle, or a uniform stand-in where an element has none at that tier. */
export interface CurveCircle { id: string; element: ElementId; tier: number; textbook: string | null }

/** The form an element's stand-in circles use: the form of its Lv.2 textbook circle. */
function homeForm(e: ElementId): RuneId {
  const lv2 = Object.values(content.spells).find((s) => s.circle && s.tier === 2 && parseCanonical(s.circle)!.core === e);
  return lv2 ? parseCanonical(lv2.circle!)!.form : 'bolt';
}

/** A circle of one element only, with tier - 1 nodes (ring 1 first). */
export function uniformCircle(e: ElementId, tier: number, form: RuneId): string {
  const nodes = tier - 1;
  const ring = (k: number) => [0, 1, 2, 3, 4].map((j) => (j < k ? { element: e, grade: 5 } : null));
  const n1 = Math.min(5, nodes), n2 = nodes - n1;
  const p: Placement = { core: { element: e, grade: 5 }, ring1: ring(n1), ring2: ring(n2), runes: [n1 ? form : null, n2 ? form : null] };
  return canonicalCircle(p, form);
}

/**
 * Per element and tier 2..10: every textbook circle of that core element and tier (the rares' Lv.10 circles count; they
 * resolve as the ordinary Lv.10 spell), or one uniform stand-in circle in the element's home form where there is none.
 */
export function curveCircles(): CurveCircle[] {
  const out: CurveCircle[] = [];
  for (const e of ELEMENT_ORDER) {
    for (let t = 2; t <= 10; t++) {
      const books = Object.values(content.spells)
        .filter((s) => s.circle && s.tier === t && parseCanonical(s.circle)!.core === e)
        .sort((a, b) => a.id.localeCompare(b.id));
      if (books.length) for (const s of books) out.push({ id: s.circle!, element: e, tier: t, textbook: s.id });
      else out.push({ id: uniformCircle(e, t, homeForm(e)), element: e, tier: t, textbook: null });
    }
  }
  return out;
}

export interface CircleCurve extends CurveCircle {
  name: string; soloAt: Record<string, number>; crowdAt: Record<string, number>; empoweredGeoAt: Record<string, number>;
}
/** One failed curve rule; `ratio` is the measured ratio, `limit` the bound it broke ('max': must stay at or below). */
export interface CurveFailure { key: string; text: string; ratio: number; limit: number; side: 'max' | 'min' }
export interface CurveReport {
  perCircle: CircleCurve[];
  failures: CurveFailure[];
  /** Per tier 2..10, medians at HOME_ZONE[tier]; ratio = this tier's median / the tier below's, both at the lower tier's home zone. */
  medians: { tier: number; zone: string; solo: number; crowd: number; geo: number; ratioSolo: number | null; ratioCrowd: number | null }[];
}

const geo = (a: number, b: number) => Math.sqrt(a * b);
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const v = [...xs].sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
const f1 = (x: number) => x.toFixed(1);

/** Seed-averaged scenario DPS (the curve uses the mean over `seeds`). */
const meanOver = (seeds: number[], f: (seed: number) => number) => seeds.reduce((n, sd) => n + f(sd), 0) / seeds.length;

/** Neighbouring tiers: median of tier n+1 / tier n within TIER_STEP +- CURVE_BAND, both measured at HOME_ZONE[n]. */
export const CURVE_BAND = 0.2;

/**
 * The tier curve on circle spells (magic circle spec 3.5): neighbouring-tier median ratios in [1.6, 2.0] (solo boss and
 * stage crowd), and a fully empowered circle stays at or below the next tier's median (the tier's empowered median at or
 * below that median / 1.2).
 */
export function curveReport(opts: { seeds: number[]; soloMs: number; crowdMs: number }): CurveReport {
  const solo = (id: string, level: number, z: string) => meanOver(opts.seeds, (seed) => soloBossDps(id, level, z, { seed, ms: opts.soloMs }));
  const crowd = (id: string, level: number, z: string) => meanOver(opts.seeds, (seed) => crowdDps(id, level, z, { seed, ms: opts.crowdMs }));
  const perCircle: CircleCurve[] = [];
  for (const c of curveCircles()) {
    const zones = new Set<string>([HOME_ZONE[c.tier]!, HOME_ZONE[c.tier - 1]!]);
    const row: CircleCurve = { ...c, name: resolveSpell(c.id, content)!.name, soloAt: {}, crowdAt: {}, empoweredGeoAt: {} };
    for (const z of zones) {
      row.soloAt[z] = solo(c.id, 1, z);
      row.crowdAt[z] = crowd(c.id, 1, z);
    }
    const home = HOME_ZONE[c.tier]!;
    row.empoweredGeoAt[home] = geo(solo(c.id, MAX_SPELL_LEVEL, home), crowd(c.id, MAX_SPELL_LEVEL, home));
    perCircle.push(row);
  }

  const failures: CurveFailure[] = [];
  const rows = (t: number) => perCircle.filter((p) => p.tier === t);
  const med = (t: number, zone: string, key: 'soloAt' | 'crowdAt') => median(rows(t).map((p) => p[key][zone] ?? 0));
  const medGeo = (t: number, zone: string) => median(rows(t).map((p) => geo(p.soloAt[zone] ?? 0, p.crowdAt[zone] ?? 0)));
  const label = (p: CircleCurve) => `${p.name}（Lv.${p.tier}${p.textbook ? '' : '，代表陣'} ${p.id}）`;

  for (const p of perCircle) {
    const home = HOME_ZONE[p.tier]!;
    if (!(p.soloAt[home]! > 0) || !(p.crowdAt[home]! > 0)) {
      failures.push({ key: `cannot damage ${p.id}`, text: `${label(p)}在 ${home} 打不動（單挑 ${f1(p.soloAt[home]!)}、群怪 ${f1(p.crowdAt[home]!)}）。`, ratio: 0, limit: 0, side: 'min' });
    }
  }

  const medians: CurveReport['medians'] = [];
  for (let n = 2; n <= 10; n++) {
    const z = HOME_ZONE[n]!, prevZ = HOME_ZONE[n - 1]!;
    const ratio = (key: 'soloAt' | 'crowdAt') => (n > 2 && med(n - 1, prevZ, key) > 0 ? med(n, prevZ, key) / med(n - 1, prevZ, key) : null);
    medians.push({ tier: n, zone: z, solo: med(n, z, 'soloAt'), crowd: med(n, z, 'crowdAt'), geo: medGeo(n, z), ratioSolo: ratio('soloAt'), ratioCrowd: ratio('crowdAt') });
  }
  for (let n = 2; n <= 9; n++) {
    const z = HOME_ZONE[n]!;
    for (const [key, name, tag] of [['soloAt', '單挑魔王', 'solo'], ['crowdAt', '群怪', 'crowd']] as const) {
      const lo = med(n, z, key), hi = med(n + 1, z, key);
      const r = lo > 0 ? hi / lo : 0;
      const text = `Lv.${n}→Lv.${n + 1}（在 ${z}，${name}）：中位數 ${f1(lo)} → ${f1(hi)}，倍率 ×${r.toFixed(2)}，應在 ${TIER_STEP}±${CURVE_BAND}。`;
      const key2 = `Lv.${n}→Lv.${n + 1} ${tag}`;
      if (r > TIER_STEP + CURVE_BAND + 1e-9) failures.push({ key: key2, text, ratio: r, limit: TIER_STEP + CURVE_BAND, side: 'max' });
      else if (r < TIER_STEP - CURVE_BAND - 1e-9) failures.push({ key: key2, text, ratio: r, limit: TIER_STEP - CURVE_BAND, side: 'min' });
    }
  }

  // Jumping a tier must be felt (tier-curve spec 15): every fully empowered Lv.n circle stays at or below the Lv.n+1 median
  // at Lv.n's home zone, and the empowered median at or below that median / 1.2.
  for (let n = 2; n <= 9; n++) {
    const z = HOME_ZONE[n]!, next = medGeo(n + 1, z);
    for (const p of rows(n)) {
      const e = p.empoweredGeoAt[z]!, r = next > 0 ? e / next : Infinity;
      if (!(e > 0) || r > 1) failures.push({ key: `empowered ${p.id}`, text: `${label(p)}強化 +${MAX_SPELL_LEVEL - 1} 的幾何平均 ${f1(e)}，超過 Lv.${n + 1} 中位數 ${f1(next)}（×${r.toFixed(2)}）。`, ratio: r, limit: 1, side: 'max' });
    }
    const me = median(rows(n).map((p) => p.empoweredGeoAt[z]!)), r = next > 0 ? me / next : Infinity;
    if (!(me > 0) || r > 1 / 1.2) failures.push({ key: `empowered median Lv.${n}`, text: `Lv.${n} 強化 +${MAX_SPELL_LEVEL - 1} 的中位數 ${f1(me)}，超過 Lv.${n + 1} 中位數 ${f1(next)} ÷ 1.2（×${r.toFixed(2)}）。`, ratio: r, limit: 1 / 1.2, side: 'max' });
  }
  return { perCircle, failures, medians };
}

// ---- Stage time on the battle strip (battle-strip spec 3.7) ----

/** The tier each zone is judged at (its home tier). */
export const ZONE_TIER: Record<string, number> = {
  mist_meadow: 2, thunder_gorge: 4, ember_wastes: 6, sunken_temple: 7, starfall_plateau: 8, worlds_end: 9,
};
/** The ordinary stage the stage-time checks measure (every zone has 9 of them before the boss). */
export const MEASURE_STAGE = 5;
/** Ordinary stages give up after this long; the boss stage fails by itself at BOSS_LIMIT_MS after the boss appears. */
export const STAGE_LIMIT_MS = 600_000;

/** Plays one real stage (waves walking in, the boss last on a boss stage) with the spell equipped from t=0. */
function playStage(
  spellId: string, level: number, zoneId: string, stage: number, opts: { seed: number; limitMs: number }, c: Content = content,
): { ms: number | null; bossMs: number | null } {
  let game = stageGame(spellId, level, zoneId);
  let battle = createBattle(zoneId, stage, { content: c });
  const rng = createRng(opts.seed);
  let t = 0, bossMs: number | null = null;
  while (t < opts.limitMs) {
    const r = stepBattle(game, battle, c, rng);
    game = r.game; battle = r.battle; t += STEP_MS;
    if (bossMs === null && r.events.some((e) => e.type === 'bossDefeated')) bossMs = battle.bossMs;
    if (battle.phase === 'done') return { ms: t, bossMs };
    if (battle.phase === 'failed') return { ms: null, bossMs: null };
  }
  return { ms: null, bossMs };
}

/** Simulated ms to clear stage `stage` of `zoneId` with the spell at `level`, or null when it is not done within limitMs (or fails). */
export function stageTime(spellId: string, level: number, zoneId: string, stage: number, opts: { seed: number; limitMs: number }): number | null {
  return playStage(spellId, level, zoneId, stage, opts).ms;
}

/** Simulated ms from the boss appearing to its fall on the zone's boss stage, or null when the stage fails (BOSS_LIMIT_MS) or runs out. */
export function bossKillTime(spellId: string, level: number, zoneId: string, opts: { seed: number; limitMs: number }): number | null {
  const zone = content.zones.find((z) => z.id === zoneId)!;
  return playStage(spellId, level, zoneId, zone.stages.length, opts).bossMs;
}

/** Named non-rare spells of `tier` that the curve does not exempt (tier 10: the rares). */
export function tierSpells(tier: number): string[] {
  return Object.values(content.spells)
    .filter((s) => s.tier === tier && !CURVE_EXEMPT.includes(s.id) && (tier === 10 ? s.rare : s.named && !s.rare))
    .map((s) => s.id).sort();
}

/** Median where null (did not finish) counts as slower than anything; null when the median itself did not finish. */
export function medianOrNull(xs: (number | null)[]): number | null {
  if (!xs.length) return null;
  const m = median(xs.map((x) => (x === null ? Infinity : x)));
  return Number.isFinite(m) ? m : null;
}

export interface StageRow { zoneId: string; rel: -1 | 0 | 1; tier: number; medianMs: number | null }
export interface BossRow { zoneId: string; tier: number; medianMs: number | null }

/**
 * For each zone: stage `opts.stage` (default MEASURE_STAGE) cleared by the tier ZONE_TIER - 1, ZONE_TIER and ZONE_TIER + 1 spells (worlds_end +1 = the
 * rares). Each spell's time is the median over seeds; the row is the median over spells (null = did not finish in STAGE_LIMIT_MS).
 */
export function stageReport(opts: { seeds: number[]; stage?: number; rels?: readonly (-1 | 0 | 1)[] }): StageRow[] {
  const stage = opts.stage ?? MEASURE_STAGE;
  const rows: StageRow[] = [];
  for (const zone of content.zones) {
    const zt = ZONE_TIER[zone.id]!;
    for (const rel of opts.rels ?? ([-1, 0, 1] as const)) {
      const tier = zt + rel;
      const spells = tierSpells(tier);
      if (!spells.length) continue;
      const per = spells.map((id) => medianOrNull(opts.seeds.map((seed) => stageTime(id, 1, zone.id, stage, { seed, limitMs: STAGE_LIMIT_MS }))));
      rows.push({ zoneId: zone.id, rel, tier, medianMs: medianOrNull(per) });
    }
  }
  return rows;
}

/** For each zone: ms from the boss appearing to its fall, home-tier spells, median over seeds then spells (null = past BOSS_LIMIT_MS). */
export function bossReport(opts: { seeds: number[] }): BossRow[] {
  return content.zones.map((zone) => {
    const tier = ZONE_TIER[zone.id]!;
    const per = tierSpells(tier).map((id) => medianOrNull(opts.seeds.map((seed) => bossKillTime(id, 1, zone.id, { seed, limitMs: STAGE_LIMIT_MS + BOSS_LIMIT_MS }))));
    return { zoneId: zone.id, tier, medianMs: medianOrNull(per) };
  });
}

export const STAGE_OPTS = { seeds: [20261021, 7] };
