import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnclaveSection } from './enclave-impact.mjs';

// Mirrors the real block snapshot shape. Values are the live 2020 figures for the current
// footprint so the assertions below double as a check on the published numbers.
const SNAPSHOT = {
  totalPopulation: 4946,
  totalHousingUnits: 3427,
  occupiedUnits: 3170,
  ownerOccupied: 2470,
  renterOccupied: 700,
  age55Plus: 4550,
  age65Plus: 4010,
};

const ENCLAVES = {
  source: 'county GIS',
  accessed: '2026-08-24',
  calibration: { addressPointsInFootprint: 3524, censusHousingUnits: 3427, ratio: 1.028 },
  areas: [
    { key: 'wild-oak', label: 'Wild Oak', blockGeoid: 'A', addresses: 41, blockAddresses: 263, blockPopulation: 382, blockHousingUnits: 261 },
    { key: 'oakmont-gardens', label: 'Oakmont Gardens', blockGeoid: 'B', addresses: 169, blockAddresses: 281, blockPopulation: 295, blockHousingUnits: 270, allRental: true },
  ],
};

const areaBy = (section, key) => section.areas.find((a) => a.key === key);

test('sizes an area from its share of its block', () => {
  const wildOak = areaBy(buildEnclaveSection(ENCLAVES, SNAPSHOT), 'wild-oak');
  assert.equal(wildOak.units, 41);              // 261 * 41/263
  assert.equal(wildOak.shareOfBlockPct, 15.6);
  assert.equal(wildOak.otherHomesInBlock, 222); // the reason it can't be excluded
  assert.equal(wildOak.pctOfUnits, 1.2);
});

test('brackets population with proportional and residual estimates', () => {
  const gardens = areaBy(buildEnclaveSection(ENCLAVES, SNAPSHOT), 'oakmont-gardens');
  // proportional: 295 * 169/281 = 177; residual: 295 - 112 * (4946/3170) = 120
  assert.equal(gardens.population.proportional, 177);
  assert.equal(gardens.population.residual, 120);
  assert.equal(gardens.population.low, 120);
  assert.equal(gardens.population.high, 177);
  assert.equal(gardens.pctOfPopulationLow, 2.4);
  assert.equal(gardens.pctOfPopulationHigh, 3.6);
});

test('the 55+ swing is bounded in both directions, not asserted', () => {
  const wildOak = areaBy(buildEnclaveSection(ENCLAVES, SNAPSHOT), 'wild-oak');
  assert.equal(wildOak.age.baseline55Plus, 92);
  // all under 55 -> denominator shrinks, share rises. All 55+ -> both shrink, share falls.
  assert.ok(wildOak.age.ifUnder55Removed > wildOak.age.baseline55Plus);
  assert.ok(wildOak.age.if55PlusRemoved < wildOak.age.baseline55Plus);
  assert.ok(wildOak.age.ifUnder55Removed - wildOak.age.baseline55Plus < 1.5); // immaterial either way
});

test('an all-rental area reports its share of rentals and the owner-occupancy swing', () => {
  const gardens = areaBy(buildEnclaveSection(ENCLAVES, SNAPSHOT), 'oakmont-gardens');
  assert.equal(gardens.tenure.pctOfRenterUnits, 24.1);        // 169 of 700
  assert.equal(gardens.tenure.ownerOccupiedPctWithout, 82.3); // 2470 / (2470 + 531)
});

test('an area with no rental flag reports no tenure effect', () => {
  const wildOak = areaBy(buildEnclaveSection(ENCLAVES, SNAPSHOT), 'wild-oak');
  assert.equal(wildOak.tenure, null);
});

test('residual estimate is skipped, not faked, when occupancy is unknown', () => {
  const snapshot = { ...SNAPSHOT, occupiedUnits: null };
  const gardens = areaBy(buildEnclaveSection(ENCLAVES, snapshot), 'oakmont-gardens');
  assert.equal(gardens.population.residual, null);
  assert.equal(gardens.population.low, gardens.population.proportional);
});

test('returns null rather than guessing when inputs are missing', () => {
  assert.equal(buildEnclaveSection(null, SNAPSHOT), null);
  assert.equal(buildEnclaveSection(ENCLAVES, null), null);
});

test('baseline carries the unmodified published figures', () => {
  const section = buildEnclaveSection(ENCLAVES, SNAPSHOT);
  assert.equal(section.baseline.population, 4946);
  assert.equal(section.baseline.pct55Plus, 92);
  assert.equal(section.calibration.ratio, 1.028);
});
