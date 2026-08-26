import type { CatalogFile } from "../../shared/catalog";

export function pickNext(
  pool: CatalogFile[],
  history: string[],
  avoidLastN: number,
  rng: () => number,
): CatalogFile {
  if (pool.length === 0) throw new Error("empty category pool");
  const banned = new Set(history.slice(-Math.max(avoidLastN, 0)));
  let candidates = pool.filter((f) => !banned.has(f.id));
  if (candidates.length === 0) candidates = pool;
  return candidates[Math.floor(rng() * candidates.length)]!;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
