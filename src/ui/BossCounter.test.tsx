// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { BossCounter } from './BossCounter';
import { fakeRuntime } from './test-runtime';

afterEach(cleanup);

describe('BossCounter', () => {
  it('renders nothing now that bosses close a zone\'s last stage', () => {
    const rt = fakeRuntime({ currentZone: 'mist_meadow' });
    const { container } = render(<BossCounter runtime={rt} content={content} />);
    expect(container.innerHTML).toBe('');
  });
});
