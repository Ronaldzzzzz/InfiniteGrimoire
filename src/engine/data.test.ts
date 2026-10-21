import { describe, expect, it } from 'vitest';
import { DataError, gameData, loadGameData } from './data';
import spells from '../data/spells.json';
import recipes from '../data/recipes.json';
import monsters from '../data/monsters.json';
import zones from '../data/zones.json';
import { ELEMENT_ORDER, STARTING_SPELL, elementItem } from './types';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const raw = () => clone({ spells, recipes, monsters, zones }) as any;

function errorOf(mutate: (r: any) => void): string {
  const r = raw();
  mutate(r);
  try {
    loadGameData(r);
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return (e as Error).message;
  }
  throw new Error('expected DataError');
}

describe('gameData', () => {
  it('real data loads', () => {
    expect(gameData.spells.mana_bolt.tier).toBe(1);
    expect(gameData.zones.map((z) => z.order)).toEqual([1, 2, 3]);
  });

  it('rejects tier out of range', () => {
    expect(errorOf((r) => { r.spells[0].tier = 21; })).toContain('tier');
  });

  it('rejects unknown prerequisite', () => {
    expect(errorOf((r) => { r.spells.find((s: any) => s.id === 'flame_burst').prerequisites = ['nope']; })).toContain('nope');
  });
  it('rejects unknown outcome spell', () => {
    expect(errorOf((r) => { r.recipes[0].outcomes[0].spellId = 'ghost_spell'; })).toContain('ghost_spell');
  });
  it('rejects unknown monster in zone', () => {
    expect(errorOf((r) => { r.zones[0].monsters[0] = 'ghost_mon'; })).toContain('ghost_mon');
  });
  it('rejects unknown boss', () => {
    expect(errorOf((r) => { r.zones[0].bossId = 'ghost_boss'; })).toContain('ghost_boss');
  });
  it('rejects unknown drop item', () => {
    expect(errorOf((r) => { r.monsters[0].drops[0].itemId = 'el:fire:9'; })).toContain('el:fire:9');
  });
  it('rejects unknown recipe input item', () => {
    expect(errorOf((r) => { r.recipes[0].inputs[0] = 'mat:unknown'; })).toContain('mat:unknown');
  });

  it('rejects recipe with inputs.length !== 2', () => {
    expect(errorOf((r) => { r.recipes[0].inputs = ['el:fire:1']; })).toContain('inputs');
  });

  it('lists all problems at once', () => {
    const msg = errorOf((r) => { r.spells[0].tier = 21; r.zones[0].bossId = 'ghost_boss'; });
    expect(msg).toContain('tier');
    expect(msg).toContain('ghost_boss');
  });

  it('every non-starting spell is an outcome of some recipe', () => {
    const outcomes = new Set(gameData.recipes.flatMap((r) => r.outcomes.map((o) => o.spellId)));
    for (const id of Object.keys(gameData.spells)) {
      if (id === STARTING_SPELL) continue;
      expect(outcomes.has(id), id).toBe(true);
    }
  });

  it('every zone drops all five grade-1 elements', () => {
    for (const z of gameData.zones) {
      const items = new Set(
        z.monsters.flatMap((m) => gameData.monsters[m].drops.map((d) => d.itemId)),
      );
      for (const e of ELEMENT_ORDER) expect(items.has(elementItem(e, 1)), `${z.id} ${e}`).toBe(true);
    }
  });

  it('hybrid spells have exactly two adjacent elements', () => {
    const hybrids = Object.values(gameData.spells).filter((s) => s.grimoire.ring === 3);
    expect(hybrids.length).toBeGreaterThan(0);
    for (const s of hybrids) {
      expect(s.elements).toHaveLength(2);
      const [a, b] = s.elements.map((e) => ELEMENT_ORDER.indexOf(e));
      const diff = Math.abs(a - b);
      expect(Math.min(diff, ELEMENT_ORDER.length - diff), s.id).toBe(1);
    }
  });

  it('zone 2 normal monsters are immune to mana_bolt by attack', () => {
    const z = gameData.zones[1];
    for (const m of z.monsters) {
      expect(gameData.monsters[m].defense).toBeGreaterThan(gameData.spells.mana_bolt.attack / 0.7);
    }
  });

  it('mana_bolt can damage all zone 1 monsters including boss', () => {
    const z = gameData.zones[0];
    for (const m of [...z.monsters, z.bossId]) {
      expect(gameData.spells.mana_bolt.tier).toBeGreaterThanOrEqual(gameData.monsters[m].tier - 1);
    }
  });
});
