// Grouped (interpolated) median from banded counts, and its application to the P12 age table.

import { P12_AGE_BANDS } from './decennial-variables.mjs';

// bands: [{ lower, upper, count }] ordered low -> high. Returns the interpolated median or null.
export function groupedMedian(bands) {
  const total = bands.reduce((a, b) => a + (b.count || 0), 0);
  if (total <= 0) return null;
  const half = total / 2;
  let cum = 0;
  for (const b of bands) {
    const c = b.count || 0;
    if (cum + c >= half) {
      if (c === 0) return b.lower;
      return b.lower + ((half - cum) / c) * (b.upper - b.lower);
    }
    cum += c;
  }
  return bands[bands.length - 1].upper;
}

export function medianAgeFromP12(values) {
  const bands = P12_AGE_BANDS.map((b) => ({
    lower: b.lower,
    upper: b.upper,
    count: b.codes.reduce((a, c) => a + (values[c] || 0), 0),
  }));
  return groupedMedian(bands);
}
