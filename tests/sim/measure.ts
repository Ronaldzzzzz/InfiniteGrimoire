/**
 * Shared DPS measurement for the spell tier curve (used by scripts/measure-dps.ts and tests/sim/tier-curve.test.ts).
 * Read-only: changes no game data. Damage counted is what actually came off foes' hit points (hit.dealt + burn).
 */
import { createBattle, stepBattle, STEP_MS, type BattleState } from '../../src/engine/combat';
import { content } from '../../src/engine/content';
import type { Content, GameState } from '../../src/engine/model';
import { createInitialState } from '../../src/engine/persist';
import { createRng } from '../../src/engine/rng';
import { craftedId, MAX_SPELL_LEVEL, resolveSpell, TIER_STEP } from '../../src/engine/spells';

export const HOME_ZONE: Record<number, string> = {
  1: 'mist_meadow', 2: 'mist_meadow', 3: 'mist_meadow', 4: 'thunder_gorge', 5: 'thunder_gorge',
  6: 'ember_wastes', 7: 'sunken_temple', 8: 'starfall_plateau', 9: 'worlds_end', 10: 'worlds_end',
};

/** The windows and seeds of the curve checks (spec 7.3), shared by tier-curve.test.ts and scripts/measure-dps.ts (ledger T7a). */
export const CURVE_OPTS = { seeds: [20261021, 7], soloMs: 60_000, crowdMs: 30_000 };

/** Control / bad-affinity spells: only checked against the upper bound. */
export const CURVE_EXEMPT = ['mire', 'sandstorm', 'steam', 'grounding', 'mana_overload'];

/** The zone with spawning switched off, so a hand-placed set of foes is all there is. */
export const quiet = (zoneId: string): Content => ({
  ...content,
  zones: content.zones.map((z) => (z.id === zoneId ? { ...z, spawnIntervalMs: 1e12, pack: { ...z.pack, everyMs: 1e12 } } : z)),
});

