import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barWidths, pairedBars } from './charts.js';

test('barWidths scales values to a max width against the series max', () => {
  assert.deepEqual(barWidths([50, 100, 0], 200), [100, 200, 0]);
});

test('pairedBars scales both sexes on one shared max (larger count => longer bar)', () => {
  // male 100 vs female 620 in the same row: the female (right) bar must be far longer.
  const svg = pairedBars({ items: [{ label: '70-74', left: 100, right: 620 }] });
  const widths = [...svg.matchAll(/class="bar-fill"[^>]*\bwidth="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 2); // [male, female]
  assert.ok(widths[1] > widths[0], 'female bar should be wider than male');
  assert.ok(widths[1] > 3 * widths[0], 'female (620) should dwarf male (100) on a shared scale');
});
