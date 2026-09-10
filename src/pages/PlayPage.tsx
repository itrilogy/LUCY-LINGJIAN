import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Catalog } from "../../shared/catalog";
import type { Mix, MixTrack } from "../../shared/mixSchema";
import { fetchMix, fetchPoetry } from "../api/client";
import { engine, type EngineSnapshot } from "../audio/MixEngine";
import { matchBackground, tagsFromPlay } from "../backgrounds/match";
import { EffectCompositor, LIGHT } from "../effects/compositor";
import { OverlayGL } from "../effects/OverlayGL";
import { attachRainGlass, detachRainGlass, type RainGlass } from "../effects/RainGlass";
import { planVisual, seatLabel, visualKey } from "../effects/seats";
import { WaterRipple } from "../effects/WaterRipple";
import { formatPct } from "../audio/volume";
import { BRAND } from "../brand";
import { AboutModal } from "../components/AboutModal";
import { ephemeralCategoryMix, ephemeralFileMix, useStore } from "../mix/store";
import { VerseCard } from "../poetry/VerseCard";
import { useVerseCycle } from "../poetry/useVerseCycle";
import type { Quote } from "../poetry/types";
import type { PlayNavState } from "../play/nav";
import { isReloadNavigation, readPlaySession, writePlaySession } from "../play/session";

const EMPTY_TAGS: string[] = [];

