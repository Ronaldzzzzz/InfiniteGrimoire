import { describe, expect, it } from 'vitest';
import { canDamage } from '../../src/engine/combat-rules';
import { content } from '../../src/engine/content';
import { resolveSpell } from '../../src/engine/spells';
import { ELEMENT_ORDER, type ElementId } from '../../src/engine/types';
import { runBot } from './bot';

const THREE_HOURS = 3 * 60 * 60 * 1000;
const SEED = 20261021;
/** mana_bolt, or a spell (named or crafted) made of this element only. */
const ofPath = (id: string, el: ElementId) => {
  if (id === 'mana_bolt') return true;
  const s = resolveSpell(id, content);
  return !!s && s.elements.length > 0 && s.elements.every((e) => e === el);
};

const TIMEOUT = 180_000;

describe('pure element paths', () => {
  for (const el of ELEMENT_ORDER) {
    it(`pure ${el} path clears all zones with 0 rejections`, { timeout: TIMEOUT }, async () => {
      const r = await runBot({ element: el, seed: SEED, maxSimMs: THREE_HOURS });
      expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
      expect(r.clearedZones, JSON.stringify(r.summary)).toEqual(content.zones.map((z) => z.id));
      expect(r.simMs).toBeLessThanOrEqual(THREE_HOURS);
      expect(r.learned).toContain('mana_bolt');
      expect(r.learned.filter((id) => !ofPath(id, el))).toEqual([]);
      // the first boss drops the key item and the bot spends it through /api/reveal
      expect(r.revealed).toEqual(['outer']);
      // one PUT per 30 s of play plus at least the two synthesis calls
      expect(r.serverCalls).toBeGreaterThanOrEqual(Math.floor(r.simMs / 30_000) + 2);
    });
  }

  it('mana_bolt only cannot clear thunder_gorge', { timeout: TIMEOUT }, async () => {
    const gorge = content.zones.find((z) => z.id === 'thunder_gorge')!;
    for (const id of [...gorge.monsters, gorge.bossId]) {
      expect(canDamage(content.spells.mana_bolt!, content.monsters[id]!), id).toBe(false);
    }
    const r = await runBot({ element: null, seed: SEED, maxSimMs: THREE_HOURS });
    expect(r.clearedZones).not.toContain('thunder_gorge');
    expect(r.learned).toEqual(['mana_bolt']);
    expect(r.rejectedUploads, r.rejectionReasons.join('\n')).toBe(0);
  });
});
