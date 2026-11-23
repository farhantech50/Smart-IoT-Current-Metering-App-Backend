/**
 * Convert raw Apparent Power (VA) to estimated Real Power (Watts)
 * using the 3-tier power factor model:
 * - <= 120 VA : Baseline fan, LED, small electronics (PF ~0.82)
 * - <= 600 VA : Motor/inductive: fridge compressor + baseline (PF ~0.67)
 * - >  600 VA : Heavy resistive heating: electric iron, kettle, etc. (PF ~0.98)
 */
export function estimateRealPower(va) {
  const val = Number(va) || 0;
  if (val <= 0) return 0;
  if (val <= 120) return val * 0.82;
  if (val <= 600) return val * 0.67;
  return val * 0.98;
}
