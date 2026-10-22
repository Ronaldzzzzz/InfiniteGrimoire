import {
  Application, BitmapFont, BitmapText, Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Text, Texture,
} from 'pixi.js';
import {
  BLADE_MS, BOLT_SPEED, METEOR_STAGGER_MS, RING_SPEED, STEP_MS, STOP_R, bladePositions,
  type ActiveFx, type BattleEvent, type BattleState, type Foe,
} from '../engine/combat';
import type { Content, Effect, Monster } from '../engine/model';
import { createRng } from '../engine/rng';
import { resolveSpell } from '../engine/spells';
import type { ElementId } from '../engine/types';
import type { Snapshot } from '../game/runtime';
import { floatTextStart, makeArena, toScreen, type Arena } from './arena';
import { ellipseArc, floatingText, jaggedPath, type Pt } from './effects';
import { blendForSpell, MULTI_KILL_WINDOW_MS, multiKillLabel, particleStyle, shakeFor, type ParticleShape, type ParticleStyle } from './element-fx';
import { interpolate } from './motion';
import { COLORS } from './palette';

/** Foe bodies are drawn at this size and scaled to their engine radius. */
const BODY_PX = 32;
const HERO_W = 22;
const HERO_H = 38;
const TEXT_MS = 600;
const IMMUNE_FONT_PX = 16; // fixed, readable at any arena size (spec 4.3)
const TEXT_MARGIN = 24;
/** Floating damage numbers alive at once; a crowd fight would otherwise spawn hundreds. */
const MAX_FLOAT_TEXTS = 40;
/** 「無效」 has its own budget so damage numbers can never crowd the immune feedback out. */
const MAX_IMMUNE_TEXTS = 24;
const MAX_PARTICLES = 1500;
const POOL_GRAPHICS = 64;
const BANNER_MS = 1200;
const CAST_LABEL_MS = 1200;
const FLASH_MS = 300;
const SHAKE_DECAY = 0.01; // shake keeps 1% of its size after a second
const STEAM_MS = 2500;
const OVERLAY_MS = 1200;
const SHAPES: ParticleShape[] = ['spark', 'streak', 'bolt', 'shard', 'drop'];
/** Shapes that glow (additive blend); shards and drops are solid matter. */
const GLOWS: Record<ParticleShape, boolean> = { spark: true, streak: true, bolt: true, shard: false, drop: false };
/** Shapes that turn to face the way they fly. */
const FACES: Record<ParticleShape, boolean> = { spark: false, streak: true, bolt: true, shard: false, drop: true };
const NEUTRAL_STYLE: ParticleStyle = { color: COLORS.element.none, vy: -20, size: [2, 4], lifeMs: [250, 500], shape: 'spark' };
const LAVA = '#ff7a3d';
const MUD = '#6b4f2e';
const FOG = '#cfd6e0';
const FROST = '#d8f0ff';
const CLOUD = '#4a5266';

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

interface OneShot {
  /** negative while waiting to start */
  age: number;
  life: number;
  node: Container;
  text: 0 | 1 | 2; // 0 = not text, 1 = damage number, 2 = immune
  pooled: boolean;
  update: (p: number, dtMs: number) => void;
}

interface Spark {
  p: Particle;
  vx: number;
  vy: number;
  ay: number;
  life: number;
  max: number;
  spin: number;
  size: number;
  glow: boolean;
  face: boolean;
  alive: boolean;
}

/** How a spell looks: its colours and the particle style of each of its elements. */
interface Look {
  primary: string;
  secondary: string | null;
  colors: string[];
  styles: ParticleStyle[];
  has: (e: ElementId) => boolean;
}

const tint = (c: string): number => parseInt(c.slice(1), 16);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

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
 * one-shot events (burst, chain, strike, hits, kills) spawn short-lived effects and particles.
 * Every element speaks its own particle language (element-fx.ts), so a combo spell shows both of its sides.
 */
