// Shared page bootstrap. Loads the baked data.json, picks one section, renders its snapshot,
// and lazily builds its explorer. `compareTo` (optional) turns on prior-year KPI deltas.

import { renderSnapshot } from './snapshot.js';
import { renderExplorer } from './explorer.js';

export async function initPage({ section: sectionKey, compareTo = null }) {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const section = data[sectionKey];
  const meta = data.meta;

  if (meta?.sample) document.getElementById('sample-banner').hidden = false;
  document.getElementById('badge-year').textContent = `${section.year} ACS 5-Year`;
  document.getElementById('meta-geo').textContent = meta.geography;
  document.getElementById('footer-source').textContent = `Source: ${section.source}`;
  if (meta.generatedAt) {
    document.getElementById('footer-generated').textContent = `Data generated ${meta.generatedAt.slice(0, 10)}.`;
  }

  const compare = compareTo ? data[compareTo]?.snapshot : null;
  renderSnapshot(section, meta, { compare });

  if (data.oakmont2020 && document.getElementById('block-kpis')) {
    const { renderBlockSnapshot } = await import('./block-snapshot.js');
    renderBlockSnapshot(data.oakmont2020);
    const bToggle = document.getElementById('block-explorer-toggle');
    const bPanel = document.getElementById('block-explorer');
    let bBuilt = false;
    bToggle.addEventListener('click', () => {
      const open = bToggle.getAttribute('aria-expanded') === 'true';
      bToggle.setAttribute('aria-expanded', String(!open));
      bPanel.hidden = open;
      if (!open && !bBuilt) { renderExplorer(bPanel, data.oakmont2020); bBuilt = true; }
    });
  }

  const toggle = document.getElementById('explorer-toggle');
  const panel = document.getElementById('explorer');
  let built = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    if (!open && !built) { renderExplorer(panel, section); built = true; }
  });
}

export function showError(err) {
  const note = document.getElementById('method-note');
  if (note) { note.hidden = false; note.textContent = `Could not load census data: ${err.message}`; }
  console.error(err);
}
