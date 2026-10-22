/** Account name / password rules shared by the worker and the browser (no DOM, no Workers APIs). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const USERNAME_CHARS = /^[\p{L}\p{N}_]+$/u;

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFKC').trim();
}

/** Comparison key: names that differ only by case or full/half width are the same account. */
export function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

export type UsernameProblem = 'length' | 'chars';

export function usernameProblem(raw: string): UsernameProblem | null {
  const name = normalizeUsername(raw);
  const len = [...name].length;
  if (len < USERNAME_MIN || len > USERNAME_MAX) return 'length';
  if (!USERNAME_CHARS.test(name)) return 'chars';
  return null;
}

export function passwordProblem(pw: string): 'length' | null {
  const len = [...pw].length;
  return len < PASSWORD_MIN || len > PASSWORD_MAX ? 'length' : null;
}
