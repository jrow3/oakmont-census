import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, isWeighted } from './aggregate.mjs';

test('isWeighted flags medians, means, per-capita, gini, ratio', () => {
  assert.equal(isWeighted('Median household income'), true);
  assert.equal(isWeighted('Mean travel time'), true);
  assert.equal(isWeighted('Per capita income'), true);
  assert.equal(isWeighted('Gini Index'), true);
  assert.equal(isWeighted('Total population'), false);
  assert.equal(isWeighted('Aggregate household income'), false); // aggregate IS summable
});

test('counts sum; nulls/negatives ignored', () => {
  assert.equal(aggregate('Total population', [100, 50, null], [1, 1, 1]), 150);
});

test('all-invalid counts return null', () => {
  assert.equal(aggregate('Total', [null, null], [1, 1]), null);
});

test('medians are population-weighted', () => {
  // (100*10 + 200*30) / (10+30) = 175
  assert.equal(aggregate('Median household income', [100, 200], [10, 30]), 175);
});

test('median with zero total weight returns null', () => {
  assert.equal(aggregate('Median age', [80, 90], [0, 0]), null);
});