export class BattleView {
  private readonly app = new Application();
  private readonly ready: Promise<void>;
  private ready_ = false;
  private destroyed = false;
  private readonly foes = new Map<number, FoeView>();
  private readonly effects: OneShot[] = [];
  private readonly frameCbs = new Set<() => void>();
  private readonly rng = createRng((Date.now() ^ 0x9e3779b9) >>> 0);
  private readonly maxFoeR: number;
  private readonly looks = new WeakMap<readonly ElementId[], Look>();
  /** shaken: everything in the arena */
  private readonly shakeRoot = new Container();
  /** not shaken: banner and cast name */
  private readonly uiLayer = new Container();
  private readonly world = new Container();
  private readonly foeLayer = new Container();
  private readonly groundFx = new Graphics();
  private readonly airFx = new Graphics();
  private readonly fxLayer = new Container();
  private readonly glowParticles = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
  });
  private readonly solidParticles = new ParticleContainer({
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: true },
  });
  private readonly sparks: Spark[] = [];
  private sparkCursor = 0;
  private shapeTex = new Map<ParticleShape, Texture>();
  private atlas: Texture | null = null;
  private readonly gPool: Graphics[] = [];
  private textCount = [0, 0, 0];
  private hero: Graphics | Sprite | null = null;
  private heroTint = 0xffffff;
  private heroFlash = { until: 0, color: 0xffffff };
  private banner: Text | null = null;
  private bannerAge = BANNER_MS;
  private bannerN = 0;
  private castLabel: Text | null = null;
  private castAge = CAST_LABEL_MS;
  private readonly killTimes: number[] = [];
  private shake = 0;
  private sustainedShake = 0;
  private readonly pendingShakes: { at: number; mag: number }[] = [];
  private readonly seenFx = new Set<number>();
  private readonly liveFx = new Set<number>();
  private time = 0;
  private frameDt = 16;
  private unit = 1;
  private alpha = 1;
  private arena: Arena = makeArena(1, 1, 0);
  private ring = new Graphics();
  private ringKey = '';
  /** engine position of each foe at the previous fixed step, for interpolation */
  private prevPos = new Map<number, Pt>();
  private lastBattle: BattleState | null = null;
  private byUid = new Map<number, Foe>();

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
    this.makeParticleAtlas();
    this.glowParticles.blendMode = 'add';
    this.world.addChild(this.ring, this.groundFx, this.foeLayer);
    this.hero = this.makeHero();
    this.world.addChild(this.hero);
    this.shakeRoot.addChild(this.world, this.airFx, this.fxLayer, this.solidParticles, this.glowParticles);
    this.app.stage.addChild(this.shakeRoot, this.uiLayer);
    this.banner = new Text({
      text: '',
      style: { fill: COLORS.amber, fontSize: 30, fontWeight: '900', fontFamily: 'system-ui, sans-serif', stroke: { color: '#000000', width: 5 } },
    });
    this.banner.anchor.set(0.5);
    this.banner.visible = false;
    this.castLabel = new Text({
      text: '',
      style: { fill: '#ffffff', fontSize: 20, fontWeight: 'bold', fontFamily: 'system-ui, sans-serif', stroke: { color: '#000000', width: 4 } },
    });
    this.castLabel.anchor.set(0.5, 1);
    this.castLabel.visible = false;
    this.uiLayer.addChild(this.banner, this.castLabel);
    ensureDamageFont();
    this.ready_ = true;
    this.app.ticker.add((t) => this.tick(t.deltaMS));
  }

  /** One small white texture per particle shape (cut from one atlas); particles are tinted by element. */
  private makeParticleAtlas(): void {
    const g = new Graphics();
    // spark: soft round ember
    g.circle(8, 8, 6).fill({ color: 0xffffff, alpha: 0.25 });
    g.circle(8, 8, 4).fill({ color: 0xffffff, alpha: 0.55 });
    g.circle(8, 8, 2.5).fill(0xffffff);
    // streak: thin dash with a fading tail
    g.rect(17, 7, 6, 2).fill({ color: 0xffffff, alpha: 0.4 });
    g.rect(23, 7, 8, 2).fill(0xffffff);
    // bolt: tiny zig-zag
    g.moveTo(33, 8).lineTo(36, 4).lineTo(40, 11).lineTo(43, 5).lineTo(47, 8).stroke({ width: 1.6, color: 0xffffff });
    // shard: sharp chip
    g.poly([52, 3, 61, 7, 55, 13]).fill(0xffffff);
    // drop: round body with a pointed top
    g.circle(72, 10, 3.5).fill(0xffffff);
    g.poly([72, 3, 69, 9, 75, 9]).fill(0xffffff);
    this.atlas = this.app.renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, 80, 16), resolution: 2 });
    g.destroy();
    SHAPES.forEach((s, i) => {
      this.shapeTex.set(s, new Texture({ source: this.atlas!.source, frame: new Rectangle(i * 16, 0, 16, 16) }));
    });
    const first = this.shapeTex.get('spark')!;
    this.glowParticles.texture = first;
    this.solidParticles.texture = first;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.sparks.push({
        p: new Particle({ texture: first, anchorX: 0.5, anchorY: 0.5 }),
        vx: 0, vy: 0, ay: 0, life: 0, max: 1, spin: 0, size: 1, glow: true, face: false, alive: false,
      });
    }
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

  private monster(id: string): Monster | undefined {
    return Object.hasOwn(this.content.monsters, id) ? this.content.monsters[id] : undefined;
  }

  private look(elements: readonly ElementId[]): Look {
    let l = this.looks.get(elements);
    if (!l) {
      const b = blendForSpell(elements);
      const unique = [...new Set(elements)];
      const set = new Set(unique);
      l = {
        primary: b.primary,
        secondary: b.secondary,
        colors: unique.length > 0 ? unique.map((e) => COLORS.element[e]) : [COLORS.element.none],
        styles: unique.length > 0 ? unique.map(particleStyle) : [NEUTRAL_STYLE],
        has: (e) => set.has(e),
      };
      this.looks.set(elements, l);
    }
    return l;
  }

  private makeHero(): Graphics | Sprite {
    const tex = this.textures.get('hero_idle');
    if (tex) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      return s;
    }
    this.heroTint = tint(COLORS.rune);
    const g = new Graphics();
    g.rect(-HERO_W / 2, -HERO_H / 2, HERO_W, HERO_H).fill(0xffffff);
    g.rect(-HERO_W / 2 + 4, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    g.rect(HERO_W / 2 - 8, -HERO_H / 2 + 8, 4, 4).fill(COLORS.bg);
    g.tint = this.heroTint;
    return g;
  }

  private makeFoe(f: Foe): FoeView {
    const def = this.monster(f.defId);
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
    this.foeLayer.addChild(root);
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
      } else {
        this.seenFx.clear();
      }
      this.lastBattle = battle;
      this.byUid = new Map(battle.foes.map((f) => [f.uid, f]));
    }
    this.alpha = alpha;
    this.unit = Math.max(0.6, Math.min(1.6, Math.min(this.w, this.h) / 360));
    const u = this.unit;
    this.arena = makeArena(this.w, this.h, this.maxFoeR);
    const c = this.arena.center;
    const hero = this.hero!;
    hero.position.set(c.x, c.y);
    hero.scale.set(u);
    hero.tint = this.time < this.heroFlash.until ? this.heroFlash.color : this.heroTint;
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
      const def = this.monster(f.defId);
      v.r = Math.max(5, (def?.radius ?? 0.03) * this.arena.radius);
      const prev = this.prevPos.get(f.uid);
      v.pos = toScreen(this.arena, interpolate(prev?.x ?? f.x, f.x, alpha), interpolate(prev?.y ?? f.y, f.y, alpha));
      const pop = Math.min(1, (this.time - v.born) / 200);
      v.root.position.set(v.pos.x, v.pos.y);
      v.root.scale.set(((2 * v.r) / BODY_PX) * (0.4 + 0.6 * pop));
      v.root.alpha = pop;
      this.drawHp(v, f);
      this.drawStatus(v, f);
      this.statusParticles(v, f);
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
    const a = this.arena;
    this.ring.clear();
    this.ring.circle(a.center.x, a.center.y, STOP_R * a.radius).stroke({ width: 1, color: COLORS.rune, alpha: 0.18 });
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

  /** Status marks: burning orange frame, wet blue frame, frozen ice-blue cover, stunned star, blinded grey. */
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
          g.rect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4).stroke({ width: 3, color: flicker ? '#ffb347' : '#ff8a3d' });
          g.rect(-s / 2, -s / 2, s, s).fill({ color: COLORS.element.fire, alpha: flicker ? 0.35 : 0.15 });
          break;
        case 'wet':
          g.rect(-s / 2 - 1, -s / 2 - 1, s + 2, s + 2).stroke({ width: 2, color: COLORS.element.water });
          break;
        case 'freeze':
          v.body.tint = tint('#bfe4f2');
          g.rect(-s / 2, -s / 2, s, s).fill({ color: FROST, alpha: 0.5 });
          g.rect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4).stroke({ width: 2, color: '#ffffff' });
          g.moveTo(-s / 2 + 4, -s / 2 + 6).lineTo(-2, 0).lineTo(-s / 2 + 8, s / 2 - 4).stroke({ width: 1, color: '#ffffff', alpha: 0.8 });
          break;
        case 'stun':
          star(g, 0, -s / 2 - 16, 7, COLORS.element.thunder);
          break;
        case 'slow':
          g.rect(-s / 2, s / 2 - 4, s, 4).fill({ color: COLORS.element.wind, alpha: 0.8 });
          break;
        case 'blind':
          v.body.tint = tint('#5a5560');
          g.rect(-s / 2, -s / 2, s, s).fill({ color: '#000000', alpha: 0.35 });
          break;
        case 'regen':
          g.rect(-s / 2, -s / 2, s, s).stroke({ width: 2, color: COLORS.rune });
          break;
      }
    }
  }

  /** Burning foes shed embers and wet ones drip; frozen foes glint. */
  private statusParticles(v: FoeView, f: Foe): void {
    for (const st of f.statuses) {
      if (st.kind === 'burn' && this.chance(4)) {
        this.spawn(particleStyle('fire'), v.pos.x + (this.rng.next() - 0.5) * v.r * 1.6, v.pos.y - v.r * 0.5, 0, -20);
      } else if (st.kind === 'wet' && this.chance(1.2)) {
        this.spawn(particleStyle('water'), v.pos.x + (this.rng.next() - 0.5) * v.r * 1.4, v.pos.y + v.r * 0.6, 0, 10);
      }
    }
  }

  /** true with probability rate x frame time (rate per second) */
  private chance(ratePerSec: number): boolean {
    return this.rng.next() < (ratePerSec * this.frameDt) / 1000;
  }

  /** count of particles to emit this frame at `ratePerSec` */
  private emitCount(ratePerSec: number): number {
    const n = (ratePerSec * this.frameDt) / 1000;
    const whole = Math.floor(n);
    return whole + (this.rng.next() < n - whole ? 1 : 0);
  }

  /** Age of an effect lined up with the interpolated foes (which are drawn one step behind). */
  private smoothAge(fx: ActiveFx): number {
    return Math.max(0, fx.ageMs - STEP_MS * (1 - this.alpha));
  }

  /** Running effects, redrawn every frame. */
  private drawActiveFx(battle: BattleState): void {
    const ground = this.groundFx;
    const air = this.airFx;
    ground.clear();
    air.clear();
    const live = this.liveFx;
    live.clear();
    this.sustainedShake = 0;
    for (const fx of battle.fx) {
      live.add(fx.uid);
      if (!this.seenFx.has(fx.uid)) {
        this.seenFx.add(fx.uid);
        this.onFxStart(fx);
      }
      const L = this.look(fx.elements);
      const e = fx.effect;
      switch (e.kind) {
        case 'bolt':
          this.drawBolt(fx, e, L);
          break;
        case 'ring':
          this.drawRingFx(fx, e, L);
          break;
        case 'blades':
          this.drawBlades(fx, L);
          break;
        case 'zone':
          if (e.pull > 0) this.drawVortex(fx, e, L);
          else this.drawPool(fx, e, L);
          if (e.strikes > 0) this.sustainedShake = Math.max(this.sustainedShake, shakeFor(e));
          break;
        case 'storm':
          this.drawStorm(fx, e, L);
          break;
        case 'meteor':
          this.drawMeteor(fx, e, L);
          break;
        case 'field': {
          const a = this.arena;
          const k = clamp01(this.smoothAge(fx) / Math.max(1, e.delayMs));
          air.circle(a.center.x, a.center.y, a.radius * k).stroke({ width: 2 * this.unit, color: L.primary, alpha: 0.5 });
          ground.circle(a.center.x, a.center.y, a.radius * k).fill({ color: L.primary, alpha: 0.08 });
          break;
        }
        case 'chain':
        case 'haste':
        case 'backfire':
          break; // chain is drawn from its event; haste shows on the mage; backfire has no running visual
      }
    }
    for (const uid of this.seenFx) if (!live.has(uid)) this.seenFx.delete(uid);
    const m = battle.mage;
    const c = this.arena.center;
    const u = this.unit;
    if (m.hasteMs > 0) air.circle(c.x, c.y, (20 + Math.sin(this.time / 100) * 2) * u).stroke({ width: 2 * u, color: COLORS.element.wind, alpha: 0.9 });
  }

  /** First frame of a running effect: schedule its shake and start lingering overlays. */
  private onFxStart(fx: ActiveFx): void {
    const e = fx.effect;
    const mag = shakeFor(e);
    const L = this.look(fx.elements);
    if (e.kind === 'meteor') {
      for (let i = 0; i < e.count; i++) this.pendingShakes.push({ at: this.time + e.delayMs + i * METEOR_STAGGER_MS - fx.ageMs, mag });
    } else if (e.kind === 'field') {
      const wait = Math.max(0, e.delayMs - fx.ageMs);
      this.pendingShakes.push({ at: this.time + wait, mag });
      this.fieldOverlay(e, L, wait);
    } else if (e.kind === 'ring' && L.has('fire') && L.has('water')) {
      this.steamFog();
    }
  }

  private drawBolt(fx: ActiveFx, e: Extract<Effect, { kind: 'bolt' }>, L: Look): void {
    const g = this.airFx;
    const a = this.arena;
    const u = this.unit;
    const travel = (this.smoothAge(fx) / 1000) * BOLT_SPEED;
    const size = Math.max(4, Math.min(14, e.radius * a.radius * 0.25)) * u;
    for (const uid of fx.hits) {
      const t = this.byUid.get(uid);
      if (!t) continue;
      const d = Math.hypot(t.x, t.y) || 1;
      const k = Math.min(travel, d) / d;
      const p = toScreen(a, t.x * k, t.y * k);
      g.circle(p.x, p.y, size * 1.8).fill({ color: L.secondary ?? L.primary, alpha: 0.3 });
      g.circle(p.x, p.y, size).fill(L.primary);
      g.circle(p.x, p.y, size * 0.4).fill({ color: '#ffffff', alpha: 0.85 });
      for (let n = this.emitCount(70); n > 0; n--) {
        this.spawn(this.pick(L), p.x, p.y, (this.rng.next() - 0.5) * 40 * u, (this.rng.next() - 0.5) * 40 * u);
      }
    }
  }

  private drawRingFx(fx: ActiveFx, e: Extract<Effect, { kind: 'ring' }>, L: Look): void {
    const g = this.airFx;
    const a = this.arena;
    const u = this.unit;
    const max = e.radius * a.radius;
    const r = Math.min((this.smoothAge(fx) / 1000) * RING_SPEED * a.radius, max);
    const fade = 1 - (r / Math.max(1, max)) * 0.7;
    g.circle(a.center.x, a.center.y, r).stroke({ width: 6 * u, color: L.primary, alpha: fade });
    if (L.secondary) g.circle(a.center.x, a.center.y, Math.max(1, r - 6 * u)).stroke({ width: 2 * u, color: L.secondary, alpha: fade });
    if (L.has('fire') && L.has('water')) {
      // steam: soft puffs ride the ring
      for (let i = 0; i < 12; i++) {
        const t = fx.uid * 1.7 + (i * Math.PI * 2) / 12;
        g.circle(a.center.x + Math.cos(t) * r, a.center.y + Math.sin(t) * r, 16 * u).fill({ color: FOG, alpha: 0.16 * fade });
      }
    }
    for (let n = this.emitCount(90 * fade); n > 0; n--) {
      const t = this.rng.next() * Math.PI * 2;
      const cx = Math.cos(t), cy = Math.sin(t);
      this.spawn(this.pick(L), a.center.x + cx * r, a.center.y + cy * r, cx * 50 * u, cy * 50 * u);
    }
  }

  private drawBlades(fx: ActiveFx, L: Look): void {
    const g = this.airFx;
    const a = this.arena;
    const u = this.unit;
    const age = this.smoothAge(fx);
    const fade = 1 - clamp01(age / BLADE_MS) * 0.6;
    for (const b of bladePositions({ ...fx, ageMs: age })) {
      const r = Math.hypot(b.x, b.y) * a.radius;
      const t = Math.atan2(b.y, b.x);
      g.moveTo(a.center.x + Math.cos(t - 0.2) * r, a.center.y + Math.sin(t - 0.2) * r);
      g.arc(a.center.x, a.center.y, r, t - 0.2, t + 0.2).stroke({ width: 4 * u, color: L.primary, alpha: fade });
      if (L.secondary) {
        const r2 = Math.max(1, r - 4 * u);
        g.moveTo(a.center.x + Math.cos(t - 0.12) * r2, a.center.y + Math.sin(t - 0.12) * r2);
        g.arc(a.center.x, a.center.y, r2, t - 0.12, t + 0.12).stroke({ width: 2 * u, color: L.secondary, alpha: fade });
      }
      if (this.chance(25)) {
        const p = toScreen(a, b.x, b.y);
        this.spawn(this.pick(L), p.x, p.y, -Math.sin(t) * 120 * u, Math.cos(t) * 120 * u);
      }
    }
  }

  /** Pulling zones: a spinning funnel of ellipses in every colour of the spell, with a fire core, sparks and crackle. */
  private drawVortex(fx: ActiveFx, e: Extract<Effect, { kind: 'zone' }>, L: Look): void {
    const g = this.airFx;
    const u = this.unit;
    const age = this.smoothAge(fx);
    const fade = clamp01(Math.min(age / 200, (e.ms - age) / 400));
    const c = toScreen(this.arena, fx.x, fx.y);
    const r = e.radius * this.arena.radius;
    const ang = (this.time / 1000) * 9 + fx.uid;
    if (L.has('fire')) {
      this.groundFx.circle(c.x, c.y, r * 0.95).fill({ color: COLORS.element.fire, alpha: 0.1 * fade });
      g.circle(c.x, c.y, r * 0.35).fill({ color: '#ff5a1f', alpha: 0.32 * fade });
      g.circle(c.x, c.y, r * 0.18).fill({ color: '#ffd08a', alpha: 0.3 * fade });
    } else if (L.has('water')) {
      g.circle(c.x, c.y, r * 0.35).fill({ color: COLORS.element.water, alpha: 0.22 * fade });
    } else if (L.has('earth')) {
      this.groundFx.circle(c.x, c.y, r).fill({ color: COLORS.element.earth, alpha: 0.12 * fade });
    }
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      const rr = r * (0.22 + i * 0.19);
      const pts = ellipseArc(c, rr, rr * 0.45, ang * (1 + i * 0.3), 0, 5, 18);
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let k = 1; k < pts.length; k++) g.lineTo(pts[k]!.x, pts[k]!.y);
      g.stroke({ width: 4 * u, color: L.colors[i % L.colors.length]!, alpha: 0.6 * fade });
    }
    if (L.has('thunder') && this.rng.next() < 0.5) {
      const a0 = this.rng.next() * Math.PI * 2;
      const a1 = a0 + 1 + this.rng.next() * 2;
      const from = { x: c.x + Math.cos(a0) * r * 0.7, y: c.y + Math.sin(a0) * r * 0.35 };
      const to = { x: c.x + Math.cos(a1) * r * 0.5, y: c.y + Math.sin(a1) * r * 0.25 };
      this.strokePath(g, jaggedPath(from, to, 5, this.rng), 2.5 * u, COLORS.element.thunder, fade);
    }
    // sparks fly off tangentially, each in its own element's style
    for (let n = this.emitCount(70 * fade); n > 0; n--) {
      const t = this.rng.next() * Math.PI * 2;
      const rr = r * (0.2 + this.rng.next() * 0.8);
      const spin = 2.4 * rr;
      this.spawn(this.pick(L), c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr * 0.5, -Math.sin(t) * spin, Math.cos(t) * spin * 0.5);
    }
  }

  /** Still zones: lava (fire), mud (earth + water), water or a plain tinted pool. */
  private drawPool(fx: ActiveFx, e: Extract<Effect, { kind: 'zone' }>, L: Look): void {
    const g = this.groundFx;
    const u = this.unit;
    const age = this.smoothAge(fx);
    const left = 1 - clamp01(age / e.ms);
    const fade = clamp01(Math.min(age / 150, (e.ms - age) / 400));
    const c = toScreen(this.arena, fx.x, fx.y);
    const r = e.radius * this.arena.radius;
    if (L.has('fire')) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time / 90 + fx.uid);
      g.circle(c.x, c.y, r).fill({ color: COLORS.element.fire, alpha: (0.3 * left + 0.12) * fade });
      g.circle(c.x, c.y, r * 0.6).fill({ color: '#ffb347', alpha: (0.12 + 0.12 * pulse) * fade });
      g.circle(c.x, c.y, r).stroke({ width: 3 * u, color: '#5a2a14', alpha: 0.7 * fade });
      for (let n = this.emitCount(18 * fade); n > 0; n--) {
        const t = this.rng.next() * Math.PI * 2;
        const rr = Math.sqrt(this.rng.next()) * r;
        this.spawn(particleStyle('fire'), c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr, 0, -30 * u);
      }
      if (L.has('earth') && this.chance(4 * fade)) this.spawn(particleStyle('earth'), c.x + (this.rng.next() - 0.5) * r, c.y, 0, -60 * u);
    } else if (L.has('earth')) {
      g.circle(c.x, c.y, r).fill({ color: MUD, alpha: 0.55 * fade });
      g.circle(c.x, c.y, r).stroke({ width: 2 * u, color: COLORS.element.earth, alpha: 0.6 * fade });
      // bubbles that grow and pop in place
      for (let i = 0; i < 6; i++) {
        const cyc = (this.time / 900 + i * 0.37 + fx.uid * 0.13) % 1;
        const seed = Math.floor(this.time / 900 + i * 0.37 + fx.uid * 0.13) * 7 + i;
        const t = seed * 2.399963;
        const rr = r * 0.75 * ((seed * 0.618) % 1);
        g.circle(c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr, (2 + cyc * 4) * u)
          .stroke({ width: 1.5 * u, color: L.has('water') ? COLORS.element.water : COLORS.element.earth, alpha: (1 - cyc) * fade });
      }
    } else {
      g.circle(c.x, c.y, r).fill({ color: L.primary, alpha: 0.18 * fade }).stroke({ width: 2 * u, color: L.primary, alpha: 0.6 * fade });
      const k = (this.time / 700 + fx.uid * 0.3) % 1;
      g.circle(c.x, c.y, r * k).stroke({ width: 1.5 * u, color: L.secondary ?? '#ffffff', alpha: 0.5 * (1 - k) * fade });
    }
  }

  /** Storm cloud over the arena; rain when the storm carries water. */
  private drawStorm(fx: ActiveFx, e: Extract<Effect, { kind: 'storm' }>, L: Look): void {
    const g = this.airFx;
    const a = this.arena;
    const u = this.unit;
    const age = this.smoothAge(fx);
    const fade = clamp01(Math.min(age / 200, (e.ms - age) / 400));
    const R = a.radius;
    // the arena reaches past the view (spawns are off-screen), so the cloud hangs from the top of the view
    const cx = a.center.x + Math.cos(this.time / 2500 + fx.uid) * a.w * 0.2;
    const cy = Math.max(a.center.y - R * 0.78, 40 * u);
    this.groundFx.circle(a.center.x, a.center.y, R).fill({ color: COLORS.element.thunder, alpha: (this.rng.next() < 0.1 ? 0.07 : 0.025) * fade });
    if (L.has('water')) {
      for (let i = 0; i < 36; i++) {
        const hx = ((i * 0.6180339 + fx.uid * 0.13) % 1) * 2 - 1;
        const hy = ((this.time / 600 + i * 0.37) % 1) * 2 - 1;
        const x = a.center.x + hx * R * 0.9, y = a.center.y + hy * R * 0.9;
        g.moveTo(x, y).lineTo(x - 3 * u, y + 11 * u).stroke({ width: 1.5 * u, color: COLORS.element.water, alpha: 0.55 * fade });
      }
    }
    for (let i = 0; i < 5; i++) {
      g.circle(cx - 96 * u + i * 48 * u, cy + (i % 2) * 14 * u, 44 * u).fill({ color: CLOUD, alpha: 0.6 * fade });
    }
    for (let i = 0; i < 4; i++) {
      g.circle(cx - 72 * u + i * 48 * u, cy + 26 * u, 30 * u).fill({ color: '#2e3442', alpha: 0.55 * fade });
    }
  }

  /** Each meteor: a growing shadow on its target and a burning rock falling in from the upper right. */
  private drawMeteor(fx: ActiveFx, e: Extract<Effect, { kind: 'meteor' }>, L: Look): void {
    const g = this.airFx;
    const a = this.arena;
    const u = this.unit;
    const age = this.smoothAge(fx);
    const r = e.radius * a.radius;
    const rock = L.has('earth') ? COLORS.element.earth : L.primary;
    const glow = L.has('fire') ? LAVA : (L.secondary ?? L.primary);
    for (let i = 0; i < e.count; i++) {
      const land = e.delayMs + i * METEOR_STAGGER_MS;
      if (age >= land) continue;
      const uid = fx.hits.length > 0 ? fx.hits[i % fx.hits.length]! : -1;
      const t = this.byUid.get(uid);
      const at = toScreen(a, t ? t.x : fx.x, t ? t.y : fx.y);
      const k = clamp01(age / land);
      this.groundFx.circle(at.x, at.y, Math.max(2, r * k)).fill({ color: '#000000', alpha: 0.38 });
      this.groundFx.circle(at.x, at.y, r).stroke({ width: 1.5 * u, color: glow, alpha: 0.35 * k });
      const mx = at.x + (1 - k) * 160 * u, my = at.y - (1 - k) * 320 * u;
      const size = (10 + 6 * k) * u;
      g.circle(mx, my, size * 1.7).fill({ color: glow, alpha: 0.35 });
      g.circle(mx, my, size).fill(rock);
      g.circle(mx - size * 0.3, my - size * 0.3, size * 0.45).fill({ color: '#ffd08a', alpha: 0.7 });
      for (let n = this.emitCount(80); n > 0; n--) {
        this.spawn(this.pick(L), mx + (this.rng.next() - 0.5) * size, my + (this.rng.next() - 0.5) * size, 60 * u + (this.rng.next() - 0.5) * 40 * u, -100 * u);
      }
    }
  }

  /** The arena-wide wash of a field: frost (freeze), sandstorm (blind), a sea (water / wet) or a flash. */
  private fieldOverlay(e: Extract<Effect, { kind: 'field' }>, L: Look, waitMs: number): void {
    const kinds = new Set((e.status ?? []).map((s) => s.kind));
    const mode = kinds.has('freeze') ? 'frost' : kinds.has('blind') ? 'sand' : L.has('water') || kinds.has('wet') ? 'sea' : 'flash';
    const g = this.takeG();
    let started = false;
    this.addEffect(g, OVERLAY_MS, (p) => {
      const a = this.arena;
      const u = this.unit;
      const R = a.radius;
      const c = a.center;
      g.clear();
      const k = 1 - p;
      if (!started) {
        started = true;
        const style = mode === 'frost' ? { ...particleStyle('water'), color: FROST, shape: 'shard' as const, vy: 30 }
          : mode === 'sand' ? particleStyle('earth') : mode === 'sea' ? particleStyle('water') : this.pick(L);
        for (let i = 0; i < 60; i++) {
          const t = this.rng.next() * Math.PI * 2, rr = Math.sqrt(this.rng.next()) * R;
          const vx = mode === 'sand' ? 220 * u : (this.rng.next() - 0.5) * 60 * u;
          this.spawn(i % 3 === 2 ? this.pick(L) : style, c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr, vx, (this.rng.next() - 0.5) * 40 * u);
        }
      }
      switch (mode) {
        case 'frost':
          g.circle(c.x, c.y, R).fill({ color: FROST, alpha: 0.32 * k });
          g.circle(c.x, c.y, R).stroke({ width: 4 * u, color: '#ffffff', alpha: 0.6 * k });
          for (let i = 0; i < 12; i++) {
            const t = (i * Math.PI * 2) / 12;
            g.moveTo(c.x + Math.cos(t) * R * 0.2, c.y + Math.sin(t) * R * 0.2)
              .lineTo(c.x + Math.cos(t + 0.08) * R * 0.95, c.y + Math.sin(t + 0.08) * R * 0.95)
              .stroke({ width: 1.5 * u, color: '#ffffff', alpha: 0.45 * k });
          }
          break;
        case 'sand':
          g.circle(c.x, c.y, R).fill({ color: COLORS.element.earth, alpha: 0.28 * k });
          for (let i = 0; i < 14; i++) {
            const y = c.y - R * 0.85 + (i / 13) * R * 1.7;
            const half = Math.sqrt(Math.max(0, R * R - (y - c.y) ** 2));
            const x = c.x - half + ((p * 1.6 + i * 0.29) % 1) * half * 2;
            g.moveTo(x, y).lineTo(Math.min(c.x + half, x + 40 * u), y + 3 * u).stroke({ width: 2 * u, color: '#e8d2a0', alpha: 0.5 * k });
          }
          break;
        case 'sea':
          g.circle(c.x, c.y, R).fill({ color: COLORS.element.water, alpha: 0.26 * k });
          for (let w = 0; w < 4; w++) {
            const y0 = c.y - R * 0.6 + w * R * 0.4;
            const half = Math.sqrt(Math.max(0, R * R - (y0 - c.y) ** 2)) * 0.95;
            g.moveTo(c.x - half, y0);
            for (let x = -half; x <= half; x += 8 * u) g.lineTo(c.x + x, y0 + Math.sin(x / (14 * u) + p * 10 + w) * 5 * u);
            g.stroke({ width: 2 * u, color: L.secondary && L.primary === COLORS.element.water ? L.secondary : '#bfe8ff', alpha: 0.55 * k });
          }
          break;
        case 'flash':
          g.circle(c.x, c.y, R).fill({ color: L.primary, alpha: 0.25 * k });
          break;
      }
    }, 0, waitMs);
  }

  /** Steam: a fog bank around the mage that thins out. */
  private steamFog(): void {
    const g = this.takeG();
    const seeds = Array.from({ length: 9 }, () => ({ t: this.rng.next() * Math.PI * 2, d: 0.15 + this.rng.next() * 0.35, s: 0.6 + this.rng.next() * 0.6 }));
    this.addEffect(g, STEAM_MS, (p) => {
      const a = this.arena;
      g.clear();
      const k = Math.min(1, p * 6) * (1 - p);
      for (const q of seeds) {
        const drift = q.t + p * 0.8;
        g.circle(a.center.x + Math.cos(drift) * q.d * a.radius, a.center.y + Math.sin(drift) * q.d * a.radius, a.radius * 0.22 * q.s)
          .fill({ color: FOG, alpha: 0.22 * k });
      }
    });
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
          this.killTimes.push(this.time);
          const el = this.monster(e.defId)?.element;
          const at = toScreen(this.arena, e.x, e.y);
          this.particleBurst(at, el ? [particleStyle(el)] : [NEUTRAL_STYLE], 10, 140 * this.unit);
          break;
        }
        case 'burst': {
          const L = this.look(e.elements);
          const at = toScreen(this.arena, e.x, e.y);
          const r = Math.min(e.r, 1) * this.arena.radius;
          this.ringFx(at, r, L);
          this.particleBurst(at, L.styles, Math.min(40, 10 + r / 3), Math.min(600, r * 2.2) * this.unit);
          break;
        }
        case 'chain': {
          const L = this.look(e.elements);
          const pts = e.points.map((p) => toScreen(this.arena, p.x, p.y));
          this.lightning(pts, L);
          for (const p of pts.slice(1)) this.particleBurst(p, L.styles, 5, 120 * this.unit);
          break;
        }
        case 'strike': {
          const L = this.look(e.elements);
          const to = toScreen(this.arena, e.x, e.y);
          const u = this.unit;
          this.lightning([{ x: to.x + (this.rng.next() - 0.5) * 60 * u, y: to.y - 260 * u }, to], L);
          this.particleBurst(to, L.styles, 7, 140 * u);
          break;
        }
        case 'cast':
          this.onCast(e.spellId);
          break;
        case 'backfire':
          this.floatText('反噬！', COLORS.amber, this.arena.center.x, this.arena.center.y - HERO_H * this.unit, true);
          this.heroFlash = { until: this.time + 600, color: tint('#b48ae8') };
          break;
        default:
          break; // spawn / status / bossDefeated are reflected via sync()
      }
    }
  }

  /** The spell name rises over the mage, who flashes in the spell's last element colour. */
  private onCast(spellId: string): void {
    const spell = resolveSpell(spellId, this.content);
    if (!spell) return;
    const L = this.look(spell.elements);
    this.heroFlash = { until: this.time + FLASH_MS, color: tint(L.colors[L.colors.length - 1]!) };
    if (spell.tier < 2 || !this.castLabel) return; // the starting bolt would just spam its name
    this.castLabel.text = spell.name;
    this.castLabel.style.fill = L.primary;
    this.castAge = 0;
  }

  private pick(L: Look): ParticleStyle {
    return L.styles.length === 1 ? L.styles[0]! : L.styles[Math.floor(this.rng.next() * L.styles.length)]!;
  }

  private range(r: [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rng.next();
  }

  /** Writes one particle into the ring buffer, overwriting the oldest when all 1500 are alive. */
  private spawn(style: ParticleStyle, x: number, y: number, vx: number, vy: number): void {
    if (this.sparks.length === 0) return;
    const s = this.sparks[this.sparkCursor]!;
    this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
    const u = this.unit;
    s.alive = true;
    s.p.texture = this.shapeTex.get(style.shape)!;
    s.p.tint = tint(style.color);
    s.p.x = x;
    s.p.y = y;
    s.vx = vx;
    s.vy = vy + style.vy * 0.3 * u;
    s.ay = style.vy * 1.2 * u;
    s.max = s.life = this.range(style.lifeMs);
    s.size = (this.range(style.size) * u) / 5;
    s.glow = GLOWS[style.shape];
    s.face = FACES[style.shape];
    s.spin = style.shape === 'shard' ? (this.rng.next() - 0.5) * 12 : 0;
    s.p.rotation = this.rng.next() * Math.PI * 2;
  }

  private particleBurst(at: Pt, styles: ParticleStyle[], count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const t = this.rng.next() * Math.PI * 2;
      const v = (0.3 + this.rng.next() * 0.7) * speed;
      this.spawn(styles[i % styles.length]!, at.x, at.y, Math.cos(t) * v, Math.sin(t) * v);
    }
  }

  private updateParticles(dtMs: number): void {
    const dt = dtMs / 1000;
    const damp = Math.pow(0.08, dt); // velocity keeps 8% after a second
    const glow = this.glowParticles.particleChildren;
    const solid = this.solidParticles.particleChildren;
    glow.length = 0;
    solid.length = 0;
    for (const s of this.sparks) {
      if (!s.alive) continue;
      s.life -= dtMs;
      if (s.life <= 0) {
        s.alive = false;
        continue;
      }
      s.vx *= damp;
      s.vy = s.vy * damp + s.ay * dt;
      const p = s.p;
      p.x += s.vx * dt;
      p.y += s.vy * dt;
      if (s.face) p.rotation = Math.atan2(s.vy, s.vx);
      else p.rotation += s.spin * dt;
      const k = s.life / s.max;
      p.alpha = Math.min(1, k * 1.5);
      p.scaleX = p.scaleY = s.size * (0.5 + 0.5 * k);
      (s.glow ? glow : solid).push(p);
    }
    this.glowParticles.update();
    this.solidParticles.update();
  }

  private takeG(): Graphics {
    const g = this.gPool.pop() ?? new Graphics();
    g.alpha = 1;
    g.visible = true;
    return g;
  }

  private addEffect(node: Container, life: number, update: OneShot['update'], text: 0 | 1 | 2 = 0, delayMs = 0): void {
    this.fxLayer.addChild(node);
    if (delayMs > 0) node.visible = false;
    this.textCount[text]!++;
    this.effects.push({ age: -delayMs, life, node, text, pooled: node instanceof Graphics, update });
  }

  private ringFx(at: Pt, r: number, L: Look): void {
    const g = this.takeG();
    const u = this.unit;
    this.addEffect(g, 350, (p) => {
      g.clear();
      const rr = Math.max(4, r * (0.3 + 0.7 * p));
      g.circle(at.x, at.y, rr).stroke({ width: (6 * (1 - p) + 1) * u, color: L.primary, alpha: 1 - p });
      if (L.secondary) g.circle(at.x, at.y, rr * 0.75).stroke({ width: (4 * (1 - p) + 1) * u, color: L.secondary, alpha: 1 - p });
      if (p < 0.25) g.circle(at.x, at.y, rr * 0.6).fill({ color: '#ffffff', alpha: 0.25 * (1 - p * 4) });
    });
  }

  /** Jagged bolt: thunder-coloured when the spell has thunder, with a glow in its other colour and a white core. */
  private lightning(points: Pt[], L: Look): void {
    if (points.length < 2) return;
    const u = this.unit;
    const main = L.has('thunder') ? COLORS.element.thunder : L.primary;
    const other = L.colors.find((c) => c !== main) ?? null;
    const g = this.takeG();
    for (let i = 1; i < points.length; i++) {
      const s = jaggedPath(points[i - 1]!, points[i]!, Math.max(3, Math.floor(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) / (16 * u))), this.rng);
      if (other) this.strokePath(g, s, 8 * u, other, 0.35);
      this.strokePath(g, s, 3.5 * u, main, 1);
      this.strokePath(g, s, 1.2 * u, '#ffffff', 1);
    }
    this.addEffect(g, 260, (p) => {
      g.alpha = 1 - p;
    });
  }

  private strokePath(g: Graphics, pts: Pt[], width: number, color: string, alpha: number): void {
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k]!.x, pts[k]!.y);
    g.stroke({ width, color, alpha });
  }

  private floatText(text: string, color: string, x: number, y: number, immune = false): void {
    const kind = immune ? 2 : 1;
    if (this.textCount[kind]! >= (immune ? MAX_IMMUNE_TEXTS : MAX_FLOAT_TEXTS)) return;
    const fontSize = immune ? IMMUNE_FONT_PX : 16 * this.unit;
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
    }, kind);
  }

  /** 「×N 一網打盡！」 pops in when six or more foes die within 0.8 s, and grows while the count climbs. */
  private updateBanner(dtMs: number): void {
    const kt = this.killTimes;
    let drop = 0;
    while (drop < kt.length && this.time - kt[drop]! >= MULTI_KILL_WINDOW_MS) drop++;
    if (drop > 0) kt.splice(0, drop);
    const label = multiKillLabel(kt, this.time);
    const b = this.banner;
    if (!b) return;
    if (label && label.n > this.bannerN) {
      this.bannerN = label.n;
      b.text = `×${label.n} 一網打盡！`;
      this.bannerAge = 0;
    } else if (!label) {
      this.bannerN = 0;
    }
    this.bannerAge += dtMs;
    const a = this.arena;
    const u = this.unit;
    b.visible = this.bannerAge < BANNER_MS;
    if (b.visible) {
      const pop = Math.max(0, 1 - this.bannerAge / 200);
      b.scale.set(u * (1 + pop * 0.6));
      b.alpha = Math.min(1, ((BANNER_MS - this.bannerAge) / BANNER_MS) * 2);
      b.position.set(a.center.x, Math.max(28 * u, a.center.y - a.radius + 40 * u));
    }
    const cl = this.castLabel;
    if (cl) {
      this.castAge += dtMs;
      cl.visible = this.castAge < CAST_LABEL_MS;
      if (cl.visible) {
        const p = this.castAge / CAST_LABEL_MS;
        cl.scale.set(u);
        cl.alpha = Math.min(1, (1 - p) * 2);
        cl.position.set(a.center.x, a.center.y - (HERO_H / 2 + 10 + 22 * p) * u);
      }
    }
  }

  private updateShake(dtMs: number): void {
    for (let i = this.pendingShakes.length - 1; i >= 0; i--) {
      const s = this.pendingShakes[i]!;
      if (this.time >= s.at) {
        this.shake = Math.max(this.shake, s.mag);
        this.pendingShakes.splice(i, 1);
      }
    }
    this.shake = Math.max(this.shake * Math.pow(SHAKE_DECAY, dtMs / 1000), this.sustainedShake);
    const m = this.shake * this.unit;
    if (m > 0.4) this.shakeRoot.position.set((this.rng.next() * 2 - 1) * m, (this.rng.next() * 2 - 1) * m);
    else this.shakeRoot.position.set(0, 0);
  }

  private tick(dtMs: number): void {
    this.time += dtMs;
    this.frameDt = Math.min(100, dtMs);
    for (const cb of [...this.frameCbs]) cb();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i]!;
      ef.age += dtMs;
      if (ef.age < 0) continue;
      ef.node.visible = true;
      const p = Math.min(1, ef.age / ef.life);
      ef.update(p, dtMs);
      if (p >= 1) {
        this.textCount[ef.text]!--;
        if (ef.pooled && this.gPool.length < POOL_GRAPHICS) {
          const g = ef.node as Graphics;
          g.clear();
          g.removeFromParent();
          this.gPool.push(g);
        } else {
          ef.node.destroy({ children: true });
        }
        this.effects.splice(i, 1);
      }
    }
    this.updateParticles(this.frameDt);
    this.updateBanner(dtMs);
    this.updateShake(dtMs);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.frameCbs.clear();
    if (this.ready_) {
      this.ready_ = false;
      for (const g of this.gPool) g.destroy();
      this.app.destroy(true, { children: true });
      for (const t of this.shapeTex.values()) t.destroy();
      this.atlas?.destroy(true);
    }
    // If init is still pending, init() tears the app down when it finishes.
    void this.ready;
  }
}

/** Four-point star (stunned). */
function star(g: Graphics, x: number, y: number, r: number, color: string): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    pts.push(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  g.poly(pts).fill(color).stroke({ width: 1, color: '#000000', alpha: 0.6 });
}
