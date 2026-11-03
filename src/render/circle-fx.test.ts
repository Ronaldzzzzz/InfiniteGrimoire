// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../engine/rng';
import { MUTATION_MS, PAUSE_MS } from '../ui/circle-reveal';

// a stand-in for Pixi: the overlay's ticker, stage and sprites, with a switch to make init fail
const pixi = vi.hoisted(() => {
  const state = { fail: false, failTexture: false, apps: [] as any[] };
  class Ticker {
    fns: ((t: { deltaMS: number }) => void)[] = [];
    started = false;
    add(fn: (t: { deltaMS: number }) => void) { this.fns.push(fn); }
    start() { this.started = true; }
    stop() { this.started = false; }
    tick(ms: number) { if (this.started) for (const f of this.fns) f({ deltaMS: ms }); }
  }
  class Node {
    children: unknown[] = [];
    visible = true; alpha = 1; tint: unknown = 0xffffff; blendMode = 'normal';
    position = { set: (x: number, y: number) => { (this as any).x = x; (this as any).y = y; } };
    scale = { set: () => {} };
    anchor = { set: () => {} };
    addChild(...c: unknown[]) { this.children.push(...c); }
    destroy() {}
  }
  class Graphics extends Node {
    circle() { return this; }
    fill() { return this; }
  }
  class Application {
    ticker = new Ticker();
    stage = new Node();
    canvas = document.createElement('canvas');
    renderer = { generateTexture: () => { if (state.failTexture) throw new Error('texture'); return { destroy() {} }; } };
    initOpts: unknown = null;
    render = vi.fn();
    destroyed = false;
    constructor() { state.apps.push(this); }
    async init(o: unknown) {
      this.initOpts = o;
      if (state.fail) throw new Error('no WebGL');
    }
    destroy() { this.destroyed = true; }
  }
  return { state, Application, Container: Node, Graphics, Sprite: Node, Texture: class {} };
});
vi.mock('pixi.js', () => ({
  Application: pixi.Application, Container: pixi.Container, Graphics: pixi.Graphics, Sprite: pixi.Sprite, Texture: pixi.Texture,
}));

const { CIRCLE_FX_MAX, CircleFx, DEEP_GOLD, FxSim, GOLD, step } = await import('./circle-fx');
type P = InstanceType<typeof FxSim>['ps'][number];

const GEO = { w: 400, h: 500, cx: 200, cy: 230, r: 150 };
const COLS = ['#ff0000', '#0000ff'];
const sim = (): InstanceType<typeof FxSim> => {
  const s = new FxSim(createRng(7));
  s.setGeometry(GEO);
  return s;
};
const run = (s: InstanceType<typeof FxSim>, ms: number, dt = 16): void => {
  for (let t = 0; t < ms; t += dt) s.update(Math.min(dt, ms - t));
};
const towardCentre = (p: P): number => (GEO.cx - p.x) * p.vx + (GEO.cy - p.y) * p.vy;
const speed = (p: P): number => Math.hypot(p.vx, p.vy);
const snap = (s: InstanceType<typeof FxSim>): string => s.ps.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';');

describe('step', () => {
  it('moves by velocity, applies gravity and drag, ages and drops the dead', () => {
    const base = { size: 2, grow: 0, color: '#fff', alpha: 1, glow: true };
    const ps: P[] = [
      { ...base, x: 0, y: 0, vx: 100, vy: 0, ax: 0, ay: 50, drag: 0, age: 0, life: 1000 },
      { ...base, x: 0, y: 0, vx: 100, vy: 0, ax: 0, ay: 0, drag: 2, age: 0, life: 1000 },
      { ...base, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, age: 990, life: 1000 },
    ];
    const out = step(ps, 100);
    expect(out).toHaveLength(2);
    expect(out[0]!.x).toBeCloseTo(10);
    expect(out[0]!.vy).toBeCloseTo(5);
    expect(out[0]!.age).toBe(100);
    expect(out[1]!.vx).toBeLessThan(100);
  });
});

