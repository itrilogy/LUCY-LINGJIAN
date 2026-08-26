import { useEffect, useState } from "react";
import { BRAND } from "../brand";

export function AboutModal({
  onClose,
  tone = "solid",
}: {
  onClose: () => void;
  tone?: "solid" | "play";
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className={"about-scrim" + (tone === "play" ? " play" : "")} onClick={onClose} role="presentation">
      <div
        className={"about" + (tone === "play" ? " play" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="about-x" type="button" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className="about-hero">
          <img src="/brand/lingjian-mark.svg" width={72} height={72} alt="" />
          <div>
            <h2 id="about-title">
              <button
                type="button"
                className="copyish"
                onClick={() => void copy(`${BRAND.nameZh} · ${BRAND.nameEn}`, "name")}
                title="点击复制"
              >
                {BRAND.nameZh} · {BRAND.nameEn}
              </button>
            </h2>
            <p>
              <button
                type="button"
                className="copyish slogan"
                onClick={() => void copy(BRAND.slogan, "slogan")}
                title="点击复制"
              >
                {BRAND.slogan}
              </button>
            </p>
            {copied && <em className="copied">{copied === "name" ? "已复制名称" : "已复制口号"}</em>}
          </div>
        </div>
        <p className="blurb">{BRAND.blurb}</p>
        <p className="legal">{BRAND.legal}</p>
        <p className="meta">
          {BRAND.structure} · {BRAND.matrix}
        </p>
        <p className="attr">
          Thunder WAV: BigSoundBank, CC0. Urban storm / rain MP3: OrangeFreeSounds, free with attribution.
          Glass rain: RaindropFX by SardineFish (MIT).
        </p>
        <div className="lab">
          <img src="/brand/luxi-lab-main.svg" alt={BRAND.lab} />
          <span>
            {BRAND.lab}
            <small>{BRAND.labEn}</small>
          </span>
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

const css = `
.about-scrim {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(4,8,7,.62);
  display: grid; place-items: center;
  padding: 24px;
  backdrop-filter: blur(10px);
}
.about {
  position: relative;
  width: min(520px, 100%);
  background: #0e1613;
  border: 1px solid rgba(245,247,250,.12);
  border-radius: 18px;
  padding: 28px 28px 22px;
  box-shadow: 0 24px 80px rgba(0,0,0,.45);
}
.about-scrim.play { background: rgba(4, 10, 9, .28); backdrop-filter: blur(8px); }
.about.play {
  background: rgba(12, 22, 18, 0.38);
  border-color: rgba(245,247,250,.18);
  box-shadow: 0 18px 60px rgba(0,0,0,.28);
  backdrop-filter: blur(22px) saturate(1.15);
  color: #f4efe6;
}
.about-x {
  position: absolute; top: 12px; right: 12px;
  width: 32px; height: 32px; padding: 0;
  font-size: 20px; line-height: 1;
}
.about-hero { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; }
.about-hero img { flex: none; border-radius: 16px; }
.about h2 { margin: 0; font-size: 20px; letter-spacing: .08em; font-weight: 600; }
.copyish, .copyish:hover {
  background: none; border: 0; padding: 0; border-radius: 0;
  cursor: pointer; text-align: left;
}
.copyish:hover { color: #00D2FF; }
.slogan { color: var(--muted); font-size: 14px; letter-spacing: .14em; }
.copied { display: block; margin-top: 4px; font-size: 11px; color: #00D2FF; font-style: normal; }
.blurb { margin: 0 0 12px; line-height: 1.7; }
.legal, .meta, .attr { color: var(--muted); font-size: 12px; line-height: 1.65; margin: 0 0 10px; }
.lab {
  display: flex; gap: 12px; align-items: center;
  margin-top: 16px; padding-top: 14px;
  border-top: 1px solid var(--line);
}
.lab img { width: 52px; height: 52px; object-fit: contain; background: #111; border-radius: 10px; }
.lab span { display: grid; gap: 2px; font-size: 13px; }
.lab small { color: var(--muted); font-size: 11px; letter-spacing: .04em; }
`;
