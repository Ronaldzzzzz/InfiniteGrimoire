import { describe, expect, it } from 'vitest';
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
  it('removeItems succeeds and drops zero keys', () => {
    const inv = { a: 2, b: 1 };
    expect(removeItems(inv, ['a', 'b'])).toEqual({ a: 1 });
    expect(inv).toEqual({ a: 2, b: 1 });
  });
  it('upgradeElement 3 -> 1', () => {
    const inv = { 'el:fire:1': 3 };
    expect(upgradeElement(inv, 'fire', 1)).toEqual({ 'el:fire:2': 1 });
    expect(inv).toEqual({ 'el:fire:1': 3 });
    expect(upgradeElement({ 'el:fire:1': 2 }, 'fire', 1)).toBeNull();
    expect(upgradeElement({ 'el:fire:3': 5 }, 'fire', 3)).toBeNull();
  });
  it('elementEquivalent', () => {
    expect(elementEquivalent({ 'el:fire:1': 2, 'el:fire:2': 1, 'el:water:1': 9 }, 'fire')).toBe(5);
  });
});
