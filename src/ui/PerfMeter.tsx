import { useEffect, useState } from 'react';
import { perfStats } from './perf-stats';

/** Dev-only overlay. Lives outside the <Profiler>, so its own updates are not counted as app commits. */
export function PerfMeter() {
  const [s, setS] = useState(() => perfStats.summary(performance.now()));
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const frame = (now: number): void => {
      perfStats.frame(now, now - last);
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const id = setInterval(() => setS(perfStats.summary(performance.now())), 500);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perfStats.longTask(e.duration);
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      observer = null; // longtask entries are not supported everywhere
    }
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
      observer?.disconnect();
    };
  }, []);
  return (
    <div className="perf-meter" data-testid="perf-meter">
      {s.fps} fps · 最長 {s.worstMs} ms · React {s.commitsPerSec}/s · 長任務 {s.longTasks}（最長 {s.longestTaskMs} ms）
    </div>
  );
}
