import { Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { createRng, type Rng } from '../engine/rng';
import { MUTATION_MS, PAUSE_MS, type CircleFxApi, type RevealKind } from '../ui/circle-reveal';
import { COLORS } from './palette';

/**
 * The particle layer over the parchment (spec 2026-11-03 polish 2, 2.2–2.4): a transparent Pixi canvas on the sheet that
 * only runs during a charge and its reveal. The particle model (FxSim, step) is plain TypeScript so it is tested without
 * Pixi; CircleFx draws it with a pool of sprites sharing one soft-dot texture.
 */

/** particles alive at once (placeholder); counted apart from the battle's MAX_ACTIVE_FX */
export const CIRCLE_FX_MAX = 400;
export const GOLD = COLORS.amber;
const PALE_GOLD = '#fff3c4';
/** gold reads poorly on the light parchment; a deeper gold gives the charge some contrast */
export const DEEP_GOLD = '#c8861a';
const WHITE = '#ffffff';
const PURPLE = '#b46cff';
const SMOKE = ['#1e1b18', '#3a3632', '#55504a'];
const ASH = ['#8a857e', '#b5afa6', '#6e6963'];
/** stop(): the particles fade over this long, then the layer is idle */
const FADE_MS = 300;
/** fail: the ash starts falling this long after the smoke */
const ASH_DELAY_MS = 400;
const RING_N = 60;
const DOT_PX = 16;

export interface Particle {
  x: number; y: number;
  /** px per second */
  vx: number; vy: number;
  /** px per second² */
  ax: number; ay: number;
  /** velocity kept per second is e^-drag */
  drag: number;
  age: number; life: number;
  /** radius in px; grows by `grow` px per second */
  size: number; grow: number;
  color: string;
  alpha: number;
  /** light (sparks) or matter (smoke, ash); both draw with normal blending, since additive light vanishes on the pale sheet */
  glow: boolean;
}

/** Advances every particle by dt ms and returns the survivors (updated in place; no other state). */
export function step(ps: Particle[], dt: number): Particle[] {
  const s = dt / 1000;
  const out: Particle[] = [];
  for (const p of ps) {
    p.age += dt;
    if (p.age >= p.life) continue;
    p.vx += p.ax * s;
    p.vy += p.ay * s;
    if (p.drag > 0) {
      const k = Math.exp(-p.drag * s);
      p.vx *= k;
      p.vy *= k;
    }
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.size = Math.max(0.5, p.size + p.grow * s);
    out.push(p);
  }
  return out;
}

export interface FxGeometry {
  /** the sheet */
  w: number; h: number;
  /** the circle's centre and radius in sheet px */
  cx: number; cy: number; r: number;
}

/** The overlay's particle model: charge emission, freeze, the five reveals, the fade. Time is its own (update dt). */
export class FxSim {
  ps: Particle[] = [];
  /** particles ever spawned (tests read the density) */
  spawned = 0;
  private g: FxGeometry = { w: 1, h: 1, cx: 0.5, cy: 0.5, r: 1 };
  private colours: string[] = [GOLD];
  private charging = false;
  private chargeT = 0;
  private chargeMs = 3000;
  private carry = 0;
  private frozen = false;
  private fading = -1;
  private time = 0;
  private pending: { at: number; run: () => void }[] = [];

  constructor(private readonly rng: Rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0)) {}

  setGeometry(g: FxGeometry): void {
    this.g = g;
  }

  /** anything to draw, emit or wait for */
  get active(): boolean {
    return this.charging || this.ps.length > 0 || this.pending.length > 0;
  }

  charge(colours: string[], ms: number): void {
    this.reset();
    this.colours = colours.length > 0 ? colours : [GOLD];
    this.charging = true;
    this.chargeT = 0;
    this.chargeMs = Math.max(1, ms);
  }

  /** the reply is late: everything stays where it is */
  hold(): void {
    this.frozen = true;
    this.charging = false;
  }

  reveal(kind: RevealKind): void {
    this.charging = false;
    this.frozen = false;
    this.fading = -1;
    this.pending = [];
    const { cx, cy } = this.g;
    const R = this.radius();
    if (kind === 'mutation') {
      // the light is pulled back in, then bursts
      const v = R * 1.6;
      for (const p of this.ps) this.aimAtCentre(p, v);
      for (let i = 0; i < RING_N; i++) {
        const a = (i / RING_N) * Math.PI * 2;
        const p = this.add({ x: cx + Math.cos(a) * R * 1.1, y: cy + Math.sin(a) * R * 1.1, color: i % 2 ? PURPLE : this.pick(this.colours), size: 2.5, glow: true });
        if (p) this.aimAtCentre(p, v * 0.8);
      }
      this.later(MUTATION_MS, () => this.ring(RING_N * 2, R * 1.4, [PURPLE, WHITE, ...this.colours], 1300));
      return;
    }
    this.ps = [];
    if (kind === 'success') this.ring(RING_N, R * 1.1, [GOLD, DEEP_GOLD, PALE_GOLD], 1000);
    else if (kind === 'learned') {
      this.ring(RING_N, R * 1.1, [GOLD, DEEP_GOLD, PALE_GOLD], 1000);
      this.ring(RING_N, R * 0.8, this.colours, 1100);
    } else if (kind === 'great') this.fountain(RING_N * 2);
    else this.smoke();
  }

  /** refused, failed or unmounted: fade out, cancel what was scheduled */
  stop(): void {
    this.charging = false;
    this.frozen = false;
    this.pending = [];
    if (this.ps.length > 0 && this.fading < 0) this.fading = 0;
  }

  update(dt: number): void {
    this.time += dt;
    const due = this.pending.filter((e) => e.at <= this.time);
    if (due.length) {
      this.pending = this.pending.filter((e) => e.at > this.time);
      for (const e of due) e.run();
    }
    if (this.fading >= 0) {
      this.fading += dt;
      const k = Math.max(0, 1 - this.fading / FADE_MS);
      if (k === 0) {
        this.ps = [];
        this.fading = -1;
        return;
      }
      for (const p of this.ps) p.alpha = Math.min(p.alpha, k);
      this.ps = step(this.ps, dt);
      return;
    }
    if (this.charging) {
      this.chargeT += dt;
      // the last PAUSE_MS of the charge is the pause: the particles stop where they are
      if (this.chargeT >= this.chargeMs - PAUSE_MS) {
        this.charging = false;
        this.frozen = true;
      } else this.emit(dt);
    }
    if (this.frozen) return;
    this.ps = step(this.ps, dt);
  }

  private reset(): void {
    this.ps = [];
    this.pending = [];
    this.frozen = false;
    this.fading = -1;
    this.carry = 0;
  }

  private radius(): number {
    return Math.max(this.g.r, 40);
  }

  private pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.rng.next() * xs.length)]!;
  }

  private range(a: number, b: number): number {
    return a + this.rng.next() * (b - a);
  }

  private later(ms: number, run: () => void): void {
    this.pending.push({ at: this.time + ms, run });
  }

  private add(p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'color'>): Particle | null {
    if (this.ps.length >= CIRCLE_FX_MAX) return null;
    const full: Particle = { vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, age: 0, life: 1000, size: 2, grow: 0, alpha: 1, glow: true, ...p };
    this.ps.push(full);
    this.spawned++;
    return full;
  }

  /** straight at the centre, dying as it arrives (it melts into the orb) */
  private aimAtCentre(p: Particle, v: number): void {
    const dx = this.g.cx - p.x, dy = this.g.cy - p.y;
    const d = Math.hypot(dx, dy) || 1;
    p.vx = (dx / d) * v;
    p.vy = (dy / d) * v;
    p.ax = p.ay = p.drag = 0;
    p.age = 0;
    p.life = Math.max(16, (0.95 * d * 1000) / v);
  }

  /** charge: from the sheet's edges toward the centre, denser and faster as it fills */
  private emit(dt: number): void {
    const f = Math.min(1, this.chargeT / this.chargeMs);
    const rate = 40 + 260 * f * f; // per second
    this.carry += (rate * dt) / 1000;
    const { w, h } = this.g;
    const v = this.radius() * (0.6 + 1.4 * f);
    while (this.carry >= 1) {
      this.carry -= 1;
      // a random point on the sheet's edge
      const t = this.rng.next() * 2 * (w + h);
      const [x, y] = t < w ? [t, 0] : t < w + h ? [w, t - w] : t < 2 * w + h ? [t - w - h, h] : [0, t - 2 * w - h];
      const gold = this.rng.next() < 1 / 3;
      const p = this.add({ x, y, color: gold ? this.pick([GOLD, DEEP_GOLD]) : this.pick(this.colours), size: this.range(2.5, 4.5), alpha: this.range(0.7, 1) });
      if (p) this.aimAtCentre(p, v * this.range(0.85, 1.15));
    }
  }

  /** a ring of n bursting outward from the centre */
  private ring(n: number, v: number, colours: readonly string[], life: number): void {
    const { cx, cy } = this.g;
    for (let i = 0; i < n; i++) {
      const a = ((i + this.range(-0.3, 0.3)) / n) * Math.PI * 2;
      const s = v * this.range(0.8, 1.25);
      this.add({
        // a hair off the centre, so every particle already lies along its way out
        x: cx + Math.cos(a) * 2, y: cy + Math.sin(a) * 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 1.4,
        life: life * this.range(0.8, 1.1), size: this.range(3, 5), color: this.pick(colours),
      });
    }
  }

  /** great: up like a fountain, then back down */
  private fountain(n: number): void {
    const { cx, cy } = this.g;
    const R = this.radius();
    for (let i = 0; i < n; i++) {
      this.add({
        x: cx + this.range(-R * 0.1, R * 0.1), y: cy,
        vx: this.range(-R * 0.45, R * 0.45), vy: -R * this.range(1.6, 2.2), ay: R * 2.2,
        life: this.range(1600, 2000), size: this.range(3, 5), color: this.pick([WHITE, PALE_GOLD, GOLD]),
      });
    }
  }

  /** fail: ink smoke rises, then grey ash drifts down for about 1.5 s */
  private smoke(): void {
    const { cx, cy } = this.g;
    const R = this.radius();
    for (let i = 0; i < 50; i++) {
      this.add({
        x: cx + this.range(-R * 0.2, R * 0.2), y: cy + this.range(-R * 0.1, R * 0.1),
        vx: this.range(-R * 0.15, R * 0.15), vy: -R * this.range(0.25, 0.5), drag: 0.6,
        life: this.range(1000, 1400), size: this.range(3, 5), grow: 6, color: this.pick(SMOKE), alpha: this.range(0.35, 0.6), glow: false,
      });
    }
    this.later(ASH_DELAY_MS, () => {
      for (let i = 0; i < 50; i++) {
        this.add({
          x: cx + this.range(-R, R), y: cy - R * this.range(0.3, 0.9),
          vx: this.range(-R * 0.08, R * 0.08), vy: R * this.range(0.08, 0.2), ay: R * 0.05,
          life: this.range(1400, 1600), size: this.range(1.2, 2.4), color: this.pick(ASH), alpha: this.range(0.5, 0.85), glow: false,
        });
      }
    });
  }
}

