import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDelta } from './format.js';

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
