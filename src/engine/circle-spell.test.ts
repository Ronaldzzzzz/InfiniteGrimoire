import { describe, expect, it } from 'vitest';
import { canonicalCircle, circuitMismatches, GRADE_CAP, parseCanonical, placementProblems, RING_FLOOR, RUNE_IDS } from './circle';
import type { Placement } from './circle';
import { circleSpell, namedFor, RARE_BONUS } from './circle-spell';
import { content } from './content';
import type { Effect, NamedSpellDef } from './model';
import { resolveSpell, TIER_STEP } from './spells';
import { ELEMENT_ORDER } from './types';

/** The placement a canonical id stands for: the cheapest core grade for its tier, ring nodes at their floor grade. */
function placementOf(id: string): Placement {
  const c = parseCanonical(id)!;
  const grade = GRADE_CAP.findIndex((cap) => cap >= c.tier) + 1;
  const ring = (r: (string | null)[], floor: number) => r.map((e) => (e ? { element: e as Placement['core']['element'], grade: floor } : null));
  const ring1 = ring(c.ring1, RING_FLOOR[0]), ring2 = ring(c.ring2, RING_FLOOR[1]);
  return { core: { element: c.core, grade }, ring1, ring2, runes: [ring1.some((x) => x) ? c.form : null, ring2.some((x) => x) ? c.form : null] };
}

const textbook = (): NamedSpellDef[] => Object.values(content.spells).filter((s) => s.circle);
const effect = (id: string): Effect => circleSpell(id, content)!.effects[0]!;
const statusKinds = (e: Effect) => ('status' in e ? e.status ?? [] : []).map((s) => s.kind);

