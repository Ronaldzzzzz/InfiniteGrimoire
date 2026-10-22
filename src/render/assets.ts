import { Assets, type Texture } from 'pixi.js';
import { content } from '../engine/content';

export const ASSET_KEYS: string[] = [
  'hero_idle',
  ...Object.keys(content.monsters).map((id) => `monster_${id}`),
];

/** Loads whichever optional PNGs exist; failures are ignored so placeholder shapes are used instead. */
export async function loadOptionalTextures(baseUrl: string): Promise<Map<string, Texture>> {
  const out = new Map<string, Texture>();
  await Promise.all(
    ASSET_KEYS.map(async (key) => {
      try {
        const tex = await Assets.load<Texture>(`${baseUrl}assets/${key}.png`);
        if (tex) out.set(key, tex);
      } catch {
        /* optional asset missing */
      }
    }),
  );
  return out;
}
