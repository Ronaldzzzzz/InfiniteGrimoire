/** How often focus is re-checked, in case a browser never fires the window's blur. */
export const FOCUS_POLL_MS = 2000;

/**
 * Away means the game is not the window in use: the page is hidden or the window lost focus
 * (another window or app, whichever screen it is on). After `delayMs` continuously not in use,
 * `onAway` fires once; using the window again after that fires `onReturn`.
 *
 * Focus follows the window's blur / focus events (a browser may still report hasFocus() during
 * blur); a slow poll of hasFocus() only ever catches a lost focus the events missed.
 */
export function watchPresence(
  opts: { delayMs: number; onAway: () => void; onReturn: () => void },
  env: { doc: Document; win: Window } = { doc: document, win: window },
): () => void {
  const { doc, win } = env;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let away = false;
  let focused = doc.hasFocus();
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onChange = (): void => {
    if (doc.visibilityState === 'hidden' || !focused) {
      if (timer !== null || away) return;
      timer = setTimeout(() => {
        timer = null;
        away = true;
        opts.onAway();
      }, opts.delayMs);
    } else {
      clear();
      if (away) {
        away = false;
        opts.onReturn();
      }
    }
  };
  const onBlur = (): void => {
    focused = false;
    onChange();
  };
  const onFocus = (): void => {
    focused = true;
    onChange();
  };
  const poll = setInterval(() => {
    if (focused && !doc.hasFocus()) onBlur();
  }, FOCUS_POLL_MS);
  doc.addEventListener('visibilitychange', onChange);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  onChange(); // already not in use at start (a background tab): the away timer starts now
  return () => {
    clear();
    clearInterval(poll);
    doc.removeEventListener('visibilitychange', onChange);
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
  };
}
