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

// Margins do not aggregate the way estimates do. Summed counts combine as the root of the sum of
// squares (Census Bureau, "Calculating Measures of Error for Derived Estimates"). A weighted
// average of two medians has no published combined margin at all — the largest component margin is
// a floor, so a caller that shows it must call it approximate rather than exact.
export function aggregateMargin(label, margins) {
  const valid = margins.filter((m) => m != null && m >= 0);
  if (!valid.length) return null;
  if (isWeighted(label)) return Math.max(...valid);
  return Math.round(Math.sqrt(valid.reduce((a, m) => a + m * m, 0)));
}
