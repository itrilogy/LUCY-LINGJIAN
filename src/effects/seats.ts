import type { Catalog } from "../../shared/catalog";
import type { MixTrack } from "../../shared/mixSchema";
import { effectsFromTags } from "../backgrounds/match";

export type OverlayKind =
  | "none"
  | "haze"
  | "snow"
  | "shafts"
  | "storm"
  | "heat"
  | "moon"
  | "grain"
  | "mist";

export type GlassKind = "rain" | "storm";

export type VisualPlan = {
  glass: GlassKind | null;
  water: number;
  overlay: OverlayKind;
  overlayIntensity: number;
  particles: string[];
  reducedMotion: boolean;
};

const MUTE = 0.02;

function familyOf(track: MixTrack, catalog: Catalog | null): string {
  if (track.kind === "category") return track.target_id;
  const f = catalog?.files.find((x) => x.id === track.target_id);
  if (f?.id === "quietnight") return "quietnight";
  if (f?.id === "drive") return "drive";
  if (f?.id === "steam") return "steam";
  if (f?.id === "rainonroof") return "rain";
  return f?.category ?? track.target_id;
}

function rawWeights(tracks: MixTrack[], catalog: Catalog | null, tags: string[]): Record<string, number> {
  const w: Record<string, number> = {};
  const add = (k: string, v: number) => {
    w[k] = (w[k] ?? 0) + v;
  };
  for (const t of tracks) {
    if (t.muted || t.volume < MUTE) continue;
    add(familyOf(t, catalog), t.volume);
  }
  if ((w.rain ?? 0) === 0 && (tags.includes("rain") || tags.includes("rainonroof") || tags.includes("drizzle"))) {
    add("rain", 0.62);
  }
  if ((w.thunder ?? 0) === 0 && (tags.includes("thunder") || tags.includes("storm"))) add("thunder", 0.7);
  if ((w.fire ?? 0) === 0 && tags.includes("fire")) add("fire", 0.55);
  if ((w.stream ?? 0) === 0 && tags.includes("stream") && (w.steam ?? 0) === 0) add("stream", 0.55);
  if ((w.steam ?? 0) === 0 && (tags.includes("steam") || tags.includes("mist") || tags.includes("fog"))) {
    add("steam", 0.5);
  }
  if ((w.ocean ?? 0) === 0 && tags.includes("ocean")) add("ocean", 0.55);
  if ((w.night ?? 0) === 0 && (tags.includes("night") || tags.includes("quietnight"))) add("night", 0.5);
  if ((w.noise ?? 0) === 0 && (tags.includes("noise") || tags.includes("white") || tags.includes("pink") || tags.includes("brown") || tags.includes("babble"))) {
    add("noise", 0.5);
  }
  if (tags.includes("snow")) add("snow", 0.68);
  if (tags.includes("dawn") || tags.includes("dusk")) add("shafts", 0.9);
  if (tags.includes("drive") || tags.includes("pulse")) add("drive", w.drive ?? 0.55);
  return w;
}

function normalize(raw: Record<string, number>): Record<string, number> {
  const vals = Object.values(raw);
  const peak = Math.max(0.02, ...vals);
  const n: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(raw)) {
    n[k] = v / peak;
    sum += n[k];
  }
  if (sum > 1.4) {
    const s = 1.4 / sum;
    for (const k of Object.keys(n)) n[k] *= s;
  }
  return n;
}

/**
 * One primary glass/water surface, one overlay, 2D particles as garnish.
 * Rain keeps RaindropFX; stream/ocean keep WaterRipple; everything else is OverlayGL.
 */
