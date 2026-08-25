import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deltaBadge } from './snapshot.js';

// Mirrors what page.js passes in from data.comparison.
const OPTS = {
  baselineLabel: '2015–2019',
  inflationFactor: 1.23070782,
  dollarFields: ['medianHouseholdIncome', 'perCapitaIncome', 'medianHomeValue', 'medianGrossRent'],
  rateFields: ['ownerOccupiedPct', 'unemploymentRate', 'povertyRate'],
  levelFields: ['medianAge'],
};

test('a rate reports percentage points, not relative change', () => {
  // Live figures. As a relative change this reads "+47%", which is the number a critic quotes.
  const badge = deltaBadge('povertyRate', 4.7, 3.2, OPTS);
  assert.match(badge, /\+1\.5 points/);
  assert.doesNotMatch(badge, /47/);
});

test('a falling rate reports negative points and reads as good news', () => {
  const badge = deltaBadge('unemploymentRate', 3.7, 8.5, OPTS);
  assert.match(badge, /-4\.8 points/);
  assert.match(badge, /kpi-delta-good/);   // unemployment falling is good
  assert.match(badge, /▼/);
});

test('rising poverty is coloured as bad, not as an increase', () => {
  const badge = deltaBadge('povertyRate', 4.7, 3.2, OPTS);
  assert.match(badge, /kpi-delta-bad/);
});

test('a dollar figure compares in constant dollars and says so', () => {
  // $73,440 in 2019 dollars is $90,383 in 2024 dollars; against $104,238 that is +15%, not +42%.
  const badge = deltaBadge('medianHouseholdIncome', 104238, 73440, OPTS);
  assert.match(badge, /\+15% in real terms/);
  assert.doesNotMatch(badge, /42/);
});

test('a count reports a relative percentage, which is right for counts', () => {
  const badge = deltaBadge('totalPopulation', 5761, 5998, OPTS);
  assert.match(badge, /-4%/);
  assert.doesNotMatch(badge, /points/);
});

test('a level reports its own units — a percentage of an age is meaningless', () => {
  const badge = deltaBadge('medianAge', 74, 71, OPTS);
  assert.match(badge, /\+3 years/);
  assert.doesNotMatch(badge, /%/);
});

test('a one-year move is singular', () => {
  assert.match(deltaBadge('medianAge', 72, 71, OPTS), /\+1 year</);
  assert.match(deltaBadge('medianAge', 70, 71, OPTS), /-1 year</);
});

test('an unchanged figure says so rather than rendering blank', () => {
  // A blank where every neighbouring tile has a figure reads as missing data.
  const badge = deltaBadge('medianAge', 71, 71, OPTS);
  assert.match(badge, /Unchanged/);
  assert.doesNotMatch(badge, /▲|▼/);
});

test('no badge names the baseline, because a wrapped badge breaks the row', () => {
  // Four of the ten wrapped to a second line when each repeated "since 2015–2019", which dropped
  // those tiles' sub-labels 20px below their neighbours'. The page states the baseline once.
  for (const badge of [
    deltaBadge('medianHouseholdIncome', 104238, 73440, OPTS),
    deltaBadge('povertyRate', 4.7, 3.2, OPTS),
    deltaBadge('medianAge', 71, 71, OPTS),
  ]) assert.doesNotMatch(badge, /2015–2019/);
});

test('a change too small to round to a whole percent still says unchanged', () => {
  const badge = deltaBadge('totalPopulation', 5000, 5010, OPTS);
  assert.match(badge, /Unchanged/);
});

test('missing values produce no badge at all', () => {
  assert.equal(deltaBadge('totalPopulation', null, 5000, OPTS), '');
  assert.equal(deltaBadge('totalPopulation', 5000, null, OPTS), '');
});

test('an unclassified key falls back to relative change without colour', () => {
  const badge = deltaBadge('somethingNew', 120, 100, OPTS);
  assert.match(badge, /\+20%/);
  assert.doesNotMatch(badge, /kpi-delta-good|kpi-delta-bad/);
});
