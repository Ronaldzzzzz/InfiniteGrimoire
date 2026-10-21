export interface PerfSummary {
  fps: number;
  worstMs: number;
  commitsPerSec: number;
  longTasks: number;
  longestTaskMs: number;
}

/** Rolling-window frame / React-commit statistics for the dev-only perf meter. */
export class FrameStats {
  private frames: { t: number; dt: number }[] = [];
  private commits: number[] = [];
  private longCount = 0;
  private longest = 0;

  constructor(private readonly windowMs = 1000) {}

  frame(now: number, dtMs: number): void {
    this.frames.push({ t: now, dt: dtMs });
    this.trim(now);
  }

  commit(now: number): void {
    this.commits.push(now);
    this.trim(now);
  }

  longTask(durationMs: number): void {
    this.longCount++;
    this.longest = Math.max(this.longest, durationMs);
  }

  summary(now: number): PerfSummary {
    this.trim(now);
    const k = 1000 / this.windowMs;
    return {
      fps: Math.round(this.frames.length * k),
      worstMs: Math.round(this.frames.reduce((m, f) => Math.max(m, f.dt), 0)),
      commitsPerSec: Math.round(this.commits.length * k),
      longTasks: this.longCount,
      longestTaskMs: Math.round(this.longest),
    };
  }

  private trim(now: number): void {
    const min = now - this.windowMs;
    while (this.frames.length > 0 && this.frames[0]!.t <= min) this.frames.shift();
    while (this.commits.length > 0 && this.commits[0]! <= min) this.commits.shift();
  }
}

export const perfStats = new FrameStats();
