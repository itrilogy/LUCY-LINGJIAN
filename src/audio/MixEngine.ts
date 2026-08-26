import {
  categoryPool,
  fileById,
  type Catalog,
  type CatalogFile,
} from "../../shared/catalog";
import type { Mix, MixTrack } from "../../shared/mixSchema";
import { mulberry32, pickNext } from "./shuffle";
import { volumeToGain } from "./volume";

export type EngineStatus = "idle" | "playing" | "paused";

export type EngineSnapshot = {
  status: EngineStatus;
  sessionSec: number;
  master: number;
  current: Array<{
    trackId: string;
    fileId: string;
    label: string;
    progress: number;
    volume: number;
    muted: boolean;
  }>;
};

type Listener = (s: EngineSnapshot) => void;

function cosineDown(from: number, n = 48): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => from * Math.cos((Math.PI / 2) * (i / (n - 1))));
}
function cosineUp(to: number, n = 48): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => to * Math.sin((Math.PI / 2) * (i / (n - 1))));
}

class Slot {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  file: CatalogFile | null = null;
  constructor(ctx: AudioContext, dest: AudioNode) {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";
    this.audio.loop = false;
    this.audio.volume = 1;
    this.source = ctx.createMediaElementSource(this.audio);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain);
    this.gain.connect(dest);
  }
  async load(file: CatalogFile): Promise<void> {
    if (this.file?.id === file.id && this.audio.src) return;
    this.file = file;
    this.audio.loop = false;
    this.audio.src = file.url;
    this.audio.load();
    await waitReady(this.audio);
  }
  async playFromStart(): Promise<void> {
    this.audio.currentTime = 0;
    await this.audio.play();
  }
}

function waitReady(audio: HTMLAudioElement, ms = 12000): Promise<void> {
  if (audio.readyState >= 3) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      cleanup();
      if (audio.readyState >= 2) resolve();
      else reject(new Error("audio timeout"));
    }, ms);
    const ok = () => {
      cleanup();
      resolve();
    };
    const err = () => {
      cleanup();
      reject(new Error("audio error"));
    };
    const cleanup = () => {
      window.clearTimeout(t);
      audio.removeEventListener("canplay", ok);
      audio.removeEventListener("error", err);
    };
    audio.addEventListener("canplay", ok);
    audio.addEventListener("error", err);
  });
}

class TrackPlayer {
  readonly track: MixTrack;
  private readonly ctx: AudioContext;
  private readonly catalog: Catalog;
  private readonly rng: () => number;
  private readonly avoidN: number;
  readonly trackGain: GainNode;
  private a: Slot;
  private b: Slot;
  private active: "a" | "b" = "a";
  private fading = false;
  private gen = 0;
  private history: string[] = [];
  private timer: number | null = null;
  private running = false;
  currentFile: CatalogFile | null = null;

  constructor(ctx: AudioContext, master: AudioNode, track: MixTrack, catalog: Catalog, mix: Mix) {
    this.ctx = ctx;
    this.track = track;
    this.catalog = catalog;
    this.avoidN = mix.shuffle.avoid_last_n;
    this.rng = mix.shuffle.seed != null
      ? mulberry32(mix.shuffle.seed ^ hash(track.id))
      : Math.random;
    this.trackGain = ctx.createGain();
    this.trackGain.gain.value = track.muted ? 0 : volumeToGain(track.volume);
    this.trackGain.connect(master);
    this.a = new Slot(ctx, this.trackGain);
    this.b = new Slot(ctx, this.trackGain);
    const onEnded = (which: "a" | "b") => {
      if (!this.running || this.fading) return;
      if (this.active !== which) return;
      if (this.track.kind === "category") void this.crossfade(true);
    };
    this.a.audio.addEventListener("ended", () => onEnded("a"));
    this.b.audio.addEventListener("ended", () => onEnded("b"));
  }

