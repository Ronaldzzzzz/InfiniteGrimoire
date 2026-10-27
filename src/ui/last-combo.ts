import type { Content, GameState } from '../engine/model';
import { describeInput } from './altar-data';
import { slotLabel } from './messages';

export const LAST_COMBO_KEY = 'ig.lastCombo';

/** The two inputs of the last pressed 合成, in slot order; null when absent or malformed. */
export function loadLastCombo(): [string, string] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LAST_COMBO_KEY) ?? 'null');
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') return [v[0], v[1]];
  } catch {
    // unreadable storage or bad JSON: treat as no combo
  }
  return null;
}

export function saveLastCombo(inputs: string[]): void {
  try {
    localStorage.setItem(LAST_COMBO_KEY, JSON.stringify(inputs));
  } catch {
    // storage unavailable: the button simply stays empty
  }
}

const isItem = (id: string): boolean => /^(el|mat):/.test(id);

/** Why the last combo cannot be put back right now; null when it can. */
export function comboBlocker(combo: [string, string] | null, game: GameState, content: Content): string | null {
  if (!combo) return '還沒有合成過';
  if (combo.some((id) => describeInput(id, content, {}) === null)) return '上次的組合已經不存在';
  const need = new Map<string, number>();
  for (const id of combo) if (isItem(id)) need.set(id, (need.get(id) ?? 0) + 1);
  for (const [id, n] of need) {
    if ((Object.hasOwn(game.inventory, id) ? game.inventory[id]! : 0) < n) return `「${slotLabel(id, content)}」不夠`;
  }
  for (const id of combo) if (!isItem(id) && !game.learned.includes(id)) return `還沒學會「${slotLabel(id, content)}」`;
  return null;
}
