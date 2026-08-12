import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketIndexFor, INCOME_BRACKETS } from './income-grid.js';

test('bracketIndexFor maps a median income to its bracket row', () => {
  // brackets ascend; $95,400 falls in the $75,000–$99,999 bracket
  const i = bracketIndexFor(95400);
  assert.equal(INCOME_BRACKETS[i].label, '$75–100k');
});

test('bracketIndexFor clamps below and above range', () => {
  assert.equal(bracketIndexFor(0), 0);
  assert.equal(bracketIndexFor(10_000_000), INCOME_BRACKETS.length - 1);
});
