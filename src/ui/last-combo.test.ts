// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import { createInitialState } from '../engine/persist';
import { comboBlocker, LAST_COMBO_KEY, loadLastCombo, saveLastCombo } from './last-combo';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const game = (p: object = {}) => ({ ...createInitialState(content), learned: ['mana_bolt'], ...p });

describe('load/save', () => {
  it('round-trips two ids in order', () => {
    saveLastCombo(['el:wind:1', 'mana_bolt']);
    expect(loadLastCombo()).toEqual(['el:wind:1', 'mana_bolt']);
  });
  it.each([['not json'], ['["a"]'], ['[1,2]'], ['{"a":1}'], ['["a","b","c"]']])('treats %s as none', (raw) => {
    localStorage.setItem(LAST_COMBO_KEY, raw);
    expect(loadLastCombo()).toBeNull();
  });
  it('swallows storage exceptions', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    expect(loadLastCombo()).toBeNull();
    expect(() => saveLastCombo(['a', 'b'])).not.toThrow();
  });
});

describe('comboBlocker', () => {
  it('no combo yet', () => expect(comboBlocker(null, game(), content)).toBe('還沒有合成過'));
  it('items short, the same id on both sides needs two', () => {
    expect(comboBlocker(['el:fire:1', 'mana_bolt'], game({ inventory: {} }), content)).toBe('「初階火」不夠');
    expect(comboBlocker(['el:fire:1', 'el:fire:1'], game({ inventory: { 'el:fire:1': 1 } }), content)).toBe('「初階火」不夠');
    expect(comboBlocker(['el:fire:1', 'el:fire:1'], game({ inventory: { 'el:fire:1': 2 } }), content)).toBeNull();
  });
  it('spell not learned', () => {
    expect(comboBlocker(['fireball', 'mana_bolt'], game(), content)).toBe('還沒學會「火球」');
  });
  it('ids that no longer resolve', () => {
    expect(comboBlocker(['gone_spell', 'mana_bolt'], game(), content)).toBe('上次的組合已經不存在');
    expect(comboBlocker(['el:fire:9', 'mana_bolt'], game(), content)).toBe('上次的組合已經不存在');
  });
  it('ok when everything is there', () => {
    expect(comboBlocker(['el:fire:1', 'mana_bolt'], game({ inventory: { 'el:fire:1': 1 } }), content)).toBeNull();
  });
});
