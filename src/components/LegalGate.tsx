import { useEffect, useState } from "react";
import { BRAND } from "../brand";
import { DualMark } from "./DualMark";
import { useStore } from "../mix/store";

export function LegalGate({ children }: { children: React.ReactNode }) {
  const ok = useStore((s) => s.legalOk);
  const accept = useStore((s) => s.acceptLegal);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-product", "lingjian");
    document.documentElement.setAttribute("data-density", "comfortable");
    if (!ok) document.documentElement.setAttribute("data-theme", "ink");
  }, [ok]);

  if (ok) return children;
  return (
    <div className="gate">
      <div className="dialog gate-card">
        <p className="eyebrow">LegalGate</p>
        <DualMark size={48} lab="gold" />
        <h1>{BRAND.nameZh}</h1>
        <p className="en">{BRAND.nameEn} · {BRAND.code}</p>
        <p className="slogan">{BRAND.slogan}</p>
        <p className="blurb">{BRAND.legal}</p>
        <label className="gate-agree">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>我已阅读并确认：仅本机个人使用，不公开再分发系统背景音。</span>
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" disabled={!agreed} onClick={accept}>
            显式确认并进入
          </button>
        </div>
      </div>
    </div>
  );
}
