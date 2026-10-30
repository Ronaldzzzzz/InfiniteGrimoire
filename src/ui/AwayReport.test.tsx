// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../engine/content';
import type { OfflineReport } from '../game/sync';
import { AwayReport, mergeReports } from './AwayReport';

afterEach(cleanup);
const report: OfflineReport = {
  kind: 'offline', zoneId: 'mist_meadow', stage: 4, ticks: 250, runs: 12, awayMs: (2 * 60 + 5) * 60_000, capped: false, loot: { 'el:fire:1': 7 },
};

describe('AwayReport', () => {
  it('shows the copy, loot and stays until 知道了', () => {
    const onClose = vi.fn();
    const { container } = render(<AwayReport report={report} content={content} onClose={onClose} />);
    expect(screen.getByText('離開期間的收穫')).toBeTruthy();
    expect(container.textContent).toContain('離開 2 小時 5 分');
    expect(container.textContent).toContain('在 迷霧草原 1-4 刷了 12 次');
    expect(container.textContent).toContain('初階火 ×7');
    expect(container.textContent).not.toContain('已達上限');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('知道了'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('shows a share of a run with one decimal', () => {
    const { container } = render(<AwayReport report={{ ...report, runs: 0.2 }} content={content} onClose={vi.fn()} />);
    expect(container.textContent).toContain('在 迷霧草原 1-4 刷了 0.2 次');
  });
  it('shows the cap line only when capped; under an hour shows minutes only', () => {
    const { container } = render(<AwayReport report={{ ...report, capped: true, awayMs: 5 * 60_000 }} content={content} onClose={vi.fn()} />);
    expect(container.textContent).toContain('已達上限（8 小時），超過的時間不計');
    expect(container.textContent).toContain('離開 5 分');
  });
  it('merges reports: sums runs and loot, keeps the latest stage', () => {
    const m = mergeReports(report, { ...report, stage: 6, runs: 3, loot: { 'el:fire:1': 1, 'el:wind:1': 2 } });
    expect(m.runs).toBe(15);
    expect(m.stage).toBe(6);
    expect(m.loot).toEqual({ 'el:fire:1': 8, 'el:wind:1': 2 });
  });
});
