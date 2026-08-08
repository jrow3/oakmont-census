// Entry point: load the baked data.json, render the snapshot, and lazily build the explorer
// the first time it is opened.

import { renderSnapshot } from './snapshot.js';
import { renderExplorer } from './explorer.js';

async function main() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();

  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  document.getElementById('badge-year').textContent = `${data.meta.year} ACS 5-Year`;
  document.getElementById('footer-source').textContent = `Source: ${data.meta.source}`;
  if (data.meta.generatedAt) {
    document.getElementById('footer-generated').textContent =
      `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;
  }

  renderSnapshot(data);

  const toggle = document.getElementById('explorer-toggle');
  const panel = document.getElementById('explorer');
  let built = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    if (!open && !built) { renderExplorer(panel, data); built = true; }
  });
}

main().catch((err) => {
  const note = document.getElementById('method-note');
  if (note) { note.hidden = false; note.textContent = `Could not load census data: ${err.message}`; }
  console.error(err);
});
