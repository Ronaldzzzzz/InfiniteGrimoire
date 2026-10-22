import { describe, expect, it } from 'vitest';
import { MAX_ELEMENT_GRADE, GRADE_UPGRADE_COST, elementItem, gradeValue } from './types';
import { addItems, elementEquivalent, removeItems, upgradeElement } from './inventory';

describe('inventory', () => {
  it('addItems adds without mutating', () => {
    const inv = { a: 1 };
    const out = addItems(inv, ['a', 'b', 'b']);
    expect(out).toEqual({ a: 2, b: 2 });
    expect(inv).toEqual({ a: 1 });
  });
  it('removeItems fails without mutating', () => {
    const inv = { a: 1 };
    expect(removeItems(inv, ['a', 'a'])).toBeNull();
    expect(inv).toEqual({ a: 1 });
  });
  it('inherited Object properties are never counted as stock', () => {
    expect(removeItems({}, ['constructor'])).toBeNull();
    expect(removeItems({}, ['toString', 'toString'])).toBeNull();
    expect(addItems({}, ['constructor', 'constructor'])).toEqual({ constructor: 2 });
  });
  it('removeItems succeeds and drops zero keys', () => {
    const inv = { a: 2, b: 1 };
    expect(removeItems(inv, ['a', 'b'])).toEqual({ a: 1 });
    expect(inv).toEqual({ a: 2, b: 1 });
  });
  it('upgradeElement costs 3, 10, 30, 100 and stops at the top grade', () => {
    const inv = { 'el:fire:1': 3 };
    expect(upgradeElement(inv, 'fire', 1)).toEqual({ 'el:fire:2': 1 });
    expect(inv).toEqual({ 'el:fire:1': 3 });
    expect(upgradeElement({ 'el:fire:1': 2 }, 'fire', 1)).toBeNull();
    expect(upgradeElement({ 'el:fire:2': 11 }, 'fire', 2)).toEqual({ 'el:fire:2': 1, 'el:fire:3': 1 });
    expect(upgradeElement({ 'el:fire:2': 9 }, 'fire', 2)).toBeNull();
    expect(upgradeElement({ 'el:fire:3': 30 }, 'fire', 3)).toEqual({ 'el:fire:4': 1 });
    expect(upgradeElement({ 'el:fire:4': 100 }, 'fire', 4)).toEqual({ 'el:fire:5': 1 });
    expect(upgradeElement({ 'el:fire:5': 500 }, 'fire', 5)).toBeNull();
  });
  it('elementEquivalent uses gradeValue', () => {
    expect(elementEquivalent({ 'el:fire:1': 2, 'el:fire:2': 1, 'el:water:1': 9 }, 'fire')).toBe(5);
    expect(elementEquivalent({ 'el:fire:1': 2, 'el:fire:3': 1, 'el:fire:5': 1 }, 'fire')).toBe(2 + 30 + 90000);
  });
  it('upgrading never changes elementEquivalent at any grade', () => {
    for (let g = 1; g < MAX_ELEMENT_GRADE; g++) {
      const inv = { [elementItem('fire', g)]: GRADE_UPGRADE_COST[g - 1]! };
      const up = upgradeElement(inv, 'fire', g)!;
      expect(elementEquivalent(up, 'fire')).toBe(elementEquivalent(inv, 'fire'));
    }
  });
});
