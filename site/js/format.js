// Number formatting helpers shared across the snapshot and explorer.

export const fmt = (n) =>
  (n == null || Number.isNaN(Number(n))) ? '—' : Number(n).toLocaleString('en-US');

export const currency = (n) =>
  (n == null || Number.isNaN(Number(n))) ? '—' : '$' + Number(n).toLocaleString('en-US');

export const pct = (n, digits = 1) =>
  (n == null || Number.isNaN(Number(n))) ? '—' : Number(n).toFixed(digits) + '%';

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Compare a current KPI value to its prior-year value. Returns numeric direction + change,
// or null when a delta is meaningless (missing values, or prior is zero).
export function formatDelta(current, prior) {
  if (current == null || prior == null || prior === 0) return null;
  const diff = current - prior;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { diff, pctChange: Number(((diff / Math.abs(prior)) * 100).toFixed(1)), dir };
}

// ACS 5-year dollar figures are expressed in the final year's dollars, so a 2015-2019 figure is
// in 2019 dollars and a 2020-2024 figure is in 2024 dollars. Comparing them directly measures
// inflation as much as it measures Oakmont. `factor` is the Census-published multiplier.
export function toCurrentDollars(value, factor) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * factor);
}

// Whether an increase in this figure is good, bad, or neither. Direction alone is not meaning:
// rising poverty and rising incomes both point up, and colouring them the same reads as
// endorsement. `null` means don't colour it at all.
const SENTIMENT = {
  povertyRate: 'badWhenUp',
  unemploymentRate: 'badWhenUp',
  medianHouseholdIncome: 'goodWhenUp',
  perCapitaIncome: 'goodWhenUp',
};

export function deltaSentiment(key, dir) {
  const rule = SENTIMENT[key];
  if (!rule || dir === 'flat') return null;
  const up = dir === 'up';
  return rule === 'goodWhenUp' ? (up ? 'good' : 'bad') : (up ? 'bad' : 'good');
}
