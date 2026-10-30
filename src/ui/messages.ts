import { content as defaultContent } from '../engine/content';
import type { Affinity, Content, Passive } from '../engine/model';
import { resolveSpell } from '../engine/spells';
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

const REJECTED: Record<string, string> = {
  insufficient: '材料不足',
  slots: '請放入兩個素材',
  unknownInput: '這個素材不能拿來合成',
  notLearned: '還沒學會這個魔法',
  maxLevel: '已經強化到最高等級',
  noElements: '無屬性魔法不能強化',
  unknown: '找不到這個項目',
  notOwned: '沒有這個道具',
  noEffect: '魔法陣已經開放到這一階了',
  already: '已經解鎖了',
  requirement: '還沒達成解鎖條件',
  locked: '這個地點還沒開放',
  elsewhere: '你已經不在這個地點了',
  notReached: '還沒打到這一關',
  cannotDamage: '裝備中的魔法打不動這裡的魔物',
  tooFast: '結算太快了，請稍後再試',
  bossAlive: '魔王還沒倒下',
  retired: '合成台改版中，請稍候改用魔法陣',
  // magic circle refusals (placementProblems)
  overCap: '超過核心上限',
  overUnlocked: '尚未開放',
  ring2BeforeRing1Full: '一環要先放滿五格才能放二環',
  tooManyRing2: '二環最多只能放四格',
  belowRingFloor: '這一環的元素階級不夠',
  runeLocked: '還沒學會這個符文',
  runeWithoutRing: '沒有節點的環不能放符文',
  ringWithoutRune: '每一環都要放一個符文',
};

/** Message for a server action's result. */
export function synthMessage(result: ActionResult, content: Content, _inputs?: string[]): string {
  switch (result.kind) {
    case 'learned':
      return 'crafted' in result && result.crafted
        ? `自創魔法：${spellLabel(result.spellId, content)}`
        : `習得新魔法：${spellLabel(result.spellId, content)}`;
    case 'known':
      return `已經會了 ${spellLabel(result.spellId, content)}`;
    case 'failed':
      return '魔法陣崩解了……元素已經消耗';
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
    case 'circleOpened':
      return `魔法陣開放到 Lv.${result.tier}`;
    case 'unlocked':
      return '被動已解鎖';
    case 'cleared':
      return result.loot.length > 0 ? `關卡結算：${itemCounts(result.loot, content)}` : '關卡結算：沒有獲得道具';
    case 'gm':
      return '已套用';
    case 'away':
    case 'offline':
    case 'none':
      return ''; // presence actions are not shown as messages
    case 'rejected':
      if (result.reason === 'grade') return '元素階級不夠';
      return REJECTED[result.reason] ?? '無法執行';
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
