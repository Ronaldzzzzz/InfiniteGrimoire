import type { SynthResult } from '../engine/synthesis';
import type { GameData, ItemId } from '../engine/types';

const ELEMENT_NAMES: Record<string, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };
const GRADE_NAMES: Record<string, string> = { '1': '初階', '2': '中階', '3': '高階' };
const MATERIAL_NAMES: Record<string, string> = { mana_crystal: '魔晶' };

export function itemName(itemId: ItemId): string {
  const [kind, a, b] = itemId.split(':');
  if (kind === 'el' && a && b && ELEMENT_NAMES[a] && GRADE_NAMES[b]) return `${GRADE_NAMES[b]}${ELEMENT_NAMES[a]}`;
  if (kind === 'mat' && a) return MATERIAL_NAMES[a] ?? a;
  return itemId;
}

export function synthMessage(result: SynthResult, data: GameData): string {
  const spellName = (id: string): string => data.spells[id]?.name ?? id;
  switch (result.kind) {
    case 'learned':
      return `習得新魔法：${spellName(result.spellId)}`;
    case 'duplicate':
      return `已習得 ${spellName(result.spellId)}，退還部分元素`;
    case 'noReaction':
      return '沒有反應……材料損耗了一部分';
    case 'knownNoReaction':
      return '這個組合沒有反應';
    case 'dormant':
      return '似乎還缺少什麼……';
    case 'rejected':
      return result.reason === 'insufficient' ? '材料不足' : '請放入兩個素材';
  }
}

export const SYNTH_ERROR_MESSAGE = '連線異常，請稍後再試';
export const SYNTH_RETRY_MESSAGE = '存檔已同步，請再試一次';
export const SAVE_ERROR_MESSAGE = '存檔失敗，進度可能沒有保存，請重新整理';
export const BOSS_HINT = '魔王打不動？可以回到前一個地點繼續累積元素';
