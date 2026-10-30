/**
 * Away means the page is hidden (a visible but unfocused window keeps fighting). After `delayMs`
 * continuously hidden, `onAway` fires once; becoming visible after that fires `onReturn`.
 */
export function watchPresence(
  opts: { delayMs: number; onAway: () => void; onReturn: () => void },
  doc: Document = document,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let away = false;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onChange = (): void => {
    if (doc.visibilityState === 'hidden') {
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
  onChange(); // already hidden at start (a background tab): the away timer starts now
  return () => {
    clear();
    doc.removeEventListener('visibilitychange', onChange);
  };
}
