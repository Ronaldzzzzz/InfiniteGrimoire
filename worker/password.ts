import { fromBase64Url, toBase64Url } from './auth';

/**
 * PBKDF2-SHA256 via WebCrypto. 50k iterations ≈ 5 ms of CPU, which fits the Workers free plan's
 * 10 ms limit (100k ≈ 10 ms would not reliably). Hashes carry their iteration count so they can be
 * upgraded on the next successful login.
 */
export const PBKDF2_ITERATIONS = 50_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = 'pbkdf2-sha256';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

function parse(stored: string): { iterations: number; salt: Uint8Array; hash: Uint8Array } | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  try {
    const salt = fromBase64Url(parts[2]!);
    const hash = fromBase64Url(parts[3]!);
    if (salt.length !== SALT_BYTES || hash.length !== HASH_BYTES) return null;
    return { iterations, salt, hash };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  return constantTimeEqual(await derive(password, parsed.salt, parsed.iterations), parsed.hash);
}

export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.iterations < PBKDF2_ITERATIONS;
}

/** Verified against when the username does not exist, so the response time matches a wrong password. */
export const DUMMY_HASH = `${PREFIX}$${PBKDF2_ITERATIONS}$${'A'.repeat(22)}$${'A'.repeat(43)}`;
