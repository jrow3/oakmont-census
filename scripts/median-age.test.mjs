import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupedMedian, medianAgeFromP12 } from './median-age.mjs';
import { P12_AGE_BANDS } from './decennial-variables.mjs';

test('groupedMedian interpolates within the median band', () => {
  const bands = [
    { lower: 0, upper: 10, count: 10 },
    { lower: 10, upper: 20, count: 10 },
    { lower: 20, upper: 30, count: 10 },
  ];
  // total 30, half 15 falls in band 2: 10 + ((15-10)/10)*10 = 15
  assert.equal(groupedMedian(bands), 15);
});

test('groupedMedian returns null when empty', () => {
  assert.equal(groupedMedian([{ lower: 0, upper: 10, count: 0 }]), null);
});

test('medianAgeFromP12 lands in the populated band', () => {
  const v = {};
  for (const b of P12_AGE_BANDS) for (const c of b.codes) v[c] = 0;
  v.P12_022N = 50; v.P12_046N = 50; // everyone in 70-74
  assert.equal(medianAgeFromP12(v), 72.5);
});
