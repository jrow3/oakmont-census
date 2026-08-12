# Oakmont Community Report (2020) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reliable, Census-only "Community Report · 2020" page on census.jrow3.com, modeled on Jim Ouimette's 2010 report, with hybrid geography (exact-block Decennial counts + tract ACS estimates).

**Architecture:** A pure `scripts/report-payload.mjs` derives a compact `report2020` object from (a) the 2020 ACS mirror's already-aggregated table map and (b) the existing `oakmont2020` Decennial block section. `fetch-census.mjs` bakes `report2020` into the small `site/data.json`; `sample-data.mjs` supplies a synthetic version for keyless preview. A new `site/report.html` + `site/js/report.js` renders it with a few chart primitives added to `charts.js`.

**Tech Stack:** Node 24 (`node:test`, native fetch), static HTML/CSS/ES-modules, existing Sonoma-Warm design system.

**Testing:** `node --test` from repo root; single file `node --test <path>`. The derivation layer is pure and TDD'd; DOM/render code ships complete with a browser smoke.

**Spec:** `docs/superpowers/specs/2026-08-12-oakmont-community-report-design.md`. **Reference data (verified live):** median HH income $78,534; per-capita $66,078; SS 80.3%/$23,479 mean; retirement 56.9%/$43,466; SSI 2.2%/$8,073; public-assistance 0.6%/mean suppressed(null); earnings 36.8%/$106,287; owners $85,057 vs renters $66,691; median home value $707,911; education 25+ total 5,673, bachelor+ 3,363; owner units 2,490 / renter 880 (B25118).

---

## Key data facts (baked into the code below)

- Read ACS values from a **mirror-style table map**: `tables[tableId].variables[code].value`, where `tableId = code.split('_')[0]`. The 2020 mirror already sums counts and population-weights medians/means (via `aggregate.mjs`), so no re-aggregation is needed here.
- Income-source **means** = aggregate ÷ households-with-source. Aggregate codes: earnings `B19061_001E`, Social Security `B19065_001E`, SSI `B19066_001E`, public assistance `B19067_001E` (**suppressed → null → render "not disclosed"**), retirement `B19069_001E`. Self-employment and SNAP have no mean (agg not used) → null.
- **Average household size** is computed from the `B25009` size distribution (7+ weighted as 7.5), NOT `B25010` (the mirror rounds means to integers).
- Age/sex, race, owner/renter counts, total population come from the **block section** (`oakmont2020.groups` / `.snapshot`), not ACS.

---

# Phase 1 — Data layer

## Task 1: Report derivation helpers (sources, household size, age/sex)

**Files:**
- Create: `scripts/report-payload.mjs`
- Test: `scripts/report-payload.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIncomeSources, deriveHouseholdSize, deriveAgeSex } from './report-payload.mjs';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/report-payload.test.mjs`
Expected: FAIL — `Cannot find module './report-payload.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// Derive the compact `report2020` payload from the 2020 ACS mirror table map and the
// Decennial block section. Pure functions; the mirror already aggregated its values.

export const av = (tables, code) => tables?.[code.split('_')[0]]?.variables?.[code]?.value ?? null;
const bv = (section, gid, code) => section?.groups?.[gid]?.variables?.[code]?.value ?? null;
export const pctOf = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);
const meanOf = (agg, cnt) => (agg != null && cnt ? Math.round(agg / cnt) : null);
const sum = (tables, codes) => codes.reduce((a, c) => a + (av(tables, c) || 0), 0);

const INCOME_SOURCES = [
  { label: 'Social Security', cnt: 'B19055_002E', uni: 'B19055_001E', agg: 'B19065_001E' },
  { label: 'Retirement / pension', cnt: 'B19059_002E', uni: 'B19059_001E', agg: 'B19069_001E' },
  { label: 'Earnings (work)', cnt: 'B19051_002E', uni: 'B19051_001E', agg: 'B19061_001E' },
  { label: 'Self-employment', cnt: 'B19053_002E', uni: 'B19053_001E', agg: null },
  { label: 'Supplemental Security Income (SSI)', cnt: 'B19056_002E', uni: 'B19056_001E', agg: 'B19066_001E' },
  { label: 'Cash public assistance', cnt: 'B19057_002E', uni: 'B19057_001E', agg: 'B19067_001E' },
  { label: 'SNAP / food stamps', cnt: 'B22001_002E', uni: 'B22001_001E', agg: null },
];

export function deriveIncomeSources(tables) {
  return INCOME_SOURCES.map((s) => ({
    label: s.label,
    withCount: av(tables, s.cnt),
    pctHouseholds: pctOf(av(tables, s.cnt), av(tables, s.uni)),
    meanAmount: s.agg ? meanOf(av(tables, s.agg), av(tables, s.cnt)) : null,
  }));
}

const HH_SIZES = [
  { size: 1, w: 1, codes: ['B25009_003E', 'B25009_011E'] },
  { size: 2, w: 2, codes: ['B25009_004E', 'B25009_012E'] },
  { size: 3, w: 3, codes: ['B25009_005E', 'B25009_013E'] },
  { size: 4, w: 4, codes: ['B25009_006E', 'B25009_014E'] },
  { size: 5, w: 5, codes: ['B25009_007E', 'B25009_015E'] },
  { size: 6, w: 6, codes: ['B25009_008E', 'B25009_016E'] },
  { size: '7+', w: 7.5, codes: ['B25009_009E', 'B25009_017E'] },
];

export function deriveHouseholdSize(tables) {
  const rows = HH_SIZES.map((s) => ({ size: s.size, w: s.w, count: sum(tables, s.codes) }));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const weighted = rows.reduce((a, r) => a + r.w * r.count, 0);
  return {
    total,
    average: total ? Number((weighted / total).toFixed(2)) : null,
    distribution: rows.map((r) => ({ size: String(r.size), count: r.count, pct: pctOf(r.count, total) })),
  };
}

// P12 (block) sex-by-age codes grouped into 55+ reporting bands, plus an Under-55 rollup.
const AGE_SEX_BANDS = [
  { band: 'Under 55', m: ['P12_003N','P12_004N','P12_005N','P12_006N','P12_007N','P12_008N','P12_009N','P12_010N','P12_011N','P12_012N','P12_013N','P12_014N','P12_015N','P12_016N'],
                      f: ['P12_027N','P12_028N','P12_029N','P12_030N','P12_031N','P12_032N','P12_033N','P12_034N','P12_035N','P12_036N','P12_037N','P12_038N','P12_039N','P12_040N'] },
  { band: '55-59', m: ['P12_017N'], f: ['P12_041N'] },
  { band: '60-64', m: ['P12_018N','P12_019N'], f: ['P12_042N','P12_043N'] },
  { band: '65-69', m: ['P12_020N','P12_021N'], f: ['P12_044N','P12_045N'] },
  { band: '70-74', m: ['P12_022N'], f: ['P12_046N'] },
  { band: '75-79', m: ['P12_023N'], f: ['P12_047N'] },
  { band: '80-84', m: ['P12_024N'], f: ['P12_048N'] },
  { band: '85+', m: ['P12_025N'], f: ['P12_049N'] },
];

export function deriveAgeSex(blockSection) {
  const s = (codes) => codes.reduce((a, c) => a + (bv(blockSection, 'age', c) || 0), 0);
  return AGE_SEX_BANDS.map((b) => {
    const male = s(b.m), female = s(b.f);
    return { band: b.band, male, female, total: male + female };
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/report-payload.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/report-payload.mjs scripts/report-payload.test.mjs
git commit -m "Add report derivation helpers: income sources, household size, age/sex"
```

