import { describe, expect, it } from 'vitest';
import { normalizeUsername, passwordProblem, usernameKey, usernameProblem } from './account-rules';

describe('username rules', () => {
  it('normalizes full-width forms and trims', () => {
    expect(normalizeUsername('  Ａｂｃ_１ ')).toBe('Abc_1');
    expect(usernameKey('  Ａｂｃ_１ ')).toBe('abc_1');
    expect(usernameKey('ABC_1')).toBe(usernameKey('abc_1'));
  });

  it('accepts letters (any script), digits and underscore, 3-20 characters', () => {
    expect(usernameProblem('艾莉亞')).toBeNull();
    expect(usernameProblem('mage_01')).toBeNull();
    expect(usernameProblem('a'.repeat(20))).toBeNull();
  });

  it('rejects bad lengths and characters', () => {
    expect(usernameProblem('ab')).toBe('length');
    expect(usernameProblem('a'.repeat(21))).toBe('length');
    expect(usernameProblem('a b c')).toBe('chars');
    expect(usernameProblem('a-b-c')).toBe('chars');
    expect(usernameProblem('mage@x')).toBe('chars');
  });
});

describe('password rules', () => {
  it('accepts 8-128 characters', () => {
    expect(passwordProblem('1234567')).toBe('length');
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('x'.repeat(128))).toBeNull();
    expect(passwordProblem('x'.repeat(129))).toBe('length');
  });
});
