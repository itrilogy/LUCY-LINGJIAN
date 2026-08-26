/** Map a 0–1 mixer slider to linear amplitude. Square-law taper so 50% is
 *  about −6 dB, 25% about −12 dB — linear 0.7 vs 0.5 is only ~3 dB and
 *  feels like the slider does nothing on rain/noise beds. */
export function volumeToGain(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  if (x <= 0) return 0;
  return x * x;
}

export function formatPct(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}