export function PlayPage() {
  const nav = useNavigate();
  const params = useParams();
  const location = useLocation();
  const navState = (location.state ?? {}) as PlayNavState;
  const catalog = useStore((s) => s.catalog);
  const backgrounds = useStore((s) => s.backgrounds);
  const reloaded = useRef(isReloadNavigation() && !navState.autoplay);
  const [mix, setMix] = useState<Mix | null>(navState.mix ?? null);
  const [snap, setSnap] = useState<EngineSnapshot>(() => {
    if (!reloaded.current) return engine.snapshot();
    const saved = readPlaySession();
    const same = saved?.path === location.pathname;
    const wasLive = Boolean(same && saved && (saved.status === "playing" || saved.status === "paused"));
    if (wasLive && !navState.autoplay) {
      engine.holdInterrupted(same && saved ? saved.sessionSec : 0);
    }
    return engine.snapshot();
  });
  const [err, setErr] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [soundMap, setSoundMap] = useState<Record<string, string[]>>({});
  const [dwellSec, setDwellSec] = useState(() => {
    const n = Number(localStorage.getItem("voicestream_verse_dwell"));
    return Number.isFinite(n) && n >= 6 && n <= 60 ? n : 16;
  });
  const [about, setAbout] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glassSlotRef = useRef<HTMLDivElement>(null);
  const waterCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<EffectCompositor | null>(null);
  const rainRef = useRef<RainGlass | null>(null);
  const waterRef = useRef<WaterRipple | null>(null);
  const overlayRef = useRef<OverlayGL | null>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const unsub = engine.subscribe((s) => {
      setSnap(s);
      writePlaySession(location.pathname, s);
    });
    const persist = () => writePlaySession(location.pathname, engine.snapshot());
    const onShow = () => engine.syncToReality();
    window.addEventListener("pagehide", persist);
    window.addEventListener("pageshow", onShow);
    return () => {
      unsub();
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("pageshow", onShow);
    };
  }, [location.pathname]);

  useEffect(() => {
    const base = `${BRAND.nameZh} · ${BRAND.nameEn}`;
    document.title = mix?.name ? `${mix.name} · ${BRAND.nameZh}` : base;
    return () => {
      document.title = base;
    };
  }, [mix?.name]);

  useEffect(() => {
    void fetchPoetry().then((p) => {
      setQuotes(p.quotes);
      setSoundMap(p.soundMap);
    });
  }, []);

  useEffect(() => {
    if (navState.mix) {
      setMix((prev) => (prev?.id === navState.mix!.id ? prev : navState.mix!));
      return;
    }
    if (!catalog) return;
    let cancelled = false;
    (async () => {
      try {
        if (params.mixId) {
          const m = await fetchMix(params.mixId);
          if (!cancelled) setMix((prev) => (prev?.id === m.id ? prev : m));
          return;
        }
        if (params.fileId) {
          const f = catalog.files.find((x) => x.id === params.fileId);
          if (!f) throw new Error("没有这个文件");
          if (!cancelled) {
            setMix((prev) =>
              prev?.tracks.length === 1 && prev.tracks[0]?.kind === "file" && prev.tracks[0].target_id === f.id
                ? prev
                : ephemeralFileMix(f),
            );
          }
          return;
        }
        if (params.categoryId) {
          const c = catalog.categories.find((x) => x.id === params.categoryId);
          if (!c) throw new Error("没有这个类别");
          if (!cancelled) {
            setMix((prev) =>
              prev?.tracks.length === 1 && prev.tracks[0]?.kind === "category" && prev.tracks[0].target_id === c.id
                ? prev
                : ephemeralCategoryMix(c),
            );
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "无法载入");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalog, params.mixId, params.fileId, params.categoryId, navState.mix]);

  const momentTags = navState.momentTags ?? EMPTY_TAGS;

  const playHint = useMemo(() => {
    if (!mix) return { fileIds: [] as string[], categoryIds: [] as string[], tags: [] as string[] };
    const fileIds = mix.tracks.filter((t) => t.kind === "file").map((t) => t.target_id);
    const categoryIds = mix.tracks.filter((t) => t.kind === "category").map((t) => t.target_id);
    const tags = backgrounds
      ? tagsFromPlay(
          {
            fileIds,
            categoryIds,
            sceneIds: [
              ...(fileIds.includes("quietnight") ? ["quietnight"] : []),
              ...(fileIds.includes("drive") ? ["drive"] : []),
            ],
            extra: [...momentTags, ...(mix.visual_tags ?? [])],
          },
          backgrounds,
        )
      : [];
    return { fileIds, categoryIds, tags };
  }, [mix, backgrounds, momentTags]);

  const bg = useMemo(() => {
    if (!mix || !backgrounds) return null;
    return matchBackground(playHint.tags, backgrounds, {
      fileIds: playHint.fileIds,
      categoryIds: playHint.categoryIds,
      seed: mix.id,
    });
  }, [mix, backgrounds, playHint]);

  const playTags = playHint.tags;

  const visual = useMemo(
    () =>
      planVisual({
        tags: playHint.tags,
        stillEffects: bg?.effects ?? [],
        tracks: mix?.tracks ?? [],
        catalog,
        reducedMotion: reduced,
      }),
    [playHint.tags, bg, mix, catalog, reduced],
  );
  const playEffects = visual.particles;
  const fxKey = visualKey(visual);

  const verse = useVerseCycle(quotes, soundMap, playTags, true, dwellSec, mix?.id ?? "");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fx = new EffectCompositor(canvas, ctx);
    fxRef.current = fx;
    const slot = glassSlotRef.current;
    if (slot) rainRef.current = attachRainGlass(slot);
    const waterCanvas = waterCanvasRef.current;
    if (waterCanvas) waterRef.current = new WaterRipple(waterCanvas);
    const overlayCanvas = overlayCanvasRef.current;
    if (overlayCanvas) overlayRef.current = new OverlayGL(overlayCanvas);
    const onResize = () => {
      fx.resize();
      rainRef.current?.resize();
      waterRef.current?.resize();
      overlayRef.current?.resize();
    };
    requestAnimationFrame(onResize);
    fx.start();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      fx.stop();
      detachRainGlass();
      rainRef.current = null;
      waterRef.current?.destroy();
      waterRef.current = null;
      overlayRef.current?.destroy();
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const effects = playEffects;
    const url = bg ? `/backgrounds/${bg.file}` : null;
    const wantGlass = visual.glass != null;
    const wantWater = visual.water > 0.02 && !wantGlass;
    const storm = visual.glass === "storm";
    let cancelled = false;
    fxRef.current?.setBackground(url);
    overlayRef.current?.setLight(...lightUv(bg?.light));

    const apply2d = (glassOk: boolean, waterOk: boolean, overlayOk: boolean) => {
      if (cancelled) return;
      fxRef.current?.resize();
      const extra: string[] = [];
      if (visual.overlay === "storm" && !overlayOk && !effects.includes("lightning")) extra.push("lightning");
      if (visual.overlay === "grain" && !overlayOk && !effects.includes("grain")) extra.push("grain");
      fxRef.current?.setEffects(
        [...effects, ...extra].filter((e) => {
          if (e === "raindrops" && glassOk) return false;
          if (e === "ripples" && waterOk) return false;
          if (e === "lightning" && overlayOk && visual.overlay === "storm") return false;
          return true;
        }),
      );
    };

    apply2d(false, false, false);

    void (async () => {
      const rain = rainRef.current;
      const water = waterRef.current;
      const overlay = overlayRef.current;
      const glassOk = wantGlass && url ? Boolean(await rain?.setScene(url, storm ? "storm" : "rain")) : false;
      if (cancelled) return;
      if (!wantGlass || !glassOk) await rain?.setScene(null);
      if (cancelled) return;
      const waterOk = wantWater && url ? Boolean(await water?.setScene(url, visual.water)) : false;
      if (cancelled) return;
      if (!wantWater || !waterOk) await water?.setScene(null);
      else water?.setIntensity(visual.water);
      if (cancelled) return;
      const surface = glassOk || waterOk;
      let kind = visual.overlay;
      if (surface && (kind === "haze" || kind === "mist")) kind = "none";
      const overlayOk =
        kind !== "none" && url
          ? Boolean(
              await overlay?.setScene(url, kind, visual.overlayIntensity, {
                refract: !(surface && (kind === "heat" || kind === "moon")),
              }),
            )
          : false;
      if (cancelled) return;
      if (!overlayOk) await overlay?.setScene(null, "none", 0);
      if (cancelled) return;
      apply2d(glassOk, waterOk, overlayOk);
    })();

    return () => {
      cancelled = true;
    };
  }, [bg, fxKey, playEffects, visual]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = fxRef.current?.shake;
      const el = bgRef.current;
      if (el && s) {
        el.style.setProperty("--sx", `${s.x}px`);
        el.style.setProperty("--sy", `${s.y}px`);
        el.style.setProperty("--sr", `${s.r}deg`);
      }
      const bands = engine.visualBands();
      overlayRef.current?.setBands(bands);
      waterRef.current?.setBands(bands);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      if (!window.location.pathname.startsWith("/play")) void engine.stop(200);
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      engine.arm();
    };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, []);

  useEffect(() => {
    if (reloaded.current) return;
    if (!navState.autoplay || !mix || !catalog) return;
    const st = engine.snapshot().status;
    if (st === "playing" || st === "paused") {
      engine.ensureAudible();
      return;
    }
    setErr(null);
    engine.arm();
    void engine.start(mix, catalog).catch((e) => {
      setErr(e instanceof Error ? e.message : "播放失败");
    });
  }, [navState.autoplay, mix, catalog]);

  const light = LIGHT[bg?.light ?? ""] ?? ["50%", "60%", "rgba(255,255,255,.2)"];
  const hasCategory = mix?.tracks.some((t) => t.kind === "category") ?? false;
  const nowRows = useMemo(() => mixRows(mix, snap, catalog), [mix, snap, catalog]);
  const hours = Math.floor(snap.sessionSec / 3600);
  const mins = Math.floor((snap.sessionSec % 3600) / 60);
  const secs = Math.floor(snap.sessionSec % 60);
  const clock = `${hours > 0 ? hours + ":" : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const toggle = () => {
    if (!mix || !catalog) return;
    setErr(null);
    engine.arm();
    const st = engine.snapshot().status;
    if (st === "playing") {
      void engine.pause();
      return;
    }
    if (st === "paused" && engine.hasPlayers()) {
      void engine.resume();
      return;
    }
    void engine.start(mix, catalog).catch((e) => {
      setErr(e instanceof Error ? e.message : "播放失败");
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Escape" && about) {
        e.preventDefault();
        setAbout(false);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        void toggle();
      } else if (e.code === "Escape") {
        void engine.stop(250);
        nav("/");
      } else if (e.code === "ArrowRight") {
        void engine.skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={"play" + (reduced ? " reduce-motion" : "")}>
      <div className="stage" aria-hidden>
        <div className="scene">
          <div
            className={"bg" + (playEffects.includes("grain") ? " grain" : "")}
            ref={bgRef}
            style={{ backgroundImage: bg ? `url(/backgrounds/${bg.file})` : undefined }}
          />
          <div ref={glassSlotRef} className="fx-glass-slot" />
          <canvas ref={waterCanvasRef} className="fx-glass fx-water" />
          <canvas ref={overlayCanvasRef} className="fx-overlay" />
          <canvas ref={canvasRef} className="fx" />
        </div>
        <div
          className="bloom"
          style={{ ["--lx" as string]: light[0], ["--ly" as string]: light[1], ["--lc" as string]: light[2] }}
        />
        <div className="vignette" />
      </div>
      {verse.quote && (
        <VerseCard
          key={`${verse.quote.id}:${verse.layout}:${verse.pose.topPct}`}
          quote={verse.quote}
          pose={verse.pose}
          leaving={verse.leaving}
          layout={verse.layout}
        />
      )}
      <div className="hud">
      <header>
        <button type="button" onClick={() => { void engine.stop(250); nav("/"); }}>← 曲库</button>
        <b>{mix?.name ?? "…"}</b>
        <span>{[bg?.label_zh, seatLabel(visual)].filter(Boolean).join(" · ")}</span>
      </header>
      <div className="now">
        {nowRows.map((c) => (
          <div key={c.trackId}>
            <em>{c.label}{c.muted ? " · 静音" : ""}</em>
            <i style={{ transform: `scaleX(${Math.max(0.02, c.progress)})` }} />
            <label className="tvol">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={c.volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  engine.setTrack(c.trackId, v, c.muted);
                  if (mix) {
                    const t = mix.tracks.find((x) => x.id === c.trackId);
                    if (t) t.volume = v;
                  }
                }}
              />
              <b>{formatPct(c.volume)}</b>
            </label>
          </div>
        ))}
      </div>
      <div className="dock">
        {err && <p className="err">{err}</p>}
        <div className="clock">{clock}<span>循环中 · 无时限</span></div>
        <div className="controls">
          <button type="button" className="ghost" onClick={() => { void engine.stop(250); nav("/"); }}>停止</button>
          <button type="button" className="playbtn" onClick={() => void toggle()}>
            {snap.status === "playing" ? "暂停" : snap.status === "paused" ? "继续" : "播放"}
          </button>
          {hasCategory && (
            <button type="button" className="ghost" disabled={snap.status !== "playing"} onClick={() => void engine.skip()}>
              下一首
            </button>
          )}
          <button type="button" className="ghost info" title="关于" aria-label="关于" onClick={() => setAbout(true)}>
            i
          </button>
        </div>
        <label className="vol">
          金句停留
          <input
            type="range"
            min={6}
            max={40}
            step={1}
            value={dwellSec}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDwellSec(v);
              localStorage.setItem("voicestream_verse_dwell", String(v));
            }}
          />
          <b>{dwellSec}s</b>
        </label>
        <label className="vol">
          主音量
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={snap.master}
            onChange={(e) => {
              const v = Number(e.target.value);
              engine.setMaster(v);
              if (mix) mix.master_volume = v;
            }}
          />
          <b>{formatPct(snap.master)}</b>
        </label>
      </div>
      </div>
      {about && <AboutModal tone="play" onClose={() => setAbout(false)} />}
      <style>{playCss}</style>
    </div>
  );
}

function lightUv(id: string | undefined): [number, number] {
  const row = LIGHT[id ?? ""];
  if (!row) return [0.52, 0.78];
  const x = Number.parseFloat(row[0] ?? "50") / 100;
  const top = Number.parseFloat(row[1] ?? "30") / 100;
  return [Number.isFinite(x) ? x : 0.52, Number.isFinite(top) ? 1 - top : 0.78];
}

function mixRows(mix: Mix | null, snap: EngineSnapshot, catalog: Catalog | null) {
  if (snap.current.length > 0) {
    return snap.current.map((c) => ({
      trackId: c.trackId,
      label: c.label,
      muted: c.muted,
      progress: c.progress,
      volume: c.volume,
    }));
  }
  if (!mix) return [];
  return mix.tracks.map((t) => rowFromTrack(t, undefined, catalog));
}

function rowFromTrack(
  t: MixTrack,
  live: EngineSnapshot["current"][number] | undefined,
  catalog: Catalog | null,
) {
  const fileId = live?.fileId || (t.kind === "file" ? t.target_id : "");
  const file = fileId ? catalog?.files.find((f) => f.id === fileId) : undefined;
  const cat = t.kind === "category" ? catalog?.categories.find((x) => x.id === t.target_id) : undefined;
  return {
    trackId: t.id,
    label: live?.label || file?.label_zh || cat?.label_zh || t.target_id,
    muted: live?.muted ?? t.muted,
    progress: live?.progress ?? 0,
    volume: live?.volume ?? t.volume,
  };
}

const playCss = `
.play { position: fixed; inset: 0; overflow: hidden; color: #f4efe6; isolation: isolate; }
.stage {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  isolation: isolate;
}
.hud {
  position: absolute; inset: 0; z-index: 40; pointer-events: none;
}
.hud header, .hud .now, .hud .dock { pointer-events: auto; }
.scene {
  position: absolute; inset: -3.2%;
  transform-origin: 50% 42%;
  animation: ken 76s ease-in-out infinite alternate;
}
.play.reduce-motion .scene { animation: none; inset: 0; }
.bg {
  position: absolute; inset: 0;
  background: #0a0a0c center / cover no-repeat;
  transform: translate3d(var(--sx, 0px), var(--sy, 0px), 0) rotate(var(--sr, 0deg));
  will-change: transform;
  filter: saturate(.92) contrast(1.04);
}
.bg.grain::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .08;
  background-image: repeating-radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 1px 3px);
  mix-blend-mode: overlay; animation: grain 0.4s steps(2) infinite;
}
@keyframes ken { from { transform: scale(1.012); } to { transform: scale(1.042) translate3d(-0.4%, -.25%, 0); } }
@keyframes grain { from { transform: translate(0,0); } to { transform: translate(-2%, 1%); } }
.fx-glass-slot, .fx-glass, .fx-overlay, .fx {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none;
}
.fx-glass-slot, .fx-glass { z-index: 0; }
.fx-overlay { z-index: 1; opacity: 0; transition: opacity .45s ease; }
.fx-glass { opacity: 0; transition: opacity .4s ease; }
.fx { z-index: 2; }
.vignette {
  position: absolute; inset: 0; pointer-events: none; z-index: 3;
  background:
    radial-gradient(ellipse at 50% 40%, transparent 42%, rgba(0,0,0,.4) 100%),
    linear-gradient(180deg, rgba(0,0,0,.22) 0%, transparent 24%, transparent 62%, rgba(0,0,0,.62) 100%);
}
.bloom {
  position: absolute; inset: 0; pointer-events: none; z-index: 3; mix-blend-mode: screen;
  background: radial-gradient(ellipse at var(--lx,50%) var(--ly,70%), var(--lc, rgba(255,180,80,.35)), transparent 55%);
  animation: breathe 6.4s ease-in-out infinite;
}
@keyframes breathe { 0%,100% { opacity: .14 } 50% { opacity: .3 } }
header {
  position: absolute; top: 0; left: 0; right: 0; z-index: 31;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 20px; background: linear-gradient(180deg, rgba(0,0,0,.45), transparent);
}
header b { letter-spacing: .12em; font-weight: 500; }
header span { color: rgba(244,239,230,.5); font-size: 12px; margin-left: auto; }
.now {
  position: absolute; top: 64px; right: 22px; z-index: 50;
  width: min(300px, 42vw);
  transform: translateZ(0);
}
.now div { margin-bottom: 12px; }
.now em {
  display: block; font-style: normal; font-size: 11px;
  color: rgba(244,239,230,.82); margin-bottom: 3px;
  text-shadow: 0 1px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9);
}
.now i { display: block; height: 2px; width: 100%; background: #fff; transform-origin: left; opacity: .85; }
.tvol { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.tvol input { flex: 1; }
.tvol b, .vol b { font-size: 11px; font-variant-numeric: tabular-nums; font-weight: 500; min-width: 2.8em; text-align: right; }
.dock {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 31;
  padding: 18px 24px 28px;
  display: grid; justify-items: center; gap: 10px;
  background: linear-gradient(0deg, rgba(0,0,0,.55), transparent);
}
.clock { letter-spacing: .16em; font-size: 13px; }
.clock span { margin-left: 10px; color: rgba(244,239,230,.45); letter-spacing: .08em; font-size: 11px; }
.controls { display: flex; gap: 10px; align-items: center; }
.playbtn { min-width: 96px; padding: 10px 22px; font-size: 15px; background: rgba(255,255,255,.14); }
.ghost { background: transparent; }
.info {
  width: 34px; height: 34px; padding: 0;
  font-style: italic; font-family: Georgia, "Times New Roman", serif;
  font-size: 16px; font-weight: 600; letter-spacing: 0;
}
.vol { display: flex; gap: 10px; align-items: center; font-size: 12px; color: rgba(244,239,230,.55); width: min(360px, 70vw); }
.vol input { flex: 1; }
.err { color: #ffb4a2; font-size: 12px; }
.verse {
  position: absolute;
  z-index: 8;
  margin: 0;
  pointer-events: none;
  color: rgba(252, 247, 236, 0.92);
  text-shadow: 0 1px 18px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.8);
  font-family: "Songti TC", "Kaiti TC", "STKaiti", "Songti SC", "Kaiti SC", "Source Han Serif TC", "Noto Serif TC", serif;
  transition: opacity 0.9s ease;
  max-height: 52vh;
  max-width: min(42vw, 420px);
}
.verse.leaving { opacity: 0; }
.verse .el {
  display: block;
  opacity: 0;
  animation: verseIn 1.15s ease forwards;
  animation-delay: calc(var(--i) * 0.78s);
}
.verse.leaving .el { animation: none; opacity: 1; }
.verse.vert {
  writing-mode: vertical-rl;
  letter-spacing: 0.22em;
}
.verse.vert .title {
  font-size: 13px;
  letter-spacing: 0.32em;
  color: rgba(252,247,236,.62);
  padding-left: 0.55em;
}
.verse.vert .line {
  font-size: clamp(20px, 2.4vw, 30px);
  font-weight: 500;
  line-height: 1.55;
}
.verse.vert .by {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgba(252,247,236,.5);
  padding-right: 0.4em;
}
.verse.horiz {
  writing-mode: horizontal-tb;
  max-width: min(28vw, 280px);
}
.verse.horiz .title {
  font-size: 12px;
  letter-spacing: 0.28em;
  color: rgba(252,247,236,.58);
  margin-bottom: 10px;
}
.verse.horiz .line {
  font-size: clamp(18px, 2vw, 26px);
  line-height: 1.7;
  letter-spacing: 0.12em;
}
.verse.horiz .by {
  margin-top: 12px;
  font-size: 12px;
  letter-spacing: 0.16em;
  color: rgba(252,247,236,.48);
}
@keyframes verseIn {
  from { opacity: 0; filter: blur(6px); transform: translateY(8px); }
  to { opacity: 1; filter: blur(0); transform: none; }
}
.verse.vert .el { transform: none; }
.verse.vert .el {
  animation-name: verseInVert;
}
@keyframes verseInVert {
  from { opacity: 0; filter: blur(6px); }
  to { opacity: 1; filter: blur(0); }
}
`;
