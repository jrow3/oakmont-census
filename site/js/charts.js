// Hand-rolled inline-SVG charts (no external library) following the dataviz mark specs:
// thin marks, square-at-baseline / rounded-at-the-growing-end bars, recessive tracks,
// selective direct labels, and a shared per-mark hover tooltip.

import { fmt, escapeHtml } from './format.js';

const W = 560;        // SVG user-space width; scales to the card via viewBox
const LABEL_W = 150;  // left label column
const VALUE_W = 60;   // right value column
const ROW_H = 30;
const BAR_H = 15;
const PAD_Y = 6;

// Path for a bar that is square on the left (baseline) and rounded on the right (data end).
function roundedRightRect(x, y, w, h, r) {
  if (w <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} ` +
    `V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
}

// items: [{ label, value, tip? }].  format: value -> display string.
export function horizontalBars({ items, color = 'var(--terracotta)', format = fmt, ariaLabel = 'Bar chart' }) {
  const barAreaW = W - LABEL_W - VALUE_W;
  const H = PAD_Y * 2 + items.length * ROW_H;
  const maxV = Math.max(1, ...items.map((d) => d.value || 0));

  const rows = items.map((d, i) => {
    const rowY = PAD_Y + i * ROW_H;
    const barY = rowY + (ROW_H - BAR_H) / 2;
    const v = d.value || 0;
    const barW = Math.round((v / maxV) * barAreaW);
    const midY = rowY + ROW_H / 2;
    const tip = d.tip || `<b>${escapeHtml(d.label)}</b><br><span class="tt-val">${format(d.value)}</span>`;
    return `
    <g class="bar-group" data-tip="${escapeHtml(tip)}">
      <rect x="0" y="${rowY}" width="${W}" height="${ROW_H}" fill="transparent" />
      <text class="bar-label" x="${LABEL_W - 10}" y="${midY + 4}" text-anchor="end" font-size="12.5">${escapeHtml(d.label)}</text>
      <rect class="bar-track" x="${LABEL_W}" y="${barY}" width="${barAreaW}" height="${BAR_H}" rx="4" />
      <path class="bar-fill" d="${roundedRightRect(LABEL_W, barY, Math.max(barW, 2), BAR_H, 4)}" fill="${color}" />
      <text class="bar-value" x="${LABEL_W + barW + 8}" y="${midY + 4}" text-anchor="start" font-size="12.5">${format(d.value)}</text>
    </g>`;
  }).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${rows}</svg>`;
}

// segments: [{ label, value, color }].  Single 100%-width bar, one rounded pill per segment.
export function stackedBar({ segments, format = fmt, ariaLabel = 'Proportion' }) {
  const H = 46;
  const barH = 34;
  const gap = 2; // surface gap between fills
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  let x = 0;
  const parts = segments.map((s) => {
    const w = Math.max(0, (s.value / total) * (W - gap * (segments.length - 1)));
    const share = ((s.value / total) * 100).toFixed(1);
    const tip = `<b>${escapeHtml(s.label)}</b><br><span class="tt-val">${format(s.value)}</span> · ${share}%`;
    const seg = `
    <g class="bar-group" data-tip="${escapeHtml(tip)}">
      <rect class="bar-fill" x="${x}" y="6" width="${w}" height="${barH}" rx="6" fill="${s.color}" />
      ${w > 54 ? `<text x="${x + 12}" y="${6 + barH / 2 + 5}" font-size="14" font-weight="600" fill="#fff">${share}%</text>` : ''}
    </g>`;
    x += w + gap;
    return seg;
  }).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${parts}</svg>`;
}

// Attach one delegated tooltip for every [data-tip] mark inside root.
let tipEl;
export function wireTooltips(root) {
  tipEl = tipEl || document.getElementById('tooltip');
  if (!tipEl) return;
  root.addEventListener('pointermove', (e) => {
    const g = e.target.closest('[data-tip]');
    if (!g) { tipEl.hidden = true; return; }
    tipEl.innerHTML = g.dataset.tip;
    tipEl.hidden = false;
    tipEl.style.left = e.clientX + 'px';
    tipEl.style.top = e.clientY + 'px';
  });
  root.addEventListener('pointerleave', () => { tipEl.hidden = true; });
}
