import { describe, expect, it } from 'vitest';
import {
  GRADE_CAP, RING_FLOOR, RUNE_NAMES, branches, canonicalCircle, circuitMismatches, parseCanonical, placementProblems,
  placementTier, possibleForms, relations, runesUnlocked, tierUnlockOf,
} from './circle';
import type { CircleNode, Placement, RuneId } from './circle';
import { ContentError, circleRules, content, loadCircleRules } from './content';
import circleRulesJson from '../data/content/circle-rules.json';
import type { ElementId } from './types';
import { ELEMENT_ORDER } from './types';
import { COUNTERS } from './combat-rules';

const n = (element: ElementId, grade = 1): CircleNode => ({ element, grade });
type Slot = ElementId | null;
function circle(core: CircleNode, ring1: Slot[], ring2: Slot[] = [], runes: [RuneId | null, RuneId | null] = [null, null], grade2 = 3): Placement {
  const pad = (a: Slot[], g: number) => [0, 1, 2, 3, 4].map((i) => (a[i] ? n(a[i]!, g) : null));
  return { core, ring1: pad(ring1, 1), ring2: pad(ring2, grade2), runes };
}
const ALL_RUNES: RuneId[] = ['bolt', 'blades', 'ring', 'chain', 'zone', 'meteor', 'storm', 'field'];
const ctx = (unlockedTier = 10, runes: RuneId[] = ALL_RUNES) => ({ unlockedTier, runes });
const rotate = <T,>(a: T[], r: number) => a.map((_, i) => a[(i + r) % 5]!);
const mirror = <T,>(a: T[]) => a.map((_, i) => a[(5 - i) % 5]!);

