import type { Catalog } from "../../shared/catalog";
import type { Mix } from "../../shared/mixSchema";
import type { BgCatalog } from "../backgrounds/match";
import type { Quote } from "../poetry/types";

export async function fetchCatalog(): Promise<Catalog> {
  const r = await fetch("/api/catalog");
  if (!r.ok) throw new Error("catalog");
  return r.json();
}

export async function fetchBackgrounds(): Promise<BgCatalog> {
  const r = await fetch("/backgrounds/catalog.json");
  if (!r.ok) throw new Error("backgrounds");
  return r.json();
}

export async function fetchMixes(): Promise<Array<{ id: string; name: string; updated_at: string; track_count: number }>> {
  const r = await fetch("/api/mixes");
  if (!r.ok) throw new Error("mixes");
  const j = await r.json();
  return j.mixes;
}

export async function fetchMix(id: string): Promise<Mix> {
  const r = await fetch(`/api/mixes/${id}`);
  if (!r.ok) throw new Error("mix");
  return r.json();
}

export async function saveMix(mix: Mix): Promise<Mix> {
  const r = await fetch(`/api/mixes/${mix.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mix),
  });
  if (!r.ok) throw new Error("save");
  return r.json();
}

export async function removeMix(id: string): Promise<void> {
  await fetch(`/api/mixes/${id}`, { method: "DELETE" });
}

export async function fetchPoetry(): Promise<{ quotes: Quote[]; soundMap: Record<string, string[]> }> {
  const [seed, extra, tags] = await Promise.all([
    fetch("/poetry/quotes.seed.json").then((r) => (r.ok ? r.json() : { quotes: [] })),
    fetch("/poetry/quotes.json").then((r) => (r.ok ? r.json() : { quotes: [] })).catch(() => ({ quotes: [] })),
    fetch("/poetry/tags.json").then((r) => (r.ok ? r.json() : {})),
  ]);
  const byId = new Map<string, Quote>();
  for (const q of [...(seed.quotes ?? []), ...(extra.quotes ?? [])] as Quote[]) {
    if (q?.id && q.lines?.length) byId.set(q.id, q);
  }
  const rawMap = (tags as { sound_map?: Record<string, string[]> }).sound_map ?? {};
  const soundMap = { ...rawMap };
  delete soundMap.comment;
  return { quotes: [...byId.values()], soundMap };
}
