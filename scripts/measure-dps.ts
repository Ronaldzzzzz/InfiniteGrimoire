/**
 * Read-only measurement for the spell tier curve on the battle strip: for every named spell in every zone, the clean
 * scenarios (the boss alone, and the stage crowd: stage MEASURE_STAGE's first wave walking in with hit points x1000),
 * unempowered and at MAX_SPELL_LEVEL, plus the real stage flow: how long stage MEASURE_STAGE takes and how long the boss
 * lives on the boss stage (from its arrival). Changes no game data.
 *
 * Run: npx esbuild scripts/measure-dps.ts --bundle --platform=node --format=esm --outfile=<tmp>/measure.mjs && node <tmp>/measure.mjs
 */
import {
  bossKillTime, crowdDps, CURVE_EXEMPT, CURVE_OPTS, curveReport, MEASURE_STAGE, median, soloBossDps, STAGE_LIMIT_MS, stageTime,
} from '../tests/sim/measure';
import { content } from '../src/engine/content';
import { MAX_SPELL_LEVEL } from '../src/engine/spells';
import { BOSS_LIMIT_MS } from '../src/engine/stages';

const SEEDS = CURVE_OPTS.seeds;
const sec = (ms: number | null) => (ms === null ? '—' : (ms / 1000).toFixed(1));
const mins = (ms: number | null) => (ms === null ? '—' : (ms / 60_000).toFixed(2));

const spells = Object.values(content.spells).filter((s) => s.id !== 'mana_overload').sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
const out: string[] = [];
const summary: Record<string, Record<number, { solo: number[]; crowd: number[] }>> = {};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

for (const zone of content.zones) {
  const boss = content.monsters[zone.bossId]!;
  const wave = zone.stages[MEASURE_STAGE - 1]!.waves;
  out.push(`\n### ${zone.name}（魔王 ${boss.name} Lv.${boss.tier}，血量 ${boss.hp}，防禦 ${boss.defense}；第 ${MEASURE_STAGE} 關 ${wave.length} 波 × ${wave[0]} 隻）\n`);
  out.push(`| 魔法 | Lv. | 單挑魔王 DPS +0 | +50 | 群怪（一波 ${wave[0]} 隻）DPS +0 | +50 | 實戰：第 ${MEASURE_STAGE} 關（分） | 實戰：打倒魔王（秒） |`);
  out.push('|---|---|---|---|---|---|---|---|');
  for (const s of spells) {
    const solo = (L: number) => mean(SEEDS.map((seed) => soloBossDps(s.id, L, zone.id, { seed, ms: CURVE_OPTS.soloMs })));
    const crowd = (L: number) => mean(SEEDS.map((seed) => crowdDps(s.id, L, zone.id, { seed, ms: CURVE_OPTS.crowdMs })));
    const s1 = solo(1), s50 = solo(MAX_SPELL_LEVEL), c1 = crowd(1), c50 = crowd(MAX_SPELL_LEVEL);
    const stageMs = stageTime(s.id, 1, zone.id, MEASURE_STAGE, { seed: SEEDS[0]!, limitMs: STAGE_LIMIT_MS });
    const bossMs = bossKillTime(s.id, 1, zone.id, { seed: SEEDS[0]!, limitMs: STAGE_LIMIT_MS + BOSS_LIMIT_MS });
    const f = (x: number) => (x === 0 ? '無效' : Math.round(x).toString());
    out.push(`| ${s.name}${s.rare ? '（稀有）' : ''} | ${s.tier} | ${f(s1)} | ${f(s50)} | ${f(c1)} | ${f(c50)} | ${mins(stageMs)} | ${sec(bossMs)} |`);
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
