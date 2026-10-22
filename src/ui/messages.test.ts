import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { craftedId } from '../engine/spells';
import { itemName, slotLabel, spellLabel, synthMessage } from './messages';

const crafted = craftedId('fireball', 'mat:ember_core');

describe('synthMessage', () => {
  it('formats every synthesis result kind', () => {
    expect(synthMessage({ kind: 'learned', spellId: 'fireball', crafted: false }, content)).toBe('習得新魔法：火球');
    expect(synthMessage({ kind: 'learned', spellId: crafted, crafted: true }, content)).toBe(`自創魔法：${spellLabel(crafted, content)}`);
    expect(synthMessage({ kind: 'duplicate', spellId: 'fireball', refunded: ['el:fire:1'] }, content)).toBe('已習得 火球，退還部分元素');
    expect(synthMessage({ kind: 'noReaction' }, content)).toBe('沒有反應……材料損耗了一部分');
    expect(synthMessage({ kind: 'dormant' }, content)).toBe('似乎還缺少什麼……');
    expect(synthMessage({ kind: 'overload', spellId: 'mana_overload' }, content)).toBe('魔力過載！');
    expect(synthMessage({ kind: 'rejected', reason: 'insufficient' }, content)).toBe('材料不足');
    expect(synthMessage({ kind: 'rejected', reason: 'slots' }, content)).toBe('請放入兩個素材');
  });

  it('names the grade a grade refusal needed', () => {
    // fire_tornado + wind_blade is depth 2: its element inputs must be 中階
    expect(synthMessage({ kind: 'rejected', reason: 'grade' }, content, ['el:fire:1', 'fire_tornado'])).toBe('元素階級不夠，需要中階以上');
    expect(synthMessage({ kind: 'rejected', reason: 'grade' }, content)).toBe('元素階級不夠');
  });

  it('formats the other server actions', () => {
    expect(synthMessage({ kind: 'empowered', level: 3 }, content)).toBe('強化成功：Lv.3');
    expect(synthMessage({ kind: 'revealed', region: 'outer' }, content)).toBe('迷霧散開了');
    expect(synthMessage({ kind: 'unlocked' }, content)).toBe('被動已解鎖');
    expect(synthMessage({ kind: 'rejected', reason: 'maxLevel' }, content)).toBe('已經強化到最高等級');
  });
});

describe('itemName', () => {
  it('names five element grades, materials, key items and unknowns', () => {
    expect(itemName('el:fire:1')).toBe('初階火');
    expect(itemName('el:wind:2')).toBe('中階風');
    expect(itemName('el:thunder:3')).toBe('高階雷');
    expect(itemName('el:earth:4')).toBe('極階土');
    expect(itemName('el:water:5')).toBe('神階水');
    expect(itemName('mat:ember_core')).toBe('餘燼核心');
    expect(itemName('key:storm_heart')).toBe('風暴之心');
    expect(itemName('mat:odd_dust')).toBe('odd_dust');
  });
});

describe('spellLabel / slotLabel', () => {
  it('names named and crafted spells, items in slots, and falls back to the id', () => {
    expect(spellLabel('fireball', content)).toBe('火球');
    expect(spellLabel(crafted, content)).not.toBe(crafted);
    expect(spellLabel('nope', content)).toBe('nope');
    expect(slotLabel('el:fire:2', content)).toBe('中階火');
    expect(slotLabel('fireball', content)).toBe('火球');
  });
});
