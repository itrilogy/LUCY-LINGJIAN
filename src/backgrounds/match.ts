import type { EffectId } from "../../shared/catalog";

export type BgCatalog = {
  matching: {
    hit_weight: number;
    extra_penalty: number;
    missing_penalty: number;
    subset_bonus: number;
    fallback_id: string;
  };
  defaults?: Record<string, string>;
  file_tags?: Record<string, string[]>;
  category_tags?: Record<string, string[]>;
  images: BgImage[];
};

export type BgImage = {
  id: string;
  file: string;
  label_zh: string;
  tags: string[];
  effects: string[];
  light: string;
};

export function tagsFromPlay(
  { fileIds = [], categoryIds = [], sceneIds = [], extra = [] }: {
    fileIds?: string[];
    categoryIds?: string[];
    sceneIds?: string[];
    extra?: string[];
  },
  catalog: BgCatalog,
): string[] {
  const tags = new Set<string>();
  const fileTags = catalog.file_tags ?? {};
  const categoryTags = catalog.category_tags ?? {};
  for (const id of categoryIds) for (const t of categoryTags[id] ?? [id]) tags.add(t);
  for (const id of [...fileIds, ...sceneIds]) {
    const mapped = fileTags[id];
    if (mapped) mapped.forEach((t) => tags.add(t));
    else tags.add(id);
  }
  for (const t of extra) if (t) tags.add(t);
  return [...tags];
}

const TAG_FX: Record<string, EffectId[]> = {
  rain: ["raindrops"],
  rainonroof: ["raindrops"],
  thunder: ["lightning", "raindrops"],
  storm: ["lightning", "raindrops"],
  fire: ["embers"],
  stream: ["ripples"],
  steam: ["ripples"],
  ocean: ["waves"],
  night: ["fireflies"],
  quietnight: ["fireflies"],
  traffic: ["parallax"],
  airplane: ["parallax"],
  bus: ["parallax"],
  train: ["parallax"],
  boat: ["waves", "parallax"],
  noise: ["grain"],
  white: ["grain"],
  pink: ["grain"],
  brown: ["grain"],
  babble: ["grain"],
  drive: ["pulse", "embers", "parallax"],
  pulse: ["pulse"],
};

/** Still effects plus signature FX from the playing tags (rain → glass, stream → ripples, …). */
export function effectsFromTags(tags: string[], base: string[] = []): string[] {
  const out = new Set(base);
  for (const t of tags) for (const e of TAG_FX[t] ?? []) out.add(e);
  return [...out];
}

function scoreImage(
  image: BgImage,
  core: Set<string>,
  flavor: Set<string>,
  matching: BgCatalog["matching"],
): number {
  if (core.size === 0 && flavor.size === 0) {
    return image.id === matching.fallback_id ? 0 : Number.NEGATIVE_INFINITY;
  }
  const img = new Set(image.tags);
  let hit = 0;
  for (const t of img) if (core.has(t)) hit += 1;
  if (hit === 0 && core.size > 0) return Number.NEGATIVE_INFINITY;
  let extra = 0;
  for (const t of img) if (!core.has(t) && !flavor.has(t)) extra += 1;
  let missing = 0;
  for (const t of core) if (!img.has(t)) missing += 1;
  let score =
    matching.hit_weight * hit - matching.extra_penalty * extra - matching.missing_penalty * missing;
  if (extra === 0 && hit > 0) score += matching.subset_bonus;
  for (const t of flavor) if (img.has(t)) score += 0.45;
  return score;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: T[], weights: number[], rng: () => number): T {
  let sum = 0;
  for (const w of weights) sum += w;
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function matchBackground(
  playingTags: string[],
  catalog: BgCatalog,
  hint?: { fileIds?: string[]; categoryIds?: string[]; seed?: string },
): BgImage {
  const vocab = new Set<string>();
  for (const img of catalog.images) for (const t of img.tags) vocab.add(t);
  const core = new Set<string>();
  const flavor = new Set<string>();
  for (const t of playingTags) {
    if (!t) continue;
    if (vocab.has(t) || catalog.file_tags?.[t] || catalog.category_tags?.[t] || catalog.defaults?.[t]) {
      core.add(t);
    } else flavor.add(t);
  }

  const scored = catalog.images.map((img) => ({
    img,
    score: scoreImage(img, core, flavor, catalog.matching),
  }));

  const hinted = [...(hint?.fileIds ?? []), ...(hint?.categoryIds ?? [])];
  for (const id of hinted) {
    const def = catalog.defaults?.[id];
    if (!def) continue;
    const row = scored.find((s) => s.img.id === def);
    if (!row) continue;
    if (row.score === Number.NEGATIVE_INFINITY) row.score = 0.2;
    else row.score += 0.7;
  }

  const hits = scored.filter((s) => s.score > Number.NEGATIVE_INFINITY);
  const fallback =
    catalog.images.find((i) => i.id === catalog.matching.fallback_id) ?? catalog.images[0]!;
  if (hits.length === 0) {
    for (const id of hinted) {
      const def = catalog.defaults?.[id];
      const image = def ? catalog.images.find((i) => i.id === def) : undefined;
      if (image) return image;
    }
    return fallback;
  }

  const best = Math.max(...hits.map((h) => h.score));
  const rng = mulberry32(hashSeed(hint?.seed ?? playingTags.join("|")));
  const weights = hits.map((h) => Math.exp((h.score - best) * 1.35));
  return pickWeighted(hits, weights, rng).img;
}
