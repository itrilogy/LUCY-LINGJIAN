import { useEffect } from "react";
import { BRAND } from "../brand";
import { DualMark } from "./DualMark";
import { toast } from "./Toast";

export function AboutModal({
  onClose,
  tone = "solid",
}: {
  onClose: () => void;
  tone?: "solid" | "play";
}) {
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
      toast(label);
    } catch {
      toast("无法复制");
    }
  };

  return (
    <div className={"overlay open" + (tone === "play" ? " play" : "")} onClick={onClose} role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="about-x" type="button" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <div className="about-hero">
          <DualMark size={48} lab="gold" />
          <div>
            <h2 id="about-title">
              <button
                type="button"
                className="copyish"
                onClick={() => void copy(`${BRAND.nameZh} · ${BRAND.nameEn}`, "已复制名称")}
                title="点击复制"
              >
                {BRAND.nameZh} · {BRAND.nameEn}
              </button>
            </h2>
            <p className="about-slogan">
              <button
                type="button"
                className="copyish"
                onClick={() => void copy(BRAND.slogan, "已复制口号")}
                title="点击复制"
              >
                {BRAND.slogan}
              </button>
            </p>
          </div>
        </div>
        <p className="about-blurb">{BRAND.blurb}</p>
        <p className="about-legal">{BRAND.legal}</p>
        <p className="about-meta">
          {BRAND.structure} · {BRAND.matrix}
        </p>
        <p className="about-attr">
          Thunder WAV: BigSoundBank, CC0. Urban storm / rain MP3: OrangeFreeSounds, free with attribution.
          Glass rain: RaindropFX by SardineFish (MIT).
        </p>
        <div className="about-lab">
          <span>
            {BRAND.lab}
            <small>{BRAND.labEn}</small>
          </span>
        </div>
      </div>
    </div>
  );
}
