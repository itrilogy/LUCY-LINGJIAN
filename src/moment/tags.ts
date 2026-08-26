export type DayPart = "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "evening" | "midnight";

export type WeatherKind = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export type MomentHit = {
  dayPart: DayPart;
  weather: WeatherKind;
  isDay: boolean;
  tempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  city: string | null;
  /** Union used for background / poetry / mix. */
  tags: string[];
  /** Sound-catalog tags that can become tracks. */
  soundTags: string[];
  labelZh: string;
  weatherZh: string;
  dayPartZh: string;
};

const DAY_PARTS: Array<{ id: DayPart; from: number; zh: string; tags: string[]; sound: string[] }> = [
  { id: "midnight", from: 0, zh: "子夜", tags: ["midnight", "night-time", "cool", "indoor"], sound: ["quietnight", "night", "brown"] },
  { id: "dawn", from: 5, zh: "黎明", tags: ["dawn", "cool", "outdoor", "nature"], sound: ["stream"] },
  { id: "morning", from: 7, zh: "清晨", tags: ["day", "outdoor", "nature"], sound: ["stream"] },
  { id: "noon", from: 11, zh: "正午", tags: ["day", "warm", "outdoor"], sound: ["ocean"] },
  { id: "afternoon", from: 14, zh: "午后", tags: ["day", "warm", "outdoor"], sound: ["stream"] },
  { id: "dusk", from: 17, zh: "黄昏", tags: ["dusk", "warm", "outdoor"], sound: ["fire", "ocean"] },
  { id: "evening", from: 19, zh: "入夜", tags: ["night-time", "warm", "indoor"], sound: ["fire", "night"] },
  { id: "midnight", from: 22, zh: "深夜", tags: ["midnight", "night-time", "cool", "indoor"], sound: ["quietnight", "night"] },
];

type WxSpec = { kind: WeatherKind; zh: string; tags: string[]; sound: string[] };

function weatherSpec(code: number | null): WxSpec {
  if (code == null) return { kind: "clear", zh: "未知", tags: [], sound: [] };
  if (code === 0) return { kind: "clear", zh: "晴朗", tags: ["outdoor", "nature"], sound: [] };
  if (code <= 3) return { kind: "cloudy", zh: "多云", tags: ["cool", "outdoor"], sound: ["stream"] };
  if (code === 45 || code === 48) return { kind: "fog", zh: "雾", tags: ["cool", "indoor", "mist"], sound: ["brown", "steam"] };
  if (code >= 51 && code <= 57) return { kind: "drizzle", zh: "毛毛雨", tags: ["cool", "indoor"], sound: ["rain", "rainonroof"] };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { kind: "rain", zh: "雨", tags: ["cool", "indoor", "rain"], sound: ["rain", "rainonroof"] };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { kind: "snow", zh: "雪", tags: ["cool", "nature", "indoor"], sound: ["white", "quietnight"] };
  }
  if (code >= 95) return { kind: "storm", zh: "雷暴", tags: ["storm", "indoor", "cool"], sound: ["thunder", "rain"] };
  return { kind: "cloudy", zh: "阴", tags: ["cool"], sound: ["stream"] };
}

export function dayPartAt(d: Date): (typeof DAY_PARTS)[number] {
  const h = d.getHours() + d.getMinutes() / 60;
  let cur = DAY_PARTS[0]!;
  for (const p of DAY_PARTS) if (h >= p.from) cur = p;
  return cur;
}

export function hitFromClock(
  d: Date,
  weatherCode: number | null,
  extras: { isDay?: boolean; tempC?: number | null; humidity?: number | null; windKmh?: number | null; city?: string | null } = {},
): MomentHit {
  const part = dayPartAt(d);
  const wx = weatherSpec(weatherCode);
  const isDay = extras.isDay ?? (d.getHours() >= 6 && d.getHours() < 19);
  const soundTags = unique([
    ...wx.sound,
    ...part.sound.filter((t) => {
      if (wx.kind === "storm" || wx.kind === "rain" || wx.kind === "drizzle") {
        return t !== "ocean" && t !== "stream";
      }
      if (wx.kind === "fog") return t !== "ocean";
      return true;
    }),
  ]);
  if (!isDay && !soundTags.includes("night") && !soundTags.includes("quietnight")) {
    soundTags.push("night");
  }
  const tags = unique([...wx.tags, ...part.tags, ...soundTags]);
  return {
    dayPart: part.id,
    weather: wx.kind,
    isDay,
    tempC: extras.tempC ?? null,
    humidity: extras.humidity ?? null,
    windKmh: extras.windKmh ?? null,
    city: extras.city ?? null,
    tags,
    soundTags,
    weatherZh: wx.zh,
    dayPartZh: part.zh,
    labelZh: `${wx.zh} · ${part.zh}`,
  };
}

function unique(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

export const TAG_LABEL_ZH: Record<string, string> = {
  rain: "雨",
  rainonroof: "屋瓦",
  thunder: "雷",
  ocean: "海",
  stream: "溪",
  steam: "汽",
  fire: "火",
  night: "夜",
  quietnight: "静夜",
  traffic: "行旅",
  noise: "空响",
  brown: "褐噪",
  white: "白噪",
  pink: "粉噪",
  dawn: "晓",
  day: "昼",
  dusk: "暮",
  "night-time": "夜时",
  midnight: "子夜",
  storm: "暴",
  indoor: "室内",
  outdoor: "野外",
  nature: "自然",
  warm: "暖",
  cool: "凉",
  mist: "雾",
};
