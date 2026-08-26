import RaindropFX from "raindrop-fx";

export type RainIntensity = "rain" | "storm";

const SHARED = {
  slipRate: 0,
  motionInterval: [0.1, 0.4],
  trailDropDensity: 0.2,
  trailDistance: [20, 30],
  trailDropSize: [0.3, 0.5],
  trailSpread: 0.6,
  initialSpread: 0.5,
  evaporate: 10,
  xShifting: [0, 0.1],
  backgroundBlurSteps: 3,
  mist: true,
  mistColor: [0.01, 0.01, 0.01, 0.32],
  mistBlurStep: 4,
  smoothRaindrop: [0.96, 0.99],
  refractBase: 0.4,
  refractScale: 0.6,
  raindropSpecularShininess: 256,
} as const;

const PRESET: Record<RainIntensity, Record<string, unknown>> = {
  rain: {
    ...SHARED,
    spawnInterval: [0.1, 0.1],
    spawnSize: [60, 100],
    spawnLimit: 2000,
    gravity: 2400,
    dropletsPerSeconds: 500,
    dropletSize: [10, 30],
    mistTime: 10,
  },
  storm: {
    ...SHARED,
    spawnInterval: [0.06, 0.1],
    spawnSize: [70, 120],
    spawnLimit: 2200,
    gravity: 2800,
    dropletsPerSeconds: 720,
    dropletSize: [10, 34],
    mistTime: 6,
    xShifting: [0, 0.16],
  },
};

type Zogra = { use: () => void; ctx: unknown };
type FxInternal = {
  simulator: { update: (t: { dt: number; total: number }) => void; raindrops: unknown };
  renderer: {
    loadAssets: () => Promise<void>;
    render: (drops: unknown, t: { dt: number; total: number }) => void;
    originalBackground?: { width?: number; height?: number } | null;
  };
};

let shared: RainGlass | null = null;

function zrOf(fx: RaindropFX | null): Zogra | null {
  const zr = (fx as unknown as { renderer?: { renderer?: Zogra } } | null)?.renderer?.renderer;
  return zr && typeof zr.use === "function" ? zr : null;
}

function bindZogra(fx: RaindropFX): void {
  zrOf(fx)?.use();
}

function clearZogra(fx: RaindropFX | null): void {
  const zr = zrOf(fx);
  if (!zr) return;
  const keep = zr.ctx;
  zr.ctx = undefined;
  try {
    zr.use();
  } catch {
    /* ignore */
  }
  zr.ctx = keep;
}

