export type EffectId =
  | "grain"
  | "parallax"
  | "embers"
  | "raindrops"
  | "waves"
  | "ripples"
  | "fireflies"
  | "lightning"
  | "pulse";

export type CategoryId =
  | "noise"
  | "traffic"
  | "fire"
  | "rain"
  | "ocean"
  | "stream"
  | "night"
  | "thunder"
  | "drive";

export type Category = {
  id: CategoryId;
  label_zh: string;
  label_en: string;
  description_zh: string;
  effect: EffectId;
  sort: number;
};

export type CatalogFile = {
  id: string;
  filename: string;
  path: string;
  url: string;
  category: CategoryId;
  label_zh: string;
  label_en: string;
  format: string;
  bytes: number;
  variant_group: string | null;
  standalone_scene: boolean;
  playback: "buffer" | "stream";
  license?: string;
  source?: string;
};

export type StandaloneScene = {
  id: string;
  file_id: string;
  label_zh: string;
  label_en: string;
  description_zh: string;
  effect: EffectId;
  sort: number;
};

export type Catalog = {
  version: number;
  source: string;
  root: string;
  file_count: number;
  total_bytes: number;
  categories: Category[];
  scenes: StandaloneScene[];
  files: CatalogFile[];
};

const STREAM_BYTES = 15_000_000;
const STREAM_IDS = new Set([
  "quietnight",
  "train",
  "airplane",
  "boat",
  "bus",
  "babble",
  "steam",
  "rainonroof",
  "night_1",
  "night_2",
  "night_3",
  "night_4",
  "night_5",
  "night_6",
  "thunder-urban-rain",
  "ocean_8",
  "ocean_2",
]);

export function enrichCatalog(raw: {
  version: number;
  source: string;
  root: string;
  file_count: number;
  total_bytes: number;
  categories: Category[];
  files: Array<{
    id: string;
    filename: string;
    path: string;
    category: CategoryId;
    label_zh: string;
    label_en: string;
    format: string;
    bytes: number;
    variant_group: string | null;
    license?: string;
    source?: string;
  }>;
}): Catalog {
  const files: CatalogFile[] = raw.files.map((f) => ({
    ...f,
    url: "/sounds/" + f.path.split("/").map(encodeURIComponent).join("/"),
    standalone_scene: f.id === "quietnight" || f.id === "drive",
    playback: STREAM_IDS.has(f.id) || f.bytes >= STREAM_BYTES ? "stream" : "buffer",
  }));

  const scenes: StandaloneScene[] = [
    {
      id: "quietnight",
      file_id: "quietnight",
      label_zh: "安静的夜晚",
      label_en: "Quiet Night",
      description_zh: "长时长独立场景，不是夜晚变体",
      effect: "fireflies",
      sort: 7.5,
    },
    {
      id: "drive",
      file_id: "drive",
      label_zh: "醒律",
      label_en: "Drive",
      description_zh: "贝斯、吉他与鼓点，用来点起能量的独立场景",
      effect: "pulse",
      sort: 9,
    },
  ];

  return { ...raw, files, scenes };
}

export function categoryPool(categoryId: CategoryId, files: CatalogFile[]): CatalogFile[] {
  return files.filter((f) => f.category === categoryId && !f.standalone_scene);
}

export function fileById(catalog: Catalog, id: string): CatalogFile | undefined {
  return catalog.files.find((f) => f.id === id);
}
