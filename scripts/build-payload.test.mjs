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

import { buildBlockSection } from './build-payload.mjs';

test('buildBlockSection derives 65+/85+/tenure from summed DHC values', () => {
  const v = {
    // fixture mirrors the codes fetch-blocks actually returns — no P1_001N, so a total-pop
    // read that isn't in DEC_VARS would surface here as a null instead of passing silently
    P12_001N: 5000,
    P12_024N: 100, P12_025N: 50, P12_048N: 120, P12_049N: 70, // some 80-84 and 85+
    P12_020N: 0, P12_021N: 0, P12_022N: 0, P12_023N: 0, P12_044N: 0, P12_045N: 0, P12_046N: 0, P12_047N: 0,
    P3_001N: 5000, P3_002N: 4800,
    P4_001N: 5000, P4_003N: 200,
    H1_001N: 3500, H3_002N: 3200, H3_003N: 300,
    H4_002N: 1500, H4_003N: 1400, H4_004N: 300,
  };
  const s = buildBlockSection(v);
  assert.equal(s.snapshot.totalPopulation, 5000);
  assert.equal(s.snapshot.age85Plus, 120);          // P12_025N + P12_049N = 50 + 70
  assert.equal(s.snapshot.age65Plus, 340);          // 100+50+120+70 (only the nonzero 80-84 & 85+ bands here)
  assert.equal(s.snapshot.ownerOccupied, 2900);     // H4_002 + H4_003
  assert.equal(s.snapshot.ownerOccupiedPct, 90.6);  // 2900 / (2900+300) * 100, 1dp
  assert.equal(s.snapshot.whiteAlonePct, 96);       // 4800/5000
  assert.equal(s.snapshot.hispanicPct, 4);          // 200/5000
  assert.ok(s.groups.age.variables.P12_025N.value === 50);
});