/** Damage per second dealt to the given foes (hits plus burn) over `ms`, or until they all fall. */
export function clean(spellId: string, level: number, zoneId: string, seed: number, foes: { defId: string; hpMul: number }[], ms: number): number {
  const c = quiet(zoneId);
  let game: GameState = {
    ...createInitialState(content),
    learned: [spellId], equipped: spellId, levels: level > 1 ? { [spellId]: level } : {},
    currentZone: zoneId, unlockedZones: content.zones.map((z) => z.id), zoneKills: { [zoneId]: 0 },
  };
  const rng = createRng(seed);
  let battle: BattleState = { ...createBattle(zoneId), spawnTimerMs: -1e12, packTimerMs: -1e12, nextUid: foes.length + 1 };
  battle.foes = foes.map((f, i) => {
    const def = content.monsters[f.defId]!;
    const a = (i / foes.length) * 2 * Math.PI;
    const r = foes.length === 1 ? 0.6 : 0.3 + 0.5 * ((i * 7) % 10) / 10;
    return { uid: i + 1, defId: f.defId, x: r * Math.cos(a), y: r * Math.sin(a), hp: def.hp * f.hpMul, maxHp: def.hp * f.hpMul, statuses: [], kx: 0, ky: 0, wander: 0 };
  });
  let t = 0, dealt = 0;
  while (t < ms) {
    const r = stepBattle(game, battle, c, rng);
    game = { ...r.game, zoneKills: { [zoneId]: 0 } }; battle = r.battle; t += STEP_MS;
    for (const e of r.events) {
      if (e.type === 'hit') dealt += e.dealt;
      if (e.type === 'dot') dealt += e.damage;
    }
    if (battle.foes.length === 0) break;
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

/** Scenario B: 20 of the zone's toughest ordinary monsters, hit points x1000. */
export function crowdDps(spellId: string, level: number, zoneId: string, opts: { seed: number; ms: number }): number {
  const tough = toughestNormal(zoneId);
  return clean(spellId, level, zoneId, opts.seed, Array.from({ length: 20 }, () => ({ defId: tough, hpMul: 1000 })), opts.ms);
}

export interface SpellCurve {
  id: string; tier: number; rare: boolean;
  soloAt: Record<string, number>; crowdAt: Record<string, number>; empoweredGeoAt: Record<string, number>;
}
export interface CurveReport {
  perSpell: SpellCurve[];
  failures: string[];
  /**
   * Crafted spells made from two of the tier-9 named spells and the rares, measured at HOME_ZONE[9]: plain-language lines for
   * every pair whose geometric mean beats the better input's by more than the affinity gain allows (x1.10 tolerance).
   */
  craftedFailures: string[];
  crafted: { id: string; affinity: string; depth: number; solo: number; crowd: number; geo: number; bestInput: number; bound: number }[];
  /** Per tier, measured at HOME_ZONE[tier], non-exempt spells only. */
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

export function curveReport(opts: { seeds: number[]; soloMs: number; crowdMs: number }): CurveReport {
  const solo = (id: string, level: number, z: string) => meanOver(opts.seeds, (seed) => soloBossDps(id, level, z, { seed, ms: opts.soloMs }));
  const crowd = (id: string, level: number, z: string) => meanOver(opts.seeds, (seed) => crowdDps(id, level, z, { seed, ms: opts.crowdMs }));
  const spells = Object.values(content.spells).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  const perSpell: SpellCurve[] = [];
  const nameOf = (id: string) => content.spells[id]!.name;
  for (const s of spells) {
    const zones = new Set<string>([HOME_ZONE[s.tier]!]);
    if (s.tier >= 2) zones.add(HOME_ZONE[s.tier - 1]!);
    const row: SpellCurve = { id: s.id, tier: s.tier, rare: !!s.rare, soloAt: {}, crowdAt: {}, empoweredGeoAt: {} };
    for (const z of zones) {
      row.soloAt[z] = solo(s.id, 1, z);
      row.crowdAt[z] = crowd(s.id, 1, z);
    }
    const home = HOME_ZONE[s.tier]!;
    row.empoweredGeoAt[home] = geo(
      solo(s.id, MAX_SPELL_LEVEL, home),
      crowd(s.id, MAX_SPELL_LEVEL, home));
    perSpell.push(row);
  }

  const failures: string[] = [];
  const exempt = (id: string) => CURVE_EXEMPT.includes(id);
  const tierRows = (t: number) => perSpell.filter((p) => p.tier === t && !exempt(p.id));
  const med = (t: number, zone: string, key: 'soloAt' | 'crowdAt') => median(tierRows(t).map((p) => p[key][zone] ?? 0));
  const medGeo = (t: number, zone: string) => median(tierRows(t).map((p) => geo(p.soloAt[zone] ?? 0, p.crowdAt[zone] ?? 0)));

  // spells with no damaging effect at all (mana_overload) have nothing to measure
  const dealsDamage = (id: string) => content.spells[id]!.effects.some((e) => 'mult' in e && e.mult > 0);
  for (const p of perSpell) {
    const home = HOME_ZONE[p.tier]!;
    if (exempt(p.id) && !dealsDamage(p.id)) continue;
    if (!(p.soloAt[home]! > 0) && !(p.crowdAt[home]! > 0)) failures.push(`${nameOf(p.id)}（Lv.${p.tier}）在 ${home} 完全打不到（cannot damage）。`);
    else if (!(p.soloAt[home]! > 0)) failures.push(`${nameOf(p.id)}（Lv.${p.tier}）單挑魔王打不動（cannot damage，DPS 0）。`);
    else if (!(p.crowdAt[home]! > 0)) failures.push(`${nameOf(p.id)}（Lv.${p.tier}）打不動群怪（cannot damage，DPS 0）。`);
  }

  // 1: neighbouring-tier ratios, measured at the lower tier's home zone.
  const medians: CurveReport['medians'] = [];
  for (let n = 1; n <= 10; n++) {
    const z = HOME_ZONE[n]!;
    const prevZ = n > 1 ? HOME_ZONE[n - 1]! : null;
    const rs = prevZ && med(n - 1, prevZ, 'soloAt') > 0 ? med(n, z, 'soloAt') / med(n - 1, prevZ, 'soloAt') : null;
    const rc = prevZ && med(n - 1, prevZ, 'crowdAt') > 0 ? med(n, z, 'crowdAt') / med(n - 1, prevZ, 'crowdAt') : null;
    medians.push({ tier: n, zone: z, solo: med(n, z, 'soloAt'), crowd: med(n, z, 'crowdAt'), geo: medGeo(n, z), ratioSolo: rs, ratioCrowd: rc });
  }
  for (let n = 1; n <= 9; n++) {
    const z = HOME_ZONE[n]!;
    for (const [key, label] of [['soloAt', '單挑魔王'], ['crowdAt', '群怪']] as const) {
      const lo = med(n, z, key), hi = med(n + 1, z, key);
      const r = lo > 0 ? hi / lo : 0;
      // [1.6, 2.0]: TIER_STEP +- 0.2, and within 1.5-2.0 (spec 15)
      const bad = r < 1.5 || r > 2.0 || Math.abs(r - TIER_STEP) > 0.2 + 1e-9;
      if (bad) failures.push(`Lv.${n}→Lv.${n + 1}（在 ${z}，${label}）：中位數 ${f1(lo)} → ${f1(hi)}，倍率 ×${r.toFixed(2)}，應在 1.5～2.0 且為 ${TIER_STEP}±0.2。`);
    }
  }

  // 2: same-tier spread.
  for (const p of perSpell) {
    if (p.tier === 10) continue;
    const z = HOME_ZONE[p.tier]!;
    const g = geo(p.soloAt[z]!, p.crowdAt[z]!), m = medGeo(p.tier, z);
    if (!(g > 0)) continue;
    if (g > m * 1.25) failures.push(`${nameOf(p.id)}（Lv.${p.tier}）幾何平均 ${f1(g)}，比同階中位數 ${f1(m)} 高出超過 25%（×${(g / m).toFixed(2)}）。`);
    else if (!exempt(p.id) && g < m * 0.75) failures.push(`${nameOf(p.id)}（Lv.${p.tier}）幾何平均 ${f1(g)}，比同階中位數 ${f1(m)} 低超過 25%（×${(g / m).toFixed(2)}）。`);
  }
  // Tier 10 (rares) spread among themselves too.
  {
    const z = HOME_ZONE[10]!, m = medGeo(10, z);
    for (const p of tierRows(10)) {
      const g = geo(p.soloAt[z]!, p.crowdAt[z]!);
      if (g > 0 && (g > m * 1.25 || g < m * 0.75)) failures.push(`${nameOf(p.id)}（Lv.10）幾何平均 ${f1(g)}，與同階中位數 ${f1(m)} 差超過 25%（×${(g / m).toFixed(2)}）。`);
    }
  }

  // 3: rares versus the tier-9 median at the same zone.
  {
    const z = HOME_ZONE[10]!, m9 = medGeo(9, z);
    for (const p of perSpell.filter((x) => x.tier === 10)) {
      const g = geo(p.soloAt[z]!, p.crowdAt[z]!);
      if (!(m9 > 0) || g < m9 * 1.5) failures.push(`${nameOf(p.id)}（Lv.10 稀有）幾何平均 ${f1(g)}，低於 Lv.9 中位數 ${f1(m9)} 的 1.5 倍（×${m9 > 0 ? (g / m9).toFixed(2) : '∞'}）。`);
    }
  }

  // 4: jumping a tier must be felt (spec 15): at tier N's home zone, every fully empowered tier-N spell stays at or below the
  // tier N+1 median, and the tier's empowered median stays at or below the tier N+1 median / 1.2.
  for (let n = 1; n <= 9; n++) {
    const z = HOME_ZONE[n]!;
    const next = medGeo(n + 1, z);
    const emp = tierRows(n).map((p) => p.empoweredGeoAt[z]!);
    for (const p of tierRows(n)) {
      const e = p.empoweredGeoAt[z]!;
      if (!(e > 0) || e > next) failures.push(`${nameOf(p.id)}（Lv.${n}）強化 +${MAX_SPELL_LEVEL - 1} 的幾何平均 ${f1(e)}，超過 Lv.${n + 1} 中位數 ${f1(next)}（×${next > 0 ? (e / next).toFixed(2) : '∞'}）。`);
    }
    const me = median(emp);
    if (!(me > 0) || me > next / 1.2) failures.push(`Lv.${n} 強化 +${MAX_SPELL_LEVEL - 1} 的中位數 ${f1(me)}，超過 Lv.${n + 1} 中位數 ${f1(next)} ÷ 1.2 = ${f1(next / 1.2)}（×${next > 0 ? (me / next).toFixed(2) : '∞'}）。`);
  }
  // 5: crafted spells made from the strongest inputs (tier-9 named spells and the rares) must not beat them by more than the
  // affinity gain (Ruling F1): crafted geo <= max(input geo) x gain bound x 1.10.
  const crafted: CurveReport['crafted'] = [];
  const craftedFailures: string[] = [];
  {
    const z = HOME_ZONE[9]!;
    const top = perSpell.filter((p) => p.tier >= 9).map((p) => p.id).sort();
    const inputGeo = (id: string) => { const p = perSpell.find((x) => x.id === id)!; return geo(p.soloAt[z] ?? 0, p.crowdAt[z] ?? 0); };
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const id = craftedId(top[i]!, top[j]!);
      const s = resolveSpell(id, content);
      if (!s) continue;
      const so = solo(id, 1, z), cr = crowd(id, 1, z), g = geo(so, cr);
      const best = Math.max(inputGeo(top[i]!), inputGeo(top[j]!));
      const bound = (s.affinity === 'good' ? 1 + 0.35 * 0.7 ** (s.depth - 1) : 1) * 1.10;
      crafted.push({ id, affinity: s.affinity, depth: s.depth, solo: so, crowd: cr, geo: g, bestInput: best, bound });
      if (g > best * bound) craftedFailures.push(`自創「${s.name}」（${nameOf(top[i]!)}＋${nameOf(top[j]!)}，相性 ${s.affinity}）在 ${z} 幾何平均 ${f1(g)}（單挑 ${f1(so)}、群怪 ${f1(cr)}），比較強的輸入 ${f1(best)} 高出 ×${(g / best).toFixed(2)}，上限 ×${bound.toFixed(2)}。`);
    }
  }
  return { perSpell, failures, medians, craftedFailures, crafted };
}
