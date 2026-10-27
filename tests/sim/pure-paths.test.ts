import { describe, expect, it } from 'vitest';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { resolveSpell } from '../../src/engine/spells';
import { ELEMENT_ORDER, type ElementId } from '../../src/engine/types';
import { runBot, type BotResult } from './bot';

const MINUTE = 60_000;
const FOUR_HOURS = 240 * MINUTE;
/** Ruling R12: a pure route takes at least an hour (the first step is tuned for a few hours of play). */
const PACING_FLOOR = 60 * MINUTE;
const SEED = 20261021;
/** mana_bolt, or a spell (named or crafted) made of this element only. */
const ofPath = (id: string, el: ElementId) => {
  if (id === 'mana_bolt') return true;
  const s = resolveSpell(id, content);
  return !!s && s.elements.length > 0 && s.elements.every((e) => e === el);
};
// astral is opened by a key item that Task 4 adds; until then no boss drops it
const allRegions = content.regions.filter((r) => !r.initiallyVisible && r.id !== 'astral').map((r) => r.id);
const lastBossAt = (r: BotResult) => r.clearedAt[content.zones[content.zones.length - 1]!.id]!;
const minutes = (r: BotResult) => Object.fromEntries(Object.entries(r.clearedAt).map(([z, ms]) => [z, +(ms / MINUTE).toFixed(1)]));

const TIMEOUT = 600_000;

function expectCleared(r: BotResult): void {
  expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  expect(r.clearedZones, JSON.stringify(r.summary)).toEqual(content.zones.map((z) => z.id));
  expect(lastBossAt(r)).toBeLessThanOrEqual(FOUR_HOURS);
  expect(r.learned).toContain('mana_bolt');
  // every boss drops a key item and the bot spends it through /api/reveal
  expect([...r.revealed].sort()).toEqual([...allRegions].sort());
  // one PUT per 30 s of play plus the synthesis calls
  expect(r.serverCalls).toBeGreaterThanOrEqual(Math.floor(r.simMs / 30_000) + 2);
}

describe('element routes', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el} route clears all zones in 1-4 simulated hours with 0 rejections`, { timeout: TIMEOUT }, async () => {
      const r = await runBot({ route: el, seed: SEED, maxSimMs: FOUR_HOURS });
      expectCleared(r);
      expect(lastBossAt(r), JSON.stringify(minutes(r))).toBeGreaterThanOrEqual(PACING_FLOOR);
      expect(r.learned.filter((id) => !ofPath(id, el))).toEqual([]);
    });
  }

  it('mixed fire + wind route learns fire_tornado and the thunderfire hurricane and clears all zones', { timeout: TIMEOUT }, async () => {
    const r = await runBot({ route: 'mixed', seed: SEED, maxSimMs: FOUR_HOURS });
    expectCleared(r);
    expect(r.learned).toEqual(expect.arrayContaining(['fire_tornado', 'thunder_fire_hurricane']));
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
