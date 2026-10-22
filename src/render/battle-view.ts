import { Application, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { bladePositions, boltTravel, ringRadius, STOP_R, type BattleEvent, type BattleState, type Foe } from '../engine/combat';
import type { Content } from '../engine/model';
import { createRng } from '../engine/rng';
import type { ElementId } from '../engine/types';
import type { Snapshot } from '../game/runtime';
import { floatTextStart, makeArena, toScreen, type Arena } from './arena';
import { floatingText, jaggedPath, type Pt } from './effects';
import { interpolate } from './motion';
import { COLORS, spellColor } from './palette';

/** Foe bodies are drawn at this size and scaled to their engine radius. */
const BODY_PX = 32;
const HERO_W = 22;
const HERO_H = 38;
const TEXT_MS = 600;
const IMMUNE_FONT_PX = 16; // fixed, readable at any arena size (spec 4.3)
const TEXT_MARGIN = 24;
/** Floating damage numbers alive at once; a crowd fight would otherwise spawn hundreds. */
const MAX_FLOAT_TEXTS = 40;

interface FoeView {
  defId: string;
  root: Container;
  body: Graphics | Sprite;
  hpBar: Graphics;
  fx: Graphics;
  born: number;
  pos: Pt;
  /** current on-screen radius */
  r: number;
  lastFrac: number;
  statusKey: string;
}

interface Effect {
  age: number;
  life: number;
  node: Container;
  text: boolean;
  update: (p: number, dtMs: number) => void;
}

const tint = (c: string): number => parseInt(c.slice(1), 16);
const colorOf = (elements: readonly ElementId[]): string => spellColor({ elements });

const DMG_FONT = 'ig-dmg';
let dmgFontInstalled = false;
function ensureDamageFont(): void {
  if (dmgFontInstalled) return;
  BitmapFont.install({
    name: DMG_FONT,
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 32, fontWeight: 'bold', fill: '#ffffff', stroke: { color: '#000000', width: 4 } },
    chars: [['0', '9']],
    resolution: 2,
  });
  dmgFontInstalled = true;
}

/**
 * Pixi view of the 2D crowd battle. Foes sit at the engine's (x, y) scaled by the arena radius and are
 * interpolated between fixed steps; running effects (ActiveFx) are redrawn every frame from the snapshot,
 * one-shot events (burst, chain, strike, hits, kills) spawn short-lived effects.
 */