  setVolume(v: number, muted: boolean): void {
    this.track.volume = v;
    this.track.muted = muted;
    this.trackGain.gain.setTargetAtTime(muted ? 0 : volumeToGain(v), this.ctx.currentTime, 0.04);
  }

  kick(): Promise<"ok" | "blocked" | "pending"> {
    this.running = true;
    const first = this.nextFile();
    const slot = this.a;
    slot.file = first;
    slot.audio.loop = this.track.kind === "file" && this.track.loop;
    slot.audio.src = first.url;
    this.currentFile = first;
    this.history.push(first.id);
    const tin = Math.max(0.05, this.track.fade_in_ms / 1000);
    slot.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    slot.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    slot.gain.gain.setValueCurveAtTime(cosineUp(1), this.ctx.currentTime, tin);
    const outcome = this.tryPlay(slot.audio);
    this.armWatch();
    if (this.track.kind === "category") void this.prefetch();
    return outcome;
  }

  ensurePlaying(): void {
    if (!this.running) return;
    void this.tryPlay(this.activeSlot().audio);
    if (this.fading) void this.tryPlay(this.idleSlot().audio);
  }

  private async tryPlay(audio: HTMLAudioElement): Promise<"ok" | "blocked" | "pending"> {
    void this.ctx.resume();
    try {
      await audio.play();
      return "ok";
    } catch (e) {
      const blocked = e instanceof DOMException && e.name === "NotAllowedError";
      audio.addEventListener(
        "canplay",
        () => {
          void audio.play().catch(() => undefined);
        },
        { once: true },
      );
      return blocked ? "blocked" : "pending";
    }
  }

  pause(): void {
    this.a.audio.pause();
    this.b.audio.pause();
  }

  async resume(): Promise<void> {
    const plays = [this.activeSlot().audio.play().then(() => undefined, () => undefined)];
    if (this.fading) plays.push(this.idleSlot().audio.play().then(() => undefined, () => undefined));
    await Promise.all(plays);
  }

  async skip(): Promise<void> {
    if (this.track.kind !== "category") return;
    await this.crossfade(true);
  }

  async stop(fadeMs?: number): Promise<void> {
    this.running = false;
    this.gen += 1;
    if (this.timer != null) window.clearInterval(this.timer);
    const t = (fadeMs ?? this.track.fade_out_ms) / 1000;
    const now = this.ctx.currentTime;
    const active = this.activeSlot();
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueCurveAtTime(
      cosineDown(active.gain.gain.value),
      now,
      Math.max(0.04, t),
    );
    await sleep(Math.max(40, t * 1000));
    this.a.audio.pause();
    this.b.audio.pause();
    this.a.gain.gain.value = 0;
    this.b.gain.gain.value = 0;
  }

  progress(): number {
    const s = this.activeSlot();
    const d = s.audio.duration;
    if (!d || !isFinite(d) || d <= 0) return 0;
    return Math.min(1, s.audio.currentTime / d);
  }

  private activeSlot(): Slot {
    return this.active === "a" ? this.a : this.b;
  }
  private idleSlot(): Slot {
    return this.active === "a" ? this.b : this.a;
  }

  private nextFile(except?: string): CatalogFile {
    if (this.track.kind === "file") {
      const f = fileById(this.catalog, this.track.target_id);
      if (!f) throw new Error(`missing file ${this.track.target_id}`);
      return f;
    }
    const pool = categoryPool(this.track.target_id as never, this.catalog.files);
    const hist = except ? [...this.history, except] : this.history;
    return pickNext(pool, hist, this.avoidN, this.rng);
  }

  private async prefetch(): Promise<void> {
    const g = this.gen;
    try {
      const nxt = this.nextFile(this.currentFile?.id);
      await this.idleSlot().load(nxt);
    } catch (e) {
      console.warn("prefetch", e);
    }
    if (g !== this.gen) return;
  }

