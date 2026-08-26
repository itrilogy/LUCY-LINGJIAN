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

function scoreImage(image: BgImage, playingTags: string[], matching: BgCatalog["matching"]): number {
  const play = new Set(playingTags);
  if (play.size === 0) return image.id === matching.fallback_id ? 0 : Number.NEGATIVE_INFINITY;
  const img = new Set(image.tags);
  let hit = 0;
  for (const t of img) if (play.has(t)) hit += 1;
  if (hit === 0) return Number.NEGATIVE_INFINITY;
  let extra = 0;
  for (const t of img) if (!play.has(t)) extra += 1;
  let missing = 0;
  for (const t of play) if (!img.has(t)) missing += 1;
  let score =
    matching.hit_weight * hit - matching.extra_penalty * extra - matching.missing_penalty * missing;
  if (extra === 0 && hit > 0) score += matching.subset_bonus;
  return score;
}

export function matchBackground(playingTags: string[], catalog: BgCatalog): BgImage {
  const unique = [...new Set(playingTags)];
  if (unique.length === 1 && catalog.defaults?.[unique[0]]) {
    const image = catalog.images.find((i) => i.id === catalog.defaults![unique[0]]);
    if (image) return image;
  }
  let best: BgImage | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const image of catalog.images) {
    const score = scoreImage(image, playingTags, catalog.matching);
    if (score > bestScore || (score === bestScore && best && image.tags.length < best.tags.length)) {
      bestScore = score;
      best = image;
    }
  }
  if (!best || bestScore === Number.NEGATIVE_INFINITY) {
    return catalog.images.find((i) => i.id === catalog.matching.fallback_id) ?? catalog.images[0]!;
  }
  return best;
}