export class BattleView {
  private readonly app = new Application();
  private readonly ready: Promise<void>;
  private ready_ = false;
  private destroyed = false;
  private readonly foes = new Map<number, FoeView>();
  private readonly effects: Effect[] = [];
  private readonly frameCbs = new Set<() => void>();
  private readonly rng = createRng((Date.now() ^ 0x9e3779b9) >>> 0);
  private readonly maxFoeR: number;
  private world = new Container();
  private hero: Graphics | Sprite | null = null;
  private activeFx = new Graphics();
  private fxLayer = new Container();
  private time = 0;
  private unit = 1;
  private arena: Arena = makeArena(1, 1, 0);
  private ring = new Graphics();
  private ringKey = '';
  /** engine position of each foe at the previous fixed step, for interpolation */
  private prevPos = new Map<number, Pt>();
  private lastBattle: BattleState | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly content: Content,
    private readonly textures: Map<string, Texture>,
  ) {
    this.maxFoeR = Math.max(0, ...Object.values(content.monsters).map((m) => m.radius));
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({ background: COLORS.bg, resizeTo: this.host, antialias: false });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world, this.activeFx, this.fxLayer);
    this.world.addChild(this.ring);
    this.hero = this.makeHero();
    this.world.addChild(this.hero);
    ensureDamageFont();
    this.ready_ = true;
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  /** Registers a per-frame callback (driven by Pixi's ticker). Returns an unsubscribe function. */
  onFrame(cb: () => void): () => void {
    this.frameCbs.add(cb);
    return () => void this.frameCbs.delete(cb);
  }

  private get w(): number {
    return this.app.screen.width;
  }
  private get h(): number {
    return this.app.screen.height;
  }

  private makeHero(): Graphics | Sprite {
    const tex = this.textures.get('hero_idle');
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      return s;
    }
    const g = new Graphics();
    g.rect(-HERO_W / 2, -HERO_H / 2, HERO_W, HERO_H).fill(COLORS.rune);
    g.rect(-HERO_W / 2 + 4, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    g.rect(HERO_W / 2 - 8, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    return g;
  }

  private makeFoe(f: Foe): FoeView {
    const def = Object.hasOwn(this.content.monsters, f.defId) ? this.content.monsters[f.defId] : undefined;
    const tex = this.textures.get(`monster_${f.defId}`);
    const s = BODY_PX;
    let body: Graphics | Sprite;
    if (tex) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = sp.height = s;
      body = sp;
    } else {
      const g = new Graphics();
      const color = COLORS.element[def?.element ?? 'none'];
      g.rect(-s / 2, -s / 2, s, s).fill(color);
      g.rect(-s / 2 + s * 0.2, -s * 0.2, s * 0.15, s * 0.15).fill(COLORS.bg);
      g.rect(s / 2 - s * 0.35, -s * 0.2, s * 0.15, s * 0.15).fill(COLORS.bg);
      if (def?.boss) g.rect(-s / 2, -s / 2, s, s).stroke({ width: 2, color: COLORS.amber });
      body = g;
    }
    const root = new Container();
    const hpBar = new Graphics();
    const fx = new Graphics();
    root.addChild(body, fx, hpBar);
    this.world.addChild(root);
    return { defId: f.defId, root, body, hpBar, fx, born: this.time, pos: { x: 0, y: 0 }, r: 0, lastFrac: -1, statusKey: '' };
  }

  /**
   * `alpha` (0..1) is how far the game clock is into the next fixed step; positions are interpolated between
   * the previous and current step so movement is smooth at any frame rate (the engine steps at 20 Hz).
   */
  sync(snapshot: Snapshot, alpha = 1): void {
    if (!this.ready_ || this.destroyed) return;
    const battle = snapshot.battle;
    if (battle !== this.lastBattle) {
      const last = this.lastBattle;
      this.prevPos.clear();
      // a new battle (travel / reload) restarts uids: don't interpolate from the old one
      if (last && last.zoneId === battle.zoneId && battle.nextUid >= last.nextUid) {
        for (const f of last.foes) this.prevPos.set(f.uid, { x: f.x, y: f.y });
      }
      this.lastBattle = battle;
    }
    this.unit = Math.max(0.6, Math.min(1.6, Math.min(this.w, this.h) / 360));
    const u = this.unit;
    this.arena = makeArena(this.w, this.h, this.maxFoeR);
    const c = this.arena.center;
    this.hero!.position.set(c.x, c.y);
    this.hero!.scale.set(u);
    this.drawRing();

    const alive = new Set<number>();
    for (const f of battle.foes) {
      alive.add(f.uid);
      let v = this.foes.get(f.uid);
      if (v && v.defId !== f.defId) {
        // a reused uid for a different monster: never inherit the old body
        v.root.destroy({ children: true });
        this.foes.delete(f.uid);
        v = undefined;
      }
      if (!v) {
        v = this.makeFoe(f);
        this.foes.set(f.uid, v);
      }
      const def = this.content.monsters[f.defId];
      v.r = Math.max(5, (def?.radius ?? 0.03) * this.arena.radius);
      const prev = this.prevPos.get(f.uid);
      v.pos = toScreen(this.arena, interpolate(prev?.x ?? f.x, f.x, alpha), interpolate(prev?.y ?? f.y, f.y, alpha));
      const pop = Math.min(1, (this.time - v.born) / 200);
      v.root.position.set(v.pos.x, v.pos.y);
      v.root.scale.set(((2 * v.r) / BODY_PX) * (0.4 + 0.6 * pop));
      v.root.alpha = pop;
      this.drawHp(v, f);
      this.drawStatus(v, f);
    }
    // uids restart at 1 after travel / reload, so drop views that left the field
    for (const [uid, v] of this.foes) {
      if (!alive.has(uid)) {
        v.root.destroy({ children: true });
        this.foes.delete(uid);
      }
    }
    this.drawActiveFx(battle);
  }

  /** Faint ring where foes stop; redrawn only when the view size changes. */
  private drawRing(): void {
    const key = `${this.w}x${this.h}`;
    if (key === this.ringKey) return;
    this.ringKey = key;
    this.ring.clear();
    this.ring.circle(this.arena.center.x, this.arena.center.y, STOP_R * this.arena.radius).stroke({ width: 1, color: COLORS.rune, alpha: 0.18 });
  }

  private drawHp(v: FoeView, f: Foe): void {
    const frac = Math.max(0, Math.min(1, f.hp / f.maxHp));
    if (frac === v.lastFrac) return;
    v.lastFrac = frac;
    v.hpBar.clear();
    if (frac >= 1) return; // full health: no bar, the crowd stays readable
    const w = BODY_PX;
    v.hpBar.rect(-w / 2, -BODY_PX / 2 - 9, w, 5).fill('#3a2a2a');
    v.hpBar.rect(-w / 2, -BODY_PX / 2 - 9, w * frac, 5).fill(frac > 0.35 ? COLORS.rune : '#e2643b');
  }

  private drawStatus(v: FoeView, f: Foe): void {
    const burning = f.statuses.some((s) => s.kind === 'burn');
    const flicker = burning && Math.floor(this.time / 120) % 2 === 0;
    const key = f.statuses.map((s) => s.kind).sort().join(',') + (flicker ? '*' : '');
    if (key === v.statusKey) return;
    v.statusKey = key;
    const g = v.fx;
    g.clear();
    const s = BODY_PX;
    v.body.tint = 0xffffff;
    for (const st of f.statuses) {
      switch (st.kind) {
        case 'burn':
          v.body.tint = flicker ? tint(COLORS.element.fire) : 0xffffff;
          g.rect(-s / 2, -s / 2, s, s).fill({ color: COLORS.element.fire, alpha: flicker ? 0.35 : 0.1 });
          break;
        case 'wet':
          g.rect(-s / 2 - 1, -s / 2 - 1, s + 2, s + 2).stroke({ width: 2, color: COLORS.element.water });
          break;
        case 'freeze':
          g.rect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4).stroke({ width: 2, color: '#d8f0ff' });
          g.rect(-s / 2, -s / 2, s, s).fill({ color: COLORS.element.water, alpha: 0.35 });
          break;
        case 'stun': {
          const pts = jaggedPath({ x: -s / 2, y: -s / 2 }, { x: s / 2, y: s / 2 }, 5, createRng(f.uid));
          g.moveTo(pts[0]!.x, pts[0]!.y);
          for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
          g.stroke({ width: 2, color: COLORS.element.thunder });
          break;
        }
        case 'slow':
          g.rect(-s / 2, s / 2 - 4, s, 4).fill({ color: COLORS.element.wind, alpha: 0.8 });
          break;
        case 'blind':
          g.rect(-s / 2, -s / 2, s, s).fill({ color: '#000000', alpha: 0.35 });
          break;
        case 'regen':
          g.rect(-s / 2, -s / 2, s, s).stroke({ width: 2, color: COLORS.rune });
          break;
      }
    }
  }

  /** Running effects, redrawn every frame (placeholder shapes; Task 10 brings the real visuals). */
  private drawActiveFx(battle: BattleState): void {
    const g = this.activeFx;
    g.clear();
    const a = this.arena;
    const R = a.radius;
    const u = this.unit;
    const byUid = new Map(battle.foes.map((f) => [f.uid, f]));
    for (const fx of battle.fx) {
      const color = colorOf(fx.elements);
      const e = fx.effect;
      switch (e.kind) {
        case 'bolt': {
          const travel = boltTravel(fx);
          for (const uid of fx.hits) {
            const t = byUid.get(uid);
            if (!t) continue;
            const d = Math.hypot(t.x, t.y) || 1;
            const k = Math.min(travel, d) / d;
            const p = toScreen(a, t.x * k, t.y * k);
            g.circle(p.x, p.y, Math.max(4, Math.min(14, e.radius * R * 0.25)) * u).fill(color);
          }
          break;
        }
        case 'ring': {
          const r = Math.min(ringRadius(fx), e.radius) * R;
          g.circle(a.center.x, a.center.y, r).stroke({ width: 4 * u, color, alpha: 0.8 });
          break;
        }
        case 'blades':
          for (const b of bladePositions(fx)) {
            const p = toScreen(a, b.x, b.y);
            g.rect(p.x - 5 * u, p.y - 5 * u, 10 * u, 10 * u).fill({ color, alpha: 0.9 });
          }
          break;
        case 'zone': {
          const p = toScreen(a, fx.x, fx.y);
          g.circle(p.x, p.y, e.radius * R).fill({ color, alpha: 0.18 }).stroke({ width: 2 * u, color, alpha: 0.6 });
          break;
        }
        case 'storm':
          g.circle(a.center.x, a.center.y, R).fill({ color, alpha: 0.06 });
          break;
        case 'meteor':
          for (const uid of fx.hits) {
            const t = byUid.get(uid);
            if (!t) continue;
            const p = toScreen(a, t.x, t.y);
            g.circle(p.x, p.y, e.radius * R).stroke({ width: 2 * u, color, alpha: 0.5 });
          }
          break;
        case 'field':
          g.circle(a.center.x, a.center.y, R * Math.min(1, fx.ageMs / Math.max(1, e.delayMs))).stroke({ width: 2 * u, color, alpha: 0.4 });
          break;
        case 'chain':
        case 'haste':
        case 'backfire':
          break; // chain is drawn from its event; haste and backfire have no running visual
      }
    }
  }

  handle(events: BattleEvent[]): void {
    if (!this.ready_ || this.destroyed) return;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const v = this.foes.get(e.uid);
          if (!v) break;
          const ft = floatingText(e);
          this.floatText(ft.text, ft.color, v.pos.x, v.pos.y - v.r, e.immune);
          break;
        }
        case 'kill': {
          const el = this.content.monsters[e.defId]?.element;
          this.burst(toScreen(this.arena, e.x, e.y), COLORS.element[el ?? 'none'], 10, 1.4);
          break;
        }
        case 'burst':
          this.ringFx(toScreen(this.arena, e.x, e.y), e.r * this.arena.radius, colorOf(e.elements));
          break;
        case 'chain':
          this.lightning(e.points.map((p) => toScreen(this.arena, p.x, p.y)), colorOf(e.elements));
          break;
        case 'strike': {
          const to = toScreen(this.arena, e.x, e.y);
          this.lightning([{ x: to.x, y: to.y - 90 * this.unit }, to], colorOf(e.elements));
          break;
        }
        case 'backfire':
          this.floatText('反噬！', COLORS.amber, this.arena.center.x, this.arena.center.y - HERO_H * this.unit, true);
          break;
        default:
          break; // spawn / cast / status / bossDefeated are reflected via sync()
      }
    }
  }

  private addEffect(node: Container, life: number, update: Effect['update'], text = false): void {
    this.fxLayer.addChild(node);
    this.effects.push({ age: 0, life, node, text, update });
  }

  private ringFx(at: Pt, r: number, color: string): void {
    const g = new Graphics();
    this.addEffect(g, 300, (p) => {
      g.clear();
      g.circle(at.x, at.y, Math.max(4, r * (0.3 + 0.7 * p))).stroke({ width: 3 * this.unit, color, alpha: 1 - p });
    });
  }

  private lightning(points: Pt[], color: string): void {
    if (points.length < 2) return;
    const segs: Pt[][] = [];
    for (let i = 1; i < points.length; i++) segs.push(jaggedPath(points[i - 1]!, points[i]!, 5, this.rng));
    const g = new Graphics();
    for (const s of segs) {
      g.moveTo(s[0]!.x, s[0]!.y);
      for (const q of s.slice(1)) g.lineTo(q.x, q.y);
    }
    g.stroke({ width: 3 * this.unit, color });
    this.addEffect(g, 250, (p) => {
      g.alpha = 1 - p;
    });
  }

  private burst(at: Pt, color: string, count: number, speed = 1): void {
    const g = new Graphics();
    const ps = Array.from({ length: count }, () => {
      const a = this.rng.next() * Math.PI * 2;
      const v = (40 + this.rng.next() * 60) * speed * this.unit;
      return { x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30 };
    });
    this.addEffect(g, 350, (p, dt) => {
      g.clear();
      for (const q of ps) {
        q.x += (q.vx * dt) / 1000;
        q.y += (q.vy * dt) / 1000;
        q.vy += (220 * dt) / 1000;
        g.rect(q.x - 2, q.y - 2, 4, 4);
      }
      g.fill({ color, alpha: 1 - p });
    });
  }

  private floatText(text: string, color: string, x: number, y: number, fixedSize = false): void {
    let texts = 0;
    for (const ef of this.effects) if (ef.text) texts++;
    if (texts >= MAX_FLOAT_TEXTS) return;
    const fontSize = fixedSize ? IMMUNE_FONT_PX : 16 * this.unit;
    // numbers use a shared bitmap font; 無效 stays a Text (Pixi caches its texture by content)
    const t = /^\d+$/.test(text)
      ? new BitmapText({ text, style: { fontFamily: DMG_FONT, fontSize } })
      : new Text({ text, style: { fill: color, fontSize, fontWeight: 'bold', stroke: { color: '#000000', width: 3 } } });
    // targets can still be off-screen: keep the result readable inside the view
    const rise = 28 * this.unit;
    const at = floatTextStart({ x, y }, this.w, this.h, TEXT_MARGIN, fontSize, rise);
    t.anchor.set(0.5, 1);
    t.position.set(at.x, at.y);
    this.addEffect(t, TEXT_MS, (p) => {
      t.y = at.y - rise * p;
      t.alpha = 1 - p;
    }, true);
  }

  private tick(dtMs: number): void {
    this.time += dtMs;
    for (const cb of [...this.frameCbs]) cb();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i]!;
      ef.age += dtMs;
      const p = Math.min(1, ef.age / ef.life);
      ef.update(p, dtMs);
      if (p >= 1) {
        ef.node.destroy({ children: true });
        this.effects.splice(i, 1);
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.frameCbs.clear();
    if (this.ready_) {
      this.ready_ = false;
      this.app.destroy(true, { children: true });
    }
    // If init is still pending, init() tears the app down when it finishes.
    void this.ready;
  }
}