describe('FxSim', () => {
  it('charge draws particles inward in the circle colours plus gold', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 1000);
    expect(s.ps.length).toBeGreaterThan(10);
    for (const p of s.ps) {
      expect(towardCentre(p)).toBeGreaterThan(0);
      expect([...COLS, GOLD, DEEP_GOLD]).toContain(p.color);
    }
    expect(s.ps.some((p) => p.color === GOLD || p.color === DEEP_GOLD)).toBe(true);
    expect(s.ps.some((p) => COLS.includes(p.color))).toBe(true);
  });

  it('charge density and speed rise over ms', () => {
    const s = sim();
    s.charge(COLS, 3000);
    const n0 = s.spawned;
    run(s, 500);
    const early = s.spawned - n0;
    const earlySpeed = s.ps.reduce((a, p) => a + speed(p), 0) / s.ps.length;
    run(s, 1500); // now at 2000
    const n1 = s.spawned;
    run(s, 500);
    const late = s.spawned - n1;
    const fresh = s.ps.filter((p) => p.age < 300);
    const lateSpeed = fresh.reduce((a, p) => a + speed(p), 0) / fresh.length;
    expect(late).toBeGreaterThan(early * 2);
    expect(lateSpeed).toBeGreaterThan(earlySpeed * 1.5);
  });

  it('the last PAUSE_MS of the charge freezes the particles', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 3000 - PAUSE_MS + 20);
    const before = snap(s);
    expect(s.ps.length).toBeGreaterThan(0);
    run(s, 200);
    expect(snap(s)).toBe(before);
  });

  it('hold freezes the particles until the reveal', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 1500);
    s.hold();
    const before = snap(s);
    run(s, 1000);
    expect(snap(s)).toBe(before);
    expect(s.active).toBe(true);
    s.reveal('success');
    run(s, 50);
    expect(snap(s)).not.toBe(before);
  });

  it('never holds more than CIRCLE_FX_MAX particles', () => {
    const s = sim();
    s.charge(COLS, 3000);
    let peak = 0;
    for (let t = 0; t < 3000; t += 16) { s.update(16); peak = Math.max(peak, s.ps.length); }
    for (const k of ['great', 'learned', 'great', 'mutation', 'learned', 'fail'] as const) {
      s.reveal(k);
      for (let t = 0; t < 200; t += 16) { s.update(16); peak = Math.max(peak, s.ps.length); }
    }
    s.reveal('mutation');
    for (let t = 0; t < MUTATION_MS + 200; t += 16) { s.update(16); peak = Math.max(peak, s.ps.length); }
    expect(peak).toBeLessThanOrEqual(CIRCLE_FX_MAX);
    expect(CIRCLE_FX_MAX).toBe(400);
  });

  it('success bursts a gold ring outward', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 3000);
    s.reveal('success');
    expect(s.ps.length).toBeGreaterThanOrEqual(40);
    for (const p of s.ps) {
      expect(towardCentre(p)).toBeLessThan(0);
      expect([GOLD, DEEP_GOLD, '#fff3c4']).toContain(p.color);
    }
    // all directions: some go left, right, up and down
    expect(s.ps.some((p) => p.vx > 0) && s.ps.some((p) => p.vx < 0) && s.ps.some((p) => p.vy > 0) && s.ps.some((p) => p.vy < 0)).toBe(true);
  });

  it('learned is the gold ring plus an element-colour ring, twice the count', () => {
    const a = sim();
    a.charge(COLS, 3000);
    a.reveal('success');
    const b = sim();
    b.charge(COLS, 3000);
    b.reveal('learned');
    expect(b.ps.length).toBe(a.ps.length * 2);
    expect(b.ps.some((p) => COLS.includes(p.color))).toBe(true);
    expect(b.ps.some((p) => p.color === GOLD || p.color === DEEP_GOLD)).toBe(true);
    for (const p of b.ps) expect(towardCentre(p)).toBeLessThan(0);
  });

  it('great is a white-gold fountain that rises and falls back', () => {
    const s = sim();
    s.charge(COLS, 3000);
    s.reveal('great');
    expect(s.ps.length).toBeGreaterThanOrEqual(60);
    expect(s.ps.every((p) => p.vy < 0)).toBe(true);
    expect(s.ps.some((p) => p.color === '#ffffff')).toBe(true);
    run(s, 1200);
    expect(s.ps.length).toBeGreaterThan(0);
    expect(s.ps.filter((p) => p.vy > 0).length).toBeGreaterThan(s.ps.length / 2);
  });

  it('fail: grey smoke rises, then ash falls for about 1.5 s', () => {
    const s = sim();
    s.charge(COLS, 3000);
    s.reveal('fail');
    expect(s.ps.length).toBeGreaterThan(20);
    for (const p of s.ps) {
      expect(p.vy).toBeLessThan(0);
      expect(p.glow).toBe(false);
      expect(COLS).not.toContain(p.color);
    }
    run(s, 600);
    const ash = s.ps.filter((p) => p.vy > 0);
    expect(ash.length).toBeGreaterThan(20);
    run(s, 900);
    expect(s.ps.some((p) => p.vy > 0)).toBe(true);
    run(s, 1500);
    expect(s.active).toBe(false);
  });

  it('mutation pulls inward, then bursts at MUTATION_MS', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 2000);
    s.reveal('mutation');
    expect(s.ps.length).toBeGreaterThan(0);
    for (const p of s.ps) expect(towardCentre(p)).toBeGreaterThan(0);
    run(s, MUTATION_MS - 50);
    expect(s.ps.filter((p) => towardCentre(p) < 0)).toHaveLength(0);
    run(s, 100);
    const out = s.ps.filter((p) => towardCentre(p) < 0);
    expect(out.length).toBeGreaterThanOrEqual(60);
    expect(out.some((p) => p.color === '#b46cff')).toBe(true);
  });

  it('stop fades the particles out over about 300 ms and cancels what was scheduled', () => {
    const s = sim();
    s.charge(COLS, 3000);
    run(s, 1000);
    s.reveal('mutation');
    s.stop();
    run(s, 150);
    expect(s.ps.length).toBeGreaterThan(0);
    expect(Math.max(...s.ps.map((p) => p.alpha))).toBeLessThan(0.7);
    run(s, 200);
    expect(s.ps).toHaveLength(0);
    expect(s.active).toBe(false);
    run(s, MUTATION_MS);
    expect(s.ps).toHaveLength(0);
  });

  it('is idle once every particle has died', () => {
    const s = sim();
    expect(s.active).toBe(false);
    s.charge(COLS, 3000);
    expect(s.active).toBe(true);
    s.reveal('success');
    run(s, 3000);
    expect(s.active).toBe(false);
  });
});

