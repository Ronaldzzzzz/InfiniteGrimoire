import { Application, BitmapFont, BitmapText, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { BattleEvent, MonsterInstance } from '../engine/battle';
import type { Snapshot } from '../game/runtime';
import { createRng } from '../engine/rng';
import type { GameData } from '../engine/types';
import { boxRadius, clampToView, makeArena, monsterDistance, pickSpawnAngle, polarPoint, stopRadius, type Arena } from './arena';
import { floatingText, jaggedPath, type Pt } from './effects';
import { COLORS, spellColor } from './palette';

const MONSTER_SIZE = 28;
const HERO_W = 22;
const HERO_H = 38;
const TEXT_MS = 600;
const HP_BAR_GAP = 9; // the hp bar sits this far above the body
const IMMUNE_FONT_PX = 16; // fixed, readable at any arena size (spec 4.3)
const TEXT_MARGIN = 24;

interface MonsterView {
  root: Container;
  body: Graphics | Sprite;
  hpBar: Graphics;
  fx: Graphics;
  size: number;
  born: number;
  pos: Pt;
  angle: number;
  /** current on-screen radius */
  r: number;
  lastFrac: number;
  hadStatus: boolean;
}

interface Effect {
  age: number;
  life: number;
  node: Container;
  update: (p: number, dtMs: number) => void;
}

const tint = (c: string): number => parseInt(c.slice(1), 16);

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

export class BattleView {
  private readonly app = new Application();
  private readonly ready: Promise<void>;
  private ready_ = false;
  private destroyed = false;
  private readonly monsters = new Map<number, MonsterView>();
  private readonly effects: Effect[] = [];
  private readonly frameCbs = new Set<() => void>();
  private readonly rng = createRng((Date.now() ^ 0x9e3779b9) >>> 0);
  private world = new Container();
  private hero: Graphics | Sprite | null = null;
  private fxLayer = new Container();
  private time = 0;
  private unit = 1;
  private arena: Arena = makeArena(1, 1, 0);
  private ring = new Graphics();
  private ringKey = '';

  constructor(
    private readonly host: HTMLElement,
    private readonly data: GameData,
    private readonly textures: Map<string, Texture>,
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({ background: COLORS.bg, resizeTo: this.host, antialias: false });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world, this.fxLayer);
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
  private get heroCenter(): Pt {
    return this.arena.center;
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

  private makeMonster(m: MonsterInstance): MonsterView {
    const def = this.data.monsters[m.defId];
    const size = MONSTER_SIZE * (def?.boss ? 2 : 1);
    const tex = this.textures.get(`monster_${m.defId}`);
    let body: Graphics | Sprite;
    if (tex) {
      body = new Sprite(tex);
      (body as Sprite).anchor.set(0.5);
    } else {
      const g = new Graphics();
      const color = COLORS.element[def?.element ?? 'none'];
      g.rect(-size / 2, -size / 2, size, size).fill(color);
      g.rect(-size / 2 + size * 0.2, -size * 0.2, size * 0.15, size * 0.15).fill(COLORS.bg);
      g.rect(size / 2 - size * 0.35, -size * 0.2, size * 0.15, size * 0.15).fill(COLORS.bg);
      body = g;
    }
    const root = new Container();
    const hpBar = new Graphics();
    const fx = new Graphics();
    root.addChild(body, fx, hpBar);
    this.world.addChild(root);
    const angle = pickSpawnAngle([...this.monsters.values()].map((v) => v.angle), this.rng);
    return { root, body, hpBar, fx, size, born: this.time, pos: { x: 0, y: 0 }, angle, r: this.extent(size), lastFrac: -1, hadStatus: false };
  }

  sync(snapshot: Snapshot): void {
    if (!this.ready_ || this.destroyed) return;
    this.unit = Math.max(0.6, Math.min(1.6, Math.min(this.w, this.h) / 360));
    const u = this.unit;
    const heroR = boxRadius(HERO_W / 2, HERO_H / 2) * u;
    this.arena = makeArena(this.w, this.h, this.extent(MONSTER_SIZE * 2) * u);
    const c = this.arena.center;
    this.hero!.position.set(c.x, c.y);
    this.hero!.scale.set(u);
    this.drawRing(heroR);

    const alive = new Set<number>();
    for (const m of snapshot.battle.monsters) {
      alive.add(m.uid);
      let v = this.monsters.get(m.uid);
      if (!v) {
        v = this.makeMonster(m);
        this.monsters.set(m.uid, v);
      }
      v.r = this.extent(v.size) * u;
      const dist = monsterDistance(this.arena, stopRadius(this.arena, heroR, v.r), m.x);
      v.pos = polarPoint(this.arena, v.angle, dist);
      const pop = Math.min(1, (this.time - v.born) / 200);
      v.root.position.set(v.pos.x, v.pos.y);
      v.root.scale.set(u * (0.4 + 0.6 * pop));
      v.root.alpha = pop;
      this.drawHp(v, m);
      this.drawStatus(v, m);
    }
    // uids restart at 1 after travel / reload, so drop views (and their angles) that left the field
    for (const [uid, v] of this.monsters) {
      if (!alive.has(uid)) {
        v.root.destroy({ children: true });
        this.monsters.delete(uid);
      }
    }
  }

  /** Unscaled radius that encloses a monster body of `size` plus its hp bar. */
  private extent(size: number): number {
    return boxRadius(Math.max(12, size / 2), size / 2 + HP_BAR_GAP);
  }

  /** Faint ring where regular monsters stop; redrawn only when the view size changes. */
  private drawRing(heroR: number): void {
    const key = `${this.w}x${this.h}x${this.unit}`;
    if (key === this.ringKey) return;
    this.ringKey = key;
    const r = stopRadius(this.arena, heroR, this.extent(MONSTER_SIZE) * this.unit);
    this.ring.clear();
    this.ring.circle(this.arena.center.x, this.arena.center.y, r).stroke({ width: 1, color: COLORS.rune, alpha: 0.18 });
  }

  private drawHp(v: MonsterView, m: MonsterInstance): void {
    const frac = Math.max(0, Math.min(1, m.hp / m.maxHp));
    if (frac === v.lastFrac) return;
    v.lastFrac = frac;
    const w = Math.max(24, v.size);
    v.hpBar.clear();
    v.hpBar.rect(-w / 2, -v.size / 2 - 9, w, 4).fill('#3a2a2a');
    v.hpBar.rect(-w / 2, -v.size / 2 - 9, w * frac, 4).fill(frac > 0.35 ? COLORS.rune : '#e2643b');
  }

  private drawStatus(v: MonsterView, m: MonsterInstance): void {
    if (m.statuses.length === 0 && !v.hadStatus) return;
    v.hadStatus = m.statuses.length > 0;
    const g = v.fx;
    g.clear();
    const s = v.size;
    const body = v.body;
    body.tint = 0xffffff;
    for (const st of m.statuses) {
      if (st.kind === 'burn') {
        const on = Math.floor(this.time / 120) % 2 === 0;
        body.tint = on ? tint(COLORS.element.fire) : 0xffffff;
        g.rect(-s / 2, -s / 2, s, s).fill({ color: COLORS.element.fire, alpha: on ? 0.35 : 0.1 });
      } else if (st.kind === 'paralyze') {
        const pts = jaggedPath({ x: -s / 2, y: -s / 2 }, { x: s / 2, y: s / 2 }, 5, createRng(Math.floor(this.time / 90)));
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
        g.stroke({ width: 2, color: COLORS.element.thunder });
      } else {
        g.rect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4).stroke({ width: 2, color: '#d8f0ff' });
        g.rect(-s / 2, -s / 2, s, s).fill({ color: COLORS.element.water, alpha: 0.3 });
      }
    }
  }

  handle(events: BattleEvent[]): void {
    if (!this.ready_ || this.destroyed) return;
    for (const e of events) {
      switch (e.type) {
        case 'cast':
          this.castEffect(e.spellId, e.targets);
          break;
        case 'hit': {
          const v = this.monsters.get(e.uid);
          if (!v) break;
          const ft = floatingText(e);
          this.floatText(ft.text, ft.color, v.pos.x, v.pos.y - v.r, e.immune);
          if (!e.immune) this.burst(v.pos, COLORS.amber, 5);
          break;
        }
        case 'kill': {
          const v = this.monsters.get(e.uid);
          if (!v) break;
          const el = this.data.monsters[e.defId]?.element;
          this.burst(v.pos, COLORS.element[el ?? 'none'], 12, 1.6);
          break;
        }
        default:
          break; // spawn / status / bossDefeated are reflected via sync()
      }
    }
  }

  private addEffect(node: Container, life: number, update: Effect['update']): void {
    this.fxLayer.addChild(node);
    this.effects.push({ age: 0, life, node, update });
  }

  private targetPts(uids: number[]): Pt[] {
    const out: Pt[] = [];
    for (const uid of uids) {
      const v = this.monsters.get(uid);
      if (v) out.push(v.pos);
    }
    return out;
  }

  private fxSprite(key: string, color: string): Sprite | null {
    const tex = this.textures.get(key);
    if (!tex) return null;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.tint = tint(color);
    return s;
  }

  private castEffect(spellId: string, targets: number[]): void {
    const spell = this.data.spells[spellId];
    if (!spell) return;
    const color = spellColor(spell);
    const from = this.heroCenter;
    const pts = this.targetPts(targets);
    const u = this.unit;
    switch (spell.pattern) {
      case 'bolt': {
        const to = pts[0];
        if (!to) return;
        const node = this.fxSprite('fx_bolt', color) ?? new Graphics().circle(0, 0, 5 * u).fill(color);
        node.position.set(from.x, from.y);
        this.addEffect(node, 160, (p) => {
          node.position.set(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p);
        });
        break;
      }
      case 'beam': {
        pts.forEach((to, i) => {
          const len = Math.hypot(to.x - from.x, to.y - from.y);
          const ang = Math.atan2(to.y - from.y, to.x - from.x);
          let node: Container;
          const spr = this.fxSprite('fx_beam', color);
          if (spr) {
            spr.anchor.set(0, 0.5);
            spr.width = len;
            spr.rotation = ang;
            if (i > 0) spr.height *= 0.5;
            node = spr;
          } else {
            // R5: the first target gets the main beam, the second a thinner branch from the hero
            const g = new Graphics();
            const main = i === 0;
            g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: (main ? 5 : 2.5) * u, color });
            if (main) g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ width: 2 * u, color: '#ffffff' });
            node = g;
          }
          node.position.set(spr ? from.x : 0, spr ? from.y : 0);
          this.addEffect(node, 200, (p) => {
            node.alpha = 1 - p;
          });
        });
        break;
      }
      case 'chain': {
        const nodes: Pt[] = [from, ...pts];
        const segs: Pt[][] = [];
        for (let i = 1; i < nodes.length; i++) segs.push(jaggedPath(nodes[i - 1]!, nodes[i]!, 5, this.rng));
        if (segs.length === 0) return;
        const g = new Graphics();
        const life = 120 * segs.length + 150;
        this.addEffect(g, life, (p) => {
          const shown = Math.min(segs.length, Math.ceil(p * life / 120));
          g.clear();
          for (let i = 0; i < shown; i++) {
            const s = segs[i]!;
            g.moveTo(s[0]!.x, s[0]!.y);
            for (const q of s.slice(1)) g.lineTo(q.x, q.y);
            g.stroke({ width: 3 * u, color, alpha: Math.max(0, 1 - p * 0.6) });
          }
          g.alpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        });
        for (const to of pts) {
          const spark = this.fxSprite('fx_chain', color);
          if (spark) {
            spark.position.set(to.x, to.y);
            this.addEffect(spark, life, (p) => {
              spark.alpha = 1 - p;
            });
          }
        }
        break;
      }
      case 'nova': {
        const maxR = Math.max(60 * u, ...pts.map((p) => Math.hypot(p.x - from.x, p.y - from.y) + 20));
        const spr = this.fxSprite('fx_nova', color);
        const g = spr ? null : new Graphics();
        const node: Container = spr ?? g!;
        node.position.set(from.x, from.y);
        this.addEffect(node, 400, (p) => {
          const r = maxR * (0.15 + 0.85 * p);
          if (spr) {
            spr.width = spr.height = r * 2;
          } else {
            g!.clear();
            g!.circle(0, 0, r).stroke({ width: 4 * u, color });
          }
          node.alpha = 1 - p;
        });
        break;
      }
    }
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
    const fontSize = fixedSize ? IMMUNE_FONT_PX : 16 * this.unit;
    // numbers use a shared bitmap font; 無效 stays a Text (Pixi caches its texture by content)
    const t = /^\d+$/.test(text)
      ? new BitmapText({ text, style: { fontFamily: DMG_FONT, fontSize } })
      : new Text({ text, style: { fill: color, fontSize, fontWeight: 'bold', stroke: { color: '#000000', width: 3 } } });
    // targets can still be off-screen: keep the result readable inside the view
    const at = clampToView({ x, y }, this.w, this.h, TEXT_MARGIN);
    t.anchor.set(0.5, 1);
    t.position.set(at.x, at.y);
    this.addEffect(t, TEXT_MS, (p) => {
      t.y = at.y - 28 * this.unit * p;
      t.alpha = 1 - p;
    });
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
