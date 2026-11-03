// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetArtCache, useArt } from './useArt';

class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() { FakeImage.all.push(this); }
}

describe('useArt', () => {
  beforeEach(() => { resetArtCache(); FakeImage.all = []; vi.stubGlobal('Image', FakeImage); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('is false until the image has loaded', () => {
    const { result } = renderHook(() => useArt('/assets/a.webp'));
    expect(result.current).toBe(false);
    expect(FakeImage.all[0]!.src).toBe('/assets/a.webp');
    act(() => FakeImage.all[0]!.onload?.());
    expect(result.current).toBe(true);
  });

  it('stays false when the image fails to load', () => {
    const { result } = renderHook(() => useArt('/assets/missing.webp'));
    act(() => FakeImage.all[0]!.onerror?.());
    expect(result.current).toBe(false);
  });

  it('stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useArt('/assets/a.webp'));
    unmount();
    expect(() => act(() => FakeImage.all[0]!.onload?.())).not.toThrow();
    expect(result.current).toBe(false);
  });

  it('probes a src once for any number of hooks, and never probes null', () => {
    const many = renderHook(() => [useArt('/assets/same.webp'), useArt('/assets/same.webp'), useArt(null)]);
    expect(FakeImage.all.map((i) => i.src)).toEqual(['/assets/same.webp']);
    act(() => FakeImage.all[0]!.onload?.());
    expect(many.result.current).toEqual([true, true, false]);
    // a later mount reads the cached result without another probe
    const later = renderHook(() => useArt('/assets/same.webp'));
    expect(later.result.current).toBe(true);
    expect(FakeImage.all).toHaveLength(1);
  });
});