export function planVisual(input: {
  tags: string[];
  stillEffects?: string[];
  tracks?: MixTrack[];
  catalog?: Catalog | null;
  reducedMotion?: boolean;
}): VisualPlan {
  const tags = input.tags;
  const reduced = Boolean(input.reducedMotion);
  const raw = rawWeights(input.tracks ?? [], input.catalog ?? null, tags);
  const n = normalize(raw);
  const rain = n.rain ?? 0;
  const thunder = n.thunder ?? 0;
  const stream = n.stream ?? 0;
  const ocean = n.ocean ?? 0;
  const steam = n.steam ?? 0;
  const fire = n.fire ?? 0;
  const snow = n.snow ?? 0;
  const noise = n.noise ?? 0;
  const shafts = n.shafts ?? 0;
  const night = n.night ?? 0;

  const stormy = thunder > 0.08 || tags.includes("storm");
  const glass: GlassKind | null = rain > MUTE || stormy ? (stormy ? "storm" : "rain") : null;

  let water = 0;
  if (!glass) {
    water = Math.max(stream, ocean * 0.92);
  } else if (stream > 0.35 && rain < 0.45) {
    water = 0;
  }

  const candidates: Array<{ kind: OverlayKind; amp: number }> = [];
  if (stormy) candidates.push({ kind: "storm", amp: Math.max(0.4, thunder, 0.55) });
  if (snow > MUTE) candidates.push({ kind: "snow", amp: snow });
  if (!glass && steam > MUTE) candidates.push({ kind: "haze", amp: Math.min(0.95, 0.7 + steam * 0.3) });
  if (!glass && !water && fire > MUTE) candidates.push({ kind: "heat", amp: fire });
  if ((glass || water) && fire > MUTE) candidates.push({ kind: "heat", amp: fire * 0.5 });
  if (ocean > MUTE && (night > MUTE || tags.includes("night") || tags.includes("quietnight"))) {
    candidates.push({ kind: "moon", amp: Math.min(0.7, 0.35 + ocean * 0.4) });
  }
  if (!glass && shafts > MUTE && rain < MUTE && thunder < MUTE) candidates.push({ kind: "shafts", amp: shafts });
  if (!glass && !water && noise > 0.45 && rain < MUTE && fire < MUTE && steam < MUTE) {
    candidates.push({ kind: "grain", amp: Math.min(0.55, noise * 0.7) });
  }
  if (!glass && tags.includes("drizzle") && rain < 0.3) candidates.push({ kind: "mist", amp: 0.4 });
  candidates.sort((a, b) => b.amp - a.amp);
  const top = candidates[0];
  const overlay: OverlayKind = top?.kind ?? "none";
  const overlayIntensity = top?.amp ?? 0;

  if (reduced) {
    return {
      glass: null,
      water: 0,
      overlay: overlay === "grain" ? "grain" : "none",
      overlayIntensity: overlay === "grain" ? 0.2 : 0,
      particles: ["grain"],
      reducedMotion: true,
    };
  }

  const base = effectsFromTags(tags, input.stillEffects ?? []);
  const particles = base.filter((e) => {
    if (e === "raindrops") return true;
    if (e === "ripples") return true;
    if (e === "lightning") return overlay !== "storm";
    if (e === "grain") return overlay !== "grain";
    if (e === "waves" && water > MUTE) return false;
    if (e === "fireflies" && overlay === "moon") return false;
    return true;
  });

  return {
    glass,
    water,
    overlay,
    overlayIntensity: overlay === "none" ? 0 : overlayIntensity,
    particles,
    reducedMotion: false,
  };
}

const OVERLAY_ZH: Record<OverlayKind, string> = {
  none: "",
  haze: "岚烟",
  snow: "飞雪",
  shafts: "晨岚",
  storm: "闪空",
  heat: "热浪",
  moon: "水月",
  grain: "网点",
  mist: "雾窗",
};

export function seatLabel(plan: VisualPlan): string {
  const bits: string[] = [];
  if (plan.glass) bits.push("雨幕");
  if (plan.water > MUTE) bits.push("涟漪");
  const over = OVERLAY_ZH[plan.overlay];
  if (over) bits.push(over);
  return bits.join(" · ");
}

export function visualKey(plan: VisualPlan): string {
  return [
    plan.glass ?? "-",
    plan.water > MUTE ? "w" : "-",
    plan.overlay,
    plan.overlayIntensity.toFixed(2),
    plan.particles.join(","),
  ].join("|");
}
