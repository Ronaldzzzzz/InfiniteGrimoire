import { describe, expect, it } from 'vitest';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { resolveSpell } from '../../src/engine/spells';
import { ELEMENT_ORDER, type ElementId } from '../../src/engine/types';
import { runBot, type BotResult } from './bot';

const MINUTE = 60_000;
const SIX_HOURS = 360 * MINUTE;
/**
 * Always on: 0 rejections and pure routes only learn their own element.
 * ENFORCE_CLEAR: every zone cleared, every region revealed, enough server calls (and the mixed route's spells).
 * ENFORCE_TIMES: the time bounds below. Report-only since the 2026-10-28 hit-point cut (crowd TTK spec): monsters die much
 * faster, so routes clear early; the user deferred the drop rebalance ("4的掉落平衡後續再更動"), restore this with it.
 */
const ENFORCE_CLEAR = true;
const ENFORCE_TIMES = false;
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

/** Always-on checks, then the clear checks (ENFORCE_CLEAR) and the time bounds (printed, asserted only under ENFORCE_TIMES). */
function check(label: string, r: BotResult): void {
  expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  expect(r.learned).toContain('mana_bolt');
  const learnedMin = Object.fromEntries(Object.entries(r.learnedAt).map(([id, ms]) => [id, +(ms / MINUTE).toFixed(1)]));
  console.info(`[sim] ${label}: cleared=${r.clearedZones.length}/${content.zones.length} sim=${(r.simMs / MINUTE).toFixed(1)}min`
    + ` clearedAt=${JSON.stringify(minutes(r))} perZone=${JSON.stringify(r.summary.clearMinutes)}`
    + ` revealed=${r.revealed.length}/${allRegions.length} learnedAt=${JSON.stringify(learnedMin)}`);
  const zones = content.zones;
  if (ENFORCE_CLEAR) {
    expect(r.clearedZones, JSON.stringify(r.summary)).toEqual(zones.map((z) => z.id));
    expect([...r.revealed].sort()).toEqual([...allRegions].sort());
    expect(r.serverCalls).toBeGreaterThanOrEqual(Math.floor(r.simMs / 30_000) + 2);
  }
  if (!ENFORCE_TIMES) return;
  // the fourth boss (Sunken Temple) is when the first four have fallen
  const fourth = zones[3]!.id;
  expect(r.clearedAt[fourth]!, `${fourth} ${JSON.stringify(minutes(r))}`).toBeGreaterThanOrEqual(FIRST_FOUR_MIN);
  expect(r.clearedAt[fourth]!, `${fourth} ${JSON.stringify(minutes(r))}`).toBeLessThanOrEqual(FIRST_FOUR_MAX);
  expect(r.clearedAt[zones[zones.length - 1]!.id]!, JSON.stringify(minutes(r))).toBeLessThanOrEqual(SIX_HOURS);
  for (const z of zones) {
    const m = (r.summary.clearMinutes as Record<string, number>)[z.id]!;
    expect(m, `${z.id} ${JSON.stringify(r.summary.clearMinutes)}`).toBeGreaterThanOrEqual(ZONE_MIN);
    expect(m, `${z.id} ${JSON.stringify(r.summary.clearMinutes)}`).toBeLessThanOrEqual(ZONE_MAX);
  }
}

// Task 7 rewrites (the bot no longer advances through stages)
describe.skip('element routes', () => {
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
    if (ENFORCE_CLEAR) expect(r.learned).toEqual(expect.arrayContaining(['fire_tornado', 'thunder_fire_hurricane', 'corona_scorch']));
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
