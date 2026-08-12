import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barWidths } from './charts.js';

test('barWidths scales values to a max width against the series max', () => {
  assert.deepEqual(barWidths([50, 100, 0], 200), [100, 200, 0]);
});
