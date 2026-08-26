import { useEffect, useMemo, useState } from "react";
import { fetchPoetry } from "../api/client";
import { TAG_LABEL_ZH, type MomentHit } from "../moment/tags";
import { expandTags, pickWeighted, scorePool } from "../poetry/match";
import type { Quote } from "../poetry/types";

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function WeatherMark({ kind }: { kind: MomentHit["weather"] }) {
  const stroke = "currentColor";
  if (kind === "rain" || kind === "drizzle") {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <path d="M8 14h16" fill="none" stroke={stroke} strokeWidth="1.6" opacity="0.5" />
        <path d="M10 8c2-3 10-3 12 1 4 0 6 5 3 8H9c-3-1-2-6 1-7z" fill="none" stroke={stroke} strokeWidth="1.5" />
        <path d="M12 20v5M16 21v6M20 20v5" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "storm") {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <path d="M9 13h15c2 0 3 4 0 6H10c-3 0-3-5 0-6z" fill="none" stroke={stroke} strokeWidth="1.5" />
        <path d="M15 18l-3 6h4l-2 5 7-8h-4l3-3z" fill={stroke} opacity="0.85" />
      </svg>
    );
  }
  if (kind === "fog") {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <path d="M6 12h18M8 16h16M7 20h17" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      </svg>
    );
  }
  if (kind === "snow") {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <path d="M16 7v18M9 11l14 10M9 21l14-10" fill="none" stroke={stroke} strokeWidth="1.4" />
        <circle cx="16" cy="16" r="2" fill={stroke} />
      </svg>
    );
  }
  if (kind === "cloudy") {
    return (
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <path d="M10 18h14c2.5 0 3-5 0-6-1-4-8-5-10-1-4 0-6 4-4 7z" fill="none" stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="6" fill="none" stroke={stroke} strokeWidth="1.6" />
      <path d="M16 5v3M16 24v3M5 16h3M24 16h3M8 8l2 2M22 22l2 2M8 24l2-2M22 10l2-2" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function MomentPanel({ hit, now, locating, weatherOk }: {
  hit: MomentHit;
  now: Date;
  locating: boolean;
  weatherOk: boolean;
}) {
  const [poetry, setPoetry] = useState<{ quotes: Quote[]; soundMap: Record<string, string[]> } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const tagKey = `${hit.weather}|${hit.dayPart}|${hit.soundTags.join(",")}`;

  useEffect(() => {
    let cancelled = false;
    void fetchPoetry().then((p) => {
      if (!cancelled) setPoetry(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!poetry?.quotes.length) return;
    if (locating) return;
    const expanded = expandTags(hit.tags, poetry.soundMap);
    const pool = scorePool(poetry.quotes, expanded);
    setQuote(pickWeighted(pool, new Map(), null));
    // tagKey stands in for weather/time/sound tags; do not depend on hit (clock ticks every second).
  }, [poetry, locating, tagKey]);

  const chips = hit.soundTags.concat(hit.tags.filter((t) => t === "indoor" || t === "outdoor" || t === "storm" || t === "warm" || t === "cool")).filter(
    (t, i, a) => a.indexOf(t) === i,
  );
  const lines = useMemo(() => quote?.lines.filter((ln) => ln.trim()) ?? [], [quote]);
  return (
    <div className={`moment ${hit.weather} ${hit.dayPart}`}>
      <div className="moment-veil" aria-hidden />
      <div className="moment-top">
        <span className="moment-kicker">此时此刻</span>
        {hit.city && <span className="moment-city">{hit.city}</span>}
      </div>
      <div className="moment-clock">
        <b>{pad(now.getHours())}:{pad(now.getMinutes())}</b>
        <em>{pad(now.getSeconds())}</em>
      </div>
      <div className="moment-date">
        {now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日 星期{WEEK[now.getDay()]}
      </div>
      <div className="moment-wx">
        <WeatherMark kind={hit.weather} />
        <div>
          <strong>{hit.tempC != null && weatherOk ? `${Math.round(hit.tempC)}°` : locating ? "…" : "—"}</strong>
          <span>{locating && !weatherOk ? "正在感知天象" : hit.weatherZh} · {hit.dayPartZh}</span>
        </div>
      </div>
      {lines.length > 0 && (
        <div className="moment-verse">
          {lines.map((ln, i) => (
            <p key={i}>{ln}</p>
          ))}
        </div>
      )}
      <div className="moment-chips" aria-label="命中标签">
        {chips.slice(0, 8).map((t) => (
          <i key={t}>{TAG_LABEL_ZH[t] ?? t}</i>
        ))}
      </div>
    </div>
  );
}
