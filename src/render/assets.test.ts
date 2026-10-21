import { describe, expect, it } from 'vitest';
import artDoc from '../../docs/art-assets.md?raw';
import { ASSET_KEYS } from './assets';

describe('art-assets doc', () => {
  it('covers all ASSET_KEYS', () => {
    const missing = ASSET_KEYS.filter((key) => !artDoc.includes(`${key}.png`));
    expect(missing).toEqual([]);
  });
});
