import { describe, expect, it } from 'vitest';
import { FAIL_BASE, FAIL_PER_MISMATCH, RARE_CHANCE, circleCost, failChance, parsePlacement, synthesizeCircle } from './circle-synth';
import { circuitMismatches, placementProblems, runesUnlocked } from './circle';
import type { CircleNode, Placement, RuneId } from './circle';
import { content } from './content';
import type { GameState } from './model';
import { createInitialState } from './persist';
import { createRng, type Rng } from './rng';
import { resolveSpell } from './spells';
import type { ElementId } from './types';

const n = (element: ElementId, grade = 1): CircleNode => ({ element, grade });
type Slot = ElementId | null;
function circle(core: CircleNode, ring1: Slot[], ring2: Slot[] = [], runes: [RuneId | null, RuneId | null] = [null, null], g1 = 1, g2 = 3): Placement {
  const pad = (a: Slot[], g: number) => [0, 1, 2, 3, 4].map((i) => (a[i] ? n(a[i]!, g) : null));
  return { core, ring1: pad(ring1, g1), ring2: pad(ring2, g2), runes };
}
const state = (o: Partial<GameState> = {}): GameState => ({ ...createInitialState(content), ...o });
/** An rng that answers `next()` from the list (then 0.99), and `int(min, max)` from `ints` (then min). */
function fixed(nexts: number[], ints: number[] = []): Rng {
  return { next: () => nexts.shift() ?? 0.99, int: (min) => ints.shift() ?? min };
}

const FIRE_BOLT = 'm:fire.2.----f.-----.bolt';
const fireBolt = () => circle(n('fire'), ['fire'], [], ['bolt', null]);
const allBosses = content.zones.map((z) => z.bossId);
/** 焚世之焰's circle: 神階 fire core, ring 1 five fire, ring 2 four 高階 fire, 墜 on both rings. */
const worldfire = () => circle(n('fire', 5), ['fire', 'fire', 'fire', 'fire', 'fire'], [null, 'fire', 'fire', 'fire', 'fire'], ['meteor', 'meteor']);
const rich = (): Record<string, number> => ({ 'el:fire:1': 5, 'el:fire:3': 4, 'el:fire:5': 1 });

