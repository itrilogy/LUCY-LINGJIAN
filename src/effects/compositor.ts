import { sampleRippleBeat } from "./WaterRipple";

export type LightId = string;

type Particle =
  | { kind: "ember"; x: number; y: number; vx: number; vy: number; life: number; r: number }
  | { kind: "rain"; x: number; y: number; vy: number; len: number; z: number; slant: number; thick: number }
  | {
      kind: "glass";
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      mass: number;
      spreadX: number;
      spreadY: number;
      resistance: number;
      shifting: number;
      nextMotion: number;
      lastTrailY: number;
      nextTrail: number;
      phase: number;
      bulge: number;
      tiny: boolean;
    }
  | { kind: "residue"; x: number; y: number; h: number; w: number; a: number }
  | {
      kind: "fly";
      x: number;
      y: number;
      vx: number;
      vy: number;
      px: number;
      r: number;
      z: number;
      period: number;
    }
  | {
      kind: "ring";
      x: number;
      y: number;
      r: number;
      vr: number;
      life: number;
      thick: number;
      vx: number;
      flat: number;
      delay: number;
    }
  | { kind: "spark"; x: number; y: number; life: number; r: number }
  | { kind: "bokeh"; x: number; y: number; z: number; vx: number; r: number }
  | { kind: "scratch"; x: number; life: number; thick: number; len: number }
  | { kind: "dust"; x: number; y: number; r: number; life: number }
  | { kind: "kick"; x: number; y: number; r: number; vr: number; life: number; thick: number };

export const LIGHT: Record<string, [string, string, string]> = {
  "cool-fog": ["48%", "42%", "rgba(180,200,220,.4)"],
  "warm-shaft": ["62%", "28%", "rgba(255,170,90,.45)"],
  "amber-dust": ["70%", "30%", "rgba(255,140,60,.4)"],
  "warm-interior": ["40%", "18%", "rgba(255,196,110,.42)"],
  "cabin-window": ["68%", "42%", "rgba(140,180,255,.4)"],
  lantern: ["72%", "62%", "rgba(255,190,80,.5)"],
  "street-streak": ["30%", "40%", "rgba(255,160,70,.35)"],
  "glass-bokeh": ["55%", "40%", "rgba(255,220,120,.3)"],
  "fire-pulse": ["48%", "72%", "rgba(255,120,40,.55)"],
  "hearth-glow": ["32%", "62%", "rgba(255,110,40,.5)"],
  "city-streak": ["50%", "40%", "rgba(180,140,255,.28)"],
  "canopy-shaft": ["50%", "30%", "rgba(180,220,200,.28)"],
  overcast: ["50%", "20%", "rgba(160,180,200,.22)"],
  "horizon-wash": ["50%", "40%", "rgba(255,200,150,.28)"],
  "moon-path": ["62%", "30%", "rgba(200,220,255,.38)"],
  "leaf-caustic": ["45%", "55%", "rgba(170,230,190,.25)"],
  "lantern-steam": ["62%", "28%", "rgba(255,170,90,.45)"],
  "firefly-pulse": ["50%", "55%", "rgba(210,255,140,.22)"],
  "moon-curtain": ["58%", "32%", "rgba(190,210,255,.35)"],
  "storm-flash": ["60%", "35%", "rgba(220,230,255,.2)"],
  "split-warm-cool": ["28%", "60%", "rgba(255,140,50,.45)"],
  "window-lamp": ["78%", "42%", "rgba(255,200,110,.4)"],
  "beat-glow": ["62%", "68%", "rgba(255,150,50,.5)"],
};

export class EffectCompositor {
  private particles: Particle[] = [];
  private effects: string[] = [];
  private flash = 0;
  private t0 = performance.now();
  private bumpT = 0;
  private bumpAmp = 0;
  private nextBump = 2800;
  private raf = 0;
  private running = false;
  private extra: Particle[] = [];
  private rainWait = 0;
  private glassWait = 0;
  private rippleWait = 0;
  private pulseWait = 0;
  private bgGen = 0;
  private bgImg: HTMLImageElement | null = null;
  shake = { x: 0, y: 0, r: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx2: CanvasRenderingContext2D,
  ) {}

  setEffects(effects: string[]): void {
    this.effects = effects;
    this.particles = [];
    this.rainWait = 0;
    this.glassWait = 0;
    this.rippleWait = 0;
    this.pulseWait = 0;
  }

