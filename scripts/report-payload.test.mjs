import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIncomeSources, deriveHouseholdSize, deriveAgeSex } from './report-payload.mjs';
import { buildReportSection, deriveEducation, deriveIncomeByTenure, deriveMarital, deriveHomeValue, derivePlaceOfBirth, deriveRace } from './report-payload.mjs';
import { deriveMarital55Plus, derivePlaceOfBirth55Plus } from './report-payload.mjs';

// minimal mirror-style table map
const T = (obj) => {
  const tables = {};
  for (const [code, value] of Object.entries(obj)) {
    const id = code.split('_')[0];
    (tables[id] ||= { variables: {} }).variables[code] = { value };
  }
  return tables;
};

const SOURCE_TABLES = T({
  B19055_001E: 1000, B19055_002E: 800, B19065_001E: 800 * 23000,   // Social Security
  B19057_001E: 1000, B19057_002E: 6, B19067_001E: null,            // public assistance: suppressed
  B19051_001E: 1000, B19051_002E: 370, B19061_001E: 370 * 100000,  // earnings
  B19053_001E: 1000, B19053_002E: 90, B19063_001E: 90 * 41000,     // self-employment
  B19054_001E: 1000, B19054_002E: 540, B19064_001E: 540 * 28000,   // interest / dividends / rent
  B19056_001E: 1000, B19056_002E: 22, B19066_001E: 22 * 8000,      // SSI
  B19059_001E: 1000, B19059_002E: 570, B19069_001E: 570 * 43000,   // retirement
  B22001_001E: 1000, B22001_002E: 0,                               // SNAP: no households at all
});

const row = (label) => deriveIncomeSources(SOURCE_TABLES).find((r) => r.label.startsWith(label));

test('deriveIncomeSources computes share and mean', () => {
  const ss = row('Social Security');
  assert.equal(ss.pctHouseholds, 80);
  assert.equal(ss.meanAmount, 23000);
  assert.equal(ss.amountStatus, 'reported');
});

test('self-employment reports a mean — B19063 exists and must be requested', () => {
  // Regression guard: this was hardcoded to null, so the page claimed the Census withheld a
  // figure it actually publishes.
  const se = row('Self-employment');
  assert.equal(se.meanAmount, 41000);
  assert.equal(se.amountStatus, 'reported');
});

test('interest / dividends / rental income is included', () => {
  const inv = row('Interest, dividends');
  assert.equal(inv.pctHouseholds, 54);
  assert.equal(inv.meanAmount, 28000);
});

test('the three no-amount cases are distinguished, not collapsed', () => {
  // suppressed by the Bureau: the table exists, the value does not
  const pa = row('Cash public assistance');
  assert.equal(pa.meanAmount, null);
  assert.equal(pa.amountStatus, 'notDisclosed');

  // no households report it, so there is nothing to disclose
  const snap = row('SNAP');
  assert.equal(snap.withCount, 0);
  assert.equal(snap.amountStatus, 'noHouseholds');
});

