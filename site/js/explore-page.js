// Explore page: one explorer with a dataset switcher, instead of three collapsed panels spread
// across two pages that a reader couldn't tell apart.

import { renderExplorer } from './explorer.js';

const DATASETS = {
  acs2020: {
    sectionKey: 'acs2020',
    featured: ['B01001', 'B01002', 'B19001', 'B19019', 'B25003', 'B25034', 'B15003', 'B02001'],
    caveat: 'A survey of a sample of households, not a count of everyone. It covers two census tracts, '
      + 'which reach a little past Oakmont. Every figure here is the Bureau’s estimate; the margin of '
      + 'error it publishes alongside is not shown, so read these as “about”, not “exactly”.',
  },
  acs2024: {
    sectionKey: 'acs2024',
    featured: ['B01001', 'B01002', 'B19001', 'B19019', 'B25003', 'B25034', 'B15003', 'B02001'],
    caveat: 'The same survey as 2016–2020, asked of a later sample. The two overlap in 2020, so they '
      + 'are not a clean before-and-after — see What’s Changed for a comparison that is.',
  },
  blocks2020: {
    sectionKey: 'oakmont2020',
    featured: ['P12', 'P3', 'P4', 'H4'],
    caveat: 'A 100% head-count, exact to Oakmont’s boundary. It only records what the census form asks: '
      + 'age, sex, race, and whether a home is owned or rented — nothing about money or education. '
      + 'The Bureau adds a little statistical noise to block-level counts to protect individuals, so a '
      + 'single block can be off by a few people even though the Oakmont totals are dependable.',
  },
};

export async function initExplorePage() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();

  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  if (data.meta?.generatedAt) {
    document.getElementById('footer-generated').textContent = `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;
  }

  const root = document.getElementById('explorer');
  const caveatEl = document.getElementById('dataset-caveat');
  const buttons = Array.from(document.querySelectorAll('.dataset-btn'));

  let token = 0; // guards against a slow fetch landing after the reader has switched away
  async function show(key) {
    const choice = DATASETS[key];
    const section = data[choice.sectionKey];
    if (!section) {
      root.innerHTML = `<p class="explorer-loading">That dataset isn't in this build.</p>`;
      return;
    }
    const mine = ++token;
    caveatEl.textContent = choice.caveat;
    for (const b of buttons) {
      const on = b.dataset.set === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    await renderExplorer(root, {
      explorerFile: section.explorerFile,
      featured: choice.featured,
      year: section.year,
      // Checked inside, after the mirror fetch and before anything is painted. Checking out here
      // would be too late: the losing render has already drawn over the winner.
      isCurrent: () => mine === token,
    });
  }

  for (const b of buttons) b.addEventListener('click', () => show(b.dataset.set));
  await show('acs2020');
}
