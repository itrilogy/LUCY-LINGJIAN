type LabTone = "light" | "gold" | "inverse";

const LAB_SRC: Record<LabTone, string> = {
  light: "/brand/luxi-lab.svg",
  gold: "/brand/luxi-lab-gold.svg",
  inverse: "/brand/luxi-lab-inverse.svg",
};

export function DualMark({
  size = 48,
  lab = "gold",
}: {
  size?: number;
  lab?: LabTone;
}) {
  return (
    <div className="dual-mark">
      <img
        className="product-mark"
        src="/brand/lingjian-mark.svg"
        width={size}
        height={size}
        alt="聆涧"
      />
      <img src={LAB_SRC[lab]} width={size} height={size} alt="鹿溪联合创新实验室" />
    </div>
  );
}
