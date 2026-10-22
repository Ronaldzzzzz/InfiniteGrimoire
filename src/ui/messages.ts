import type { SynthResult } from '../engine/synthesis';
import type { GameData, ItemId } from '../engine/types';
import { USERNAME_MAX, USERNAME_MIN, PASSWORD_MAX, PASSWORD_MIN, type UsernameProblem } from '../engine/account-rules';
import { ApiError, NetworkError, RateLimitedError } from '../game/api';

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

export function usernameProblemMessage(p: UsernameProblem): string {
  return p === 'length' ? `帳號名稱需要 ${USERNAME_MIN}～${USERNAME_MAX} 個字` : '帳號名稱只能用中英文、數字和底線';
}

export function passwordProblemMessage(): string {
  return `密碼需要 ${PASSWORD_MIN}～${PASSWORD_MAX} 個字`;
}

export function accountErrorMessage(e: unknown): string {
  if (e instanceof RateLimitedError) return `嘗試次數過多，請 ${Math.max(1, Math.ceil(e.retryAfterSec / 60))} 分鐘後再試`;
  if (e instanceof ApiError) {
    if (e.code === 'invalid_credentials') return '帳號或密碼錯誤';
    if (e.code === 'taken') return '這個帳號名稱已被使用';
    if (e.code === 'already_bound') return '這個角色已經綁定過帳號';
    if (e.code === 'not_bound') return '這個角色還沒有綁定帳號';
    if (e.code === 'invalid_username') return usernameProblemMessage('chars');
    if (e.code === 'invalid_password') return passwordProblemMessage();
  }
  if (e instanceof NetworkError) return '連線異常，請稍後再試';
  return '發生錯誤，請稍後再試';
}