const hex = (c: string): number => Number.parseInt(c.slice(1), 16);

/**
 * The Pixi canvas over the sheet. Construct it on the first charge (not at mount); if Pixi cannot start (no WebGL) it
 * stays a silent no-op and only the CSS part of the show plays.
 */
export class CircleFx implements CircleFxApi {
  private app: Application | null = null;
  private failed = false;
  private destroyed = false;
  private readonly sim = new FxSim();
  private readonly layer = new Container();
  private readonly sprites: Sprite[] = [];
  private tex: Texture | null = null;

  constructor(private readonly host: HTMLElement) {
    this.init().catch(() => {
      this.failed = true;
    });
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0, resizeTo: this.host, antialias: false, autoStart: false,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    try {
      const style = app.canvas.style;
      style.position = 'absolute';
      style.inset = '0';
      style.width = '100%';
      style.height = '100%';
      style.pointerEvents = 'none';
      this.host.appendChild(app.canvas);
      const dot = new Graphics()
        .circle(DOT_PX / 2, DOT_PX / 2, DOT_PX / 2).fill({ color: 0xffffff, alpha: 0.25 })
        .circle(DOT_PX / 2, DOT_PX / 2, DOT_PX / 3).fill({ color: 0xffffff, alpha: 0.6 })
        .circle(DOT_PX / 2, DOT_PX / 2, DOT_PX / 5).fill(0xffffff);
      this.tex = app.renderer.generateTexture(dot);
      dot.destroy();
      app.stage.addChild(this.layer);
      app.ticker.add((t) => this.frame(t.deltaMS));
    } catch (e) {
      // a half-built overlay must not stay on the page
      app.canvas.remove();
      app.destroy(true, { children: true });
      throw e;
    }
    this.app = app;
    this.wake();
  }

