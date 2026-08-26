import { BRAND } from "../brand";
import { useStore } from "../mix/store";

export function LegalGate({ children }: { children: React.ReactNode }) {
  const ok = useStore((s) => s.legalOk);
  const accept = useStore((s) => s.acceptLegal);
  if (ok) return children;
  return (
    <div className="legal">
      <div className="legal-card">
        <img src="/brand/lingjian-mark.svg" width={56} height={56} alt="" />
        <h1>{BRAND.nameZh}</h1>
        <p className="en">{BRAND.nameEn}</p>
        <p className="slogan">{BRAND.slogan}</p>
        <p>{BRAND.legal}</p>
        <button className="primary" type="button" onClick={accept}>
          我了解，进入
        </button>
      </div>
      <style>{`
        .legal { min-height: 100%; display: grid; place-items: center; padding: 32px; background: #0b0c0e; }
        .legal-card { max-width: 420px; }
        .legal-card img { border-radius: 14px; margin-bottom: 14px; }
        .legal-card h1 { letter-spacing: .18em; font-weight: 600; font-size: 22px; margin: 0; }
        .legal-card .en { letter-spacing: .2em; font-size: 12px; color: var(--muted); margin: 4px 0 10px; }
        .legal-card .slogan { color: var(--accent); letter-spacing: .16em; margin: 0 0 14px; }
        .legal-card p { color: var(--muted); }
      `}</style>
    </div>
  );
}
