import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAcsSection, assembleData, buildSnapshot } from './build-payload.mjs';

test('buildAcsSection wraps values with year and source', () => {
  const section = buildAcsSection('2024', { B01001_001E: 5000 });
  assert.equal(section.year, '2024');
  assert.match(section.source, /2024 ACS 5-Year/);
  assert.equal(section.snapshot.totalPopulation, 5000);
  assert.ok(section.groups.age, 'has groups');
});

test('assembleData nests both sections under acs2020/acs2024', () => {
  const s2020 = buildAcsSection('2020', { B01001_001E: 5600 });
  const s2024 = buildAcsSection('2024', { B01001_001E: 5839 });
  const data = assembleData({ '2020': s2020, '2024': s2024 }, { sample: true });
  assert.equal(data.acs2020.snapshot.totalPopulation, 5600);
  assert.equal(data.acs2024.snapshot.totalPopulation, 5839);
  assert.equal(data.meta.sample, true);
  assert.match(data.meta.geography, /1516\.01/);
});

test('buildSnapshot keeps its existing shape (characterization)', () => {
  const s = buildSnapshot({ B25003_002E: 8, B25003_003E: 2 });
  assert.equal(s.ownerOccupiedPct, 80); // 8 / (8+2)
});