function resetCompiledGpu(root: unknown): void {
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    if (typeof Node !== "undefined" && node instanceof Node) return;
    if (typeof WebGL2RenderingContext !== "undefined" && node instanceof WebGL2RenderingContext) return;
    seen.add(node);
    const rec = node as Record<string, unknown>;
    if (typeof rec.vertexShaderSource === "string" && "initialized" in rec) {
      rec.initialized = false;
      rec.gl = null;
      rec.program = null;
    }
    if ("_shader" in rec && "initialized" in rec) {
      rec.initialized = false;
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(root);
}

async function decodeBg(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return img;
}

function hostCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "fx-glass";
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

export function attachRainGlass(slot: HTMLElement): RainGlass {
  if (!shared) shared = new RainGlass(hostCanvas());
  if (shared.canvas.parentElement !== slot) slot.appendChild(shared.canvas);
  return shared;
}

export function detachRainGlass(): void {
  if (!shared) return;
  shared.pause();
  shared.canvas.remove();
}

export class RainGlass {
  readonly canvas: HTMLCanvasElement;
  private fx: RaindropFX | null = null;
  private url: string | null = null;
  private intensity: RainIntensity = "rain";
  private running = false;
  private gen = 0;
  private raf = 0;
  private recovering = false;
  private creating: Promise<boolean> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.style.opacity = "0";
    this.canvas.addEventListener("webglcontextlost", this.onLost);
    this.canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  async setScene(url: string | null, intensity: RainIntensity = "rain"): Promise<boolean> {
    if (!url) {
      this.gen += 1;
      this.pause();
      this.url = null;
      return false;
    }
    const gen = ++this.gen;
    this.intensity = intensity;
    if (this.fx && this.url === url && !this.contextLost()) {
      await this.waitFit();
      if (gen !== this.gen) return false;
      bindZogra(this.fx);
      const box = this.canvas.getBoundingClientRect();
      this.fx.resize(Math.max(1, Math.floor(box.width)), Math.max(1, Math.floor(box.height)));
      this.apply(intensity);
      this.startLoop();
      this.paint();
      this.show();
      return true;
    }
    if (this.creating) await this.creating;
    if (gen !== this.gen) return false;
    const work = this.boot(url, intensity, gen);
    this.creating = work;
    try {
      return await work;
    } finally {
      if (this.creating === work) this.creating = null;
    }
  }

  resize(): void {
    if (!this.fx) return;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(0, Math.floor(r.width));
    const h = Math.max(0, Math.floor(r.height));
    if (w < 8 || h < 8) return;
    const opts = this.fx.options as { width?: number; height?: number };
    if (opts.width === w && opts.height === h) return;
    bindZogra(this.fx);
    this.fx.resize(w, h);
  }

  pause(): void {
    this.stopLoop();
    this.hide();
  }

  destroy(): void {
    this.gen += 1;
    this.hide();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.teardown(true);
    if (shared === this) shared = null;
  }

  private async boot(url: string, intensity: RainIntensity, gen: number): Promise<boolean> {
    try {
      const img = await decodeBg(url);
      await this.waitFit();
      if (gen !== this.gen) return false;
      if (!this.fx || this.contextLost()) {
        this.teardown(false);
        this.fx = new RaindropFX({
          canvas: this.canvas,
          background: img,
          ...PRESET[intensity],
        });
        bindZogra(this.fx);
        await (this.fx as unknown as FxInternal).renderer.loadAssets();
      } else {
        bindZogra(this.fx);
        this.apply(intensity);
        if (this.url !== url) await this.fx.setBackground(img);
      }
      if (gen !== this.gen) return false;
      bindZogra(this.fx);
      this.url = url;
      this.startLoop();
      this.paint();
      if (!this.backgroundReady()) {
        this.hide();
        this.teardown(false);
        return false;
      }
      this.show();
      return true;
    } catch (e) {
      console.warn("RaindropFX unavailable", e);
      this.hide();
      this.teardown(false);
      return false;
    }
  }

  private startLoop(): void {
    this.running = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.pump);
  }

  private stopLoop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.fx?.stop();
  }

  private paint(): void {
    if (!this.fx) return;
    bindZogra(this.fx);
    const fx = this.fx as unknown as FxInternal;
    const time = { dt: 0.03, total: performance.now() / 1000 };
    fx.simulator.update(time);
    fx.renderer.render(fx.simulator.raindrops, time);
  }

  private pump = (now: number): void => {
    if (!this.running || !this.fx) return;
    try {
      bindZogra(this.fx);
      const fx = this.fx as unknown as FxInternal;
      const time = { dt: 0.03, total: now / 1000 };
      fx.simulator.update(time);
      fx.renderer.render(fx.simulator.raindrops, time);
    } catch (e) {
      console.warn("RaindropFX frame", e);
      void this.recover();
      return;
    }
    this.raf = requestAnimationFrame(this.pump);
  };

  private onLost = (e: Event): void => {
    e.preventDefault();
    this.stopLoop();
    this.hide();
  };

  private onRestored = (): void => {
    void this.recover();
  };

  private async recover(): Promise<void> {
    if (this.recovering) return;
    const url = this.url;
    const intensity = this.intensity;
    if (!url) return;
    this.recovering = true;
    this.teardown(false);
    try {
      await this.setScene(url, intensity);
    } finally {
      this.recovering = false;
    }
  }

  private teardown(loseContext: boolean): void {
    this.stopLoop();
    clearZogra(this.fx);
    if (this.fx) resetCompiledGpu(this.fx);
    if (loseContext) {
      const gl = this.canvas.getContext("webgl2");
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.fx = null;
    this.running = false;
  }

  private contextLost(): boolean {
    const gl = this.canvas.getContext("webgl2");
    return !gl || gl.isContextLost();
  }

  private backgroundReady(): boolean {
    const bg = (this.fx as unknown as FxInternal | null)?.renderer?.originalBackground;
    return !!bg && (bg.width ?? 0) > 1 && (bg.height ?? 0) > 1;
  }

  private hide(): void {
    this.canvas.style.opacity = "0";
  }

  private show(): void {
    this.canvas.style.opacity = "1";
  }

  private apply(intensity: RainIntensity): void {
    if (!this.fx) return;
    for (const [k, v] of Object.entries(PRESET[intensity])) {
      this.fx.options[k] = v;
    }
  }

  private fit(): boolean {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(0, Math.floor(r.width));
    const h = Math.max(0, Math.floor(r.height));
    if (w < 8 || h < 8) return false;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    return true;
  }

  private async waitFit(): Promise<void> {
    for (let i = 0; i < 30; i++) {
      if (this.fit()) return;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    this.canvas.width = Math.max(1, this.canvas.clientWidth || 1);
    this.canvas.height = Math.max(1, this.canvas.clientHeight || 1);
  }
}