test('a source with no aggregate table reads as not published, not withheld', () => {
  const snapOnly = deriveIncomeSources(T({ B22001_001E: 1000, B22001_002E: 40 }))
    .find((r) => r.label.startsWith('SNAP'));
  // ACS publishes no aggregate SNAP dollars at any geography
  assert.equal(snapOnly.amountStatus, 'notPublished');
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

// B12002 inverts the B12001 hazard: age lives only on the LEAVES, so now-married 55+ must sum
// spouse-present + separated + other, and must never touch the _018/_111 parents (which carry
// no age and would double-count if added).
const MARITAL_55 = T({
  // male never married 55+ (_013.._017) = 10 each = 50
  B12002_013E: 10, B12002_014E: 10, B12002_015E: 10, B12002_016E: 10, B12002_017E: 10,
  // male now married: spouse present (_029.._033) = 100 each = 500
  B12002_029E: 100, B12002_030E: 100, B12002_031E: 100, B12002_032E: 100, B12002_033E: 100,
  // male separated (_045.._049) = 2 each = 10; male other (_060.._064) = 3 each = 15
  B12002_045E: 2, B12002_046E: 2, B12002_047E: 2, B12002_048E: 2, B12002_049E: 2,
  B12002_060E: 3, B12002_061E: 3, B12002_062E: 3, B12002_063E: 3, B12002_064E: 3,
  // male widowed (_075.._079) = 20 each = 100; male divorced (_090.._094) = 5 each = 25
  B12002_075E: 20, B12002_076E: 20, B12002_077E: 20, B12002_078E: 20, B12002_079E: 20,
  B12002_090E: 5, B12002_091E: 5, B12002_092E: 5, B12002_093E: 5, B12002_094E: 5,
  // the age-less parents — present in the real mirror, must be ignored entirely
  B12002_018E: 999999, B12002_111E: 999999, B12002_003E: 999999, B12002_002E: 999999,
});

test('deriveMarital55Plus sums B12002 leaves and ignores the age-less parents', () => {
  const m = deriveMarital55Plus(MARITAL_55);
  assert.equal(m.total, 700);          // 50 + (500+10+15) + 100 + 25
  assert.equal(m.pctMarried, 75);      // 525 / 700 — parents _018/_111 excluded
  assert.equal(m.pctWidowed, 14.3);
  assert.equal(m.pctDivorced, 3.6);
  assert.equal(m.pctNever, 7.1);
});

test('deriveMarital55Plus returns null rather than a zeroed row when the table is absent', () => {
  assert.equal(deriveMarital55Plus(T({ B12001_001E: 1000 })), null);
});

test('derivePlaceOfBirth55Plus reads the 55+ bands of each B06001 category', () => {
  const p = derivePlaceOfBirth55Plus(T({
    // total 55+ bands (_008.._012)
    B06001_008E: 100, B06001_009E: 100, B06001_010E: 100, B06001_011E: 100, B06001_012E: 100,
    // born in state (_020.._024) = 300
    B06001_020E: 60, B06001_021E: 60, B06001_022E: 60, B06001_023E: 60, B06001_024E: 60,
    // born in another state (_032.._036) = 150
    B06001_032E: 30, B06001_033E: 30, B06001_034E: 30, B06001_035E: 30, B06001_036E: 30,
    // foreign born (_056.._060) = 50
    B06001_056E: 10, B06001_057E: 10, B06001_058E: 10, B06001_059E: 10, B06001_060E: 10,
  }));
  assert.equal(p.total, 500);
  const cat = (label) => p.categories.find((c) => c.label === label);
  assert.equal(cat('Born in California').count, 300);
  assert.equal(cat('Born in California').pct, 60);
  assert.equal(cat('Born in another state').count, 150);
  assert.equal(cat('Foreign-born').count, 50);
});

test('deriveEducation covers the 45+ population (B15001, 45-64 + 65+) and computes shares', () => {
  // Male 45-64 block (start _027): total 100, bachelor's +6 = _033, graduate +7 = _034; other blocks empty.
  const tables = T({ B15001_027E: 100, B15001_035E: 0, B15001_068E: 0, B15001_076E: 0,
    B15001_030E: 30, B15001_033E: 40, B15001_034E: 20 });
  const e = deriveEducation(tables);
  assert.equal(e.total45plus, 100);
  assert.equal(e.pctBachelorsPlus, 60); // (40 bachelor's + 20 graduate) / 100
  assert.equal(e.pctGraduatePlus, 20);  // 20 graduate / 100
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
    B15001_027E: 900, B15001_035E: 2100, B15001_068E: 800, B15001_076E: 1200,
    B25119_002E: 85057, B25119_003E: 66691, B25118_002E: 2490, B25118_014E: 880,
  });
  const block = { snapshot: { totalPopulation: 4994, medianAge: 74.3, ownerOccupiedPct: 93.6 },
    groups: { age: { variables: { P12_003N: { value: 10 }, P12_017N: { value: 10 }, P12_041N: { value: 30 } } },
      hispanic: { variables: {} }, race: { variables: {} } } };
  const r = buildReportSection(tables, block);
  assert.equal(r.summary.population, 4994);
  assert.equal(r.summary.pct55Plus, 80); // 40 of 50 in the age bands are 55+ (P12_003N is under-55)
  assert.equal(r.summary.medianHouseholdIncome, 78534);
  // Assert the sources that must be present rather than a row count, so adding a source
  // doesn't fail this and dropping one silently doesn't pass it.
  const sourceLabels = r.incomeSources.map((s) => s.label);
  for (const expected of ['Social Security', 'Retirement / pension', 'Self-employment', 'SNAP / food stamps']) {
    assert.ok(sourceLabels.includes(expected), `missing income source: ${expected}`);
  }
  assert.equal(r.education.total45plus, 5000); // 900 + 2100 + 800 + 1200
  assert.match(r.vintage, /2020/);
});

test('deriveHomeValue groups B25075 by the verified bracket boundaries', () => {
  const tables = T({ B25075_001E: 100, B25075_002E: 5, B25075_021E: 10, B25075_023E: 60, B25075_024E: 15, B25075_027E: 10 });
  const hv = deriveHomeValue(tables);
  const band = (label) => hv.distribution.find((d) => d.label === label).count;
  assert.equal(band('< $300k'), 5);      // _002 only
  assert.equal(band('$300-500k'), 10);   // _021 ($300k-399,999)
  assert.equal(band('$500-750k'), 60);   // _023 ($500k-749,999)
  assert.equal(band('$750k-1M'), 15);    // _024
  assert.equal(band('$1M +'), 10);       // _027 ($2M+)
});

test('deriveRace maps P3 race codes and P4 Hispanic origin from the block section', () => {
  const block = { groups: {
    race: { variables: { P3_001N: { value: 1000 }, P3_002N: { value: 950 }, P3_003N: { value: 12 }, P3_005N: { value: 20 } } },
    hispanic: { variables: { P4_001N: { value: 1000 }, P4_003N: { value: 37 } } },
  } };
  const r = deriveRace(block);
  assert.equal(r.total, 1000);
  const white = r.groups.find((g) => g.label === 'White');
  assert.equal(white.count, 950);
  assert.equal(white.pct, 95);
  assert.equal(r.groups.find((g) => g.label === 'Black').count, 12);
  assert.equal(r.groups.find((g) => g.label === 'Asian').count, 20);
  assert.equal(r.hispanicPct, 3.7);
});

test('derivePlaceOfBirth breaks out Census regions of origin', () => {
  const tables = T({ B05002_001E: 100, B05002_003E: 45, B05002_005E: 13, B05002_006E: 15, B05002_007E: 6, B05002_008E: 8, B05002_013E: 12 });
  const p = derivePlaceOfBirth(tables);
  assert.equal(p.regions.length, 6);
  assert.equal(p.regions.find((r) => r.label === 'California').pct, 45);
  assert.equal(p.regions.find((r) => r.label === 'Midwest').pct, 15);
  assert.equal(p.regions.find((r) => r.label === 'Foreign-born').pct, 12);
});
