import { Assets, type Texture } from 'pixi.js';
import { gameData } from '../engine/data';

export const ASSET_KEYS: string[] = [
  'hero_idle',
  ...Object.keys(gameData.monsters).map((id) => `monster_${id}`),
  'fx_bolt',
  'fx_beam',
  'fx_chain',
  'fx_nova',
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
