import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// jsdom does not apply media queries, so the strip's layout rules are checked in the stylesheet itself
// (here, outside src/, because the app's tsconfig has no Node types and vitest blanks imported CSS)
const css = readFileSync(new URL('../../src/ui/App.css', import.meta.url), 'utf8');

/** The body of the first `@media (max-width: <px>px)` block and where it starts. */
function media(px: number): { body: string; at: number } {
  const at = css.indexOf(`@media (max-width: ${px}px)`);
  expect(at, `@media ${px}px`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  const open = css.indexOf('{', at);
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return { body: css.slice(open + 1, i), at };
  }
  throw new Error(`unclosed @media ${px}px`);
}
const rule = (body: string, selector: string): string => {
  const m = body.match(new RegExp(`(?:^|[}\\s])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  return m ? m[1]! : '';
};

describe('battle strip layout', () => {
  it('stays on screen below 1100 px, where the page scrolls: fixed to the bottom, with room left for it', () => {
    const { body } = media(1099);
    expect(rule(body, '.battle-strip')).toMatch(/position:\s*fixed/);
    expect(rule(body, '.battle-strip')).toMatch(/bottom:\s*0/);
    expect(rule(body, 'body')).toMatch(/padding-bottom:\s*180px/);
  });

  it('the phone rule (<= 600 px) comes later, so its lower strip and padding win', () => {
    const tablet = media(1099), phone = media(600);
    expect(phone.at).toBeGreaterThan(tablet.at);
    expect(rule(phone.body, '.battle-strip')).toMatch(/height:\s*140px/);
    expect(rule(phone.body, 'body')).toMatch(/padding-bottom:\s*140px/);
  });
});
