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
    </div>
  );
}
