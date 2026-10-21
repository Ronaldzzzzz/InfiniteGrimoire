// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SaveErrorBanner } from './SaveErrorBanner';

afterEach(cleanup);

describe('SaveErrorBanner', () => {
  it('shows a non-blocking banner only while status is error', () => {
    const { rerender } = render(<SaveErrorBanner status="online" />);
    expect(screen.queryByText('存檔失敗，進度可能沒有保存，請重新整理')).toBeNull();
    rerender(<SaveErrorBanner status="error" />);
    const banner = screen.getByText('存檔失敗，進度可能沒有保存，請重新整理');
    expect(banner.closest('.save-error-banner')).toBeTruthy();
    rerender(<SaveErrorBanner status="offline" />);
    expect(screen.queryByText('存檔失敗，進度可能沒有保存，請重新整理')).toBeNull();
  });
});
