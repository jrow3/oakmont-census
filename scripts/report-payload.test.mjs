import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIncomeSources, deriveHouseholdSize, deriveAgeSex } from './report-payload.mjs';
import { buildReportSection, deriveEducation, deriveIncomeByTenure, deriveMarital } from './report-payload.mjs';

// minimal mirror-style table map
const T = (obj) => {
  const tables = {};
  for (const [code, value] of Object.entries(obj)) {
    const id = code.split('_')[0];
    (tables[id] ||= { variables: {} }).variables[code] = { value };
  }
  return tables;
};

test('deriveIncomeSources computes share and mean; suppressed mean -> null', () => {
  const tables = T({
    B19055_001E: 1000, B19055_002E: 800, B19065_001E: 800 * 23000,   // Social Security
    B19057_001E: 1000, B19057_002E: 6, B19067_001E: null,            // public assistance (mean suppressed)
    B19051_001E: 1000, B19051_002E: 370, B19061_001E: 370 * 100000,  // earnings
    B19053_001E: 1000, B19053_002E: 90,                              // self-employment (no mean)
    B19056_001E: 1000, B19056_002E: 22, B19066_001E: 22 * 8000,      // SSI
    B19059_001E: 1000, B19059_002E: 570, B19069_001E: 570 * 43000,   // retirement
    B22001_001E: 1000, B22001_002E: 3,                               // SNAP (no mean)
  });
  const rows = deriveIncomeSources(tables);
  const ss = rows.find((r) => r.label.startsWith('Social Security'));
  assert.equal(ss.pctHouseholds, 80);
  assert.equal(ss.meanAmount, 23000);
  const pa = rows.find((r) => r.label.startsWith('Cash public assistance'));
  assert.equal(pa.pctHouseholds, 0.6);
  assert.equal(pa.meanAmount, null); // suppressed aggregate
});

test('deriveHouseholdSize averages from the B25009 distribution (7+ = 7.5)', () => {
  const tables = T({
    B25009_003E: 100, B25009_011E: 0,   // 1-person = 100
    B25009_004E: 100, B25009_012E: 0,   // 2-person = 100
    B25009_005E: 0, B25009_013E: 0, B25009_006E: 0, B25009_014E: 0,
    B25009_007E: 0, B25009_015E: 0, B25009_008E: 0, B25009_016E: 0,
    B25009_009E: 0, B25009_017E: 0,
  });
  const hs = deriveHouseholdSize(tables);
  assert.equal(hs.total, 200);
  assert.equal(hs.average, 1.5); // (1*100 + 2*100)/200
});

test('deriveAgeSex sums 55+ bands from the block P12 groups', () => {
  const block = { groups: { age: { variables: {
    P12_017N: { value: 10 }, P12_041N: { value: 30 }, // 55-59 m/f
    P12_025N: { value: 5 }, P12_049N: { value: 40 },  // 85+ m/f
  } } } };
  const rows = deriveAgeSex(block);
  const b5559 = rows.find((r) => r.band === '55-59');
  assert.equal(b5559.male, 10);
  assert.equal(b5559.female, 30);
  assert.equal(b5559.total, 40);
  const b85 = rows.find((r) => r.band === '85+');
  assert.equal(b85.female, 40);
});

test('deriveMarital uses the parent now-married totals (no double count of _005/_006 children)', () => {
  const tables = T({ B12001_001E: 1000, B12001_004E: 300, B12001_005E: 250, B12001_006E: 50,
    B12001_013E: 400, B12001_009E: 50, B12001_018E: 100, B12001_010E: 40, B12001_019E: 60, B12001_003E: 30, B12001_012E: 20 });
  const m = deriveMarital(tables);
  assert.equal(m.pctMarried, 70); // (300 + 400) / 1000, NOT adding the _005/_006 sub-rows
});

test('deriveEducation bounds totals to the 25+ population and computes shares', () => {
  const tables = T({ B15003_001E: 1000, B15003_022E: 300, B15003_023E: 150, B15003_024E: 30, B15003_025E: 20 });
  const e = deriveEducation(tables);
  assert.equal(e.total25plus, 1000);
  assert.equal(e.pctBachelorsPlus, 50); // (300+150+30+20)/1000
  assert.equal(e.pctGraduatePlus, 20);  // (150+30+20)/1000
});

test('deriveIncomeByTenure exposes owner/renter medians', () => {
  const tables = T({ B25119_002E: 85057, B25119_003E: 66691, B25118_002E: 2490, B25118_014E: 880 });
  const t = deriveIncomeByTenure(tables);
  assert.equal(t.ownerMedian, 85057);
  assert.equal(t.renterMedian, 66691);
  assert.equal(t.ownerHouseholds, 2490);
  assert.equal(t.renterHouseholds, 880);
});

test('buildReportSection assembles a labeled, sourced payload', () => {
  const tables = T({
    B19013_001E: 78534, B19301_001E: 66078, B25077_001E: 707911,
    B19055_001E: 3370, B19055_002E: 2706, B19065_001E: 2706 * 23479,
    B25009_003E: 900, B25009_011E: 300, B25009_004E: 1200, B25009_012E: 150,
    B15003_001E: 5673, B15003_022E: 2000, B15003_023E: 900, B15003_024E: 300, B15003_025E: 163,
    B25119_002E: 85057, B25119_003E: 66691, B25118_002E: 2490, B25118_014E: 880,
  });
  const block = { snapshot: { totalPopulation: 4994, medianAge: 74.3, pct65Plus: 81.2, ownerOccupiedPct: 93.6 },
    groups: { age: { variables: { P12_017N: { value: 10 }, P12_041N: { value: 30 } } },
      hispanic: { variables: {} }, race: { variables: {} } } };
  const r = buildReportSection(tables, block);
  assert.equal(r.summary.population, 4994);
  assert.equal(r.summary.medianHouseholdIncome, 78534);
  assert.ok(Array.isArray(r.incomeSources) && r.incomeSources.length === 7);
  assert.equal(r.education.total25plus, 5673);
  assert.match(r.vintage, /2020/);
});
