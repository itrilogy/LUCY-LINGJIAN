import type { Quote } from "./types";

const SKIP = new Set(["layout-vertical", "layout-horizontal", "comment"]);

export function expandTags(playTags: string[], soundMap: Record<string, string[]>): string[] {
  const out = new Set<string>();
  for (const t of playTags) {
    if (!t || SKIP.has(t)) continue;
    out.add(t);
    for (const x of soundMap[t] ?? []) if (!SKIP.has(x)) out.add(x);
  }
  return [...out];
}

export function hitCount(quote: Quote, expanded: Set<string>): number {
  let n = 0;
  for (const t of quote.tags) {
    if (SKIP.has(t) || t.startsWith("layout-")) continue;
    if (expanded.has(t)) n += 1;
  }
  return n;
}

export function scorePool(quotes: Quote[], expanded: string[]): Array<Quote & { hits: number }> {
  const set = new Set(expanded);
  const scored = quotes.map((q) => ({ ...q, hits: hitCount(q, set) }));
  const hits = scored.filter((q) => q.hits > 0);
  return hits.length > 0 ? hits : scored;
}

export function pickWeighted(
  pool: Array<Quote & { hits: number }>,
  shown: Map<string, number>,
  lastId: string | null,
): Quote | null {
  if (pool.length === 0) return null;
  const items = pool.length > 1 ? pool.filter((q) => q.id !== lastId) : pool;
  const weights = items.map((q) => {
    const shownN = shown.get(q.id) ?? 0;
    const base = (q.hits + 0.3) ** 1.65 * (q.weight ?? 1);
    return Math.max(0.02, base / (1 + shownN * 1.8));
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function randomPose(): { side: "left" | "right"; topPct: number; insetPct: number } {
  return {
    side: "left",
    topPct: 28 + Math.random() * 32,
    insetPct: 4.5 + Math.random() * 8,
  };
}
