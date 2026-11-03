// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useArt } from './useArt';

class FakeImage {
  static all: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() { FakeImage.all.push(this); }
}

describe('useArt', () => {
  beforeEach(() => { FakeImage.all = []; vi.stubGlobal('Image', FakeImage); });
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

  it('detaches its handlers on unmount', () => {
    const { unmount } = renderHook(() => useArt('/assets/a.webp'));
    const img = FakeImage.all[0]!;
    expect(img.onload).not.toBeNull();
    unmount();
    expect(img.onload).toBeNull();
    expect(img.onerror).toBeNull();
  });
});
