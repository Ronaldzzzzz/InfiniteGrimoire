import { useEffect, useState } from 'react';

export const PARCHMENT_SRC = '/assets/parchment.webp';
export const DESK_SRC = '/assets/desk.webp';

/** Preloads an optional image; true once it has loaded, false while loading or when the file is missing. */
export function useArt(src: string): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setLoaded(true); };
    img.onerror = () => { if (live) setLoaded(false); };
    img.src = src;
    return () => { live = false; img.onload = null; img.onerror = null; };
  }, [src]);
  return loaded;
}

/** Optional art for one rune (256x256, transparent); missing files fall back to the drawn glyph. */
export const runeArtSrc = (id: string): string => `/assets/rune-${id}.webp`;
