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
