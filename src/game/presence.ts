/**
 * Away means the game is not the window in use: the page is hidden or the window lost focus
 * (another window or app, whichever screen it is on). After `delayMs` continuously not in use,
 * `onAway` fires once; using the window again after that fires `onReturn`.
 */
export function watchPresence(
  opts: { delayMs: number; onAway: () => void; onReturn: () => void },
  env: { doc: Document; win: Window } = { doc: document, win: window },
): () => void {
  const { doc, win } = env;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let away = false;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const inUse = (): boolean => doc.visibilityState !== 'hidden' && doc.hasFocus();
  const onChange = (): void => {
    if (!inUse()) {
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
  doc.addEventListener('visibilitychange', onChange);
  win.addEventListener('blur', onChange);
  win.addEventListener('focus', onChange);
  onChange(); // already not in use at start (a background tab): the away timer starts now
  return () => {
    clear();
    doc.removeEventListener('visibilitychange', onChange);
    win.removeEventListener('blur', onChange);
    win.removeEventListener('focus', onChange);
  };
}
