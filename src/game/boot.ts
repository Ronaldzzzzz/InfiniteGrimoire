import { AuthError } from './api';

/** 'auth': the token is invalid, restart onboarding. 'retry': keep the token and let the player retry. */
export function classifyBootError(e: unknown): 'auth' | 'retry' {
  return e instanceof AuthError ? 'auth' : 'retry';
}
