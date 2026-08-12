import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateVarCodes, shapeTable } from './mirror.mjs';

const header = ['B19001_001E', 'B19013_001E', 'B19001_001M', 'NAME', 'state', 'county', 'tract'];
// two tracts; B19001_001E is a count (households), B19013_001E is a median, _001M is a margin
const rows = [
  ['100', '90000', '15', 'Tract A', '06', '097', '151601'],
  ['300', '70000', '20', 'Tract B', '06', '097', '151602'],
];
const labels = { B19001_001E: 'Total households', B19013_001E: 'Median household income' };
const pops = { '06097151601': 10, '06097151602': 30 };
const rowKey = (h, r) => r[h.indexOf('state')] + r[h.indexOf('county')] + r[h.indexOf('tract')];

test('estimateVarCodes keeps E (ACS) and N (DHC) value codes, drops margins/geo/NAME', () => {
  assert.deepEqual(estimateVarCodes(header), ['B19001_001E', 'B19013_001E']); // _001M margin dropped
  assert.deepEqual(estimateVarCodes(['P12_001N', 'H4_002N', 'NAME', 'state', 'block']),
    ['P12_001N', 'H4_002N']); // DHC N-suffix kept
});

test('shapeTable sums counts and weights medians by population', () => {
  const t = shapeTable('Household Income', [header, ...rows], labels, pops, rowKey);
  assert.equal(t.concept, 'Household Income');
  assert.equal(t.variables.B19001_001E.value, 400); // 100 + 300
  assert.equal(t.variables.B19001_001E.label, 'Total households');
  // (90000*10 + 70000*30) / 40 = 75000
  assert.equal(t.variables.B19013_001E.value, 75000);
});
