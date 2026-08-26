import type { CSSProperties } from "react";
import type { Pose, Quote } from "./types";
import { verseBodyLines } from "./verse";

export function VerseCard({
  quote,
  pose,
  leaving,
  layout,
}: {
  quote: Quote;
  pose: Pose;
  leaving: boolean;
  layout: "vertical" | "horizontal";
}) {
  const vertical = layout !== "horizontal";
  const parts: Array<{ key: string; kind: string; text: string }> = [
    { key: "title", kind: "title", text: quote.title },
    ...verseBodyLines(quote).map((line, i) => ({ key: `l${i}`, kind: "line", text: line })),
    { key: "by", kind: "by", text: quote.dynasty ? `${quote.dynasty} · ${quote.author}` : quote.author },
  ];
  const style: CSSProperties = {
    top: `${pose.topPct}%`,
    [pose.side]: `${pose.insetPct}%`,
  };
  return (
    <figure
      className={"verse" + (vertical ? " vert" : " horiz") + (leaving ? " leaving" : "")}
      style={style}
      aria-hidden
    >
      {parts.map((p, i) => (
        <span key={p.key} className={"el " + p.kind} style={{ ["--i" as string]: i }}>
          {p.text}
        </span>
      ))}
    </figure>
  );
}