## Task 2: Remaining derivations + buildReportSection

**Files:**
- Modify: `scripts/report-payload.mjs`
- Modify: `scripts/report-payload.test.mjs`

- [ ] **Step 1: Append the failing tests**

```js
import { buildReportSection, deriveEducation, deriveIncomeByTenure, deriveMarital } from './report-payload.mjs';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/report-payload.test.mjs`
Expected: FAIL — `deriveEducation` / `buildReportSection` not exported.

- [ ] **Step 3: Append the implementation**

```js
const BACHELORS_PLUS = ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'];
const GRADUATE_PLUS = ['B15003_023E', 'B15003_024E', 'B15003_025E'];
const EDU_BANDS = [
  { label: 'High school diploma or less', codes: ['B15003_002E','B15003_003E','B15003_004E','B15003_005E','B15003_006E','B15003_007E','B15003_008E','B15003_009E','B15003_010E','B15003_011E','B15003_012E','B15003_013E','B15003_014E','B15003_015E','B15003_016E','B15003_017E','B15003_018E'] },
  { label: 'Some college / associate', codes: ['B15003_019E','B15003_020E','B15003_021E'] },
  { label: "Bachelor's degree", codes: ['B15003_022E'] },
  { label: "Master's degree", codes: ['B15003_023E'] },
  { label: 'Professional degree', codes: ['B15003_024E'] },
  { label: 'Doctorate', codes: ['B15003_025E'] },
];

export function deriveEducation(tables) {
  const total = av(tables, 'B15003_001E');
  return {
    total25plus: total,
    pctBachelorsPlus: pctOf(sum(tables, BACHELORS_PLUS), total),
    pctGraduatePlus: pctOf(sum(tables, GRADUATE_PLUS), total),
    bands: EDU_BANDS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })),
  };
}

// B25118: owner brackets _003.._013, renter _015.._025 (same 11 income bands each).
const TENURE_INCOME_BANDS = [
  '< $10k','$10-15k','$15-20k','$20-25k','$25-35k','$35-50k','$50-75k','$75-100k','$100-150k','$150-200k','$200k +',
];
const ownerCode = (i) => `B25118_${String(3 + i).padStart(3, '0')}E`;
const renterCode = (i) => `B25118_${String(15 + i).padStart(3, '0')}E`;

export function deriveIncomeByTenure(tables) {
  return {
    ownerMedian: av(tables, 'B25119_002E'),
    renterMedian: av(tables, 'B25119_003E'),
    ownerHouseholds: av(tables, 'B25118_002E'),
    renterHouseholds: av(tables, 'B25118_014E'),
    distribution: TENURE_INCOME_BANDS.map((label, i) => ({
      label, owner: av(tables, ownerCode(i)) || 0, renter: av(tables, renterCode(i)) || 0,
    })),
  };
}

const INCOME_BRACKETS = [
  { label: '< $10k', codes: ['B19001_002E'] }, { label: '$10-15k', codes: ['B19001_003E'] },
  { label: '$15-25k', codes: ['B19001_004E','B19001_005E'] }, { label: '$25-35k', codes: ['B19001_006E','B19001_007E'] },
  { label: '$35-50k', codes: ['B19001_008E','B19001_009E','B19001_010E'] }, { label: '$50-75k', codes: ['B19001_011E','B19001_012E'] },
  { label: '$75-100k', codes: ['B19001_013E'] }, { label: '$100-150k', codes: ['B19001_014E','B19001_015E'] },
  { label: '$150-200k', codes: ['B19001_016E'] }, { label: '$200k +', codes: ['B19001_017E'] },
];

export function deriveIncome(tables) {
  const total = av(tables, 'B19001_001E');
  return {
    median: av(tables, 'B19013_001E'),
    perCapita: av(tables, 'B19301_001E'),
    familyMedian: av(tables, 'B19126_001E'),
    nonfamilyMedian: av(tables, 'B19215_001E'),
    distribution: INCOME_BRACKETS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })),
  };
}

const VALUE_BANDS = [
  { label: '< $300k', codes: ['B25075_002E','B25075_003E','B25075_004E','B25075_005E','B25075_006E','B25075_007E','B25075_008E','B25075_009E','B25075_010E','B25075_011E','B25075_012E','B25075_013E','B25075_014E'] },
  { label: '$300-500k', codes: ['B25075_015E','B25075_016E','B25075_017E','B25075_018E'] },
  { label: '$500-750k', codes: ['B25075_019E','B25075_020E'] },
  { label: '$750k-1M', codes: ['B25075_021E'] },
  { label: '$1M +', codes: ['B25075_022E','B25075_023E','B25075_024E','B25075_025E'] },
];

export function deriveHomeValue(tables) {
  const total = av(tables, 'B25075_001E');
  return { median: av(tables, 'B25077_001E'), distribution: VALUE_BANDS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })) };
}

// Race & Hispanic origin from the Decennial block section (exact-Oakmont counts).
const RACE_GROUPS = [
  { label: 'White', code: 'P3_002N' }, { label: 'Black', code: 'P3_003N' },
  { label: 'American Indian / Alaska Native', code: 'P3_004N' }, { label: 'Asian', code: 'P3_005N' },
  { label: 'Native Hawaiian / Pacific Islander', code: 'P3_006N' }, { label: 'Some other race', code: 'P3_007N' },
  { label: 'Two or more races', code: 'P3_008N' },
];

export function deriveRace(blockSection) {
  const total = bv(blockSection, 'race', 'P3_001N');
  const hispanic = bv(blockSection, 'hispanic', 'P4_003N');
  const hispanicTotal = bv(blockSection, 'hispanic', 'P4_001N');
  return {
    total,
    groups: RACE_GROUPS.map((g) => ({ label: g.label, count: bv(blockSection, 'race', g.code), pct: pctOf(bv(blockSection, 'race', g.code), total) })),
    hispanicPct: pctOf(hispanic, hispanicTotal),
  };
}

export function deriveMarital(tables) {
  const total = av(tables, 'B12001_001E');
  // "Now married" is the parent total per sex (_004 male, _013 female); its _005/_006 children must
  // NOT be added or married is double-counted. Never/widowed/divorced: male _003/_009/_010, female _012/_018/_019.
  const nowMarried = sum(tables, ['B12001_004E', 'B12001_013E']);
  const widowed = sum(tables, ['B12001_009E', 'B12001_018E']);
  const divorced = sum(tables, ['B12001_010E', 'B12001_019E']);
  const never = sum(tables, ['B12001_003E', 'B12001_012E']);
  return { total, pctMarried: pctOf(nowMarried, total), pctWidowed: pctOf(widowed, total), pctDivorced: pctOf(divorced, total), pctNever: pctOf(never, total) };
}

export function derivePlaceOfBirth(tables) {
  const total = av(tables, 'B05002_001E');
  const bornInState = av(tables, 'B05002_003E');
  const bornOtherState = av(tables, 'B05002_004E');
  const foreign = av(tables, 'B05002_013E');
  return { total, pctBornInCalifornia: pctOf(bornInState, total), pctBornOtherState: pctOf(bornOtherState, total), pctForeignBorn: pctOf(foreign, total) };
}

function deriveSummary(tables, block, householdSize) {
  return {
    population: block?.snapshot?.totalPopulation ?? null,
    medianAge: block?.snapshot?.medianAge ?? null,
    pct65Plus: block?.snapshot?.pct65Plus ?? null,
    ownerOccupiedPct: block?.snapshot?.ownerOccupiedPct ?? null,
    averageHouseholdSize: householdSize.average,
    medianHouseholdIncome: av(tables, 'B19013_001E'),
    perCapitaIncome: av(tables, 'B19301_001E'),
  };
}

export function buildReportSection(acsTables, blockSection) {
  const householdSize = deriveHouseholdSize(acsTables);
  return {
    vintage: '2020 ACS 5-Year (2016–2020) + 2020 Decennial Census',
    geography: {
      counts: '76 selected Oakmont census blocks (2020 Decennial)',
      estimates: 'Census Tracts 1516.01 + 1516.02 (2020 ACS 5-Year)',
      note: 'Counts are exact to Oakmont; ACS estimates are tract-level and include the non-Oakmont fringe within the two tracts.',
    },
    summary: deriveSummary(acsTables, blockSection, householdSize),
    ageSex: deriveAgeSex(blockSection),
    householdSize,
    income: deriveIncome(acsTables),
    incomeSources: deriveIncomeSources(acsTables),
    incomeByTenure: deriveIncomeByTenure(acsTables),
    homeValue: deriveHomeValue(acsTables),
    education: deriveEducation(acsTables),
    race: deriveRace(blockSection),
    marital: deriveMarital(acsTables),
    placeOfBirth: derivePlaceOfBirth(acsTables),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/report-payload.test.mjs`
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add scripts/report-payload.mjs scripts/report-payload.test.mjs
git commit -m "Add remaining report derivations and buildReportSection"
```

## Task 3: Bake report2020 into the real build

**Files:**
- Modify: `scripts/fetch-census.mjs`
- Modify: `scripts/build-payload.mjs`

- [ ] **Step 1: Let assembleData accept a report section**

In `scripts/build-payload.mjs`, change `assembleData` to carry `report2020`:

```js
export function assembleData(sections, { sample = false, oakmont2020 = null, report2020 = null } = {}) {
  const data = {
    meta: {
      geography: 'Census Tracts 1516.01 + 1516.02, Sonoma County, CA',
      generatedAt: new Date().toISOString(),
      sample,
    },
    acs2020: sections['2020'],
    acs2024: sections['2024'],
  };
  if (oakmont2020) data.oakmont2020 = oakmont2020;
  if (report2020) data.report2020 = report2020;
  return data;
}
```

- [ ] **Step 2: Build the 2020 mirror early and derive report2020 in `fetch-census.mjs`**

Add the import near the others:

```js
import { buildReportSection } from './report-payload.mjs';
```

In `main()`, replace the block that currently builds `oakmont2020`, assembles data, writes it, and then builds the mirrors, with this order (build the ACS 2020 mirror before assembling data so the report can use it; keep writing the mirror files afterward):

```js
  console.log('Fetching 2020 DHC for the Oakmont blocks');
  const blockValues = await fetchBlockValues();
  const oakmont2020 = buildBlockSection(blockValues);
  console.log(`  Oakmont blocks: population ${oakmont2020.snapshot.totalPopulation}, ${oakmont2020.snapshot.pct65Plus}% age 65+`);

  await mkdir(EXPLORER_DIR, { recursive: true });
  const mirrors = {};
  for (const year of ACS_YEARS) {
    console.log(`Building ACS ${year} full mirror`);
    mirrors[year] = await fetchAcsMirror(year);
  }
  console.log('Building block DHC full mirror');
  const blockMirror = await fetchBlockMirror();

  const report2020 = buildReportSection(mirrors['2020'].tables, oakmont2020);
  console.log(`  Report: median HH income $${report2020.summary.medianHouseholdIncome}, avg household size ${report2020.summary.averageHouseholdSize}`);

  const data = assembleData(sections, { oakmont2020, report2020 });
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH}`);

  for (const year of ACS_YEARS) {
    await writeFile(join(EXPLORER_DIR, `acs${year}.json`), JSON.stringify(mirrors[year]) + '\n', 'utf8');
  }
  await writeFile(join(EXPLORER_DIR, 'blocks2020.json'), JSON.stringify(blockMirror) + '\n', 'utf8');
  console.log(`Wrote mirror files to ${EXPLORER_DIR}`);
```

