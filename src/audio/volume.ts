/** Map a 0–1 mixer slider to linear amplitude. Square-law taper (gain = v^2) so 50% is
 *  about −12 dB, 25% about −24 dB — providing smooth perceptual loudness control
 *  across rain/ambient beds. */
export function volumeToGain(v: number): number {
  const x = Math.min(1, Math.max(0, v));
  if (x <= 0) return 0;
  return x * x;
}

export function formatPct(v: number): string {
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}