  private armWatch(): void {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (!this.running || this.fading) return;
      const s = this.activeSlot();
      const d = s.audio.duration;
      if (!d || !isFinite(d) || d <= 0) return;
      const remain = d - s.audio.currentTime;
      const tout = Math.max(0.15, this.track.fade_out_ms / 1000);
      if (this.track.kind === "file") {
        if (this.track.loop) return;
        if (remain <= tout) void this.stop();
        return;
      }
      if (remain <= tout + 0.05) void this.crossfade(false);
    }, 120);
  }

  private async crossfade(force: boolean): Promise<void> {
    if (this.fading || !this.running) return;
    this.fading = true;
    const g = this.gen;
    const from = this.activeSlot();
    const to = this.idleSlot();
    if (!to.file) {
      try {
        await this.prefetch();
      } catch {
        from.audio.loop = true;
        this.fading = false;
        return;
      }
    }
    if (!to.file) {
      from.audio.loop = true;
      this.fading = false;
      return;
    }
    const d = from.audio.duration;
    let tin = this.track.fade_in_ms / 1000;
    let tout = this.track.fade_out_ms / 1000;
    if (isFinite(d) && d < 2 * Math.max(tin, tout) + 0.5) {
      tin = tout = Math.max(0.12, d / 4);
    }
    from.audio.loop = false;
    try {
      await to.playFromStart();
    } catch (e) {
      console.warn("crossfade play", e);
      from.audio.loop = true;
      this.fading = false;
      return;
    }
    if (g !== this.gen) return;
    const now = this.ctx.currentTime;
    from.gain.gain.cancelScheduledValues(now);
    to.gain.gain.cancelScheduledValues(now);
    from.gain.gain.setValueCurveAtTime(cosineDown(1), now, tout);
    to.gain.gain.setValueAtTime(0, now);
    to.gain.gain.setValueCurveAtTime(cosineUp(1), now, tin);
    await sleep(Math.max(tin, tout) * 1000);
    if (g !== this.gen) return;
    from.audio.pause();
    from.audio.currentTime = 0;
    from.gain.gain.value = 0;
    this.active = this.active === "a" ? "b" : "a";
    this.currentFile = to.file;
    this.history.push(to.file.id);
    if (this.history.length > 8) this.history.splice(0, this.history.length - 8);
    this.fading = false;
    if (this.track.kind === "category") void this.prefetch();
    if (force) this.armWatch();
  }
}