(Delete the old `oakmont2020`/`assembleData`/`writeFile(OUT_PATH)`/mirror-writing block this replaces, so each runs once.)

- [ ] **Step 3: Verify syntax**

Run: `node --check scripts/fetch-census.mjs && node --check scripts/build-payload.mjs`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-census.mjs scripts/build-payload.mjs
git commit -m "Bake report2020 into data.json from the 2020 mirror"
```

## Task 4: Sample report data for keyless preview

**Files:**
- Modify: `scripts/sample-data.mjs`

- [ ] **Step 1: Build a synthetic report table map and section**

Add near the other imports:

```js
import { buildReportSection } from './report-payload.mjs';
```

After `oakmont2020` is built (the sample block section) and before `assembleData`, add a realistic sample ACS table map and derive the sample report. Use figures close to the live 2020 tract data:

```js
function tbl(obj) {
  const tables = {};
  for (const [code, value] of Object.entries(obj)) {
    const id = code.split('_')[0];
    (tables[id] ||= { concept: id, variables: {} }).variables[code] = { label: code, value };
  }
  return tables;
}

const sampleReportTables = tbl({
  B19013_001E: 78534, B19301_001E: 66078, B19126_001E: 114385, B19215_001E: 58853,
  B19001_001E: 3370, B19001_013E: 470, B19001_014E: 360, B19001_015E: 300, B19001_016E: 300, B19001_017E: 260,
  B25077_001E: 707911, B25075_001E: 2490, B25075_019E: 700, B25075_020E: 600, B25075_021E: 500, B25075_022E: 400,
  B15003_001E: 5673, B15003_017E: 900, B15003_021E: 400, B15003_022E: 2000, B15003_023E: 900, B15003_024E: 300, B15003_025E: 163,
  B25119_002E: 85057, B25119_003E: 66691,
  B25118_002E: 2490, B25118_014E: 880, B25118_009E: 700, B25118_010E: 500, B25118_021E: 300, B25118_022E: 120,
  B25009_003E: 900, B25009_011E: 300, B25009_004E: 1200, B25009_012E: 150, B25009_005E: 150, B25009_013E: 30,
  B25009_006E: 70, B25009_014E: 12, B25009_007E: 25, B25009_015E: 5, B25009_008E: 10, B25009_016E: 2, B25009_009E: 5, B25009_017E: 1,
  B19055_001E: 3370, B19055_002E: 2706, B19065_001E: 2706 * 23479,
  B19059_001E: 3370, B19059_002E: 1918, B19069_001E: 1918 * 43466,
  B19051_001E: 3370, B19051_002E: 1240, B19061_001E: 1240 * 106287,
  B19053_001E: 3370, B19053_002E: 300,
  B19056_001E: 3370, B19056_002E: 74, B19066_001E: 74 * 8073,
  B19057_001E: 3370, B19057_002E: 20, B19067_001E: null,
  B22001_001E: 3370, B22001_002E: 30,
  B12001_001E: 5829, B12001_003E: 200, B12001_004E: 1650, B12001_009E: 120, B12001_010E: 300,
  B12001_012E: 260, B12001_013E: 1500, B12001_018E: 620, B12001_019E: 350,
  B05002_001E: 5949, B05002_003E: 2200, B05002_004E: 3100, B05002_013E: 649,
});
const report2020 = buildReportSection(sampleReportTables, oakmont2020);
```

Then pass it through the existing `assembleData` call:

```js
const data = assembleData(
  { '2020': buildAcsSection('2020', values2020), '2024': buildAcsSection('2024', values2024) },
  { sample: true, oakmont2020, report2020 }
);
```

- [ ] **Step 2: Regenerate and verify the report section**

Run: `node scripts/sample-data.mjs && node -e "const d=require('./site/data.json'); const r=d.report2020; console.log('pop', r.summary.population, '| medHHinc', r.summary.medianHouseholdIncome, '| avgHHsize', r.summary.averageHouseholdSize, '| SS%', r.incomeSources[0].pctHouseholds, '| edu25+', r.education.total25plus, '| ownerMed', r.incomeByTenure.ownerMedian)"`
Expected: `pop 4994 | medHHinc 78534 | avgHHsize <~1.5> | SS% 80.3 | edu25+ 5673 | ownerMed 85057`

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-data.mjs
git commit -m "Sample data: synthetic report2020 for keyless preview"
```