describe('circle rules', () => {
  it('constants', () => {
    expect(GRADE_CAP).toEqual([2, 4, 6, 8, 10]);
    expect(RING_FLOOR).toEqual([1, 3]);
    expect(ALL_RUNES.map((r) => RUNE_NAMES[r]).join('')).toBe('射刃波鏈域墜嵐臨');
  });

  it('tier counts the core', () => {
    expect(placementTier(circle(n('fire'), []))).toBe(1);
    expect(placementTier(circle(n('fire', 3), ['fire', 'fire', 'fire']))).toBe(4);
    expect(placementTier(circle(n('fire', 4), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire', 'fire']))).toBe(8);
  });

  describe('placement problems', () => {
    it('a valid Lv.2 fire bolt has none', () => {
      expect(placementProblems(circle(n('fire'), ['fire'], [], ['bolt', null]), ctx(2, ['bolt']))).toEqual([]);
    });
    it('over the core cap', () => {
      expect(placementProblems(circle(n('fire', 1), ['fire', 'fire'], [], ['bolt', null]), ctx())).toContain('overCap');
    });
    it('over the unlocked tier', () => {
      const p = circle(n('fire', 3), ['fire', 'fire', 'fire', 'fire'], [], ['bolt', null]);
      expect(placementProblems(p, ctx(4))).toEqual(['overUnlocked']);
      expect(placementProblems(p, ctx(5))).toEqual([]);
    });
    it('ring 2 before ring 1 is full', () => {
      const p = circle(n('fire', 5), ['fire', 'fire', 'fire', 'fire'], [null, null, null, null, 'fire'], ['bolt', 'bolt']);
      expect(placementProblems(p, ctx())).toContain('ring2BeforeRing1Full');
    });
    it('too many ring 2 nodes', () => {
      const p = circle(n('fire', 5), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire', 'fire', 'fire', 'fire', 'fire'], ['bolt', 'bolt']);
      expect(placementProblems(p, ctx(11))).toEqual(['overCap', 'tooManyRing2']);
    });
    it('a 中階 node in ring 2 is below the floor', () => {
      const p = circle(n('fire', 4), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire'], ['bolt', 'bolt'], 2);
      expect(placementProblems(p, ctx())).toEqual(['belowRingFloor']);
    });
    it('rune 鏈 needs the gorge boss', () => {
      const p = circle(n('thunder'), ['thunder'], [], ['chain', null]);
      expect(placementProblems(p, ctx(10, runesUnlocked(['mist_stag'], content)))).toEqual(['runeLocked']);
      expect(placementProblems(p, ctx(10, runesUnlocked(['mist_stag', 'storm_roc'], content)))).toEqual([]);
    });
    it('ring without rune and rune without ring', () => {
      expect(placementProblems(circle(n('fire'), ['fire'], [], [null, null]), ctx())).toEqual(['ringWithoutRune']);
      expect(placementProblems(circle(n('fire'), ['fire'], [], ['bolt', 'bolt']), ctx())).toEqual(['runeWithoutRing']);
    });
  });

  describe('pentagram relations', () => {
    it('the generate cycle on the circle gives 5 generate pairs; its star lines are then the 5 相剋 pairs', () => {
      const r = relations(circle(n('fire', 3), ['water', 'earth', 'fire', 'thunder', 'wind']));
      expect(r.generate).toEqual([['water', 'earth'], ['earth', 'fire'], ['fire', 'thunder'], ['thunder', 'wind'], ['wind', 'water']]);
      // no neighbour pair is 相剋: every 相剋 sits on a star line
      expect(r.overcome).toEqual([['water', 'fire'], ['earth', 'thunder'], ['fire', 'wind'], ['thunder', 'water'], ['wind', 'earth']]);
    });
    it('a ring of one element has no relations', () => {
      expect(relations(circle(n('fire', 3), Array(5).fill('fire')))).toEqual({ generate: [], overcome: [] });
    });
    it('neighbours 水–火 are not a generate pair', () => {
      const r = relations(circle(n('fire', 3), ['water', 'fire']));
      expect(r.generate).toEqual([]);
      expect(r.overcome).toEqual([]);
    });
    it('star line (0,2) 水/火 is an overcome pair', () => {
      const r = relations(circle(n('fire', 3), ['water', null, 'fire']));
      expect(r.overcome).toEqual([['water', 'fire']]);
      expect(r.generate).toEqual([]);
    });
  });

  describe('circuit', () => {
    it('uniform single-element circles match at Lv.2, 4, 6, 8 and 10', () => {
      for (const e of ELEMENT_ORDER) {
        for (const [r1, r2] of [[1, 0], [3, 0], [5, 0], [5, 2], [5, 4]] as const) {
          const p = circle(n(e, 5), Array(r1).fill(e), Array(r2).fill(e));
          expect(circuitMismatches(p), `${e} ${r1}+${r2}`).toBe(0);
        }
      }
    });
    it('a 相剋 connection mismatches its layer', () => {
      expect(circuitMismatches(circle(n('water', 3), ['fire']))).toBe(1);
      expect(circuitMismatches(circle(n('fire', 5), Array(5).fill('fire'), ['water']))).toBe(1);
    });
    it('different branch counts mismatch', () => {
      const b = circleRules.branches;
      const pair = ELEMENT_ORDER.flatMap((a) => ELEMENT_ORDER.map((c) => [a, c] as const))
        .find(([a, c]) => b[a].coreOut !== b[c].ring1In && COUNTERS[a] !== c && COUNTERS[c] !== a);
      expect(pair).toBeDefined();
      expect(circuitMismatches(circle(n(pair![0], 3), [pair![1]]))).toBe(1);
    });
    it('branches reports core out and per-node counts', () => {
      const p = circle(n('earth', 5), Array(5).fill('earth'), ['earth']);
      const br = branches(p);
      expect(br.core.out).toBe(5 * circleRules.branches.earth.coreOut);
      expect(br.ring1.every((x) => x !== null)).toBe(true);
      expect(br.ring2[0]).not.toBeNull();
      expect(br.ring2[1]).toBeNull();
      expect(br.ring2[0]!.in).toBe(br.ring1[0]!.out);
    });
  });

  describe('canonical id', () => {
    const r1: Slot[] = ['fire', 'fire', 'wind', 'water', 'earth'];
    const r2: Slot[] = ['thunder', null, 'fire', null, null];
    const id = canonicalCircle(circle(n('fire', 5), r1, r2), 'bolt');

    it('folds rotation and mirror only', () => {
      for (let r = 0; r < 5; r++) {
        expect(canonicalCircle(circle(n('fire', 5), rotate(r1, r), rotate(r2, r)), 'bolt')).toBe(id);
        expect(canonicalCircle(circle(n('fire', 5), mirror(rotate(r1, r)), mirror(rotate(r2, r))), 'bolt')).toBe(id);
      }
      // rotating ring 1 alone is a different circle
      expect(canonicalCircle(circle(n('fire', 5), rotate(r1, 1), r2), 'bolt')).not.toBe(id);
    });
    it('turning a 相剋 star pair into a neighbour pair changes the id', () => {
      // water at 0, fire at 2: star line; swap to water at 0, fire at 1: neighbours
      const a = canonicalCircle(circle(n('earth', 3), ['water', 'earth', 'fire']), 'bolt');
      const b = canonicalCircle(circle(n('earth', 3), ['water', 'fire', 'earth']), 'bolt');
      expect(a).not.toBe(b);
    });
    it('ignores node grades and spare core grade', () => {
      const p = circle(n('fire', 2), ['fire', 'wind'], [], ['bolt', null]);
      const q = structuredClone(p);
      q.ring1[0]!.grade = 3;
      q.core.grade = 5;
      expect(canonicalCircle(q, 'bolt')).toBe(canonicalCircle(p, 'bolt'));
    });
    it('uses the actual tier and the form', () => {
      expect(parseCanonical(canonicalCircle(circle(n('fire', 1), ['fire', 'fire']), 'bolt'))!.tier).toBe(2);
      expect(canonicalCircle(circle(n('fire', 5), r1, r2), 'meteor')).not.toBe(id);
    });
  });

  describe('parseCanonical', () => {
    it('round-trips', () => {
      const cases: [Placement, RuneId][] = [
        [circle(n('water'), []), 'bolt'],
        [circle(n('fire', 2), ['earth', 'earth', 'fire']), 'meteor'],
        [circle(n('thunder', 5), Array(5).fill('thunder'), ['wind', 'thunder', 'water', 'earth']), 'chain'],
      ];
      for (const [p, form] of cases) {
        const id = canonicalCircle(p, form);
        const parsed = parseCanonical(id)!;
        expect(parsed).not.toBeNull();
        expect(parsed.core).toBe(p.core.element);
        expect(parsed.tier).toBe(placementTier(p));
        expect(parsed.form).toBe(form);
        const back = circle(n(parsed.core, 5), parsed.ring1, parsed.ring2);
        expect(canonicalCircle(back, parsed.form)).toBe(id);
      }
    });
    it('returns null for garbage and never throws', () => {
      for (const s of ['', 'c(a|b)', 'm:', 'm:garbage', 'm:fire.2.f----.-----.nope', 'm:fire.9.f----.-----.bolt', 'm:fire.1.-----.-----.ring', 'mana_bolt']) {
        expect(parseCanonical(s), s).toBeNull();
      }
      expect(parseCanonical(undefined as unknown as string)).toBeNull();
    });
    it('rejects an id that is not in its folded form', () => {
      expect(canonicalCircle(circle(n('fire', 2), ['fire', 'wind']), 'bolt')).toBe('m:fire.3.---fw.-----.bolt');
      expect(parseCanonical('m:fire.3.---fw.-----.bolt')).not.toBeNull();
      expect(parseCanonical('m:fire.3.fw---.-----.bolt')).toBeNull();
      expect(parseCanonical('m:fire.4.---fw.-----.bolt')).toBeNull();
    });
  });

  it('forms', () => {
    expect(possibleForms(circle(n('fire', 5), Array(5).fill('fire'), ['fire'], ['bolt', 'meteor']))).toEqual(['bolt', 'meteor']);
    expect(possibleForms(circle(n('fire', 5), Array(5).fill('fire'), ['fire'], ['ring', 'ring']))).toEqual(['ring']);
    expect(possibleForms(circle(n('fire'), []))).toEqual(['bolt']);
  });

  it('runes unlock by bosses', () => {
    expect(runesUnlocked([], content)).toEqual(['bolt']);
    expect(runesUnlocked(['mist_stag'], content)).toEqual(['bolt', 'blades', 'ring']);
    expect(runesUnlocked(['mist_stag', 'storm_roc', 'volcano_drake', 'sunken_titan', 'fallen_star_wyrm', 'first_page_warden'], content))
      .toEqual(['bolt', 'blades', 'ring', 'chain', 'zone', 'meteor', 'storm', 'field']);
    expect(runesUnlocked(['storm_roc'], content)).toEqual(['bolt', 'chain', 'zone']);
  });

  it('tierUnlockOf', () => {
    expect(tierUnlockOf('key:storm_heart')).toBe(4);
    expect(tierUnlockOf('key:thunder_eye')).toBe(6);
    expect(tierUnlockOf('key:magma_seal')).toBe(8);
    expect(tierUnlockOf('key:titan_crown')).toBe(9);
    expect(tierUnlockOf('key:star_sigil')).toBe(10);
    expect(tierUnlockOf('key:nope')).toBeNull();
    expect(tierUnlockOf('el:fire:1')).toBeNull();
    expect(circleRules.startTier).toBe(2);
  });

  describe('circle-rules.json validation', () => {
    const raw = () => structuredClone(circleRulesJson) as Record<string, any>;
    const issues = (r: Record<string, any>) => {
      try {
        loadCircleRules(r, content);
      } catch (e) {
        expect(e).toBeInstanceOf(ContentError);
        return (e as ContentError).issues.join('\n');
      }
      throw new Error('expected loadCircleRules to throw');
    };
    it('accepts the shipped file', () => {
      expect(() => loadCircleRules(raw(), content)).not.toThrow();
    });
    it('rejects an unknown boss, key item, element or rune', () => {
      const a = raw(); a.runeUnlocks.nobody = ['field'];
      expect(issues(a)).toMatch(/nobody/);
      const b = raw(); b.tierUnlocks['key:nope'] = 5;
      expect(issues(b)).toMatch(/key:nope/);
      const c = raw(); c.branches.light = c.branches.fire;
      expect(issues(c)).toMatch(/light/);
      const d = raw(); d.runeUnlocks.mist_stag = ['laser'];
      expect(issues(d)).toMatch(/laser/);
    });
    it('rejects branch counts that would break uniform circles', () => {
      const a = raw(); a.branches.fire.ring2In += 1;
      expect(issues(a)).toMatch(/fire/);
    });
  });
});
