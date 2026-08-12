// Aggregate one Census variable across geographies (tracts or blocks).
// Counts sum. Medians/means/per-capita/ratios cannot be summed, so they are
// population-weighted. Values must be pre-parsed to number|null (nulls skipped).

const WEIGHTED = /\b(median|mean|per capita|gini|ratio)\b/i;

export function isWeighted(label) {
  return WEIGHTED.test(label || '');
}

export function aggregate(label, values, weights) {
  if (isWeighted(label)) {
    let weightedSum = 0, totalWeight = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i], w = weights[i];
      if (v != null && v > 0 && w > 0) { weightedSum += v * w; totalWeight += w; }
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  }
  let sum = 0, anyValid = false;
  for (const v of values) {
    if (v != null && v >= 0) { sum += v; anyValid = true; }
  }
  return anyValid ? sum : null;
}
