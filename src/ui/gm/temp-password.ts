import { PASSWORD_MAX, PASSWORD_MIN } from '../../engine/account-rules';

export const TEMP_PASSWORD_LEN = 12;
// no 0 O o 1 l I: the GM reads the password out to the player
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;

if (TEMP_PASSWORD_LEN < PASSWORD_MIN || TEMP_PASSWORD_LEN > PASSWORD_MAX) throw new Error('TEMP_PASSWORD_LEN breaks the password rules');

/** Uniform integer in [0, n) from the browser's CSPRNG (rejection sampling, no modulo bias). */
function cryptoRand(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

/** A one-time password for a reset: letters and digits (at least one of each), no look-alike characters. */
export function generateTempPassword(rand: (n: number) => number = cryptoRand): string {
  const chars = [LETTERS[rand(LETTERS.length)]!, DIGITS[rand(DIGITS.length)]!];
  while (chars.length < TEMP_PASSWORD_LEN) chars.push(ALL[rand(ALL.length)]!);
  // Fisher-Yates so the guaranteed letter and digit are not always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
