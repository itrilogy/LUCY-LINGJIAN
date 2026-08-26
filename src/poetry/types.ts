export type Quote = {
  id: string;
  title: string;
  author: string;
  dynasty?: string;
  form?: string;
  lines: string[];
  tags: string[];
  layout?: "vertical" | "horizontal";
  weight?: number;
};

export type PoetryIndex = {
  sound_map: Record<string, string[]>;
  quotes: Quote[];
};

export type Pose = {
  side: "left" | "right";
  topPct: number;
  insetPct: number;
};