describe('spells generated from circles', () => {
  it('a Lv.2 fire bolt circle makes a fire bolt that burns', () => {
    const s = circleSpell('m:fire.2.----f.-----.bolt', content)!;
    expect(s.tier).toBe(2);
    expect(s.elements).toEqual(['fire']);
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0]!.kind).toBe('bolt');
    expect(statusKinds(s.effects[0]!)).toContain('burn');
  });

  it('ring 1 風×5 + 刃 makes blades with push, stronger push than one 風', () => {
    const five = effect('m:wind.6.wwwww.-----.blades'), one = effect('m:wind.2.----w.-----.blades');
    expect(five.kind).toBe('blades');
    if (five.kind !== 'blades' || one.kind !== 'blades') throw new Error('not blades');
    expect(five.push).toBeGreaterThan(0);
    expect(five.push).toBeGreaterThan(one.push);
  });

  it('水 nodes add wet; more 火 nodes burn longer', () => {
    expect(statusKinds(effect('m:water.2.----a.-----.ring'))).toContain('wet');
    expect(statusKinds(effect('m:fire.2.----f.-----.bolt'))).not.toContain('wet');
    const burn = (id: string) => ('status' in effect(id) ? (effect(id) as { status: { kind: string; ms: number }[] }).status : []).find((s) => s.kind === 'burn')!;
    expect(burn('m:fire.6.fffff.-----.bolt').ms).toBeGreaterThan(burn('m:fire.2.----f.-----.bolt').ms);
  });

  it('土 slows, 雷 adds chain hops', () => {
    expect(statusKinds(effect('m:earth.2.----e.-----.bolt'))).toContain('slow');
    const hops = (id: string) => (effect(id) as Extract<Effect, { kind: 'chain' }>).hops;
    expect(hops('m:thunder.6.ttttt.-----.chain')).toBeGreaterThan(hops('m:thunder.2.----t.-----.chain'));
  });

  it('a 相剋 pair on the star lines weakens the spell and adds a reaction; a 相生 pair strengthens it', () => {
    // water core, ring 1 positions 0 and 2 (a star line): 水 and 火 — water counters fire
    const clash = effect(canonicalCircle({ ...placementOf('m:water.3.---aa.-----.bolt'), ring1: [{ element: 'water', grade: 1 }, null, { element: 'fire', grade: 1 }, null, null] }, 'bolt'));
    const plain = effect('m:water.3.---aa.-----.bolt');
    if (clash.kind !== 'bolt' || plain.kind !== 'bolt') throw new Error('not bolt');
    expect(clash.mult).toBeLessThan(plain.mult);
    expect(statusKinds(clash)).toContain('blind');
    // neighbours 0, 1: 水 → 土 is 相生
    const gen = effect(canonicalCircle({ ...placementOf('m:water.3.---aa.-----.bolt'), ring1: [{ element: 'water', grade: 1 }, { element: 'earth', grade: 1 }, null, null, null] }, 'bolt'));
    if (gen.kind !== 'bolt') throw new Error('not bolt');
    expect(gen.mult).toBeGreaterThan(plain.mult);
  });

  it('attack follows TIER_STEP per tier', () => {
    const a2 = circleSpell('m:fire.2.----f.-----.bolt', content)!.attack;
    const a3 = circleSpell('m:fire.3.---ff.-----.bolt', content)!.attack;
    expect(a3 / a2).toBeCloseTo(TIER_STEP, 1);
  });

  it('deterministic', () => {
    for (const id of ['m:fire.5.-feff.-----.bolt', 'm:water.10.aaaaa.-eeee.zone', 'm:fire.1.-----.-----.bolt']) {
      expect(circleSpell(id, content)).toEqual(circleSpell(id, content));
    }
  });

  it('elements are every element on the circle, core first', () => {
    expect(resolveSpell(content.spells.inferno!.circle!, content)!.elements).toEqual(['fire', 'earth']);
    expect(resolveSpell(content.spells.myriad_thunder!.circle!, content)!.elements).toEqual(['thunder', 'wind']);
    expect(circleSpell('m:water.5.-aawa.-----.zone', content)!.elements).toEqual(['water', 'wind']);
  });

  it('named overlay: the 火球 circle resolves with name 火球 and generated effects', () => {
    const id = content.spells.fireball!.circle!;
    const s = resolveSpell(id, content)!;
    expect(s.id).toBe(id);
    expect(s.name).toBe('火球');
    expect(s.named).toBe(true);
    expect(s.effects).toEqual(circleSpell(id, content)!.effects);
    // the desc describes the generated effect, not the old hand-tuned one
    expect(s.desc).toBe(circleSpell(id, content)!.desc);
    expect(namedFor(id, content)?.id).toBe('fireball');
  });

  it('a rare spell is the Lv.10 spell of its circle x RARE_BONUS with its own id and texts; the circle stays ordinary', () => {
    for (const def of Object.values(content.spells).filter((x) => x.rare)) {
      expect(parseCanonical(def.circle!)?.tier, def.id).toBe(10);
      const rare = resolveSpell(def.id, content)!, plain = resolveSpell(def.circle!, content)!;
      expect(rare.id, def.id).toBe(def.id);
      expect(rare.name, def.id).toBe(def.name);
      expect(rare.desc, def.id).toBe(def.desc);
      expect(rare.school, def.id).toBe('forbidden');
      expect((rare as { rare?: boolean }).rare, def.id).toBe(true);
      expect(rare.effects, def.id).toEqual(plain.effects);
      expect(rare.attack, def.id).toBe(Math.round(plain.attack * RARE_BONUS));
      expect(plain.name, def.id).not.toBe(def.name);
      expect(namedFor(def.circle!, content), def.id).toBeUndefined();
    }
  });

  it('every textbook circle matches its circuit', () => {
    for (const s of textbook()) expect(circuitMismatches(placementOf(s.circle!)), `${s.id} ${s.circle}`).toBe(0);
  });

  it('every textbook circle respects caps and floors and uses all its nodes', () => {
    for (const s of textbook()) {
      const c = parseCanonical(s.circle!);
      expect(c, s.id).not.toBeNull();
      expect(placementProblems(placementOf(s.circle!), { unlockedTier: 10, runes: [...RUNE_IDS] }), s.id).toEqual([]);
      const nodes = [...c!.ring1, ...c!.ring2].filter((x) => x).length;
      expect(c!.tier, s.id).toBe(1 + nodes);
      expect(c!.tier, s.id).toBe(s.tier);
    }
  });

  it('each element has a textbook circle at Lv.2, 4, 6, 8 and 10 (core element)', () => {
    for (const e of ELEMENT_ORDER) {
      for (const t of [2, 4, 6, 8, 10]) {
        expect(textbook().some((s) => parseCanonical(s.circle!)!.core === e && s.tier === t), `${e} Lv.${t}`).toBe(true);
      }
    }
  });

  it('rotation of a textbook circle is the same spell', () => {
    for (const s of textbook()) {
      const p = placementOf(s.circle!);
      const rot = <T,>(r: T[]) => [...r.slice(2), ...r.slice(0, 2)];
      const mirror = <T,>(r: T[]) => [r[0]!, r[4]!, r[3]!, r[2]!, r[1]!];
      const form = parseCanonical(s.circle!)!.form;
      expect(canonicalCircle({ ...p, ring1: rot(p.ring1), ring2: rot(p.ring2) }, form), s.id).toBe(s.circle);
      expect(canonicalCircle({ ...p, ring1: mirror(p.ring1), ring2: mirror(p.ring2) }, form), s.id).toBe(s.circle);
      expect(resolveSpell(canonicalCircle({ ...p, ring1: rot(p.ring1), ring2: rot(p.ring2) }, form), content)!.name, s.id).toBe(resolveSpell(s.circle!, content)!.name);
    }
  });

  it('resolveSpell rejects ids that are not canonical circles', () => {
    expect(resolveSpell('m:fire.2.f----.-----.bolt', content)).toBeNull(); // not the folded form
    expect(resolveSpell('m:fire.3.----f.-----.bolt', content)).toBeNull(); // tier above the node count
    expect(resolveSpell('m:light.2.----f.-----.bolt', content)).toBeNull();
    expect(circleSpell('fireball', content)).toBeNull();
  });
});