describe('synthesizeCircle', () => {
  it('learns a Lv.2 fire bolt and spends 初階火 ×2', () => {
    const { state: s, result } = synthesizeCircle(state({ inventory: { 'el:fire:1': 3 } }), fireBolt(), content, fixed([0.5]));
    expect(result).toEqual({ kind: 'learned', spellId: FIRE_BOLT, form: 'bolt' });
    expect(s.learned).toEqual(['mana_bolt', FIRE_BOLT]);
    expect(s.inventory).toEqual({ 'el:fire:1': 1 });
    expect(resolveSpell(FIRE_BOLT, content)!.name).toBe(content.spells.fireball!.name);
    expect(s.synthesisLog[FIRE_BOLT]).toEqual({ attempts: 1, results: { [`learned:${FIRE_BOLT}`]: 1 }, noReaction: false });
  });

  it('known on repeat spends again, one entry', () => {
    const one = synthesizeCircle(state({ inventory: { 'el:fire:1': 4 } }), fireBolt(), content, fixed([0.5])).state;
    const { state: s, result } = synthesizeCircle(one, fireBolt(), content, fixed([0.5]));
    expect(result).toEqual({ kind: 'known', spellId: FIRE_BOLT, form: 'bolt' });
    expect(s.learned.filter((x) => x === FIRE_BOLT)).toHaveLength(1);
    expect(s.inventory).toEqual({});
    expect(s.synthesisLog[FIRE_BOLT]!.attempts).toBe(2);
  });

  it('a big failure spends the elements and learns nothing', () => {
    const { state: s, result } = synthesizeCircle(state({ inventory: { 'el:fire:1': 2 } }), fireBolt(), content, fixed([FAIL_BASE / 2]));
    expect(result).toEqual({ kind: 'failed', form: 'bolt' });
    expect(s.learned).toEqual(['mana_bolt']);
    expect(s.inventory).toEqual({});
    expect(s.synthesisLog[FIRE_BOLT]!.results).toEqual({ failed: 1 });
  });

  it('a core-only circle is a bolt and costs the core only', () => {
    const p = circle(n('water', 2), []);
    expect(circleCost(p)).toEqual(['el:water:2']);
    const { result } = synthesizeCircle(state({ inventory: { 'el:water:2': 1 } }), p, content, fixed([0.5]));
    expect(result).toEqual({ kind: 'learned', spellId: 'm:water.1.-----.-----.bolt', form: 'bolt' });
  });

  it('refuses every placement problem and missing elements, changing nothing', () => {
    const inv = { 'el:fire:1': 9, 'el:fire:2': 9, 'el:fire:3': 9, 'el:fire:4': 9 };
    const cases: [Placement, Partial<GameState>, string][] = [
      [circle(n('fire'), ['fire', 'fire'], [], ['bolt', null]), {}, 'overCap'],
      [circle(n('fire', 2), ['fire', 'fire'], [], ['bolt', null]), {}, 'overUnlocked'],
      [circle(n('fire', 4), ['fire', 'fire', 'fire', 'fire'], ['fire'], ['bolt', 'bolt']), { circleTier: 10 }, 'ring2BeforeRing1Full'],
      // five ring-2 nodes are always past every core cap too, so overCap comes first
      [circle(n('fire', 5), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire', 'fire', 'fire', 'fire', 'fire'], ['bolt', 'bolt']), { circleTier: 10 }, 'tooManyRing2'],
      [circle(n('fire', 4), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire'], ['bolt', 'bolt'], 1, 2), { circleTier: 10 }, 'belowRingFloor'],
      [circle(n('fire'), ['fire'], [], ['chain', null]), {}, 'runeLocked'],
      [circle(n('fire'), [], [], ['bolt', null]), {}, 'runeWithoutRing'],
      [circle(n('fire'), ['fire'], [], [null, null]), {}, 'ringWithoutRune'],
    ];
    for (const [p, o, reason] of cases) {
      const before = state({ inventory: inv, ...o });
      const problems = placementProblems(p, { unlockedTier: before.circleTier, runes: runesUnlocked(before.defeatedBosses, content) });
      expect(problems, reason).toContain(reason);
      const out = synthesizeCircle(before, p, content, createRng(1));
      expect(out.result, reason).toEqual({ kind: 'rejected', reason: problems[0] });
      expect(out.state).toBe(before);
    }
    const poor = state({ inventory: { 'el:fire:1': 1 } });
    const out = synthesizeCircle(poor, fireBolt(), content, createRng(1));
    expect(out.result).toEqual({ kind: 'rejected', reason: 'insufficient' });
    expect(out.state).toBe(poor);
  });

  it('runes and tiers come from the bosses and the key items the player has used', () => {
    const p = circle(n('fire', 2), ['fire', 'fire', 'fire'], [], ['blades', null]);
    const inv = { 'el:fire:1': 3, 'el:fire:2': 1 };
    expect(synthesizeCircle(state({ inventory: inv, circleTier: 4 }), p, content, createRng(1)).result).toEqual({ kind: 'rejected', reason: 'runeLocked' });
    const ok = synthesizeCircle(state({ inventory: inv, circleTier: 4, defeatedBosses: ['mist_stag'] }), p, content, fixed([0.5])).result;
    expect(ok).toMatchObject({ kind: 'learned', form: 'blades' });
  });

  it('mixed runes pick each form about half the time', () => {
    const p = circle(n('fire', 4), ['fire', 'fire', 'fire', 'fire', 'fire'], ['fire'], ['bolt', 'meteor']);
    const s = state({ inventory: { 'el:fire:1': 5, 'el:fire:3': 1, 'el:fire:4': 1 }, circleTier: 8, defeatedBosses: allBosses });
    const rng = createRng(20261030);
    const counts: Record<string, number> = { bolt: 0, meteor: 0 };
    for (let i = 0; i < 400; i++) {
      const r = synthesizeCircle(s, p, content, rng).result;
      if (r.kind === 'rejected') throw new Error('refused');
      counts[r.form]!++;
    }
    for (const form of ['bolt', 'meteor']) {
      expect(counts[form]!, form).toBeGreaterThanOrEqual(160);
      expect(counts[form]!, form).toBeLessThanOrEqual(240);
    }
  });

  it('mismatched circuit fails more often', () => {
    // a fire core with a water ring-1 node: 水剋火 on the wired pair, one mismatched layer
    const bad = circle(n('fire'), ['water'], [], ['bolt', null]);
    expect(circuitMismatches(bad)).toBe(1);
    expect(circuitMismatches(fireBolt())).toBe(0);
    expect(failChance(fireBolt())).toBeCloseTo(FAIL_BASE);
    expect(failChance(bad)).toBeCloseTo(FAIL_BASE + FAIL_PER_MISMATCH);
    const rate = (p: Placement) => {
      const rng = createRng(7);
      const s = state({ inventory: { 'el:fire:1': 1, 'el:water:1': 1 } });
      let failed = 0;
      for (let i = 0; i < 1000; i++) if (synthesizeCircle(s, p, content, rng).result.kind === 'failed') failed++;
      return failed / 1000;
    };
    expect(rate(bad)).toBeGreaterThan(rate(fireBolt()));
    // a circuit that does not connect is never a refusal
    expect(synthesizeCircle(state({ inventory: { 'el:fire:1': 1, 'el:water:1': 1 } }), bad, content, fixed([0.9])).result.kind).toBe('learned');
  });

  it('rare circle rolls the rare spell at RARE_CHANCE', () => {
    const s = state({ inventory: rich(), circleTier: 10, defeatedBosses: allBosses });
    const hit = synthesizeCircle(s, worldfire(), content, fixed([0.5, RARE_CHANCE / 2]));
    expect(hit.result).toEqual({ kind: 'learned', spellId: 'worldfire', form: 'meteor', rare: true });
    expect(hit.state.learned).toContain('worldfire');
    expect(hit.state.inventory).toEqual({});
    const miss = synthesizeCircle(s, worldfire(), content, fixed([0.5, RARE_CHANCE]));
    expect(miss.result).toEqual({ kind: 'learned', spellId: content.spells.worldfire!.circle, form: 'meteor' });
    // an ordinary circle never rolls a rare spell
    const plain = synthesizeCircle(state({ inventory: { 'el:fire:1': 2 } }), fireBolt(), content, fixed([0.5, 0]));
    expect(plain.result).toEqual({ kind: 'learned', spellId: FIRE_BOLT, form: 'bolt' });
  });
});

describe('parsePlacement', () => {
  it('accepts a well-formed placement', () => {
    expect(parsePlacement(fireBolt())).toEqual(fireBolt());
  });
  it('rejects malformed shapes without throwing', () => {
    const p = fireBolt();
    const bad: unknown[] = [
      null, 'x', [], {},
      { ...p, ring1: p.ring1.slice(0, 4) },
      { ...p, ring2: [...p.ring2, null] },
      { ...p, core: { element: 'fire', grade: 1.5 } },
      { ...p, core: { element: 'fire', grade: 6 } },
      { ...p, core: { element: 'fire', grade: 0 } },
      { ...p, core: { element: 'dark', grade: 1 } },
      { ...p, runes: ['laser', null] },
      { ...p, runes: ['bolt'] },
      { ...p, extra: 1 },
      { ...p, core: { element: 'fire', grade: 1, x: 1 } },
      { ...p, ring1: [{ element: '__proto__', grade: 1 }, null, null, null, null] },
    ];
    for (const b of bad) expect(parsePlacement(b), JSON.stringify(b)).toBeNull();
  });
});
