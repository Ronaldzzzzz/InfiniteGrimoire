const KEY = 'ig.autoAdvance';

/** Whether to move on to the next stage after a clear. On unless the player turned it off. */
export function loadAutoAdvance(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveAutoAdvance(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, String(on));
  } catch {
    // preference only; the page works without storage
  }
}
