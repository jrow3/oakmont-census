// Methodology page: fills a few live anchor figures from data.json, shows the sample banner, and
// runs the jump-nav scroll-spy. The explanatory prose, geography diagram, and source table are
// static HTML in methodology.html — this module only keeps the live numbers honest and the nav lit.
import { fmt, pct, escapeHtml } from './format.js';

export function resolveFigures(data) {
  const snapshot = (data.oakmont2020 && data.oakmont2020.snapshot) || {};
  return {
    population: snapshot.totalPopulation ?? null,
    pct55: snapshot.pct55Plus ?? null,
  };
}

const FIGURE_FORMAT = {
  population: (value) => fmt(value),
  pct55: (value) => pct(value),
};

function injectFigures(figures) {
  for (const [key, value] of Object.entries(figures)) {
    if (value == null) continue;
    const format = FIGURE_FORMAT[key] || String;
    for (const el of document.querySelectorAll(`[data-figure="${key}"]`)) {
      el.textContent = format(value);
    }
  }
}

// Returns the id of the last section whose top has scrolled past `offset`. `sections` is
// [{ id, top }] ordered by top ascending; clamps to the first section before anything is passed.
export function activeSectionFor(offset, sections) {
  let active = sections.length ? sections[0].id : null;
  for (const section of sections) {
    if (section.top <= offset) active = section.id;
    else break;
  }
  return active;
}

function wireScrollSpy() {
  const links = Array.from(document.querySelectorAll('.method-jump a'));
  const sections = links
    .map((link) => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  const setActive = () => {
    const offset = window.scrollY + 140;
    const positions = sections.map((el) => ({ id: el.id, top: el.offsetTop }));
    const activeId = activeSectionFor(offset, positions);
    for (const link of links) {
      link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
    }
  };

  setActive();
  window.addEventListener('scroll', setActive, { passive: true });
  window.addEventListener('resize', setActive);
}

export async function initMethodology() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  if (data.meta?.generatedAt) {
    const generated = document.getElementById('footer-generated');
    if (generated) generated.textContent = `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;
  }
  injectFigures(resolveFigures(data));
  wireScrollSpy();
}

export function showMethodologyError(err) {
  const body = document.getElementById('method-body');
  if (body) body.insertAdjacentHTML('afterbegin',
    `<p class="explorer-loading">Could not load live figures: ${escapeHtml(err.message)}</p>`);
  console.error(err);
}
