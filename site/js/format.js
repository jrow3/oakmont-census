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
