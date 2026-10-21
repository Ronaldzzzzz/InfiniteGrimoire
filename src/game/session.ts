export const TOKEN_KEY = 'infinite-grimoire.token';

export function readToken(storage: Storage | null): string | null {
  try {
    return storage ? storage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function writeToken(storage: Storage | null, token: string): boolean {
  try {
    if (!storage) return false;
    storage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}