  setBackground(url: string | null): void {
    const gen = ++this.bgGen;
    if (!url) {
      this.bgImg = null;
      return;
    }
    const img = new Image();
    img.src = url;
    img.onload = () => {
      if (gen === this.bgGen) {
        this.bgImg = img;
      }
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop(performance.now());
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  resize(): void {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    if (document.hidden) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dt = Math.min(40, now - this.t0);
    this.t0 = now;
    this.draw(now, dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  private spawnRain(): void {
    const z = Math.pow(Math.random(), 0.85);
    this.particles.push({
      kind: "rain",
      x: Math.random() * this.canvas.width,
      y: -16 - Math.random() * 50,
      vy: 4.2 + z * 6.5,
      len: 12 + z * 22,
      z,
      slant: 1.4 + z * 2.8,
      thick: 0.4 + z * 0.85,
    });
  }

  private spawnFly(): void {
    const z = 0.35 + Math.random() * 0.75;
    this.particles.push({
      kind: "fly",
      x: Math.random() * this.canvas.width,
      y: this.canvas.height * (0.12 + Math.random() * 0.72),
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.22,
      px: Math.random() * 20,
      r: 1.6 + z * 3.4,
      z,
      period: 1400 + Math.random() * 2200,
    });
  }

  private spawnRipple(amp: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.particles.push({
      kind: "ring",
      x: w * (0.1 + Math.random() * 0.8),
      y: h * (0.42 + Math.random() * 0.48),
      r: 4 + amp * 16,
      vr: 0.02 + amp * 0.03,
      life: 1,
      thick: 0.7 + amp * 1.5,
      vx: (Math.random() - 0.35) * 0.012,
      flat: 0.34 + Math.random() * 0.12,
      delay: 0,
    });
  }

  private makeGlass(x: number, y: number, size: number, tiny: boolean): Extract<Particle, { kind: "glass" }> {
    const mass = size * size;
    const maxRes = 100 * 100 * 4;
    return {
      kind: "glass",
      x,
      y,
      vx: 0,
      vy: 0,
      r: size,
      mass,
      spreadX: 0.45,
      spreadY: 0.45,
      resistance: tiny ? 1e12 : Math.random() * 2400 * maxRes,
      shifting: (Math.random() * 2 - 1) * 0.08,
      nextMotion: performance.now() + 100 + Math.random() * 300,
      lastTrailY: y,
      nextTrail: 20 + Math.random() * 16,
      phase: Math.random() * 12,
      bulge: 0,
      tiny,
    };
  }

  private spawnGlass(kind: "micro" | "cling" | "slide"): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (kind === "micro") {
      this.particles.push(this.makeGlass(Math.random() * w, Math.random() * h * 0.94, (7 + Math.random() * 16) * dpr, true));
      return;
    }
    const size = kind === "slide" ? (52 + Math.random() * 42) * dpr : (38 + Math.random() * 36) * dpr;
    const drop = this.makeGlass(Math.random() * w, Math.random() * (kind === "slide" ? h * 0.35 : h * 0.85), size, false);
    if (kind === "slide") {
      drop.resistance = 0;
      drop.vy = 80 + Math.random() * 140;
      drop.spreadY = 0.7;
    }
    this.particles.push(drop);
  }

  private spawn(effect: string): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (effect === "embers") {
      this.particles.push({
        kind: "ember",
        x: Math.random() * w,
        y: h * (0.72 + Math.random() * 0.22),
        vx: (Math.random() - 0.5) * 0.28,
        vy: -0.35 - Math.random() * 0.8,
        life: 1,
        r: 1 + Math.random() * 2.2,
      });
    } else if (effect === "raindrops") {
      this.spawnRain();
    } else if (effect === "fireflies") {
      this.spawnFly();
    } else if (effect === "ripples") {
      this.spawnRipple(sampleRippleBeat().amp);
    } else if (effect === "parallax") {
      const z = 0.25 + Math.random() * 0.75;
      this.particles.push({
        kind: "bokeh",
        x: w + 20 + Math.random() * 80,
        y: h * (0.28 + Math.random() * 0.5),
        z,
        vx: -(0.25 + z * 0.9),
        r: 2 + z * 7,
      });
    } else if (effect === "grain") {
      if (Math.random() < 0.55) {
        this.particles.push({
          kind: "scratch",
          x: Math.random() * w,
          life: 0.18 + Math.random() * 0.35,
          thick: 0.8 + Math.random() * 1.8,
          len: h * (0.22 + Math.random() * 0.7),
        });
      } else {
        this.particles.push({
          kind: "dust",
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.4 + Math.random() * 1.6,
          life: 0.2 + Math.random() * 0.5,
        });
      }
    }
  }

  private leaveResidue(x: number, y: number, h: number, w: number, a: number): void {
    if (h < 4 || a < 0.04) return;
    this.particles.push({ kind: "residue", x, y, h, w, a });
  }

  private stepGlass(now: number, dt: number, dpr: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dtSec = dt / 1000;
    const gravity = 2400 * dpr;
    const maxRes = 100 * 100 * 4;
    const glass = this.particles.filter((p): p is Extract<Particle, { kind: "glass" }> => p.kind === "glass");

    for (const p of glass) {
      p.bulge *= Math.pow(0.12, dtSec);
      if (p.tiny) {
        p.x += Math.sin(now * 0.0007 + p.phase) * 0.015 * dpr;
        continue;
      }
      if (now >= p.nextMotion) {
        p.nextMotion = now + 100 + Math.random() * 300;
        p.resistance = Math.random() * gravity * maxRes;
        p.shifting = (Math.random() * 2 - 1) * (0.02 + Math.random() * 0.08);
      }
      p.mass -= 10 * dpr * dpr * dtSec;
      if (p.mass < 36 * dpr * dpr) {
        p.x = Math.random() * w;
        p.y = Math.random() * h * 0.25;
        p.r = (38 + Math.random() * 40) * dpr;
        p.mass = p.r * p.r;
        p.vy = 0;
        p.vx = 0;
        p.spreadX = 0.45;
        p.spreadY = 0.45;
        continue;
      }
      p.r = Math.sqrt(p.mass);
      const force = gravity * p.mass - p.resistance;
      const acc = force / p.mass;
      p.vy += acc * dtSec;
      if (p.vy < 0) p.vy = 0;
      p.vx = p.vy * p.shifting;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      if (p.vy > 50 && Math.random() < dtSec * 10) {
        this.leaveResidue(p.x, p.y - p.r * 0.4, p.r * 0.9, Math.max(1.2 * dpr, p.r * 0.1), 0.22);
      }
      const spreadV = 0.3 * 2 * Math.atan(p.vy * 0.005) / Math.PI;
      p.spreadY = Math.max(p.spreadY, spreadV);
      p.spreadX *= Math.pow(0.01, dtSec);
      p.spreadY *= Math.pow(0.01, dtSec);
      if (p.spreadX < 0.08) p.spreadX = 0.08;
      if (p.y - p.lastTrailY > p.nextTrail && p.vy > 40 && p.mass > 1000 * dpr * dpr) {
        const shed = p.r * (0.3 + Math.random() * 0.2);
        const trail = this.makeGlass(p.x + (Math.random() - 0.5) * 10 * dpr, p.y - p.r * 0.2, shed, true);
        trail.spreadY = Math.abs(p.vy) * 0.01 * 0.6;
        this.particles.push(trail);
        p.mass -= trail.mass;
        p.lastTrailY = p.y;
        p.nextTrail = (20 + Math.random() * 16) * dpr;
      }
      if (p.x < -p.r) p.x = w + p.r * 0.2;
      if (p.x > w + p.r) p.x = -p.r * 0.2;
      if (p.y > h + p.r) {
        p.y = Math.random() * h * 0.18;
        p.x = Math.random() * w;
        p.vy = 0;
        p.r = (42 + Math.random() * 40) * dpr;
        p.mass = p.r * p.r;
        p.spreadX = 0.5;
        p.spreadY = 0.5;
      }
    }

    const live = this.particles.filter((p): p is Extract<Particle, { kind: "glass" }> => p.kind === "glass" && !p.tiny);
    live.sort((a, b) => a.y - b.y);
    const dead = new Set<Particle>();
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (dead.has(a)) continue;
      for (let j = i + 1; j < live.length && j < i + 12; j++) {
        const b = live[j];
        if (dead.has(b)) continue;
        const dy = b.y - a.y;
        if (dy > (a.r + b.r) * 0.5) break;
        const dx = b.x - a.x;
        const merge = (a.r + b.r) * 0.16;
        if (dx * dx + dy * dy >= merge * merge) continue;
        const big = a.mass >= b.mass ? a : b;
        const small = big === a ? b : a;
        const mx = big.vx * big.mass + small.vx * small.mass;
        const my = big.vy * big.mass + small.vy * small.mass;
        big.mass += small.mass;
        big.r = Math.sqrt(big.mass);
        big.vx = mx / big.mass;
        big.vy = my / big.mass;
        big.bulge = 0.35;
        dead.add(small);
      }
    }
    if (dead.size) this.particles = this.particles.filter((p) => !dead.has(p));
  }

  private drawGlassDrop(
    ctx: CanvasRenderingContext2D,
    p: Extract<Particle, { kind: "glass" }>,
    dpr: number,
  ): void {
    const rx = p.r * (0.5 + p.spreadX * 0.5 + p.bulge * 0.12);
    const ry = p.r * (0.5 + p.spreadY * 0.5 + p.bulge * 0.08);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const img = this.bgImg;
    if (img && img.complete && img.naturalWidth > 0 && !p.tiny) {
      const mag = 1.22 + Math.min(0.35, p.r / (220 * dpr));
      const dw = rx * 2 * mag;
      const dh = ry * 2 * mag;
      const dx = p.x - dw / 2 + rx * 0.08;
      const dy = p.y - dh / 2 + ry * 0.06;
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = this.canvas.width / this.canvas.height;
      let bw: number;
      let bh: number;
      let ox: number;
      let oy: number;
      if (ir > cr) {
        bh = this.canvas.height;
        bw = bh * ir;
        ox = (this.canvas.width - bw) / 2;
        oy = 0;
      } else {
        bw = this.canvas.width;
        bh = bw / ir;
        ox = 0;
        oy = (this.canvas.height - bh) / 2;
      }
      ctx.drawImage(
        img,
        ((dx - ox) / bw) * img.naturalWidth,
        ((dy - oy) / bh) * img.naturalHeight,
        (dw / bw) * img.naturalWidth,
        (dh / bh) * img.naturalHeight,
        dx,
        dy,
        dw,
        dh,
      );
    } else {
      const body = ctx.createRadialGradient(p.x, p.y - ry * 0.2, 0, p.x, p.y, Math.max(rx, ry));
      body.addColorStop(0, "rgba(255,255,255,.38)");
      body.addColorStop(0.45, "rgba(210,230,245,.16)");
      body.addColorStop(1, "rgba(170,200,220,.05)");
      ctx.fillStyle = body;
      ctx.fill();
    }
    const gloss = ctx.createRadialGradient(p.x - rx * 0.28, p.y - ry * 0.38, 0, p.x, p.y, Math.max(rx, ry));
    gloss.addColorStop(0, "rgba(255,255,255,.55)");
    gloss.addColorStop(0.22, "rgba(255,255,255,.12)");
    gloss.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gloss;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = Math.max(0.8, p.r * 0.03);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.ellipse(p.x - rx * 0.32, p.y - ry * 0.4, rx * 0.22, ry * 0.16, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private stepFly(
    p: Extract<Particle, { kind: "fly" }>,
    now: number,
    dt: number,
    dpr: number,
    w: number,
    h: number,
  ): void {
    const k = dt / 16.7;
    p.vx += (Math.sin(now * 0.00085 + p.px) * 0.018 + Math.sin(now * 0.0021 + p.px * 1.7) * 0.01) * k;
    p.vy += (Math.cos(now * 0.0007 + p.px * 1.3) * 0.014 + Math.sin(now * 0.0016 + p.px) * 0.008) * k;
    p.vx *= Math.pow(0.96, k);
    p.vy *= Math.pow(0.96, k);
    p.x += p.vx * dpr * (0.7 + p.z) * k;
    p.y += p.vy * dpr * (0.55 + p.z * 0.5) * k;
    if (p.x < -20) p.x = w + 10;
    if (p.x > w + 20) p.x = -10;
    if (p.y < h * 0.06) p.vy += 0.04 * k;
    if (p.y > h * 0.88) p.vy -= 0.05 * k;
  }

  private drawFly(
    ctx: CanvasRenderingContext2D,
    p: Extract<Particle, { kind: "fly" }>,
    now: number,
    dpr: number,
  ): void {
    const t = ((now + p.px * 180) % p.period) / p.period;
    let pulse = 0;
    if (t < 0.18) pulse = Math.sin((t / 0.18) * Math.PI);
    else if (t < 0.28) pulse = 0.55 + 0.45 * Math.sin(((t - 0.18) / 0.1) * Math.PI);
    else pulse = 0.04;
    const glow = p.r * (2.8 + pulse * 4.2) * p.z * dpr;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
    g.addColorStop(0, `rgba(255,255,210,${0.85 * pulse})`);
    g.addColorStop(0.18, `rgba(210,255,120,${0.55 * pulse * p.z})`);
    g.addColorStop(0.5, `rgba(140,220,70,${0.18 * pulse})`);
    g.addColorStop(1, "rgba(80,160,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,230,${0.35 + 0.65 * pulse})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.1, p.r * 0.45 * dpr), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawWaterFilm(now: number, _dt: number, dpr: number): void {
    const ctx = this.ctx2;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let k = 0; k < 10; k++) {
      ctx.beginPath();
      const y0 = h * (0.55 + k * 0.042);
      ctx.strokeStyle = `rgba(198,228,228,${0.028 + (k % 3) * 0.01})`;
      ctx.lineWidth = (0.55 + (k % 2) * 0.3) * dpr;
      for (let x = 0; x <= w; x += 7) {
        const y =
          y0 +
          Math.sin(x * 0.011 + now * 0.00018 + k * 0.8) * 2.8 * dpr +
          Math.sin(x * 0.028 + now * 0.00011 + k) * 1.3 * dpr;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const seed = i * 17.13;
      const drift = now * 0.006 * ((i % 5) - 2);
      const x = (Math.abs(Math.sin(seed)) * w + drift + w) % w;
      const y = h * (0.57 + Math.abs(Math.sin(seed * 1.7)) * 0.38);
      const a = 0.035 + 0.07 * (0.5 + 0.5 * Math.sin(now * 0.0009 + seed));
      ctx.fillStyle = `rgba(220,245,245,${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.8 * dpr, 1.05 * dpr, 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRing(ctx: CanvasRenderingContext2D, p: Extract<Particle, { kind: "ring" }>, dpr: number): void {
    const rx = p.r;
    const ry = p.r * p.flat;
    const a = Math.max(0, p.life);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(210,240,235,${0.52 * a})`;
    ctx.lineWidth = Math.max(0.9, p.thick) * dpr * (0.7 + a * 0.4);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * a})`;
    ctx.lineWidth = Math.max(0.5, p.thick * 0.4) * dpr;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
    ctx.stroke();
    const shine = ctx.createRadialGradient(p.x, p.y - ry * 0.2, 0, p.x, p.y, rx);
    shine.addColorStop(0, `rgba(230,255,250,${0.08 * a})`);
    shine.addColorStop(0.55, "rgba(180,220,220,0)");
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private trafficShake(now: number, dt: number): void {
    this.bumpT += dt;
    if (this.bumpT > this.nextBump) {
      this.bumpT = 0;
      this.nextBump = 2400 + Math.random() * 3800;
      this.bumpAmp = 0.22 + Math.random() * 0.45;
    }
    this.bumpAmp *= Math.pow(0.18, dt / 1000);
    const rumble = Math.sin(now * 0.021) * 0.14 + Math.sin(now * 0.047) * 0.08;
    this.shake.x = rumble * 0.7 + this.bumpAmp * 1.6;
    this.shake.y = Math.sin(now * 0.018) * 0.35 + this.bumpAmp * (Math.random() > 0.5 ? 1.1 : -0.8);
    this.shake.r = rumble * 0.04 + this.bumpAmp * 0.12;
  }

  private draw(now: number, dt: number): void {
    const ctx = this.ctx2;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    this.extra = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    if (this.effects.includes("parallax")) this.trafficShake(now, dt);
    else this.shake = { x: 0, y: 0, r: 0 };

    if (this.effects.includes("grain")) {
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const y = ((now * 0.055 + i * 41) % (h + 50)) - 25;
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.1)";
        ctx.fillRect(0, y, w, (1 + (i % 2)) * dpr);
      }
      for (let i = 0; i < 7; i++) {
        const x = ((now * (0.08 + i * 0.011) + i * 73) % (w + 80)) - 40;
        const a = 0.045 + 0.05 * (0.5 + 0.5 * Math.sin(now * 0.006 + i));
        ctx.fillStyle = i % 2 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 0.7})`;
        ctx.fillRect(x, 0, (1 + (i % 3)) * dpr, h);
      }
      if (Math.random() < 0.012) {
        const x = Math.random() * w;
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.fillRect(x, 0, (6 + Math.random() * 18) * dpr, h);
      }
      ctx.restore();
    }

    if (this.effects.includes("waves")) {
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 2 * dpr;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        const y0 = h * (0.62 + k * 0.07);
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x * 0.008 + now * 0.0008 + k) * (10 + k * 4) * dpr;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    if (this.effects.includes("ripples")) this.drawWaterFilm(now, dt, dpr);

    if (this.effects.includes("lightning")) {
      if (Math.random() < 0.0022) this.flash = 1;
      if (this.flash > 0) {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, `rgba(210,225,255,${0.32 * this.flash})`);
        sky.addColorStop(0.42, `rgba(180,200,230,${0.08 * this.flash})`);
        sky.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        this.flash *= 0.78;
      }
    }

    if (this.effects.includes("pulse")) {
      this.pulseWait -= dt;
      if (this.pulseWait <= 0) {
        this.flash = Math.max(this.flash, 0.16);
        this.particles.push({
          kind: "kick",
          x: w * (0.42 + Math.random() * 0.2),
          y: h * (0.62 + Math.random() * 0.18),
          r: 10 * dpr,
          vr: 0.11 + Math.random() * 0.04,
          life: 1,
          thick: 2.2 + Math.random() * 1.2,
        });
        this.particles.push({
          kind: "spark",
          x: w * (0.25 + Math.random() * 0.5),
          y: h * (0.55 + Math.random() * 0.3),
          life: 1,
          r: 3 + Math.random() * 5,
        });
        this.shake = { x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 1.4, r: (Math.random() - 0.5) * 0.12 };
        this.pulseWait = 430 + Math.random() * 50;
      }
      if (this.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = `rgba(255,140,40,${0.12 * this.flash})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    const cap: Record<string, number> = {
      embers: 90,
      fireflies: 48,
      parallax: 28,
      grain: 36,
    };
    for (const e of this.effects) {
      if (e === "raindrops") {
        let rains = 0;
        let glasses = 0;
        for (const p of this.particles) {
          if (p.kind === "rain") rains++;
          else if (p.kind === "glass") glasses++;
        }
        this.rainWait -= dt;
        this.glassWait -= dt;
        if (rains < 40 && this.rainWait <= 0) {
          this.spawnRain();
          this.rainWait = rains < 24 ? 18 : 55 + Math.random() * 80;
        }
        if (glasses < 170 && this.glassWait <= 0) {
          let tiny = 0;
          for (const p of this.particles) if (p.kind === "glass" && p.tiny) tiny++;
          const large = glasses - tiny;
          if (tiny < 130) this.spawnGlass("micro");
          else if (large < 40) this.spawnGlass(Math.random() < 0.18 ? "slide" : "cling");
          this.glassWait = glasses < 90 ? 12 : 40 + Math.random() * 70;
        }
        continue;
      }
      if (e === "ripples") {
        let rings = 0;
        for (const p of this.particles) if (p.kind === "ring") rings++;
        this.rippleWait -= dt;
        if (this.rippleWait <= 0) {
          const beat = sampleRippleBeat();
          const cap = beat.amp > 0.78 ? 4 : beat.amp > 0.48 ? 6 : 8;
          if (rings < cap) this.spawnRipple(beat.amp);
          this.rippleWait = beat.waitSec * 1000;
        }
        continue;
      }
      const need = cap[e];
      if (!need) continue;
      const have = this.particles.filter((p) =>
        (e === "embers" && p.kind === "ember") ||
        (e === "fireflies" && p.kind === "fly") ||
        (e === "parallax" && p.kind === "bokeh") ||
        (e === "grain" && (p.kind === "scratch" || p.kind === "dust")),
      ).length;
      if (have < need) this.spawn(e);
      if (have < need - 10) this.spawn(e);
    }

    if (this.effects.includes("raindrops")) this.stepGlass(now, dt, dpr);

    this.particles = this.particles.filter((p) => {
      if (p.kind === "ember") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 0.00035;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const rad = p.r * (1.4 + p.life) * dpr;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 3.2);
        g.addColorStop(0, `rgba(255,230,160,${0.85 * p.life})`);
        g.addColorStop(0.25, `rgba(255,140,40,${0.45 * p.life})`);
        g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,180,80,${0.35 * p.life})`;
        ctx.lineWidth = Math.max(0.6, p.r * 0.4) * dpr;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 18 * dpr, p.y - p.vy * 18 * dpr);
        ctx.stroke();
        ctx.restore();
        return p.life > 0 && p.y > 0;
      }
      if (p.kind === "rain") {
        p.y += p.vy * dpr;
        const a = 0.08 + p.z * 0.16;
        ctx.save();
        ctx.strokeStyle = `rgba(214,230,255,${a})`;
        ctx.lineWidth = p.thick * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.slant * dpr, p.y + p.len * dpr);
        ctx.stroke();
        ctx.restore();
        if (p.y > h) {
          p.y = -20;
          p.x = Math.random() * w;
        }
        return true;
      }
      if (p.kind === "residue") {
        p.a *= Math.pow(0.35, dt / 1000);
        ctx.save();
        ctx.strokeStyle = `rgba(210,228,245,${0.22 * p.a})`;
        ctx.lineWidth = p.w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.h);
        ctx.stroke();
        ctx.restore();
        return p.a > 0.03;
      }
      if (p.kind === "glass") {
        this.drawGlassDrop(ctx, p, dpr);
        return true;
      }
      if (p.kind === "fly") {
        this.stepFly(p, now, dt, dpr, w, h);
        this.drawFly(ctx, p, now, dpr);
        return true;
      }
      if (p.kind === "kick") {
        p.r += dt * p.vr;
        p.life -= dt * 0.0009;
        const a = Math.max(0, p.life);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = `rgba(255,170,70,${0.55 * a})`;
        ctx.lineWidth = Math.max(1, p.thick * a) * dpr;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(0,210,255,${0.22 * a})`;
        ctx.lineWidth = Math.max(0.6, p.thick * 0.4) * dpr;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * 0.78, p.r * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return p.life > 0;
      }
      if (p.kind === "ring") {
        if (p.delay > 0) {
          p.delay -= dt;
          return true;
        }
        p.r += dt * 0.04;
        p.x += p.vx * dt * dpr;
        p.life -= dt * 0.0005;
        this.drawRing(ctx, p, dpr);
        return p.life > 0;
      }
      if (p.kind === "spark") {
        p.life -= dt * 0.0034;
        const a = Math.max(0, p.life);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const rad = p.r * (0.7 + (1 - a) * 1.6) * dpr;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
        g.addColorStop(0, `rgba(245,255,255,${0.7 * a})`);
        g.addColorStop(0.35, `rgba(190,230,255,${0.28 * a})`);
        g.addColorStop(1, "rgba(160,210,230,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rad * 1.15, rad * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return p.life > 0;
      }
      if (p.kind === "bokeh") {
        p.x += p.vx * p.z * dpr;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const rad = p.r * dpr;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 2.4);
        g.addColorStop(0, `rgba(255,236,200,${0.22 + p.z * 0.28})`);
        g.addColorStop(0.45, `rgba(255,186,110,${0.1 + p.z * 0.12})`);
        g.addColorStop(1, "rgba(255,160,80,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,248,230,${0.35 + p.z * 0.25})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.1, rad * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (p.x < -60) p.x = w + 40;
        return true;
      }
      if (p.kind === "scratch") {
        p.life -= dt * 0.0016;
        ctx.strokeStyle = `rgba(255,255,255,${0.28 * p.life})`;
        ctx.lineWidth = p.thick * dpr;
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x + 3 * dpr, p.len);
        ctx.stroke();
        ctx.strokeStyle = `rgba(0,0,0,${0.16 * p.life})`;
        ctx.beginPath();
        ctx.moveTo(p.x + 1.5 * dpr, 0);
        ctx.lineTo(p.x + 4.5 * dpr, p.len);
        ctx.stroke();
        return p.life > 0;
      }
      if (p.kind === "dust") {
        p.life -= dt * 0.0014;
        ctx.fillStyle = `rgba(255,255,255,${0.18 * p.life})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
        ctx.fill();
        return p.life > 0;
      }
      return false;
    });
    if (this.extra.length) this.particles.push(...this.extra);
  }
}
