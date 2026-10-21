import { describe, expect, it } from 'vitest';
import { FrameStats } from './perf-stats';

describe('FrameStats', () => {
  it('reports fps and the worst frame over the last second', () => {
    const s = new FrameStats();
    let t = 0;
    for (let i = 0; i < 59; i++) {
      t += 16;
      s.frame(t, 16);
    }
    t += 40;
    s.frame(t, 40);
    const r = s.summary(t);
    expect(r.fps).toBe(60);
    expect(r.worstMs).toBe(40);
  });

  it('drops samples older than the window', () => {
    const s = new FrameStats();
    s.frame(0, 100);
    s.commit(0);
    s.frame(1500, 16);
    const r = s.summary(1500);
    expect(r.fps).toBe(1);
    expect(r.worstMs).toBe(16);
    expect(r.commitsPerSec).toBe(0);
  });

  it('counts commits per second and keeps long tasks cumulative', () => {
    const s = new FrameStats();
    for (let i = 0; i < 20; i++) s.commit(i * 50);
    s.longTask(70);
    s.longTask(120);
    const r = s.summary(999);
    expect(r.commitsPerSec).toBe(20);
    expect(r.longTasks).toBe(2);
    expect(r.longestTaskMs).toBe(120);
  });

  it('returns zeros when empty', () => {
    expect(new FrameStats().summary(0)).toEqual({ fps: 0, worstMs: 0, commitsPerSec: 0, longTasks: 0, longestTaskMs: 0 });
  });
});
