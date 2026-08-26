import { create } from "zustand";
import type { Catalog, CatalogFile, Category } from "../../shared/catalog";
import type { Mix, MixTrack } from "../../shared/mixSchema";
import { ulid } from "../../shared/ulid";
import type { BgCatalog } from "../backgrounds/match";

type Draft = Mix;

type Store = {
  catalog: Catalog | null;
  backgrounds: BgCatalog | null;
  mixes: Array<{ id: string; name: string; updated_at: string; track_count: number }>;
  draft: Draft;
  legalOk: boolean;
  setCatalog: (c: Catalog) => void;
  setBackgrounds: (b: BgCatalog) => void;
  setMixes: (m: Store["mixes"]) => void;
  acceptLegal: () => void;
  resetDraft: () => void;
  newMix: () => void;
  clearTracks: () => void;
  loadDraft: (mix: Mix) => void;
  rename: (name: string) => void;
  setMaster: (v: number) => void;
  addFile: (file: CatalogFile) => void;
  addCategory: (cat: Category) => void;
  updateTrack: (id: string, patch: Partial<MixTrack>) => void;
  removeTrack: (id: string) => void;
};

function emptyDraft(): Draft {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: ulid(),
    name: "未命名混音",
    created_at: now,
    updated_at: now,
    master_volume: 0.8,
    tracks: [],
    shuffle: { avoid_last_n: 1 },
  };
}

export const useStore = create<Store>((set) => ({
  catalog: null,
  backgrounds: null,
  mixes: [],
  draft: emptyDraft(),
  legalOk: typeof localStorage !== "undefined" && localStorage.getItem("voicestream_legal_ok") === "1",
  setCatalog: (catalog) => set({ catalog }),
  setBackgrounds: (backgrounds) => set({ backgrounds }),
  setMixes: (mixes) => set({ mixes }),
  acceptLegal: () => {
    localStorage.setItem("voicestream_legal_ok", "1");
    set({ legalOk: true });
  },
  resetDraft: () => set({ draft: emptyDraft() }),
  newMix: () => set({ draft: emptyDraft() }),
  clearTracks: () => set((s) => ({ draft: { ...s.draft, tracks: [] } })),
  loadDraft: (mix) => set({ draft: structuredClone(mix) }),
  rename: (name) => set((s) => ({ draft: { ...s.draft, name } })),
  setMaster: (master_volume) => set((s) => ({ draft: { ...s.draft, master_volume } })),
  addFile: (file) =>
    set((s) => {
      if (s.draft.tracks.length >= 8) return s;
      if (s.draft.tracks.some((t) => t.kind === "file" && t.target_id === file.id)) return s;
      const track: MixTrack = {
        id: ulid(),
        kind: "file",
        target_id: file.id,
        volume: 0.7,
        muted: false,
        fade_in_ms: 2000,
        fade_out_ms: 2000,
        loop: true,
      };
      return { draft: { ...s.draft, tracks: [...s.draft.tracks, track] } };
    }),
  addCategory: (cat) =>
    set((s) => {
      if (s.draft.tracks.length >= 8) return s;
      if (s.draft.tracks.some((t) => t.kind === "category" && t.target_id === cat.id)) return s;
      const track: MixTrack = {
        id: ulid(),
        kind: "category",
        target_id: cat.id,
        volume: 0.7,
        muted: false,
        fade_in_ms: 2500,
        fade_out_ms: 2500,
        loop: true,
      };
      return { draft: { ...s.draft, tracks: [...s.draft.tracks, track] } };
    }),
  updateTrack: (id, patch) =>
    set((s) => ({
      draft: {
        ...s.draft,
        tracks: s.draft.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      },
    })),
  removeTrack: (id) =>
    set((s) => ({ draft: { ...s.draft, tracks: s.draft.tracks.filter((t) => t.id !== id) } })),
}));

export function ephemeralFileMix(file: CatalogFile): Mix {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: ulid(),
    name: file.label_zh,
    created_at: now,
    updated_at: now,
    master_volume: 0.8,
    tracks: [
      {
        id: ulid(),
        kind: "file",
        target_id: file.id,
        volume: 0.75,
        muted: false,
        fade_in_ms: 1200,
        fade_out_ms: 800,
        loop: true,
      },
    ],
    shuffle: { avoid_last_n: 1 },
  };
}

export function ephemeralCategoryMix(cat: Category): Mix {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: ulid(),
    name: cat.label_zh + " · 随机",
    created_at: now,
    updated_at: now,
    master_volume: 0.8,
    tracks: [
      {
        id: ulid(),
        kind: "category",
        target_id: cat.id,
        volume: 0.75,
        muted: false,
        fade_in_ms: 2200,
        fade_out_ms: 2200,
        loop: true,
      },
    ],
    shuffle: { avoid_last_n: 1 },
  };
}
