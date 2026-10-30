import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { AFFINITY_LABEL, empowerLabel, itemCounts, itemName, passiveRequirementLabel, spellLabel, synthMessage } from './messages';

const crafted = 'm:fire.3.---fw.-----.bolt';

describe('synthMessage', () => {
  it('formats every synthesis result kind', () => {
    expect(synthMessage({ kind: 'learned', spellId: crafted, form: 'bolt' }, content)).toBe(`習得新魔法：${spellLabel(crafted, content)}`);
    expect(synthMessage({ kind: 'rejected', reason: 'insufficient' }, content)).toBe('材料不足');
    expect(synthMessage({ kind: 'cleared', loot: ['el:fire:1'] }, content)).toBe('關卡結算：初階火');
    expect(synthMessage({ kind: 'cleared', loot: [] }, content)).toBe('關卡結算：沒有獲得道具');
    expect(synthMessage({ kind: 'rejected', reason: 'tooFast' }, content)).toBe('結算太快了，請稍後再試');
    expect(synthMessage({ kind: 'rejected', reason: 'cannotDamage' }, content)).toBe('裝備中的魔法打不動這裡的魔物');
    expect(synthMessage({ kind: 'rejected', reason: 'elsewhere' }, content)).toBe('你已經不在這個地點了');
  });

  it('formats the other server actions', () => {
    expect(synthMessage({ kind: 'empowered', level: 3 }, content)).toBe('強化成功：強化 +2');
    expect(synthMessage({ kind: 'circleOpened', tier: 4 }, content)).toBe('魔法陣開放到 Lv.4');
    expect(synthMessage({ kind: 'learned', spellId: 'm:fire.2.----f.-----.bolt', form: 'bolt' }, content)).toBe('習得新魔法：火球');
    expect(synthMessage({ kind: 'known', spellId: 'm:fire.2.----f.-----.bolt', form: 'bolt' }, content)).toBe('已經會了 火球');
    expect(synthMessage({ kind: 'failed', form: 'bolt' }, content)).toBe('魔法陣崩解了……元素已經消耗');
    expect(synthMessage({ kind: 'rejected', reason: 'overCap' }, content)).toBe('超過核心上限');
    expect(synthMessage({ kind: 'rejected', reason: 'overUnlocked' }, content)).toBe('尚未開放');
    expect(synthMessage({ kind: 'rejected', reason: 'noEffect' }, content)).toBe('魔法陣已經開放到這一階了');
    expect(synthMessage({ kind: 'unlocked' }, content)).toBe('被動已解鎖');
    expect(synthMessage({ kind: 'gm' }, content)).toBe('已套用');
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

describe('spellLabel', () => {
  it('names named and circle spells, and falls back to the id', () => {
    expect(spellLabel('fireball', content)).toBe('火球');
    expect(spellLabel(crafted, content)).not.toBe(crafted);
    expect(spellLabel('nope', content)).toBe('nope');
  });
});

describe('empower / affinity / passive labels', () => {
  it('shows the empower level as 強化 +N, hidden at level 1', () => {
    expect(empowerLabel(1)).toBe('');
    expect(empowerLabel(2)).toBe('強化 +1');
    expect(empowerLabel(11)).toBe('強化 +10');
  });
  it('names every affinity', () => {
    expect(AFFINITY_LABEL).toEqual({ base: '基礎', self: '同元素強化', good: '相性極佳', odd: '奇妙', bad: '相性差' });
  });
  it('counts repeated items', () => {
    expect(itemCounts(['el:fire:2', 'el:fire:2', 'el:wind:2'], content)).toBe('中階火 ×2、中階風');
  });
  it('describes each kind of passive requirement', () => {
    expect(passiveRequirementLabel(content.passives.ember_affinity!, content)).toBe('需要 餘燼核心 ×5');
    expect(passiveRequirementLabel(content.passives.deep_insight!, content)).toBe(`擊敗${content.monsters.storm_roc!.name}`);
    expect(passiveRequirementLabel(content.passives.eager_student!, content)).toBe('學會 10 個魔法');
    expect(passiveRequirementLabel(content.passives.gale_affinity!, content)).toBe('學會 4 個帶風的魔法');
  });
});