describe('CircleFx', () => {
  afterEach(() => {
    pixi.state.fail = false;
    pixi.state.failTexture = false;
    pixi.state.apps.length = 0;
    document.body.innerHTML = '';
  });
  const host = (): HTMLElement => {
    const sheet = document.createElement('div');
    const h = document.createElement('div');
    sheet.appendChild(h);
    document.body.appendChild(sheet);
    return h;
  };
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('a transparent canvas over the host that ignores the pointer; the ticker runs only while particles live', async () => {
    const h = host();
    const fx = new CircleFx(h);
    await flush();
    const app = pixi.state.apps[0];
    expect(app.initOpts).toMatchObject({ backgroundAlpha: 0, resizeTo: h });
    expect(app.canvas.style.pointerEvents).toBe('none');
    expect(app.ticker.started).toBe(false);
    fx.charge(COLS, 3000);
    expect(app.ticker.started).toBe(true);
    fx.reveal('success');
    for (let t = 0; t < 3000; t += 16) app.ticker.tick(16);
    expect(app.ticker.started).toBe(false);
    fx.destroy();
    expect(app.destroyed).toBe(true);
  });

  it('sharp on a dense screen: resolution follows devicePixelRatio with autoDensity', async () => {
    new CircleFx(host());
    await flush();
    expect(pixi.state.apps[0].initOpts).toMatchObject({ resolution: window.devicePixelRatio || 1, autoDensity: true });
  });

  it('a throw after init destroys the app and removes the canvas', async () => {
    pixi.state.failTexture = true;
    const h = host();
    const fx = new CircleFx(h);
    await flush();
    const app = pixi.state.apps[0];
    expect(app.destroyed).toBe(true);
    expect(h.querySelector('canvas')).toBeNull();
    expect(() => { fx.charge(COLS, 3000); fx.stop(); }).not.toThrow();
  });

  it('a failed init leaves a silent no-op', async () => {
    pixi.state.fail = true;
    const err = vi.spyOn(console, 'error');
    const fx = new CircleFx(host());
    await flush();
    expect(() => {
      fx.charge(COLS, 3000);
      fx.hold();
      fx.reveal('great');
      fx.stop();
      fx.destroy();
    }).not.toThrow();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
