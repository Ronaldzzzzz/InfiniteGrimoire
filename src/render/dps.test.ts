import { describe, expect, it } from 'vitest';
import { DpsMeter, DpsReadout, dpsGapMs, formatDps, formatPrevDps } from './dps';

describe('DpsMeter (active time)', () => {
  it('does not drop because of idle time between bursts longer than the gap', () => {
    const m = new DpsMeter();
    for (const t of [0, 500, 1000, 1500]) m.add(t, 100, 1000);
    expect(m.value(2500)).toBeCloseTo(160, 6); // 400 damage over 2.5 s of fighting
    expect(m.value(9000)).toBeCloseTo(160, 6); // six idle seconds change nothing
  });

  it('is total damage over elapsed time when hits arrive within the gap', () => {
    const m = new DpsMeter();
    for (const t of [0, 1000, 2000, 3000]) m.add(t, 100, 1000);
    expect(m.value(3000)).toBeCloseTo(400 / 3, 6);
  });

  it('counts the whole damage of a hit, overkill included, and overlapping gaps once', () => {
    const m = new DpsMeter();
    m.add(0, 5000, 2000);
    m.add(500, 5000, 2000);
    expect(m.value(2500)).toBeCloseTo(10_000 / 2.5, 6); // union [0, 2500]
  });

  it('forgets damage older than the window', () => {
    const m = new DpsMeter();
    m.add(0, 100, 1000);
    expect(m.value(5000)).toBeCloseTo(100, 6);
    expect(m.value(40_000)).toBe(0);
  });

  it('never divides by less than a second and ignores bad damage', () => {
    const m = new DpsMeter();
    m.add(100, 50);
    m.add(150, 0);
    m.add(160, -1);
    m.add(170, Number.NaN);
    expect(m.value(200)).toBe(50);
  });

  it('reset forgets everything', () => {
    const m = new DpsMeter();
    m.add(1000, 1000);
    m.reset();
    expect(m.value(1500)).toBe(0);
  });
});

describe('dpsGapMs', () => {
  it('is the cooldown, but at least a second', () => {
    expect(dpsGapMs(400)).toBe(1000);
    expect(dpsGapMs(2500)).toBe(2500);
  });
});

describe('DpsReadout', () => {
  it('uses the equipped spell cooldown as the gap', () => {
    const r = new DpsReadout();
    r.equip('a', 'A', 3000);
    r.hit(0, 300);
    expect(r.value(3000)).toBeCloseTo(100, 6); // 3 s of fighting after one hit
  });

  it('shows the previous spell after a swap and clears it when the battle restarts', () => {
    const r = new DpsReadout();
    r.equip('a', 'Alpha', 1000);
    expect(r.previous).toBeNull();
    r.hit(0, 3457);
    expect(r.value(1000)).toBeCloseTo(3457, 6);
    r.equip('b', 'Beta', 1000);
    expect(r.previous?.name).toBe('Alpha');
    expect(r.previous?.dps).toBeCloseTo(3457, 6);
    expect(r.value(2000)).toBe(0); // the new spell starts fresh
    r.newBattle();
    expect(r.previous).toBeNull();
  });

  it('keeps the older comparison when the swapped-out spell never dealt damage', () => {
    const r = new DpsReadout();
    r.equip('a', 'Alpha', 1000);
    r.hit(0, 100);
    r.value(1000);
    r.equip('b', 'Beta', 1000);
    r.equip('c', 'Gamma', 1000);
    expect(r.previous?.name).toBe('Alpha');
  });

  it('counts burn as damage', () => {
    const r = new DpsReadout();
    r.equip('a', 'A', 1000);
    r.dot(0, 200);
    expect(r.value(1000)).toBeCloseTo(200, 6);
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
  it('formats the previous-spell line', () => {
    expect(formatPrevDps(null)).toBe('');
    expect(formatPrevDps({ name: '墜日', dps: 3456.6 })).toBe('前一招 墜日 3,457');
  });
});
