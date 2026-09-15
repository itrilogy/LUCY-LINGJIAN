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
  const [idle, setIdle] = useState(false);
  const [topHot, setTopHot] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [fxOn, setFxOn] = useState(true);
  const lastMaster = useRef(0.8);
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
    let timer = 0;
    const bump = (e?: Event) => {
      setIdle(false);
      if (e instanceof PointerEvent) setTopHot(e.clientY < 48);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2000);
    };
    bump();
    window.addEventListener("pointermove", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", bump);
      window.removeEventListener("keydown", bump);
    };
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

    if (!fxOn) {
      fxRef.current?.setEffects([]);
      void rainRef.current?.setScene(null);
      void waterRef.current?.setScene(null);
      void overlayRef.current?.setScene(null, "none", 0);
      return () => {
        cancelled = true;
      };
    }

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
  }, [bg, fxKey, playEffects, visual, fxOn]);

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
  const clock = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

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
      } else if (e.code === "KeyM") {
        const live = engine.snapshot();
        if (live.master > 0) {
          lastMaster.current = live.master;
          engine.setMaster(0);
        } else {
          engine.setMaster(lastMaster.current || 0.8);
        }
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        const live = engine.snapshot();
        engine.setMaster(Math.min(1, live.master + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        const live = engine.snapshot();
        engine.setMaster(Math.max(0, live.master - 0.05));
      } else if (e.code === "KeyF") {
        setFxOn((v) => !v);
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (!e.repeat) setAdvanced((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const playing = snap.status === "playing";
  const playLabel = playing ? "暂停" : snap.status === "paused" ? "继续" : "播放";

  return (
    <div className={"play" + (reduced ? " reduce-motion" : "") + (fxOn ? "" : " fx-off") + (idle ? " idle" : "") + (topHot ? " top-hot" : "") + (advanced ? " advanced" : "")}>
      <div className="stage" aria-hidden>
        <div className="scene">
          <div
            className={"bg" + (playEffects.includes("grain") && fxOn ? " grain" : "")}
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
      <header className="play-bar">
        <button type="button" className="btn btn-ghost" onClick={() => { void engine.stop(250); nav("/"); }}>曲库</button>
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
        <div className="clock">{clock}<span>会话计时 · 无时限</span></div>
        <div className="controls">
          <button type="button" className="btn btn-ghost" onClick={() => { void engine.stop(250); nav("/"); }}>停止</button>
          <button type="button" className="playbtn" aria-label={playLabel} onClick={() => void toggle()}>
            <PlayGlyph playing={playing} />
          </button>
          {hasCategory && (
            <button type="button" className="btn btn-ghost" disabled={snap.status !== "playing"} onClick={() => void engine.skip()}>
              下一首
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "收起" : "展开"}
          </button>
          <button type="button" className="btn btn-ghost info" title="关于" aria-label="关于" onClick={() => setAbout(true)}>
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
              if (v > 0) lastMaster.current = v;
              if (mix) mix.master_volume = v;
            }}
          />
          <b>{formatPct(snap.master)}</b>
        </label>
      </div>
      </div>
      {about && <AboutModal tone="play" onClose={() => setAbout(false)} />}
    </div>
  );
}

function PlayGlyph({ playing }: { playing: boolean }) {
  if (playing) {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden>
        <rect x="6" y="5" width="4" height="14" rx="0.5" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="0.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden>
      <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
    </svg>
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

