export type GeoFix = { lat: number; lon: number; city: string | null };

export type WeatherSnap = {
  code: number;
  tempC: number;
  humidity: number | null;
  windKmh: number | null;
  isDay: boolean;
};

const GEO_KEY = "voicestream_geo";

function remember(fix: GeoFix): void {
  try {
    localStorage.setItem(GEO_KEY, JSON.stringify(fix));
  } catch {
    /* ignore */
  }
}

function recalled(): GeoFix | null {
  try {
    const raw = localStorage.getItem(GEO_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as GeoFix;
    if (typeof v.lat === "number" && typeof v.lon === "number") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function gps(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
      () => reject(new Error("denied")),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

async function ipFix(): Promise<GeoFix> {
  const r = await fetch("https://get.geojs.io/v1/ip/geo.json");
  if (!r.ok) throw new Error("ip");
  const j = (await r.json()) as { latitude?: string; longitude?: string; city?: string; region?: string };
  const lat = Number(j.latitude);
  const lon = Number(j.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("ip");
  return { lat, lon, city: j.city || j.region || null };
}

async function reverseCity(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    return j.city || j.locality || j.principalSubdivision || null;
  } catch {
    return null;
  }
}

export async function locate(): Promise<GeoFix> {
  const cached = recalled();
  try {
    const fix = await gps();
    if (!fix.city) fix.city = (await reverseCity(fix.lat, fix.lon)) ?? cached?.city ?? null;
    remember(fix);
    return fix;
  } catch {
    if (cached) return cached;
    const fix = await ipFix();
    remember(fix);
    return fix;
  }
}

export async function fetchWeather(fix: GeoFix): Promise<WeatherSnap> {
  const q = new URLSearchParams({
    latitude: String(fix.lat),
    longitude: String(fix.lon),
    current: "temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m",
    timezone: "auto",
    wind_speed_unit: "kmh",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error("weather");
  const j = (await r.json()) as {
    current?: {
      temperature_2m?: number;
      weather_code?: number;
      is_day?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
    };
  };
  const c = j.current;
  if (!c || typeof c.weather_code !== "number") throw new Error("weather");
  return {
    code: c.weather_code,
    tempC: typeof c.temperature_2m === "number" ? c.temperature_2m : 0,
    humidity: typeof c.relative_humidity_2m === "number" ? c.relative_humidity_2m : null,
    windKmh: typeof c.wind_speed_10m === "number" ? c.wind_speed_10m : null,
    isDay: c.is_day === 1,
  };
}
