import { useEffect, useState } from 'react';

export const PARCHMENT_SRC = '/assets/parchment.webp';
export const DESK_SRC = '/assets/desk.webp';

type Listener = (loaded: boolean) => void;
/** one probe per src for the whole page: the result once known, and who is waiting while it loads */
const results = new Map<string, boolean>();
const waiting = new Map<string, Set<Listener>>();

/** Forgets every probe result (tests only). */
export function resetArtCache(): void {
  results.clear();
  waiting.clear();
}

function probe(src: string, on: Listener): () => void {
  let set = waiting.get(src);
  if (!set) {
    set = new Set();
    waiting.set(src, set);
    const done = (ok: boolean): void => {
      results.set(src, ok);
      const ls = waiting.get(src);
      waiting.delete(src);
      ls?.forEach((l) => l(ok));
    };
    const img = new Image();
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = src;
  }
  set.add(on);
  return () => { set.delete(on); };
}

/**
 * Preloads an optional image; true once it has loaded, false while loading or when the file is missing. Each src is probed
 * once however many components ask; `null` never probes.
 */
export function useArt(src: string | null): boolean {
  const [loaded, setLoaded] = useState(() => (src !== null && results.get(src)) || false);
  useEffect(() => {
    if (src === null) return;
    const known = results.get(src);
    if (known !== undefined) {
      setLoaded(known);
      return;
    }
    return probe(src, setLoaded);
  }, [src]);
  return loaded;
}

/** Optional art for one rune (256x256, transparent); missing files fall back to the drawn glyph. */
export const runeArtSrc = (id: string): string => `/assets/rune-${id}.webp`;
