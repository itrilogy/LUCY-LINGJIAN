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

  const expanded = useMemo(() => expandTags(playTags, soundMap), [playTags, soundMap]);
  const pool = useMemo(() => scorePool(quotes, expanded), [quotes, expanded]);

  const next = useCallback(() => {
    const q = pickWeighted(pool, shown.current, lastId.current);
    if (!q) {
      setQuote(null);
      return;
    }
    lastId.current = q.id;
    shown.current.set(q.id, (shown.current.get(q.id) ?? 0) + 1);
    setPose(randomPose());
    setLayout(randomLayout());
    setLeaving(false);
    setQuote(q);
  }, [pool]);

  useEffect(() => {
    shown.current = new Map();
    lastId.current = null;
    setLeaving(false);
    setQuote(null);
  }, [resetKey]);

  useEffect(() => {
    if (quotes.length === 0 || quote) return;
    next();
  }, [quotes.length, quote, next]);

  useEffect(() => {
    if (!quote || !playing) return;
    const n = 2 + verseBodyLines(quote).length;
    const fadeInMs = n * 780 + 1100;
    const hold = Math.max(4000, dwellSec * 1000);
    const t = window.setTimeout(() => setLeaving(true), fadeInMs + hold);
    return () => window.clearTimeout(t);
  }, [quote, playing, dwellSec]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => next(), 900);
    return () => window.clearTimeout(t);
  }, [leaving, next]);

  return { quote, pose, layout, leaving, hits: quote ? pool.find((p) => p.id === quote.id)?.hits ?? 0 : 0 };
}
