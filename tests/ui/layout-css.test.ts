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

describe('magic circle parchment', () => {
  it('marks a clashing wire in red', () => {
    expect(rule(css, '.parchment-svg .wire.clash')).toMatch(/stroke:\s*#b0331d/);
  });
  it('lets the rune band take taps through the pointer-less svg', () => {
    expect(rule(css, '.parchment-svg .rune-band .hit')).toMatch(/pointer-events:\s*stroke/);
  });
});

describe('magic circle effects', () => {
  /** every `@media (prefers-reduced-motion: reduce)` block, concatenated */
  const reduced = (() => {
    let out = '';
    let from = 0;
    for (;;) {
      const at = css.indexOf('@media (prefers-reduced-motion: reduce)', from);
      if (at < 0) return out;
      let depth = 0;
      const open = css.indexOf('{', at);
      let i = open;
      for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) break;
      }
      out += css.slice(open + 1, i);
      from = i;
    }
  })();
  it('turns the circle animations off for reduced motion', () => {
    for (const sel of ['.burnt', '.shake', '.success', '.rune-band', '.light-pillar']) {
      const hit = reduced.split('}').find((r) => r.includes(sel) && /animation:\s*none/.test(r));
      expect(hit, `${sel} in reduced motion`).toBeTruthy();
    }
  });
  it('reduced motion also stops the charging spin and line light-up (their selectors are more specific)', () => {
    for (const sel of ['.parchment.charging .parchment-svg .rune-band', '.parchment.charging .parchment-svg .draw']) {
      const hit = reduced.split('}').find((r) => r.includes(sel) && /animation:\s*none/.test(r));
      expect(hit, sel).toBeTruthy();
      expect(hit!.split('{')[0]).toContain(sel);
    }
  });
  it('a chosen rune band glows gently at rest', () => {
    const r = rule(css, '.parchment-svg .rune-band.filled');
    expect(r).toMatch(/drop-shadow/);
    expect(r).toMatch(/animation:\s*circle-rune-glow/);
  });
  it('the rare charge dims the page behind the sheet', () => {
    expect(rule(css, '.rare-dim')).toMatch(/position:\s*fixed/);
    expect(rule(css, '.rare-dim')).toMatch(/pointer-events:\s*none/);
    expect(rule(css, '.parchment-sheet.rare')).toMatch(/z-index/);
  });
});

describe('study desk and parchment sheet', () => {
  const body = (sel: string) => css.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.:()]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  it('the workbench has the desk art on top of a fallback wood look', () => {
    const r = body('.workbench');
    expect(body('.workbench.has-desk')).toContain('url("/assets/desk.webp")');
    expect(r).not.toContain('desk.webp');
    expect(r).toMatch(/repeating-linear-gradient/);
    expect(r).toMatch(/radial-gradient/);
  });
  it('the sheet shows the parchment art once loaded', () => {
    expect(body('.parchment-sheet.has-art')).toContain('url("/assets/parchment.webp")');
  });
  it('without the art the sheet is a torn paper stand-in', () => {
    expect(body('.parchment-sheet:not(.has-art)')).toMatch(/clip-path:\s*polygon/);
  });
  it('the circle stays square on a portrait sheet', () => {
    expect(body('.parchment-sheet')).toMatch(/aspect-ratio:\s*4\s*\/\s*5/);
    expect(body('.parchment')).toMatch(/aspect-ratio:\s*1/);
  });
});

describe('phone node card', () => {
  it('the <=600px .node-card override comes after the base rule, so it wins', () => {
    const { at } = media(600);
    const overrides = [...css.matchAll(/\.node-card \{[^}]*max-height: 70%/g)].map((m) => m.index!);
    expect(overrides.length).toBeGreaterThan(0);
    const base = css.search(/^\.node-card \{/m);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(Math.min(...overrides)).toBeGreaterThan(base);
    expect(Math.min(...overrides)).toBeGreaterThan(at);
  });
});

describe('final fix wave css', () => {
  const blockOf = (selector: string): string => {
    const at = css.search(new RegExp(`^${selector.replace(/[.:()]/g, '\\$&')} \\{`, 'm'));
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };
  it('the grade wheel text scales with the parchment so three lines fit a phone item', () => {
    expect(blockOf('.ring-picker .ring-item')).toMatch(/font-size:\s*clamp\(8px,\s*3\.4cqi,\s*11px\)/);
    expect(blockOf('.parchment')).toMatch(/container-type:\s*inline-size/);
  });
  it('the circle stays inside the paper so Lv.10 ring-2 slots are not clipped', () => {
    expect(blockOf('.parchment')).toMatch(/width:\s*76%/);
  });
  it('the placeholder paper fits the panel', () => {
    expect(blockOf('.parchment-sheet:not(.has-art)')).toMatch(/width:\s*min\(100%,\s*52vh\)/);
  });
  it('on phones the banner and equip toasts move off the result and prediction, after the base rules', () => {
    const banner = css.search(/\.discovery-banner \{ top: 28%; \}/);
    expect(banner).toBeGreaterThan(css.search(/^\.discovery-banner \{/m));
    const toast = css.search(/\.strip-float \.equip-toasts \{ position: fixed; top: 112px/);
    expect(toast).toBeGreaterThan(css.search(/^\.strip-float \.key-bar, \.strip-float \.equip-toasts/m));
    expect(css.lastIndexOf('@media (max-width: 600px)', banner)).toBeGreaterThan(css.lastIndexOf('}\n', banner - 200));
  });
  it('reduced motion hides the light pillar', () => {
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .parchment-svg .draw'));
    expect(rm.slice(0, rm.indexOf('\n}\n'))).toMatch(/\.light-pillar \{ display: none; \}/);
  });
});
