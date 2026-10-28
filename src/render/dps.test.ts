import { describe, expect, it } from 'vitest';
import { DpsMeter, formatDps } from './dps';

describe('DpsMeter', () => {
  it('averages the damage of the last DPS_WINDOW_MS', () => {
    const m = new DpsMeter(0);
    for (let t = 0; t < 20_000; t += 1000) m.add(t, 100);
    expect(m.value(19_500)).toBeCloseTo(100, 6); // the 10 hits at 10–19 s, 100 per second
    expect(m.value(25_000)).toBeCloseTo(40, 6); // only the hits at 16–19 s are still inside the window
    expect(m.value(40_000)).toBe(0);
  });

  it('divides by the time since the start while the window is not yet full', () => {
    const m = new DpsMeter(0);
    m.add(500, 300);
    m.add(1500, 300);
    expect(m.value(2000)).toBeCloseTo(300, 6); // 600 over 2 s
  });

  it('never divides by less than a second', () => {
    const m = new DpsMeter(0);
    m.add(100, 50);
    expect(m.value(200)).toBe(50);
  });

  it('reset forgets everything and restarts the clock', () => {
    const m = new DpsMeter(0);
    m.add(1000, 1000);
    m.reset(5000);
    expect(m.value(5000)).toBe(0);
    m.add(6000, 400);
    expect(m.value(7000)).toBeCloseTo(200, 6);
  });

  it('ignores zero, negative and non-finite damage', () => {
    const m = new DpsMeter(0);
    m.add(100, 0);
    m.add(200, -5);
    m.add(300, Number.NaN);
    expect(m.value(1000)).toBe(0);
  });
});

describe('formatDps', () => {
  it('shows a dash for nothing, grouped integers below a million, and k above', () => {
    expect(formatDps(0)).toBe('DPS —');
    expect(formatDps(12.6)).toBe('DPS 13');
    expect(formatDps(1234.4)).toBe('DPS 1,234');
    expect(formatDps(123_456)).toBe('DPS 123,456');
    expect(formatDps(2_500_000)).toBe('DPS 2,500k');
  });
});
