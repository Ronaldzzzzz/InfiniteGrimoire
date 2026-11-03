import { describe, expect, it } from 'vitest';
import { content } from '../engine/content';
import { MUTATION_MS, PAUSE_MS, PROGRESS_MS, RARE_PROGRESS_MS, revealKindOf } from './circle-reveal';

const FIREBALL = 'm:fire.2.----f.-----.bolt';

describe('circle reveal timing and kinds', () => {
  it('charges 3 s, pauses for the last 0.3 s, mutates for the 2 s after', () => {
    expect(PROGRESS_MS).toBe(3000);
    expect(RARE_PROGRESS_MS).toBe(5000);
    expect(PAUSE_MS).toBe(300);
    expect(MUTATION_MS).toBe(2000);
  });

  it('maps a server reply to its reveal: failed, rare (mutation), learned, known (success)', () => {
    expect(revealKindOf({ kind: 'failed', form: 'bolt' }, content)).toBe('fail');
    expect(revealKindOf({ kind: 'learned', spellId: 'worldfire', form: 'bolt', rare: { first: true } }, content)).toBe('mutation');
    expect(revealKindOf({ kind: 'known', spellId: 'worldfire', form: 'bolt' }, content)).toBe('mutation');
    expect(revealKindOf({ kind: 'learned', spellId: FIREBALL, form: 'bolt' }, content)).toBe('learned');
    expect(revealKindOf({ kind: 'known', spellId: FIREBALL, form: 'bolt' }, content)).toBe('success');
  });
});
