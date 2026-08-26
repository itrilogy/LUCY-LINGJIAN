/** Tag-hit background matcher. No runtime image generation. */

export function tagsFromPlay({ fileIds = [], categoryIds = [], sceneIds = [] }, catalog) {
  const tags = new Set();
  const fileTags = catalog.file_tags || {};
  const categoryTags = catalog.category_tags || {};

  for (const id of categoryIds) {
    for (const t of categoryTags[id] || [id]) tags.add(t);
  }
  for (const id of fileIds) {
    const mapped = fileTags[id];
    if (mapped) mapped.forEach((t) => tags.add(t));
    else tags.add(id);
  }
  for (const id of sceneIds) {
    const mapped = fileTags[id];
    if (mapped) mapped.forEach((t) => tags.add(t));
    else tags.add(id);
  }
  return [...tags];
}

export function scoreImage(image, playingTags, matching) {
  const play = new Set(playingTags);
  if (play.size === 0) return image.id === matching.fallback_id ? 0 : -Infinity;

  const img = new Set(image.tags);
  let hit = 0;
  for (const t of img) if (play.has(t)) hit += 1;
  if (hit === 0) return -Infinity;

  let extra = 0;
  for (const t of img) if (!play.has(t)) extra += 1;
  let missing = 0;
  for (const t of play) if (!img.has(t)) missing += 1;

  let score =
    matching.hit_weight * hit -
    matching.extra_penalty * extra -
    matching.missing_penalty * missing;

  if (extra === 0 && hit > 0) score += matching.subset_bonus;
  return score;
}

export function matchBackground(playingTags, catalog) {
  const matching = catalog.matching;
  const unique = [...new Set(playingTags)];

  if (unique.length === 1 && catalog.defaults?.[unique[0]]) {
    const image = catalog.images.find((i) => i.id === catalog.defaults[unique[0]]);
    if (image) {
      return { image, score: 99, ranked: [{ id: image.id, score: 99 }] };
    }
  }

  let best = null;
  let bestScore = -Infinity;
  const ranked = [];

  for (const image of catalog.images) {
    const score = scoreImage(image, playingTags, matching);
    ranked.push({ id: image.id, score });
    if (score > bestScore) {
      bestScore = score;
      best = image;
    } else if (score === bestScore && best && image.tags.length < best.tags.length) {
      best = image;
    }
  }

  if (!best || bestScore === -Infinity) {
    best = catalog.images.find((i) => i.id === matching.fallback_id) || catalog.images[0];
    bestScore = 0;
  }

  ranked.sort((a, b) => b.score - a.score);
  return { image: best, score: bestScore, ranked: ranked.slice(0, 5) };
}
