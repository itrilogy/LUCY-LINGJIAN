import type { Catalog } from "../../shared/catalog";
import type { Mix, MixTrack } from "../../shared/mixSchema";
import { ulid } from "../../shared/ulid";
import type { MomentHit } from "./tags";

type Source = { kind: "file" | "category"; id: string; vol: number };

const TAG_SOURCES: Record<string, Source[]> = {
  rain: [{ kind: "category", id: "rain", vol: 0.82 }],
  rainonroof: [{ kind: "file", id: "rainonroof", vol: 0.7 }],
  thunder: [{ kind: "category", id: "thunder", vol: 0.62 }],
  ocean: [{ kind: "category", id: "ocean", vol: 0.78 }],
  stream: [{ kind: "category", id: "stream", vol: 0.76 }],
  steam: [{ kind: "file", id: "steam", vol: 0.55 }],
  fire: [{ kind: "category", id: "fire", vol: 0.58 }],
  night: [{ kind: "category", id: "night", vol: 0.64 }],
  quietnight: [{ kind: "file", id: "quietnight", vol: 0.7 }],
  traffic: [{ kind: "category", id: "traffic", vol: 0.5 }],
  noise: [{ kind: "category", id: "noise", vol: 0.48 }],
  brown: [{ kind: "file", id: "brownnoise", vol: 0.45 }],
  white: [{ kind: "file", id: "whitenoise", vol: 0.42 }],
  pink: [{ kind: "file", id: "pinknoise", vol: 0.42 }],
  babble: [{ kind: "file", id: "babble", vol: 0.4 }],
};

function exists(catalog: Catalog, s: Source): boolean {
  if (s.kind === "category") return catalog.categories.some((c) => c.id === s.id);
  return catalog.files.some((f) => f.id === s.id);
}

function jitter(vol: number): number {
  return Math.min(0.95, Math.max(0.28, vol + (Math.random() - 0.5) * 0.12));
}

/** Pick 2–4 tracks from hit sound tags. Stronger weather tags take the first slots. */
export function composeMomentMix(catalog: Catalog, hit: MomentHit): Mix {
  const used = new Set<string>();
  const tracks: MixTrack[] = [];
  const candidates: Source[] = [];
  for (const tag of hit.soundTags) {
    for (const s of TAG_SOURCES[tag] ?? []) {
      if (!exists(catalog, s)) continue;
      const key = `${s.kind}:${s.id}`;
      if (used.has(key)) continue;
      used.add(key);
      candidates.push(s);
    }
  }
  const cap = hit.weather === "storm" ? 4 : 2 + (Math.random() < 0.45 ? 1 : 0);
  const indoor = hit.tags.includes("indoor");
  const order = candidates.map((s, i) => {
    let w = 1 / (1 + i * 0.35) + Math.random() * 0.25;
    if (indoor && s.id === "rainonroof") w += 0.4;
    if (indoor && s.id === "rain") w -= 0.08;
    return { s, w };
  });
  order.sort((a, b) => b.w - a.w);
  for (const { s } of order) {
    if (tracks.length >= cap) break;
    if (s.id === "rainonroof" && tracks.some((t) => t.target_id === "rain") && Math.random() < 0.45) continue;
    if (s.id === "quietnight" && tracks.some((t) => t.target_id === "night") && Math.random() < 0.5) continue;
    tracks.push({
      id: ulid(),
      kind: s.kind,
      target_id: s.id,
      volume: jitter(s.vol * (tracks.length === 0 ? 1 : 0.78)),
      muted: false,
      fade_in_ms: tracks.length === 0 ? 1600 : 2400,
      fade_out_ms: 2000,
      loop: true,
    });
  }
  if (tracks.length === 0) {
    const night = catalog.categories.find((c) => c.id === "night");
    const stream = catalog.categories.find((c) => c.id === "stream");
    const fallback = (hit.isDay ? stream : night) ?? catalog.categories[0];
    if (fallback) {
      tracks.push({
        id: ulid(),
        kind: "category",
        target_id: fallback.id,
        volume: 0.75,
        muted: false,
        fade_in_ms: 1800,
        fade_out_ms: 1800,
        loop: true,
      });
    }
  }
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: ulid(),
    name: `此时此刻 · ${hit.labelZh}`,
    created_at: now,
    updated_at: now,
    master_volume: 0.82,
    tracks,
    shuffle: { avoid_last_n: 1 },
  };
}