export class MixEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private players = new Map<string, TrackPlayer>();
  private mix: Mix | null = null;
  private status: EngineStatus = "idle";
  private startedAt = 0;
  private pausedAccum = 0;
  private pauseMark = 0;
  private listeners = new Set<Listener>();
  private raf = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): EngineSnapshot {
    const sessionSec =
      this.status === "idle"
        ? 0
        : this.status === "paused"
          ? this.pausedAccum
          : (performance.now() - this.startedAt) / 1000 + this.pausedAccum;
    return {
      status: this.status,
      sessionSec,
      master: this.mix?.master_volume ?? 0.8,
      current: [...this.players.values()].map((p) => ({
        trackId: p.track.id,
        fileId: p.currentFile?.id ?? "",
        label: p.currentFile?.label_zh ?? p.track.target_id,
        progress: p.progress(),
        volume: p.track.volume,
        muted: p.track.muted,
      })),
    };
  }

  /** Call synchronously inside a click/keydown so AudioContext + element.play stay in the user gesture. */
  arm(): void {
    if (!this.ctx || this.ctx.state === "closed") this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  hasPlayers(): boolean {
    return this.players.size > 0;
  }

  /** After a refresh: keep the clock, show 继续, wait for a click to start. */
  holdInterrupted(sessionSec: number): void {
    this.dropPlayers();
    this.status = "paused";
    this.pausedAccum = Math.max(0, sessionSec);
    this.pauseMark = performance.now();
    this.emit();
  }

  /** If the UI says playing but nothing is actually audible, fall back to paused. */
  syncToReality(): void {
    if (this.status !== "playing") return;
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed" || ctx.state === "suspended" || this.players.size === 0) {
      this.status = "paused";
      this.pauseMark = performance.now();
      this.emit();
    }
  }

  async start(mix: Mix, catalog: Catalog): Promise<void> {
    this.arm();
    const sessionCarry = this.status === "paused" ? this.pausedAccum : 0;
    this.dropPlayers();
    this.mix = mix;
    const ctx = this.ctx!;
    if (this.master) this.master.disconnect();
    if (this.analyser) this.analyser.disconnect();
    const master = ctx.createGain();
    master.gain.value = volumeToGain(mix.master_volume);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    master.connect(analyser);
    analyser.connect(ctx.destination);
    this.master = master;
    this.analyser = analyser;
    void ctx.resume();
    const live = mix.tracks.slice(0, 8);
    const kicks: Array<Promise<"ok" | "blocked" | "pending">> = [];
    for (const t of live) {
      const p = new TrackPlayer(ctx, master, t, catalog, mix);
      this.players.set(t.id, p);
      kicks.push(p.kick());
    }
    if (this.players.size === 0) throw new Error("没有轨道能够开始播放");
    this.emit();
    const outcomes = await Promise.all(kicks);
    this.pausedAccum = sessionCarry;
    const audible = outcomes.some((o) => o === "ok" || o === "pending");
    if (!audible) {
      this.status = "paused";
      this.pauseMark = performance.now();
      this.emit();
      return;
    }
    this.status = "playing";
    this.startedAt = performance.now();
    this.tick();
  }

  async pause(): Promise<void> {
    if (this.status !== "playing") return;
    this.pauseMark = performance.now();
    await this.ctx?.suspend();
    for (const p of this.players.values()) p.pause();
    this.status = "paused";
    this.emit();
  }

  async resume(): Promise<void> {
    if (this.status !== "paused") return;
    if (this.players.size === 0) return;
    this.pausedAccum += (performance.now() - this.pauseMark) / 1000;
    this.arm();
    void this.ctx?.resume();
    for (const p of this.players.values()) p.ensurePlaying();
    this.startedAt = performance.now();
    this.status = "playing";
    this.tick();
  }

  ensureAudible(): void {
    this.arm();
    if (this.status === "paused") {
      void this.resume();
      return;
    }
    if (this.status !== "playing") return;
    void this.ctx?.resume();
    for (const p of this.players.values()) p.ensurePlaying();
  }

  async skip(): Promise<void> {
    await Promise.all(
      [...this.players.values()]
        .filter((p) => p.track.kind === "category")
        .map((p) => p.skip()),
    );
  }

  setMaster(v: number): void {
    if (this.mix) this.mix.master_volume = v;
    this.master?.gain.setTargetAtTime(volumeToGain(v), this.ctx?.currentTime ?? 0, 0.03);
    this.emit();
  }

  setTrack(id: string, volume: number, muted: boolean): void {
    const t = this.mix?.tracks.find((x) => x.id === id);
    if (t) {
      t.volume = volume;
      t.muted = muted;
    }
    this.players.get(id)?.setVolume(volume, muted);
    this.emit();
  }

  private dropPlayers(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const p of this.players.values()) p.pause();
    this.players.clear();
  }

  async stop(fadeMs = 400): Promise<void> {
    if (this.raf) cancelAnimationFrame(this.raf);
    const ps = [...this.players.values()];
    this.players.clear();
    await Promise.all(ps.map((p) => p.stop(fadeMs)));
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
    this.analyser = null;
    this.status = "idle";
    this.emit();
  }

  private tick = (): void => {
    this.emit();
    if (this.status === "playing") this.raf = requestAnimationFrame(this.tick);
  };

  private emit(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }
}

export const engine = new MixEngine();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
