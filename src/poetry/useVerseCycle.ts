import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { expandTags, pickWeighted, randomPose, scorePool } from "./match";
import type { Pose, Quote } from "./types";
import { randomLayout, verseBodyLines } from "./verse";

export function useVerseCycle(
  quotes: Quote[],
  soundMap: Record<string, string[]>,
  playTags: string[],
  playing: boolean,
  dwellSec: number,
  resetKey: string,
) {
  const shown = useRef(new Map<string, number>());
  const lastId = useRef<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pose, setPose] = useState<Pose>(() => randomPose());
  const [layout, setLayout] = useState<"vertical" | "horizontal">(() => randomLayout());
  const [leaving, setLeaving] = useState(false);
  const [cycle, setCycle] = useState(0);

  const expanded = useMemo(() => expandTags(playTags, soundMap), [playTags, soundMap]);
  const pool = useMemo(() => scorePool(quotes, expanded), [quotes, expanded]);
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const pick = useCallback(() => {
    const q = pickWeighted(poolRef.current, shown.current, lastId.current);
    if (!q) return false;
    lastId.current = q.id;
    shown.current.set(q.id, (shown.current.get(q.id) ?? 0) + 1);
    setPose(randomPose());
    setLayout(randomLayout());
    setLeaving(false);
    setQuote(q);
    setCycle((n) => n + 1);
    return true;
  }, []);

  useEffect(() => {
    shown.current = new Map();
    lastId.current = null;
    setLeaving(false);
    setQuote(null);
  }, [resetKey]);

  useEffect(() => {
    if (quotes.length === 0 || quote) return;
    pick();
  }, [quotes.length, quote, pick, resetKey]);

  useEffect(() => {
    if (!quote || !playing) return;
    let cancelled = false;
    const n = 2 + verseBodyLines(quote).length;
    const fadeInMs = n * 780 + 1100;
    const hold = Math.max(4000, dwellSec * 1000);
    const fadeOutMs = 900;
    const fadeAt = window.setTimeout(() => {
      if (!cancelled) setLeaving(true);
    }, fadeInMs + hold);
    const nextAt = window.setTimeout(() => {
      if (cancelled) return;
      if (!pick()) setQuote(null);
    }, fadeInMs + hold + fadeOutMs);
    return () => {
      cancelled = true;
      window.clearTimeout(fadeAt);
      window.clearTimeout(nextAt);
    };
  }, [cycle, quote, playing, dwellSec, pick]);

  return { quote, pose, layout, leaving, hits: quote ? pool.find((p) => p.id === quote.id)?.hits ?? 0 : 0 };
}
