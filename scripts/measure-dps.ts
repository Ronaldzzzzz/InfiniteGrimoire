/**
 * Read-only measurement for the spell tier curve (AGENTS.md 3.0, step 2): how fast every named spell kills
 * each zone's boss in the real battle flow (the boss appears after the last wave kill, normals keep spawning),
 * unempowered and at MAX_SPELL_LEVEL, plus two clean cases: the boss alone, and a crowd of 20 tough normals.
 * Changes no game data.
 *
 * Run: npx esbuild scripts/measure-dps.ts --bundle --platform=node --format=esm --outfile=<tmp>/measure.mjs && node <tmp>/measure.mjs
 */
import { createBattle, stepBattle, STEP_MS, type BattleState } from '../src/engine/combat';
import { clean, CURVE_EXEMPT, CURVE_OPTS, curveReport, median } from '../tests/sim/measure';
import { content } from '../src/engine/content';
import type { GameState } from '../src/engine/model';
import { createInitialState } from '../src/engine/persist';
import { createRng } from '../src/engine/rng';
import { MAX_SPELL_LEVEL } from '../src/engine/spells';

const SEEDS = [20261021, 7, 99];
const BOSS_CAP_MS = 600_000;
const CLEAR_CAP_MS = 600_000;

interface Run { clearMs: number | null; bossMs: number | null }

function run(spellId: string, level: number, zoneId: string, seed: number): Run {
  const zone = content.zones.find((z) => z.id === zoneId)!;
  let game: GameState = {
    ...createInitialState(content),
    learned: [spellId], equipped: spellId, levels: level > 1 ? { [spellId]: level } : {},
    currentZone: zoneId, unlockedZones: content.zones.map((z) => z.id), zoneKills: { [zoneId]: 0 },
  };
  let battle: BattleState = createBattle(zoneId);
  const rng = createRng(seed);
  let t = 0, clearMs: number | null = null, bossAt: number | null = null;
  while (t < CLEAR_CAP_MS + BOSS_CAP_MS) {
    const r = stepBattle(game, battle, content, rng);
    game = r.game; battle = r.battle; t += STEP_MS;
    for (const e of r.events) {
      if (e.type === 'spawn' && e.boss) { clearMs = t; bossAt = t; }
      if (e.type === 'kill' && content.monsters[e.defId]?.boss && bossAt !== null) return { clearMs, bossMs: t - bossAt };
    }
    if (bossAt === null && t >= CLEAR_CAP_MS) return { clearMs: null, bossMs: null };
    if (bossAt !== null && t - bossAt >= BOSS_CAP_MS) return { clearMs, bossMs: null };
  }
  return { clearMs, bossMs: null };
}

const avg = (xs: (number | null)[]): number | null => (xs.some((x) => x === null) ? null : xs.reduce((a, b) => a! + b!, 0)! / xs.length);
const sec = (ms: number | null) => (ms === null ? '—' : (ms / 1000).toFixed(1));

const spells = Object.values(content.spells).filter((s) => s.id !== 'mana_overload').sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
const out: string[] = [];
const summary: Record<string, Record<number, { solo: number[]; crowd: number[] }>> = {};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

for (const zone of content.zones) {
  const boss = content.monsters[zone.bossId]!;
  const tough = [...zone.monsters].sort((a, b) => content.monsters[b]!.tier - content.monsters[a]!.tier || content.monsters[b]!.defense - content.monsters[a]!.defense)[0]!;
  const td = content.monsters[tough]!;
  out.push(`\n### ${zone.name}（魔王 ${boss.name} Lv.${boss.tier}，血量 ${boss.hp}，防禦 ${boss.defense}；群怪用 ${td.name} Lv.${td.tier} 防禦 ${td.defense}）\n`);
  out.push('| 魔法 | Lv. | 單挑魔王 DPS +0 | +50 | 群怪 20 隻 DPS +0 | +50 | 實戰：清 ' + zone.killsForBoss + ' 隻（秒） | 實戰：打倒魔王（秒） |');
  out.push('|---|---|---|---|---|---|---|---|');
  for (const s of spells) {
    const solo = (L: number) => mean(SEEDS.slice(0, 2).map((sd) => clean(s.id, L, zone.id, sd, [{ defId: zone.bossId, hpMul: 1000 }], 60_000)));
    const crowd = (L: number) => mean(SEEDS.slice(0, 2).map((sd) => clean(s.id, L, zone.id, sd, Array.from({ length: 20 }, () => ({ defId: tough, hpMul: 1000 })), 30_000)));
    const s1 = solo(1), s50 = solo(MAX_SPELL_LEVEL), c1 = crowd(1), c50 = crowd(MAX_SPELL_LEVEL);
    const real = SEEDS.slice(0, 1).map((sd) => run(s.id, 1, zone.id, sd))[0]!;
    const f = (x: number) => (x === 0 ? '無效' : Math.round(x).toString());
    out.push(`| ${s.name}${s.rare ? '（稀有）' : ''} | ${s.tier} | ${f(s1)} | ${f(s50)} | ${f(c1)} | ${f(c50)} | ${sec(real.clearMs)} | ${sec(real.bossMs)} |`);
    const row = ((summary[zone.id] ??= {})[s.tier] ??= { solo: [], crowd: [] });
    // the summary below follows the curve checks: control spells (CURVE_EXEMPT) are left out
    if (s1 > 0 && !CURVE_EXEMPT.includes(s.id)) row.solo.push(s1);
    if (c1 > 0 && !CURVE_EXEMPT.includes(s.id)) row.crowd.push(c1);
  }
}

out.push('\n### 各階中位數（未強化，不含控制型例外魔法）與相對前一階的倍率\n');
const line = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? { med: median(v), min: v[0]!, max: v[v.length - 1]! } : null; };
for (const zone of content.zones) {
  for (const key of ['solo', 'crowd'] as const) {
    let prev: number | null = null;
    const parts: string[] = [];
    for (const [t, row] of Object.entries(summary[zone.id] ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const l = line(row[key]);
      if (!l) continue;
      parts.push(`Lv.${t} ${Math.round(l.med)}（${Math.round(l.min)}～${Math.round(l.max)}${prev ? `，×${(l.med / prev).toFixed(2)}` : ''}）`);
      prev = l.med;
    }
    out.push(`- ${zone.name}・${key === 'solo' ? '單挑魔王' : '群怪'}：${parts.join('；')}`);
  }
}

const rep = curveReport(CURVE_OPTS);
out.push('\n### 依主場的各階中位數（非例外魔法，未強化；比較照規格 7.2 在較低階的主場）\n');
for (const m of rep.medians) {
  out.push(`- Lv.${m.tier} @${m.zone}：單挑 ${m.solo.toFixed(1)}${m.ratioSolo ? `（×${m.ratioSolo.toFixed(2)}）` : ''}；群怪 ${m.crowd.toFixed(1)}${m.ratioCrowd ? `（×${m.ratioCrowd.toFixed(2)}）` : ''}；幾何 ${m.geo.toFixed(1)}`);
}
out.push(`\n### 階級曲線檢查：${rep.failures.length} 條未通過\n`);
for (const f of rep.failures) out.push(`- ${f}`);
console.log(out.join('\n'));
