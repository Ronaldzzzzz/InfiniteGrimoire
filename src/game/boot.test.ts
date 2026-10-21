import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, NetworkError } from './api';
import { classifyBootError } from './boot';

describe('classifyBootError', () => {
  it('only AuthError is auth', () => {
    expect(classifyBootError(new AuthError('x'))).toBe('auth');
    expect(classifyBootError(new NetworkError('x'))).toBe('retry');
    expect(classifyBootError(new ApiError('x', 400))).toBe('retry');
    expect(classifyBootError(new Error('x'))).toBe('retry');
  });
});
