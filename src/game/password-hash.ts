import { usernameKey } from '../engine/account-rules';

/**
 * The slow part of password hashing runs in the browser, so the Worker stays far below the free
 * plan's 10 ms CPU limit. The password itself never leaves the browser; the server HMACs this value.
 */
export const CLIENT_PBKDF2_ITERATIONS = 300_000;

/** Fixed per-account salt, so no extra round trip is needed before hashing. */
export function passwordSalt(username: string): string {
  return `infinite-grimoire:v1:${usernameKey(username)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function clientPasswordHash(username: string, password: string, iterations = CLIENT_PBKDF2_ITERATIONS): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(passwordSalt(username)), iterations },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}