  charge(colours: string[], ms: number): void {
    if (this.dead()) return;
    this.measure();
    this.sim.charge(colours, ms);
    this.wake();
  }

  hold(): void {
    if (this.dead()) return;
    this.sim.hold();
  }

  reveal(kind: RevealKind): void {
    if (this.dead()) return;
    this.measure();
    this.sim.reveal(kind);
    this.wake();
  }

  stop(): void {
    if (this.dead()) return;
    this.sim.stop();
    this.wake();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.tex?.destroy(true);
      this.app = null;
    }
  }

  private dead(): boolean {
    return this.failed || this.destroyed;
  }

  /** the sheet's size and the circle's centre, from the `.parchment` beside the host */
  private measure(): void {
    const box = this.host.getBoundingClientRect();
    const circle = this.host.parentElement?.querySelector('.parchment')?.getBoundingClientRect();
    const w = box.width || 1, h = box.height || 1;
    if (circle && circle.width > 0) {
      this.sim.setGeometry({
        w, h, cx: circle.left - box.left + circle.width / 2, cy: circle.top - box.top + circle.height / 2, r: circle.width * 0.4,
      });
    } else this.sim.setGeometry({ w, h, cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.3 });
  }

  private wake(): void {
    if (this.app && this.sim.active && !this.app.ticker.started) this.app.ticker.start();
  }

  private frame(dt: number): void {
    const app = this.app;
    if (!app) return;
    // clamp a long stall, but not so tightly that a slow device falls behind the CSS charge
    this.sim.update(Math.min(dt, 100));
    const ps = this.sim.ps;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      let s = this.sprites[i];
      if (!s) {
        s = new Sprite(this.tex!);
        s.anchor.set(0.5);
        this.sprites.push(s);
        this.layer.addChild(s);
      }
      s.visible = true;
      s.position.set(p.x, p.y);
      s.scale.set((p.size * 2) / DOT_PX);
      s.tint = hex(p.color);
      s.alpha = p.alpha * (1 - Math.max(0, (p.age - p.life * 0.7) / (p.life * 0.3)));
    }
    for (let i = ps.length; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
    if (!this.sim.active) {
      // clear the last frame, then sleep until the next charge
      app.render();
      app.ticker.stop();
    }
  }
}
