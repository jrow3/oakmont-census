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

test('shapeTable keeps the margin the Census sent in the same response', () => {
  const t = shapeTable('Household Income', [header, ...rows], labels, pops, rowKey);
  assert.equal(t.variables.B19001_001E.moe, 25); // sqrt(15^2 + 20^2)
});

test('a variable with no margin column carries no margin key at all', () => {
  // Rather than a null the explorer would have to render as an empty cell.
  const t = shapeTable('Household Income', [header, ...rows], labels, pops, rowKey);
  assert.equal('moe' in t.variables.B19013_001E, false);
  const dhc = shapeTable('Age', [['P12_001N', 'state', 'block'], ['500', '06', '1001']],
    { P12_001N: 'Total' }, {}, () => 'x');
  assert.equal('moe' in dhc.variables.P12_001N, false);
});

test('the Census negative sentinels are not read as margins', () => {
  // -555555555 means "margin not calculable"; treating it as a number would print a huge ±.
  const h = ['B19001_001E', 'B19001_001M', 'state', 'county', 'tract'];
  const t = shapeTable('X', [h, ['100', '-555555555', '06', '097', '151601']],
    { B19001_001E: 'Total households' }, {}, () => 'x');
  assert.equal('moe' in t.variables.B19001_001E, false);
});
