import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateJointCounts, INCOME_BRACKETS } from './income-grid.js';

test('INCOME_BRACKETS covers ten rows ending at $200k+', () => {
  assert.equal(INCOME_BRACKETS.length, 10);
  assert.equal(INCOME_BRACKETS[INCOME_BRACKETS.length - 1].label, '$200k +');
});

test('estimateJointCounts preserves the size (column) marginal exactly', () => {
  const M = estimateJointCounts({
    incomeMarginal: [100, 100],
    sizeMarginal: [120, 80],
    sizeMedians: [20000, 90000],
    mids: [25000, 85000],
  });
  const colSum = (c) => M.reduce((a, row) => a + row[c], 0);
  assert.ok(Math.abs(colSum(0) - 120) < 1e-6);
  assert.ok(Math.abs(colSum(1) - 80) < 1e-6);
});

test('estimateJointCounts total equals the summed size marginal', () => {
  const M = estimateJointCounts({
    incomeMarginal: [50, 150, 100],
    sizeMarginal: [120, 100, 80],
    sizeMedians: [15000, 45000, 95000],
    mids: [20000, 50000, 90000],
  });
  const total = M.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 300) < 1e-6);
});

test('estimateJointCounts concentrates larger-median sizes in higher-income rows', () => {
  const M = estimateJointCounts({
    incomeMarginal: [100, 100],
    sizeMarginal: [100, 100],
    sizeMedians: [20000, 90000], // col 0 earns little, col 1 earns lots
    mids: [25000, 85000],        // row 0 low income, row 1 high income
  });
  assert.ok(M[1][1] > M[1][0]); // high-income row: high-median size dominates
  assert.ok(M[0][0] > M[0][1]); // low-income row: low-median size dominates
});

test('estimateJointCounts handles a size with no median (empty column)', () => {
  const M = estimateJointCounts({
    incomeMarginal: [100, 100],
    sizeMarginal: [200, 0],
    sizeMedians: [40000, null],
    mids: [25000, 85000],
  });
  const colSum = (c) => M.reduce((a, row) => a + row[c], 0);
  assert.ok(Math.abs(colSum(1) - 0) < 1e-6);
  assert.ok(Math.abs(colSum(0) - 200) < 1e-6);
});
