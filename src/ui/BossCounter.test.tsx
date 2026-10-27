// @vitest-environment jsdom
import { Profiler } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { createBattle } from '../engine/combat';
import { BossCounter, bossCounterText } from './BossCounter';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

describe('bossCounterText', () => {
  it('counts down the kills left in the current zone', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', zoneKills: {} });
    expect(bossCounterText(rt.getSnapshot(), content)).toBe('魔王出現還差 40 隻');
    rt.set({ game: { zoneKills: { mist_meadow: 15 } } });
    expect(bossCounterText(rt.getSnapshot(), content)).toBe('魔王出現還差 25 隻');
  });
  it('never goes negative', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', zoneKills: { mist_meadow: 99 } });
    expect(bossCounterText(rt.getSnapshot(), content)).toBe('魔王出現還差 0 隻');
  });
  it('says the boss is here while it is alive', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow' });
    const zone = content.zones.find((z) => z.id === 'mist_meadow')!;
    const battle = createBattle('mist_meadow');
    const foe = { ...(battle.foes[0] ?? ({} as never)), defId: zone.bossId };
    rt.set({ battle: { ...battle, bossActive: true, foes: [foe as never] } });
    expect(bossCounterText(rt.getSnapshot(), content)).toBe('魔王現身！');
  });
});

describe('BossCounter', () => {
  it('does not re-render when the number stays the same', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow', zoneKills: {} });
    let commits = 0;
    render(
      <Profiler id="bc" onRender={() => commits++}>
        <BossCounter runtime={rt} content={content} />
      </Profiler>,
    );
    expect(screen.getByRole('status', { name: '魔王倒數' }).textContent).toBe('魔王出現還差 40 隻');
    const before = commits;
    act(() => rt.set({ revision: 2 }));
    act(() => rt.set({ game: { inventory: { 'el:fire:1': 3 } } }));
    expect(commits).toBe(before);
    act(() => rt.set({ game: { zoneKills: { mist_meadow: 1 } } }));
    expect(commits).toBe(before + 1);
  });
});
