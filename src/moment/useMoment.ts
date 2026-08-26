import { useEffect, useMemo, useState } from "react";
import { hitFromClock, type MomentHit } from "./tags";
import { fetchWeather, locate, type GeoFix, type WeatherSnap } from "./weather";

export type MomentState = {
  now: Date;
  hit: MomentHit;
  locating: boolean;
  weatherOk: boolean;
};

export function useMoment(): MomentState {
  const [now, setNow] = useState(() => new Date());
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [wx, setWx] = useState<WeatherSnap | null>(null);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let refresh = 0;
    (async () => {
      try {
        const geo = await locate();
        if (cancelled) return;
        setFix(geo);
        const snap = await fetchWeather(geo);
        if (!cancelled) setWx(snap);
        refresh = window.setInterval(() => {
          void fetchWeather(geo).then((s) => {
            if (!cancelled) setWx(s);
          }).catch(() => undefined);
        }, 12 * 60 * 1000);
      } catch {
        /* time-only fallback */
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  const hit = useMemo(
    () =>
      hitFromClock(now, wx?.code ?? null, {
        isDay: wx?.isDay,
        tempC: wx?.tempC ?? null,
        humidity: wx?.humidity ?? null,
        windKmh: wx?.windKmh ?? null,
        city: fix?.city ?? null,
      }),
    [now, wx, fix],
  );

  return { now, hit, locating, weatherOk: Boolean(wx) };
}
