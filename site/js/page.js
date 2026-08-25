// Bootstrap for the change page: loads the baked data.json, picks one section, and renders its
// snapshot against a baseline. `compareTo` names the baseline section; the terms of the
// comparison (inflation factor, which fields are dollars) travel in the payload.

import { renderSnapshot } from './snapshot.js';

export async function initPage({ section: sectionKey, compareTo = null }) {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const section = data[sectionKey];
  const meta = data.meta;

  if (meta?.sample) document.getElementById('sample-banner').hidden = false;
  // "2024 ACS 5-Year" is the Bureau's name for a survey covering 2020-2024. Spell out the span,
  // because the single year reads as "this is 2024 data" to anyone who hasn't met the ACS.
  document.getElementById('badge-year').textContent = `${Number(section.year) - 4}–${section.year} survey`;
  document.getElementById('meta-geo').textContent = meta.geography;
  document.getElementById('footer-source').textContent = `Source: ${section.source}`;
  if (meta.generatedAt) {
    document.getElementById('footer-generated').textContent = `Data generated ${meta.generatedAt.slice(0, 10)}.`;
  }

  // A 5-year ACS vintage covers the four years before it too, and its dollars are stated in its
  // final year — both facts the change page has to state rather than assume.
  const windowLabel = (year) => `${Number(year) - 4}–${year}`;
  const terms = data.comparison || null;
  const baseline = compareTo && terms ? data[compareTo] : null;
  const compare = baseline?.snapshot ?? null;
  const compareMeta = baseline ? {
    baselineLabel: windowLabel(baseline.year),
    currentLabel: windowLabel(section.year),
    baselineDollarYear: baseline.year,
    inflationFactor: terms.inflationFactor,
    dollarFields: terms.dollarFields,
  } : null;
  renderSnapshot(section, meta, { compare, compareMeta });
}

export function showError(err) {
  const note = document.getElementById('method-note');
  if (note) { note.hidden = false; note.textContent = `Could not load census data: ${err.message}`; }
  console.error(err);
}
