import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDelta, toCurrentDollars, deltaSentiment } from './format.js';

// The Census-published factor for restating 2015-2019 ACS dollars in 2024 dollars.
const FACTOR = 1.23070782;

test('toCurrentDollars restates a figure using the published factor', () => {
  assert.equal(toCurrentDollars(71200, FACTOR), 87626);
  assert.equal(toCurrentDollars(0, FACTOR), 0);
});

test('toCurrentDollars passes through missing values rather than inventing zero', () => {
  assert.equal(toCurrentDollars(null, FACTOR), null);
  assert.equal(toCurrentDollars(undefined, FACTOR), null);
});

test('adjusting for inflation changes the story, which is the point', () => {
  // Real figures: without the adjustment the site claimed +32.7% income growth.
  const then = 78534;   // 2019 dollars
  const now = 104238;   // 2024 dollars
  const nominal = Math.round(((now - then) / then) * 100);
  const real = Math.round(((now - toCurrentDollars(then, FACTOR)) / toCurrentDollars(then, FACTOR)) * 100);
  assert.equal(nominal, 33);
  assert.equal(real, 8);
  assert.ok(real < nominal / 3, 'unadjusted comparison overstates growth several-fold');
});

test('deltaSentiment reads meaning, not direction', () => {
  // Both point up; only one is good news.
  assert.equal(deltaSentiment('medianHouseholdIncome', 'up'), 'good');
  assert.equal(deltaSentiment('povertyRate', 'up'), 'bad');
  assert.equal(deltaSentiment('unemploymentRate', 'up'), 'bad');
  assert.equal(deltaSentiment('povertyRate', 'down'), 'good');
});

test('figures with no obvious good direction stay uncoloured', () => {
  assert.equal(deltaSentiment('totalPopulation', 'up'), null);
  assert.equal(deltaSentiment('medianAge', 'up'), null);
  assert.equal(deltaSentiment('povertyRate', 'flat'), null);
});

test('increase → dir up, positive pctChange', () => {
  assert.deepEqual(formatDelta(110, 100), { diff: 10, pctChange: 10, dir: 'up' });
});

test('decrease → dir down, negative pctChange', () => {
  assert.deepEqual(formatDelta(90, 100), { diff: -10, pctChange: -10, dir: 'down' });
});

test('equal → dir flat', () => {
  assert.equal(formatDelta(100, 100).dir, 'flat');
});

test('null/zero prior → null (no delta)', () => {
  assert.equal(formatDelta(100, null), null);
  assert.equal(formatDelta(null, 100), null);
  assert.equal(formatDelta(100, 0), null);
});
