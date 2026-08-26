import type { Quote } from "./types";

const PUNCT = "，、。；：！？,;:!?";

export function splitByPunct(text: string): string[] {
  const segs: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (PUNCT.includes(ch)) {
      const t = buf.trim();
      if (t) segs.push(t);
      buf = "";
    }
  }
  const rest = buf.trim();
  if (rest) segs.push(rest);
  return segs.length ? segs : [text];
}

export function verseBodyLines(quote: Quote): string[] {
  return quote.lines.flatMap(splitByPunct);
}

export function randomLayout(): "vertical" | "horizontal" {
  return Math.random() < 0.5 ? "vertical" : "horizontal";
}
