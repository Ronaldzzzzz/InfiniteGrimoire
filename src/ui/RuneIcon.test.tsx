// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNE_IDS } from '../engine/circle';
import { RUNE_BAND_COUNT, RuneIcon } from './RuneIcon';
import { resetArtCache } from './useArt';

class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() { FakeImage.all.push(this); }
}

describe('RuneIcon', () => {
  beforeEach(() => { resetArtCache(); FakeImage.all = []; vi.stubGlobal('Image', FakeImage); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('draws a distinct non-empty placeholder for each of the 8 runes', () => {
    const ds = RUNE_IDS.map((id) => {
      const { container } = render(<svg><RuneIcon id={id} size={20} /></svg>);
      expect(container.querySelector(`[data-rune="${id}"]`)).toBeTruthy();
      const d = container.querySelector('path')!.getAttribute('d')!;
      expect(d.length).toBeGreaterThan(10);
      cleanup();
      return d;
    });
    expect(new Set(ds).size).toBe(8);
  });

  it('draws 「？」 for null', () => {
    const { container } = render(<svg><RuneIcon id={null} size={20} /></svg>);
    expect(container.querySelector('[data-rune="locked"]')!.textContent).toBe('？');
  });

  it('switches to the art image once it has loaded', () => {
    const { container } = render(<svg><RuneIcon id="bolt" size={20} /></svg>);
    expect(container.querySelector('image')).toBeNull();
    act(() => FakeImage.all[0]!.onload?.());
    expect(container.querySelector('image')!.getAttribute('href')).toBe('/assets/rune-bolt.webp');
  });

  it('probes one src once across many icons, and not at all for the locked glyph', () => {
    render(<svg>{Array.from({ length: 12 }, (_, i) => <RuneIcon key={i} id="bolt" size={20} />)}<RuneIcon id={null} size={20} /></svg>);
    expect(FakeImage.all.map((i) => i.src)).toEqual(['/assets/rune-bolt.webp']);
  });

  it('band count is 12', () => { expect(RUNE_BAND_COUNT).toBe(12); });
});
