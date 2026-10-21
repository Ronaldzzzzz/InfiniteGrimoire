import { describe, expect, it } from 'vitest';
import { gameData } from '../engine/data';
import { itemName, synthMessage } from './messages';

const spellId = Object.keys(gameData.spells)[0]!;
const name = gameData.spells[spellId]!.name;

describe('synthMessage', () => {
  it('formats every result kind', () => {
    expect(synthMessage({ kind: 'learned', spellId }, gameData)).toBe(`習得新魔法：${name}`);
    expect(synthMessage({ kind: 'duplicate', spellId, refunded: ['el:fire:1'] }, gameData)).toBe(`已習得 ${name}，退還部分元素`);
    expect(synthMessage({ kind: 'noReaction', consumed: ['el:fire:1'] }, gameData)).toBe('沒有反應……材料損耗了一部分');
    expect(synthMessage({ kind: 'knownNoReaction' }, gameData)).toBe('這個組合沒有反應');
    expect(synthMessage({ kind: 'dormant' }, gameData)).toBe('似乎還缺少什麼……');
    expect(synthMessage({ kind: 'rejected', reason: 'insufficient' }, gameData)).toBe('材料不足');
    expect(synthMessage({ kind: 'rejected', reason: 'slots' }, gameData)).toBe('請放入兩個素材');
  });
});

describe('itemName', () => {
  it('names elements, materials and unknowns', () => {
    expect(itemName('el:fire:1')).toBe('初階火');
    expect(itemName('el:wind:2')).toBe('中階風');
    expect(itemName('el:thunder:3')).toBe('高階雷');
    expect(itemName('el:earth:1')).toBe('初階土');
    expect(itemName('el:water:1')).toBe('初階水');
    expect(itemName('mat:mana_crystal')).toBe('魔晶');
    expect(itemName('mat:odd_dust')).toBe('odd_dust');
  });
});
