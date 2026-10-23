import { content as defaultContent } from '../engine/content';
import { requiredGrade } from '../engine/crafting';
import type { Affinity, Content, Passive } from '../engine/model';
import { craftedId, inputToken, resolveSpell } from '../engine/spells';
import { GRADE_NAMES, type ItemId } from '../engine/types';
import { USERNAME_MAX, USERNAME_MIN, PASSWORD_MAX, PASSWORD_MIN, type UsernameProblem } from '../engine/account-rules';
import { ApiError, NetworkError, RateLimitedError, type ActionResult } from '../game/api';

export const ELEMENT_NAMES: Record<string, string> = { fire: '火', wind: '風', thunder: '雷', earth: '土', water: '水' };

/** Element items by grade and element; materials and key items by their content name. */
export function itemName(itemId: ItemId, content: Content = defaultContent): string {
  const [kind, a, b] = itemId.split(':');
  const grade = Number(b);
  if (kind === 'el' && a && ELEMENT_NAMES[a] && GRADE_NAMES[grade - 1]) return `${GRADE_NAMES[grade - 1]}${ELEMENT_NAMES[a]}`;
  if (kind === 'mat' && a) return Object.hasOwn(content.materials, itemId) ? content.materials[itemId]!.name : a;
  if (kind === 'key' && a) return Object.hasOwn(content.keyItems, itemId) ? content.keyItems[itemId]!.name : a;
  return itemId;
}

/** Items with repeats folded into counts: 「中階火 ×2、中階風」. */
export function itemCounts(items: readonly ItemId[], content: Content = defaultContent): string {
  const counts = new Map<ItemId, number>();
  for (const id of items) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, n]) => (n > 1 ? `${itemName(id, content)} ×${n}` : itemName(id, content))).join('、');
}

export const AFFINITY_LABEL: Record<Affinity, string> = { base: '基礎', self: '同元素強化', good: '相性極佳', odd: '奇妙', bad: '相性差' };

/** R17: "Lv." is the tier; the empower level shows as 「強化 +N」 (N = level - 1), nothing at level 1. */
export function empowerLabel(level: number): string {
  return level > 1 ? `強化 +${level - 1}` : '';
}

export function passiveRequirementLabel(p: Passive, content: Content = defaultContent): string {
  const u = p.unlock;
  if (u.kind === 'items') {
    return `需要 ${Object.entries(u.items).map(([id, n]) => `${itemName(id, content)} ×${n}`).join('、')}`;
  }
  if (u.kind === 'boss') return `擊敗${Object.hasOwn(content.monsters, u.bossId) ? content.monsters[u.bossId]!.name : u.bossId}`;
  return `學會 ${u.count} 個${u.element ? `帶${ELEMENT_NAMES[u.element]}的` : ''}魔法`;
}

/** A named or crafted spell's name, or the id itself when it is not a spell. */
export function spellLabel(id: string, content: Content): string {
  return resolveSpell(id, content)?.name ?? id;
}

/** What a synthesis slot shows: an item name, or the name of the spell put in it. */
export function slotLabel(id: string, content: Content): string {
  return /^(el|mat|key):/.test(id) ? itemName(id, content) : spellLabel(id, content);
}

/** Grade the crafted result of these inputs demands from its element inputs, or null when unknown. */
function neededGrade(inputs: string[] | undefined, content: Content): number | null {
  if (!inputs || inputs.length !== 2) return null;
  const a = inputToken(inputs[0]!, content), b = inputToken(inputs[1]!, content);
  if (a === null || b === null) return null;
  const spell = resolveSpell(craftedId(a, b), content);
  return spell ? requiredGrade(spell.depth) : null;
}

const REJECTED: Record<string, string> = {
  insufficient: '材料不足',
  slots: '請放入兩個素材',
  unknownInput: '這個素材不能拿來合成',
  notLearned: '還沒學會這個魔法',
  maxLevel: '已經強化到最高等級',
  noElements: '無屬性魔法不能強化',
  unknown: '找不到這個項目',
  notOwned: '沒有這個道具',
  alreadyRevealed: '這個區域已經揭開了',
  already: '已經解鎖了',
  hidden: '這個區域還被迷霧遮住',
  requirement: '還沒達成解鎖條件',
};

/** Message for a server action's result; `inputs` are the synthesis inputs (for the grade a refusal needed). */
export function synthMessage(result: ActionResult, content: Content, inputs?: string[]): string {
  switch (result.kind) {
    case 'learned':
      return result.crafted
        ? `自創魔法：${spellLabel(result.spellId, content)}`
        : `習得新魔法：${spellLabel(result.spellId, content)}`;
    case 'duplicate':
      // only what the server says came back: a random recipe's retry refunds a single item
      return result.refunded.length > 0
        ? `已經會了 ${spellLabel(result.spellId, content)}，退還 ${itemCounts(result.refunded, content)}`
        : `已經會了 ${spellLabel(result.spellId, content)}，沒有退還`;
    case 'noReaction':
      return '沒有反應……材料損耗了一部分';
    case 'dormant':
      return '似乎還缺少什麼……';
    case 'overload':
      return '魔力過載！';
    case 'empowered':
      return `強化成功：${empowerLabel(result.level)}`;
    case 'revealed':
      return '迷霧散開了';
    case 'unlocked':
      return '被動已解鎖';
    case 'gm':
      return '已套用';
    case 'rejected': {
      if (result.reason === 'grade') {
        const g = neededGrade(inputs, content);
        return g === null ? '元素階級不夠' : `元素階級不夠，需要${GRADE_NAMES[g - 1]}以上`;
      }
      return REJECTED[result.reason] ?? '無法執行';
    }
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

/** "just now", "N minutes ago" ... for the discovery feed. */
export function timeAgo(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}

/** The headline of one feed entry; it names the spell and never its recipe. */
export function discoveryLine(d: { displayName: string; spellId: string; first: boolean }, content: Content): string {
  const name = resolveSpell(d.spellId, content)?.name ?? d.spellId;
  return d.first ? `✦ 全服首次發現　${d.displayName} 合出了「${name}」` : `${d.displayName} 也合出了「${name}」`;
}
