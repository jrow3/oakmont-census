import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFigures, activeSectionFor } from './methodology.js';

test('resolveFigures pulls population, 55+ share and block count from the block snapshot', () => {
  const figures = resolveFigures({ oakmont2020: { snapshot: { totalPopulation: 4946, pct55Plus: 92, blockCount: 75 } } });
  assert.equal(figures.population, 4946);
  assert.equal(figures.pct55, 92);
  assert.equal(figures.blocks, 75);
});

test('resolveFigures returns nulls when the block section is missing', () => {
  const figures = resolveFigures({});
  assert.equal(figures.population, null);
  assert.equal(figures.pct55, null);
  assert.equal(figures.blocks, null);
});

test('resolveFigures flattens the enclave section for the page spans', () => {
  const figures = resolveFigures({
    oakmont2020: { snapshot: { totalPopulation: 4946, pct55Plus: 92, blockCount: 75 } },
    enclaves2020: {
      baseline: { pct55Plus: 92, ownerOccupied: 2470, renterOccupied: 700 },
      calibration: { addressPointsInFootprint: 3524, censusHousingUnits: 3427 },
      areas: [
        { key: 'wild-oak', addresses: 41, blockAddresses: 263, otherHomesInBlock: 222, units: 41,
          pctOfUnits: 1.2, population: { low: 29, high: 60 }, age: { ifUnder55Removed: 93.1 }, tenure: null },
        { key: 'oakmont-gardens', addresses: 169, blockAddresses: 281, otherHomesInBlock: 112, units: 162,
          pctOfUnits: 4.7, population: { low: 120, high: 177 }, age: { ifUnder55Removed: 95 },
          tenure: { pctOfRenterUnits: 24.1, renterUnits: 700, ownerOccupiedPctWithout: 82.3 } },
      ],
    },
  });
  assert.equal(figures.wildOakUnits, 41);
  assert.equal(figures.wildOakOtherHomes, 222);
  assert.equal(figures.wildOakPopRange, '29–60');
  assert.equal(figures.gardensPctRentals, 24.1);
  assert.equal(figures.gardensOwnerWithout, 82.3);
  assert.equal(figures.baselineOwnerPct, 77.9);
  assert.equal(figures.calibAddresses, 3524);
});

test('enclave figures are absent rather than wrong when the section is missing', () => {
  const figures = resolveFigures({ oakmont2020: { snapshot: { totalPopulation: 4946 } } });
  assert.equal(figures.wildOakUnits, undefined);
  assert.equal(figures.gardensOwnerWithout, undefined);
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
