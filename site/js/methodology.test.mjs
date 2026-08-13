import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFigures, activeSectionFor } from './methodology.js';

test('resolveFigures pulls population and 55+ share from the block snapshot', () => {
  const figures = resolveFigures({ oakmont2020: { snapshot: { totalPopulation: 4994, pct55Plus: 92 } } });
  assert.equal(figures.population, 4994);
  assert.equal(figures.pct55, 92);
});

test('resolveFigures returns nulls when the block section is missing', () => {
  const figures = resolveFigures({});
  assert.equal(figures.population, null);
  assert.equal(figures.pct55, null);
});

const SECTIONS = [
  { id: 'short', top: 0 },
  { id: 'two-kinds', top: 500 },
  { id: 'ladder', top: 1200 },
  { id: 'fine-print', top: 2000 },
];

test('activeSectionFor returns the first section at the top of the page', () => {
  assert.equal(activeSectionFor(0, SECTIONS), 'short');
  assert.equal(activeSectionFor(120, SECTIONS), 'short');
});

test('activeSectionFor returns the last section scrolled past', () => {
  assert.equal(activeSectionFor(600, SECTIONS), 'two-kinds');
  assert.equal(activeSectionFor(1300, SECTIONS), 'ladder');
  assert.equal(activeSectionFor(5000, SECTIONS), 'fine-print');
});

test('activeSectionFor handles an empty section list', () => {
  assert.equal(activeSectionFor(100, []), null);
});
