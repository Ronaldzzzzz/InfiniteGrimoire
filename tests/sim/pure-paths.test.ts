import { describe, expect, it } from 'vitest';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { resolveSpell } from '../../src/engine/spells';
import { ELEMENT_ORDER, type ElementId } from '../../src/engine/types';
import { runBot, type BotResult } from './bot';

const MINUTE = 60_000;
const SIX_HOURS = 360 * MINUTE;
/**
 * Tuning targets (spec 6.4) are measured and printed until Task 7 finishes tuning; flip to true to enforce them.
 * Always on: 0 rejections and pure routes only learn their own element.
 */
const ENFORCE = false;
/** Spec 6.4: the first four bosses fall between 1 and 4 hours, all six within 6 hours, each zone takes 5-90 minutes. */
const FIRST_FOUR_MIN = 60 * MINUTE;
const FIRST_FOUR_MAX = 240 * MINUTE;
const ZONE_MIN = 5;
const ZONE_MAX = 90;
const SEED = 20261021;
/** mana_bolt, or a spell (named or crafted) made of this element only. */
const ofPath = (id: string, el: ElementId) => {
  if (id === 'mana_bolt') return true;
  const s = resolveSpell(id, content);
  return !!s && s.elements.length > 0 && s.elements.every((e) => e === el);
};
const allRegions = content.regions.filter((r) => !r.initiallyVisible).map((r) => r.id);
const minutes = (r: BotResult) => Object.fromEntries(Object.entries(r.clearedAt).map(([z, ms]) => [z, +(ms / MINUTE).toFixed(1)]));

const TIMEOUT = 600_000;

/** Always-on checks, then the tuning targets (printed, and asserted only under ENFORCE). */
function check(label: string, r: BotResult): void {
  expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  expect(r.learned).toContain('mana_bolt');
  const learnedMin = Object.fromEntries(Object.entries(r.learnedAt).map(([id, ms]) => [id, +(ms / MINUTE).toFixed(1)]));
  console.info(`[sim] ${label}: cleared=${r.clearedZones.length}/${content.zones.length} sim=${(r.simMs / MINUTE).toFixed(1)}min`
    + ` clearedAt=${JSON.stringify(minutes(r))} perZone=${JSON.stringify(r.summary.clearMinutes)}`
    + ` revealed=${r.revealed.length}/${allRegions.length} learnedAt=${JSON.stringify(learnedMin)}`);
  if (!ENFORCE) return;
  const zones = content.zones;
  expect(r.clearedZones, JSON.stringify(r.summary)).toEqual(zones.map((z) => z.id));
  expect([...r.revealed].sort()).toEqual([...allRegions].sort());
  expect(r.serverCalls).toBeGreaterThanOrEqual(Math.floor(r.simMs / 30_000) + 2);
  zones.slice(0, 4).forEach((z) => {
    expect(r.clearedAt[z.id]!, `${z.id} ${JSON.stringify(minutes(r))}`).toBeGreaterThanOrEqual(FIRST_FOUR_MIN);
    expect(r.clearedAt[z.id]!, `${z.id} ${JSON.stringify(minutes(r))}`).toBeLessThanOrEqual(FIRST_FOUR_MAX);
  });
  expect(r.clearedAt[zones[zones.length - 1]!.id]!, JSON.stringify(minutes(r))).toBeLessThanOrEqual(SIX_HOURS);
  for (const z of zones) {
    const m = (r.summary.clearMinutes as Record<string, number>)[z.id]!;
    expect(m, `${z.id} ${JSON.stringify(r.summary.clearMinutes)}`).toBeGreaterThanOrEqual(ZONE_MIN);
    expect(m, `${z.id} ${JSON.stringify(r.summary.clearMinutes)}`).toBeLessThanOrEqual(ZONE_MAX);
  }
}

describe('element routes', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el} route follows Lv.2-9 through six zones with 0 rejections`, { timeout: TIMEOUT }, async () => {
      const r = await runBot({ route: el, seed: SEED, maxSimMs: SIX_HOURS });
      check(`pure ${el}`, r);
      expect(r.learned.filter((id) => !ofPath(id, el))).toEqual([]);
    });
  }

  it('mixed fire + wind route learns fire_tornado and the thunderfire hurricane, then the fire trunk', { timeout: TIMEOUT }, async () => {
    const r = await runBot({ route: 'mixed', seed: SEED, maxSimMs: SIX_HOURS });
    check('mixed', r);
    if (ENFORCE) expect(r.learned).toEqual(expect.arrayContaining(['fire_tornado', 'thunder_fire_hurricane', 'corona_scorch']));
  });

  it('mana_bolt only cannot clear thunder_gorge', { timeout: TIMEOUT }, async () => {
    const gorge = content.zones.find((z) => z.id === 'thunder_gorge')!;
    for (const id of [...gorge.monsters, gorge.bossId]) {
      expect(canDamage(content.spells.mana_bolt!, content.monsters[id]!), id).toBe(false);
    }
    const r = await runBot({ route: null, seed: SEED, maxSimMs: 60 * MINUTE });
    expect(r.clearedZones).not.toContain('thunder_gorge');
    expect(r.learned).toEqual(['mana_bolt']);
    expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  });
});
