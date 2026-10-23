import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../../engine/account-rules';
import { generateTempPassword, TEMP_PASSWORD_LEN } from './temp-password';

describe('generateTempPassword', () => {
  it('is 12 characters, avoids look-alikes, mixes letters and digits and passes the password rules', () => {
    expect(TEMP_PASSWORD_LEN).toBe(12);
    for (let i = 0; i < 200; i++) {
      const pw = generateTempPassword();
      expect(pw).toHaveLength(TEMP_PASSWORD_LEN);
      expect(pw).toMatch(/^[A-Za-z2-9]+$/);
      expect(pw).not.toMatch(/[0Oo1lI]/);
      expect(pw).toMatch(/[A-Za-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(passwordProblem(pw)).toBeNull();
    }
  });

  it('is reproducible with an injected random source, even a degenerate one', () => {
    const seq = (seed: number) => {
      let s = seed;
      return (n: number) => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s % n;
      };
    };
    expect(generateTempPassword(seq(7))).toBe(generateTempPassword(seq(7)));
    const zero = generateTempPassword(() => 0);
    expect(zero).toHaveLength(12);
    expect(zero).toMatch(/[A-Za-z]/);
    expect(zero).toMatch(/[0-9]/);
  });
});