---

# Phase 2 — Report page

## Task 5: Chart primitives (paired + grouped bars)

**Files:**
- Modify: `site/js/charts.js`
- Test: `site/js/charts.test.mjs`

- [ ] **Step 1: Write the failing test** (pure geometry helper only)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barWidths } from './charts.js';

test('barWidths scales values to a max width against the series max', () => {
  assert.deepEqual(barWidths([50, 100, 0], 200), [100, 200, 0]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test site/js/charts.test.mjs`
Expected: FAIL — `barWidths` is not exported.

- [ ] **Step 3: Add the exported helper and the two chart renderers**

Add to `site/js/charts.js` (export `barWidths`; the SVG renderers reuse the file's existing `W`, `escapeHtml`, `fmt`):

```js
// Scale a series of values to [0, maxW] against the series maximum. Exported for tests.
export function barWidths(values, maxW) {
  const max = Math.max(1, ...values.map((v) => v || 0));
  return values.map((v) => Math.round(((v || 0) / max) * maxW));
}

// Paired horizontal bars: left (male) grows leftward from center, right (female) rightward.
// items: [{ label, left, right }].
export function pairedBars({ items, leftColor = 'var(--teal)', rightColor = 'var(--terracotta)', format = fmt, ariaLabel = 'Paired bars' }) {
  const ROWH = 26, PADY = 8, LABELW = 64, CENTERGAP = 8;
  const half = (W - LABELW - CENTERGAP) / 2;
  const H = PADY * 2 + items.length * ROWH;
  const lw = barWidths(items.map((d) => d.left), half);
  const rw = barWidths(items.map((d) => d.right), half);
  const centerX = LABELW + half;
  const rows = items.map((d, i) => {
    const y = PADY + i * ROWH, by = y + 4, bh = ROWH - 12, mid = y + ROWH / 2 + 4;
    return `<g class="bar-group" data-tip="${escapeHtml(`<b>${escapeHtml(d.label)}</b><br>Male ${format(d.left)} · Female ${format(d.right)}`)}">
      <rect x="0" y="${y}" width="${W}" height="${ROWH}" fill="transparent" />
      <rect class="bar-fill" x="${centerX - lw[i]}" y="${by}" width="${lw[i]}" height="${bh}" rx="3" fill="${leftColor}" />
      <rect class="bar-fill" x="${centerX + CENTERGAP}" y="${by}" width="${rw[i]}" height="${bh}" rx="3" fill="${rightColor}" />
      <text class="bar-label" x="${LABELW - 8}" y="${mid}" text-anchor="end" font-size="12">${escapeHtml(d.label)}</text>
    </g>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${rows}</svg>`;
}

// Grouped horizontal bars: two series (a, b) per row. items: [{ label, a, b }].
export function groupedBars({ items, aColor = 'var(--terracotta)', bColor = 'var(--teal)', format = fmt, ariaLabel = 'Grouped bars' }) {
  const ROWH = 34, PADY = 8, LABELW = 150, VALUEW = 8;
  const areaW = W - LABELW - VALUEW;
  const H = PADY * 2 + items.length * ROWH;
  const aw = barWidths(items.map((d) => d.a), areaW);
  const bw = barWidths(items.map((d) => d.b), areaW);
  const rows = items.map((d, i) => {
    const y = PADY + i * ROWH, bh = 9;
    return `<g class="bar-group" data-tip="${escapeHtml(`<b>${escapeHtml(d.label)}</b><br>${format(d.a)} · ${format(d.b)}`)}">
      <rect x="0" y="${y}" width="${W}" height="${ROWH}" fill="transparent" />
      <text class="bar-label" x="${LABELW - 10}" y="${y + 13}" text-anchor="end" font-size="12">${escapeHtml(d.label)}</text>
      <rect class="bar-fill" x="${LABELW}" y="${y + 4}" width="${aw[i]}" height="${bh}" rx="3" fill="${aColor}" />
      <rect class="bar-fill" x="${LABELW}" y="${y + 4 + bh + 2}" width="${bw[i]}" height="${bh}" rx="3" fill="${bColor}" />
    </g>`;
  }).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}">${rows}</svg>`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test site/js/charts.test.mjs`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add site/js/charts.js site/js/charts.test.mjs
git commit -m "Add paired-bar and grouped-bar chart primitives"
```

## Task 6: report.html + nav links

**Files:**
- Create: `site/report.html`
- Modify: `site/index.html`, `site/changes.html`

- [ ] **Step 1: Create `site/report.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Oakmont Village — Community Report (2020)</title>
  <meta name="description" content="A reliable 2020 demographic report for Oakmont Village, Sonoma County, California, built only from U.S. Census Bureau data." />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍇</text></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,900;1,9..144,400&family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div id="sample-banner" class="sample-banner" hidden>
    <strong>Sample data.</strong> These are placeholder figures for preview. Run the fetch script with a Census API key for the real numbers.
  </div>

  <header class="masthead">
    <div class="masthead-inner">
      <p class="kicker">Oakmont Village · Sonoma County, California</p>
      <h1>Community <em>Report</em></h1>
      <p class="lead">A demographic snapshot of our 55+ community, drawn only from U.S. Census Bureau data — the 2020 Decennial Census for exact counts and the 2020 American Community Survey for income, education, and housing.</p>
      <div class="masthead-meta">
        <span class="badge">2020 Census &amp; ACS</span>
        <span class="meta-dot">·</span>
        <span id="report-geo">Oakmont blocks + Tracts 1516.01/1516.02</span>
      </div>
      <nav class="year-nav" aria-label="Pages">
        <a href="./index.html" class="year-link">2020 Portrait</a>
        <a href="./changes.html" class="year-link">2024 Update</a>
        <a href="./report.html" class="year-link active" aria-current="page">Community Report</a>
      </nav>
    </div>
  </header>

  <main id="report" class="report"></main>

  <footer class="site-footer">
    <p id="footer-source">Source: U.S. Census Bureau — 2020 Decennial Census (DHC) and 2020 ACS 5-Year Estimates.</p>
    <p class="footer-fine" id="footer-generated"></p>
  </footer>

  <div id="tooltip" class="tooltip" role="status" aria-live="off" hidden></div>

  <script type="module">
    import { renderReport, showReportError } from './js/report.js';
    renderReport().catch(showReportError);
  </script>
</body>
</html>
```

- [ ] **Step 2: Add the "Community Report" link to the other two pages' `year-nav`**

In `site/index.html`, replace the `year-nav` block with:

```html
      <nav class="year-nav" aria-label="Data year">
        <a href="./index.html" class="year-link active" aria-current="page">2020 Portrait</a>
        <a href="./changes.html" class="year-link">2024 Update</a>
        <a href="./report.html" class="year-link">Community Report</a>
      </nav>
```

In `site/changes.html`, replace its `year-nav` block with:

```html
      <nav class="year-nav" aria-label="Data year">
        <a href="./index.html" class="year-link">← 2020 Portrait</a>
        <a href="./changes.html" class="year-link active" aria-current="page">2024 Update</a>
        <a href="./report.html" class="year-link">Community Report</a>
      </nav>
```

- [ ] **Step 3: Commit**

```bash
git add site/report.html site/index.html site/changes.html
git commit -m "Add report.html shell and cross-page nav links"
```

## Task 7: report.js renderer

**Files:**
- Create: `site/js/report.js`

- [ ] **Step 1: Write the renderer**

```js
// Renders the Community Report from data.report2020. Sourced, honest, modeled on Jim's 2010 report.
import { fmt, currency, pct, escapeHtml } from './format.js';
import { horizontalBars, stackedBar, pairedBars, groupedBars, wireTooltips } from './charts.js';

const num = (n) => (n == null ? '—' : fmt(n));
const money = (n) => (n == null ? '—' : currency(n));
const percent = (n) => (n == null ? '—' : pct(n));

const kpi = (label, value, sub, source) =>
  `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div><div class="kpi-src">${source}</div></div>`;

function section(id, kicker, title, source, bodyHtml) {
  return `<section class="report-section reveal" id="${id}">
    <div class="report-head"><p class="chart-kicker">${kicker}</p><h2>${title}</h2><p class="report-source">${source}</p></div>
    ${bodyHtml}
  </section>`;
}

export async function renderReport() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const r = data.report2020;
  if (!r) throw new Error('No report data in data.json');
  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  if (data.meta?.generatedAt) document.getElementById('footer-generated').textContent = `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;

  const root = document.getElementById('report');
  root.innerHTML = [
    summarySection(r),
    ageSexSection(r),
    householdSection(r),
    incomeSection(r),
    incomeSourcesSection(r),
    tenureIncomeSection(r),
    homeValueSection(r),
    educationSection(r),
    raceSection(r),
    maritalSection(r),
    placeOfBirthSection(r),
    methodologySection(r),
  ].join('');
  wireTooltips(root);
}

function summarySection(r) {
  const s = r.summary;
  const tiles = [
    kpi('Population', num(s.population), 'Residents', 'Decennial · exact blocks'),
    kpi('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years', 'Decennial · exact blocks'),
    kpi('Age 65+', percent(s.pct65Plus), 'Of residents', 'Decennial · exact blocks'),
    kpi('Avg. household size', s.averageHouseholdSize != null ? String(s.averageHouseholdSize) : '—', 'People per home', 'ACS · tracts'),
    kpi('Owner-occupied', percent(s.ownerOccupiedPct), 'Of occupied homes', 'Decennial · exact blocks'),
    kpi('Median household income', money(s.medianHouseholdIncome), 'Per year', 'ACS · tracts'),
    kpi('Per-capita income', money(s.perCapitaIncome), 'Per year', 'ACS · tracts'),
  ].join('');
  return section('summary', 'Who are we?', 'A 55+ community, in numbers',
    'Counts from the 2020 Decennial Census (exact Oakmont blocks); dollar figures from the 2020 ACS (tracts).',
    `<div class="kpi-grid">${tiles}</div>
     <p class="report-note">Oakmont is an active-adult 55+ community. Fewer than a handful of residents are under 55; the age bands below begin at 55.</p>`);
}

function ageSexSection(r) {
  const rows = r.ageSex.filter((b) => b.band !== 'Under 55');
  const under55 = r.ageSex.find((b) => b.band === 'Under 55');
  const items = rows.map((b) => ({ label: b.band, left: b.male, right: b.female }));
  const totalM = rows.reduce((a, b) => a + b.male, 0), totalF = rows.reduce((a, b) => a + b.female, 0);
  const tableRows = rows.map((b) => `<tr><td>${b.band}</td><td class="num">${num(b.male)}</td><td class="num">${num(b.female)}</td><td class="num">${num(b.total)}</td></tr>`).join('');
  return section('age', 'Age & gender', 'Older, and mostly women',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks).',
    `<div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Male</span><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Female</span></div>
     ${pairedBars({ items, ariaLabel: 'Population by age band and sex' })}
     <div class="table-wrap"><table><thead><tr><th>Age</th><th class="num">Male</th><th class="num">Female</th><th class="num">Total</th></tr></thead>
       <tbody>${tableRows}<tr class="total-row"><td>55+ total</td><td class="num">${num(totalM)}</td><td class="num">${num(totalF)}</td><td class="num">${num(totalM + totalF)}</td></tr></tbody></table></div>
     <p class="chart-caption">Women outnumber men roughly <strong>2:1</strong>, and the gap widens with age. Under-55 residents (about ${num(under55 ? under55.total : 0)}) are shown for completeness only.</p>`);
}

function householdSection(r) {
  const items = r.householdSize.distribution.map((d) => ({ label: `${d.size}-person`, value: d.count }));
  return section('households', 'Households', 'Most of us live alone or as a couple',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Household size from table B25009.',
    `${horizontalBars({ items, ariaLabel: 'Households by size', format: fmt })}
     <p class="chart-caption">Oakmont averages <strong>${r.householdSize.average ?? '—'}</strong> people per household — one- and two-person homes dominate, consistent with a retirement community.</p>`);
}

function incomeSection(r) {
  const i = r.income;
  const items = i.distribution.map((d) => ({ label: d.label, value: d.count }));
  return section('income', 'Income', 'Solidly middle class',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(i.median)}</div><div class="stat-label">Median household income</div></div>
       <div class="stat"><div class="stat-value">${money(i.perCapita)}</div><div class="stat-label">Per-capita income</div></div>
       <div class="stat"><div class="stat-value">${money(i.familyMedian)}</div><div class="stat-label">Median family income</div></div>
       <div class="stat"><div class="stat-value">${money(i.nonfamilyMedian)}</div><div class="stat-label">Median non-family income</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Households by income bracket', format: fmt })}
     <p class="chart-caption">Family households (typically couples) earn well above people living alone — the same split Jim's 2010 report found.</p>`);
}

function incomeSourcesSection(r) {
  const rows = r.incomeSources.map((s) => {
    const width = s.pctHouseholds != null ? Math.max(1, Math.round(s.pctHouseholds)) : 0;
    const mean = s.meanAmount != null ? money(s.meanAmount) : '<span class="na">not disclosed</span>';
    return `<div class="src-row" data-tip="${escapeHtml(`<b>${escapeHtml(s.label)}</b><br>${percent(s.pctHouseholds)} of households · mean ${s.meanAmount != null ? money(s.meanAmount) : 'suppressed'}`)}">
      <div class="src-label">${escapeHtml(s.label)}</div>
      <div class="src-bar"><i style="width:${width}%"></i></div>
      <div class="src-pct">${percent(s.pctHouseholds)}</div>
      <div class="src-mean">${mean}</div>
    </div>`;
  }).join('');
  return section('sources', 'Sources of income', 'What households live on',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Shares are % of households receiving each source; means are per receiving household.',
    `<div class="src-head"><div class="src-label"></div><div class="src-bar"></div><div class="src-pct">Households</div><div class="src-mean">Mean amount</div></div>
     <div class="src-list">${rows}</div>
     <p class="chart-caption">These are real ACS figures — not the AARP member survey used in the 2020 draft. Because ACS income is tract-level, shares read a little lower than an Oakmont-only count would (the tracts include younger non-Oakmont households).</p>`);
}

function tenureIncomeSection(r) {
  const t = r.incomeByTenure;
  const items = t.distribution.map((d) => ({ label: d.label, a: d.owner, b: d.renter }));
  return section('tenure-income', 'Owners vs. renters', 'Owners earn more',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Tables B25119 (medians) and B25118 (distribution).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(t.ownerMedian)}</div><div class="stat-label">Owner median income (${num(t.ownerHouseholds)} homes)</div></div>
       <div class="stat"><div class="stat-value">${money(t.renterMedian)}</div><div class="stat-label">Renter median income (${num(t.renterHouseholds)} homes)</div></div>
     </div>
     <div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span></div>
     ${groupedBars({ items, ariaLabel: 'Household income by tenure' })}`);
}

function homeValueSection(r) {
  const items = r.homeValue.distribution.map((d) => ({ label: d.label, value: d.count }));
  return section('home-value', 'Home value', 'Where owner-estimated values land',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Owner-reported values (table B25075/B25077).',
    `<p class="report-note">Median owner-estimated home value: <strong>${money(r.homeValue.median)}</strong>.</p>
     ${horizontalBars({ items, ariaLabel: 'Owner-occupied homes by value', format: fmt })}`);
}

function educationSection(r) {
  const e = r.education;
  const items = e.bands.map((b) => ({ label: b.label, value: b.count }));
  return section('education', 'Education', 'A highly educated community',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Population 25 and over (table B15003).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${percent(e.pctBachelorsPlus)}</div><div class="stat-label">Bachelor's degree or higher</div></div>
       <div class="stat"><div class="stat-value">${percent(e.pctGraduatePlus)}</div><div class="stat-label">Graduate or professional degree</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Educational attainment', format: fmt })}
     <p class="chart-caption">Totals are bounded by the ${num(e.total25plus)} residents aged 25+ — unlike the 2020 draft, which reported more degrees than people.</p>`);
}

function raceSection(r) {
  const items = r.race.groups.filter((g) => (g.count || 0) > 0).map((g) => ({ label: g.label, value: g.count }));
  return section('race', 'Race & ethnicity', 'Predominantly white',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks). Race and Hispanic origin are separate questions.',
    `${horizontalBars({ items, ariaLabel: 'Residents by race', format: fmt })}
     <p class="chart-caption"><strong>${percent(r.race.hispanicPct)}</strong> of residents identify as Hispanic or Latino (of any race). Presented as clean Census counts rather than an unreconcilable survey table.</p>`);
}

function maritalSection(r) {
  const m = r.marital;
  const items = [
    { label: 'Now married', value: m.pctMarried }, { label: 'Widowed', value: m.pctWidowed },
    { label: 'Divorced', value: m.pctDivorced }, { label: 'Never married', value: m.pctNever },
  ];
  return section('marital', 'Marital status', 'Married, widowed, or on their own',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Population 15+ (table B12001).',
    `${horizontalBars({ items, ariaLabel: 'Marital status', format: (n) => percent(n) })}
     <p class="chart-caption">A note on precision: in 2020 the federal ACS did not consistently record same-sex married couples as married, which understates marriage among Oakmont's same-sex couples.</p>`);
}

function placeOfBirthSection(r) {
  const p = r.placeOfBirth;
  const items = [
    { label: 'Born in California', value: p.pctBornInCalifornia },
    { label: 'Born in another state', value: p.pctBornOtherState },
    { label: 'Foreign-born', value: p.pctForeignBorn },
  ];
  return section('origin', 'Where residents come from', 'Mostly California and elsewhere in the U.S.',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Place of birth (table B05002).',
    `${horizontalBars({ items, ariaLabel: 'Place of birth', format: (n) => percent(n) })}
     <p class="chart-caption">Place of birth is the Census surrogate for "where did you move from" — the region-of-origin detail in prior reports isn't published in a standard table.</p>`);
}

function methodologySection(r) {
  return section('methodology', 'Methodology & sources', 'How this report was built',
    'U.S. Census Bureau only.',
    `<div class="method-body">
       <p>This report uses <strong>only U.S. Census Bureau data</strong> — no AARP survey, no commercial or address-level data.</p>
       <ul>
         <li><strong>Counts</strong> (population, age, sex, race, owner/renter) come from the <strong>2020 Decennial Census</strong>, summed over ${escapeHtml(r.geography.counts)} — exact to Oakmont's boundary.</li>
         <li><strong>Estimates</strong> (income, income sources, education, home value, tenure, marital status, place of birth) come from the <strong>2020 ACS 5-Year</strong> for ${escapeHtml(r.geography.estimates)}. ${escapeHtml(r.geography.note)}</li>
       </ul>
       <p>ACS estimates carry sampling margins of error; small percentages (SSI, public assistance, SNAP) are approximate, and some aggregate amounts are suppressed by the Census Bureau for privacy and shown as "not disclosed."</p>
       <p class="report-note">Vintage: ${escapeHtml(r.vintage)}.</p>
     </div>`);
}

export function showReportError(err) {
  const root = document.getElementById('report');
  if (root) root.innerHTML = `<p class="explorer-loading">Could not load the report: ${escapeHtml(err.message)}</p>`;
  console.error(err);
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check site/js/report.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add site/js/report.js
git commit -m "Add the Community Report renderer"
```

## Task 8: Report styles

**Files:**
- Modify: `site/styles.css`

- [ ] **Step 1: Append report styles**

```css
/* ── Community Report ── */
.report { max-width: 920px; margin: 0 auto; padding: 2rem 1.25rem 4rem; display: flex; flex-direction: column; gap: 2.5rem; }
.report-section { display: flex; flex-direction: column; gap: 1rem; }
.report-head h2 { margin: .15rem 0 0; font: 600 1.6rem/1.1 'Fraunces', serif; }
.report-source { margin: 0; font: 400 .8rem 'Public Sans', sans-serif; color: var(--ink-soft, #6b625a); }
.report-note { font: 400 .95rem/1.5 'Public Sans', sans-serif; color: var(--ink, #2b2621); }
.kpi-src { margin-top: .35rem; font: 500 .68rem 'Public Sans', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: var(--teal); }
.stat-row { display: flex; flex-wrap: wrap; gap: 1.5rem; }
.stat-value { font: 600 1.5rem 'Fraunces', serif; color: var(--terracotta); }
.stat-label { font: 400 .85rem 'Public Sans', sans-serif; color: var(--ink-soft, #6b625a); }
.total-row td { font-weight: 700; border-top: 2px solid var(--line, #e5ddd3); }
.src-head, .src-row { display: grid; grid-template-columns: 12rem 1fr 4rem 6rem; align-items: center; gap: .75rem; }
.src-head { font: 600 .72rem 'Public Sans', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-soft, #6b625a); }
.src-list { display: flex; flex-direction: column; gap: .5rem; }
.src-label { font: 500 .9rem 'Public Sans', sans-serif; }
.src-bar { background: var(--wash, #faf6f0); border-radius: 999px; height: .7rem; overflow: hidden; }
.src-bar i { display: block; height: 100%; background: var(--terracotta); border-radius: 999px; }
.src-pct { font: 600 .9rem 'Public Sans', sans-serif; text-align: right; font-variant-numeric: tabular-nums; }
.src-mean { font: 400 .85rem 'Public Sans', sans-serif; text-align: right; color: var(--ink-soft, #6b625a); font-variant-numeric: tabular-nums; }
.method-body { display: flex; flex-direction: column; gap: .75rem; font: 400 .95rem/1.55 'Public Sans', sans-serif; }
.method-body ul { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: .4rem; }
@media (max-width: 620px) {
  .src-head, .src-row { grid-template-columns: 1fr 3.2rem 5rem; }
  .src-head .src-label, .src-row .src-bar { display: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/styles.css
git commit -m "Style the Community Report page"
```

---

# Phase 3 — Verify, document, ship

## Task 9: Full build + browser smoke

**Files:** none (verification)

- [ ] **Step 1: Regenerate sample data and run the whole suite**

Run: `node scripts/sample-data.mjs && node --test`
Expected: sample logs; all tests PASS (report-payload, charts, aggregate, mirror, median-age, build-payload, format, income-grid).

- [ ] **Step 2: Serve and open `report.html`** (use the dependency-free Node server from the prior plan's Task 18, or `npx --yes serve site -l 8099`), open `http://localhost:8099/report.html`, and confirm:
- Summary KPI row renders with source tags (Decennial vs ACS).
- Age & gender paired-bar chart + table (55+ bands, ~2:1 female skew).
- Income, sources-of-income (with % + mean, "not disclosed" for public-assistance mean), owner-vs-renter, home value, education, race, marital, place-of-birth all render.
- Methodology section reads correctly; no console errors.
- The three nav links work across index/changes/report.

- [ ] **Step 3: Commit any tweaks**

```bash
git add -A && git commit -m "Polish after report smoke test"
```

## Task 10: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Community Report" section to `README.md`**

```markdown
## Community Report (2020)

`site/report.html` is a reliable recreation of the LRPC demographic report, modeled on Jim Ouimette's
trusted 2010 report and built from **Census Bureau data only** (no AARP survey, no commercial data). It
uses a hybrid geography: exact-block **2020 Decennial** counts (age, sex, race, owner/renter, population)
and tract **2020 ACS 5-Year** estimates (income, income sources, education, home value, tenure, marital
status, place of birth). `scripts/report-payload.mjs` derives the compact `report2020` block baked into
`site/data.json` from the 2020 ACS mirror and the Decennial block section; `site/js/report.js` renders it.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document the Community Report page"
```

## Task 11: Finish the branch

- [ ] **Step 1:** Confirm clean tree + tests pass (`node --test && git status --short`).
- [ ] **Step 2:** Use superpowers:finishing-a-development-branch to merge/deploy with John (push to `main` triggers the live build).

---

## Self-review notes

- **Spec coverage:** summary (Task 2/7), age&gender (1/7), households/size (1/7), income incl. family-vs-nonfamily (2/7), sources incl. SS/SSI/SNAP/public-assistance with means (1/7), owner-vs-renter income (2/7), home value (2/7), education corrected (2/7), race (2/7), marital w/ caveat (2/7), place of birth (2/7), methodology (7). Data baked via Tasks 3–4; charts Task 5; page Tasks 6–8. All spec sections map to tasks.
- **Suppressed/edge data:** public-assistance mean → null → "not disclosed" (tested); average household size computed from B25009 distribution, not the integer-rounded B25010 (tested); education bounded to 25+ population (tested).
- **Naming consistency:** `buildReportSection(acsTables, blockSection)`, `deriveIncomeSources/HouseholdSize/AgeSex/Income/IncomeByTenure/Education/HomeValue/Race/Marital/PlaceOfBirth`, `av`/`pctOf`, `barWidths`, `pairedBars`, `groupedBars`, `renderReport`, `data.report2020` — consistent across tasks.
