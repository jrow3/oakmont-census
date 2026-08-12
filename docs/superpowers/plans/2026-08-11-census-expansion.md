# Census Site Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add median age, a block map, an income×household-size grid, and a full mirror of all ACS detailed (incl. race-iterated) and block-published DHC tables into a lazy-loaded, searchable explorer.

**Architecture:** The build fetches a small curated `data.json` (drives the fast snapshot) plus large per-section mirror files under `site/explorer/` (drive the explorer, lazy-loaded, gitignored). Fetch scripts discover tables from the Census API's own catalog and aggregate across the two tracts / 76 blocks. The front end stays framework-free: ES modules, hand-rolled SVG, and Leaflet for the one map.

**Tech Stack:** Node 24 (`node:test`, native `fetch`), static HTML/CSS/ES-modules, Leaflet 1.9.4 (CDN), Census API (ACS5 + 2020 DHC), TIGERweb REST.

**Testing:** No package.json. Run all tests with `node --test` from the repo root; a single file with `node --test <path>`. Pure logic is unit-tested; network/DOM modules ship with complete code and a run-and-verify step (matching the existing repo, which does not test fetch/DOM code).

**Reference:** Spec at `docs/superpowers/specs/2026-08-11-census-expansion-design.md`.

---

## File Structure

**New files**
- `scripts/census-http.mjs` — shared `getJson` (retry) + `mapLimit` (bounded concurrency).
- `scripts/aggregate.mjs` — `isWeighted(label)` + `aggregate(label, values, weights)`: sum counts, population-weight medians/means.
- `scripts/mirror.mjs` — `estimateVarCodes(header)` + `shapeTable(...)`: a `group(...)` API response → `{ concept, variables }`.
- `scripts/median-age.mjs` — `groupedMedian(bands)` + `medianAgeFromP12(values)`.
- `scripts/fetch-acs-mirror.mjs` — `fetchAcsMirror(year)`: full ACS detailed-table mirror for the two tracts.
- `scripts/fetch-block-geometry.mjs` — one-time: TIGERweb polygons for the 76 blocks → `site/blocks.geojson`.
- `site/blocks.geojson` — committed block geometry.
- `site/js/block-map.js` — `renderBlockMap()`: Leaflet map of the blocks.
- `site/js/income-grid.js` — `renderIncomeGrid(container, tables)`: the 2-axis income×size grid.
- `scripts/aggregate.test.mjs`, `scripts/median-age.test.mjs`, `scripts/mirror.test.mjs`, `site/js/income-grid.test.mjs`.

**Modified files**
- `scripts/census-variables.mjs` — add B01002, B19019; extend `MEDIAN_VARS`.
- `scripts/decennial-variables.mjs` — add `P12_AGE_BANDS`.
- `scripts/build-payload.mjs` — `medianAge` in ACS + block snapshots; `explorerFile` per section.
- `scripts/fetch-census.mjs` — write the three mirror files alongside `data.json`.
- `scripts/fetch-blocks.mjs` — add `fetchBlockMirror()` (keep `fetchBlockValues()`).
- `scripts/sample-data.mjs` — median/B19019 samples + placeholder mirror files.
- `site/js/explorer.js` — Featured + searchable catalog over a lazy-loaded mirror file.
- `site/js/page.js` — pass `explorerFile`/featured to the explorer; call `renderBlockMap()`.
- `site/js/snapshot.js`, `site/js/block-snapshot.js` — Median age KPI swap.
- `site/index.html` — Leaflet tags + map card.
- `site/styles.css` — map, grid, catalog/search styles.
- `.gitignore` — ignore `site/explorer/*.json`.
- `README.md` — document the mirror, map, grid.

---

# Phase 1 — Pipeline + mirror + explorer redesign

## Task 1: Shared HTTP helpers

**Files:**
- Create: `scripts/census-http.mjs`

- [ ] **Step 1: Write the module**

```js
// Shared HTTP helpers for the Census fetch scripts: a retrying JSON GET and a
// bounded-concurrency map. Node 24 native fetch; no dependencies.

export async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Run fn over items with at most `limit` in flight; preserves input order in the result.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
```

- [ ] **Step 2: Sanity-check it loads**

Run: `node -e "import('./scripts/census-http.mjs').then(m => console.log(typeof m.getJson, typeof m.mapLimit))"`
Expected: `function function`

- [ ] **Step 3: Commit**

```bash
git add scripts/census-http.mjs
git commit -m "Add shared Census HTTP helpers (getJson, mapLimit)"
```

## Task 2: Aggregation classifier

**Files:**
- Create: `scripts/aggregate.mjs`
- Test: `scripts/aggregate.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, isWeighted } from './aggregate.mjs';

test('isWeighted flags medians, means, per-capita, gini, ratio', () => {
  assert.equal(isWeighted('Median household income'), true);
  assert.equal(isWeighted('Mean travel time'), true);
  assert.equal(isWeighted('Per capita income'), true);
  assert.equal(isWeighted('Gini Index'), true);
  assert.equal(isWeighted('Total population'), false);
  assert.equal(isWeighted('Aggregate household income'), false); // aggregate IS summable
});

test('counts sum; nulls/negatives ignored', () => {
  assert.equal(aggregate('Total population', [100, 50, null], [1, 1, 1]), 150);
});

test('all-invalid counts return null', () => {
  assert.equal(aggregate('Total', [null, null], [1, 1]), null);
});

test('medians are population-weighted', () => {
  // (100*10 + 200*30) / (10+30) = 175
  assert.equal(aggregate('Median household income', [100, 200], [10, 30]), 175);
});

test('median with zero total weight returns null', () => {
  assert.equal(aggregate('Median age', [80, 90], [0, 0]), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/aggregate.test.mjs`
Expected: FAIL — `Cannot find module './aggregate.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// Aggregate one Census variable across geographies (tracts or blocks).
// Counts sum. Medians/means/per-capita/ratios cannot be summed, so they are
// population-weighted. Values must be pre-parsed to number|null (nulls skipped).

const WEIGHTED = /\b(median|mean|per capita|gini|ratio)\b/i;

export function isWeighted(label) {
  return WEIGHTED.test(label || '');
}

export function aggregate(label, values, weights) {
  if (isWeighted(label)) {
    let weightedSum = 0, totalWeight = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i], w = weights[i];
      if (v != null && v > 0 && w > 0) { weightedSum += v * w; totalWeight += w; }
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  }
  let sum = 0, anyValid = false;
  for (const v of values) {
    if (v != null && v >= 0) { sum += v; anyValid = true; }
  }
  return anyValid ? sum : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/aggregate.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/aggregate.mjs scripts/aggregate.test.mjs
git commit -m "Add label-based aggregation classifier (sum counts, weight medians)"
```

## Task 3: Mirror table shaping

**Files:**
- Create: `scripts/mirror.mjs`
- Test: `scripts/mirror.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/mirror.test.mjs`
Expected: FAIL — `Cannot find module './mirror.mjs'`

- [ ] **Step 3: Write the implementation**

```js
// Shape a Census `get=group(ID)` response into { concept, variables }.
// Estimates only (codes ending in E, excluding geo/annotation columns). Values are
// aggregated across the response's rows (tracts or filtered blocks).

import { aggregate } from './aggregate.mjs';

const GEO_COLS = new Set(['NAME', 'state', 'county', 'tract', 'block', 'GEO_ID', 'us', 'place']);

// Value columns: ACS estimates end in E, DHC counts end in N. Margins (M), annotations (EA/MA/NA),
// and geo columns are excluded.
export function estimateVarCodes(header) {
  return header.filter((h) => /_\d+[EN]$/.test(h) && !GEO_COLS.has(h));
}

// json: [header, ...rows]. labels: code -> label. weightByKey: rowKey -> weight population.
// rowKeyOf(header, row) -> the key into weightByKey (missing keys weight as 1).
export function shapeTable(concept, json, labels, weightByKey, rowKeyOf) {
  const header = json[0];
  const rows = json.slice(1);
  const weights = rows.map((r) => weightByKey[rowKeyOf(header, r)] ?? 1);
  const variables = {};
  for (const code of estimateVarCodes(header)) {
    const idx = header.indexOf(code);
    const label = labels[code] || code;
    const values = rows.map((r) => {
      const n = parseInt(r[idx], 10);
      return Number.isNaN(n) ? null : n;
    });
    variables[code] = { label, value: aggregate(label, values, weights) };
  }
  return { concept, variables };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/mirror.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/mirror.mjs scripts/mirror.test.mjs
git commit -m "Add mirror table shaping (group() response -> table object)"
```

## Task 4: Grouped median (for block median age)

**Files:**
- Create: `scripts/median-age.mjs`
- Test: `scripts/median-age.test.mjs`
- Modify: `scripts/decennial-variables.mjs` (add `P12_AGE_BANDS`)

- [ ] **Step 1: Add `P12_AGE_BANDS` to `scripts/decennial-variables.mjs`**

Append at the end of the file (after `DEC_VARS`):

```js
// Numeric age-band bounds for the P12 (sex-by-age) table, male+female codes combined.
// Used to compute a grouped median age across the summed blocks. The open-ended 85+ band
// is capped at 95 so the interpolation has a finite width.
export const P12_AGE_BANDS = [
  { lower: 0,  upper: 5,  codes: ['P12_003N', 'P12_027N'] },
  { lower: 5,  upper: 10, codes: ['P12_004N', 'P12_028N'] },
  { lower: 10, upper: 15, codes: ['P12_005N', 'P12_029N'] },
  { lower: 15, upper: 18, codes: ['P12_006N', 'P12_030N'] },
  { lower: 18, upper: 20, codes: ['P12_007N', 'P12_031N'] },
  { lower: 20, upper: 21, codes: ['P12_008N', 'P12_032N'] },
  { lower: 21, upper: 22, codes: ['P12_009N', 'P12_033N'] },
  { lower: 22, upper: 25, codes: ['P12_010N', 'P12_034N'] },
  { lower: 25, upper: 30, codes: ['P12_011N', 'P12_035N'] },
  { lower: 30, upper: 35, codes: ['P12_012N', 'P12_036N'] },
  { lower: 35, upper: 40, codes: ['P12_013N', 'P12_037N'] },
  { lower: 40, upper: 45, codes: ['P12_014N', 'P12_038N'] },
  { lower: 45, upper: 50, codes: ['P12_015N', 'P12_039N'] },
  { lower: 50, upper: 55, codes: ['P12_016N', 'P12_040N'] },
  { lower: 55, upper: 60, codes: ['P12_017N', 'P12_041N'] },
  { lower: 60, upper: 62, codes: ['P12_018N', 'P12_042N'] },
  { lower: 62, upper: 65, codes: ['P12_019N', 'P12_043N'] },
  { lower: 65, upper: 67, codes: ['P12_020N', 'P12_044N'] },
  { lower: 67, upper: 70, codes: ['P12_021N', 'P12_045N'] },
  { lower: 70, upper: 75, codes: ['P12_022N', 'P12_046N'] },
  { lower: 75, upper: 80, codes: ['P12_023N', 'P12_047N'] },
  { lower: 80, upper: 85, codes: ['P12_024N', 'P12_048N'] },
  { lower: 85, upper: 95, codes: ['P12_025N', 'P12_049N'] },
];
```

- [ ] **Step 2: Write the failing test**

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test scripts/median-age.test.mjs`
Expected: FAIL — `Cannot find module './median-age.mjs'`

- [ ] **Step 4: Write the implementation**

```js
// Grouped (interpolated) median from banded counts, and its application to the P12 age table.

import { P12_AGE_BANDS } from './decennial-variables.mjs';

// bands: [{ lower, upper, count }] ordered low -> high. Returns the interpolated median or null.
export function groupedMedian(bands) {
  const total = bands.reduce((a, b) => a + (b.count || 0), 0);
  if (total <= 0) return null;
  const half = total / 2;
  let cum = 0;
  for (const b of bands) {
    const c = b.count || 0;
    if (cum + c >= half) {
      if (c === 0) return b.lower;
      return b.lower + ((half - cum) / c) * (b.upper - b.lower);
    }
    cum += c;
  }
  return bands[bands.length - 1].upper;
}

export function medianAgeFromP12(values) {
  const bands = P12_AGE_BANDS.map((b) => ({
    lower: b.lower,
    upper: b.upper,
    count: b.codes.reduce((a, c) => a + (values[c] || 0), 0),
  }));
  return groupedMedian(bands);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scripts/median-age.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/median-age.mjs scripts/median-age.test.mjs scripts/decennial-variables.mjs
git commit -m "Add grouped-median age from P12 bands"
```

## Task 5: Curated variable additions (B01002, B19019)

**Files:**
- Modify: `scripts/census-variables.mjs`

- [ ] **Step 1: Extend `MEDIAN_VARS`**

Replace the `MEDIAN_VARS` set with:

```js
export const MEDIAN_VARS = new Set([
  'B19013_001E', // Median Household Income
  'B25064_001E', // Median Gross Rent
  'B25077_001E', // Median Home Value
  'B19301_001E', // Per Capita Income
  'B01002_001E', 'B01002_002E', 'B01002_003E', // Median Age (total / male / female)
  'B19019_001E', 'B19019_002E', 'B19019_003E', 'B19019_004E',
  'B19019_005E', 'B19019_006E', 'B19019_007E', 'B19019_008E', // Median income by household size
]);
```

- [ ] **Step 2: Add median-age vars to the `age` group**

In `GROUPS.age.variables`, after the `'B01001_049E'` line, add:

```js
      'B01002_001E': 'Median Age (total)',
      'B01002_002E': 'Median Age (male)',
      'B01002_003E': 'Median Age (female)',
```

- [ ] **Step 3: Add the new `incomeBySize` group**

In `GROUPS`, after the `income` group (before `race`), add:

```js
  incomeBySize: {
    label: 'Income by Household Size',
    totalKey: 'B19019_001E',
    variables: {
      'B19019_001E': 'Median household income — All households',
      'B19019_002E': 'Median household income — 1-person households',
      'B19019_003E': 'Median household income — 2-person households',
      'B19019_004E': 'Median household income — 3-person households',
      'B19019_005E': 'Median household income — 4-person households',
      'B19019_006E': 'Median household income — 5-person households',
      'B19019_007E': 'Median household income — 6-person households',
      'B19019_008E': 'Median household income — 7-or-more-person households',
    },
  },
```

- [ ] **Step 4: Verify the module still loads and the new vars are present**

Run: `node -e "import('./scripts/census-variables.mjs').then(m => { console.log(m.GROUPS.incomeBySize.totalKey, m.GROUPS.age.variables.B01002_001E, m.MEDIAN_VARS.has('B01002_001E')); })"`
Expected: `B19019_001E Median Age (total) true`

- [ ] **Step 5: Commit**

```bash
git add scripts/census-variables.mjs
git commit -m "Add median age (B01002) and income-by-size (B19019) to curated vars"
```

## Task 6: Median age in snapshots (data model)

**Files:**
- Modify: `scripts/build-payload.mjs`
- Test: `scripts/build-payload.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/build-payload.test.mjs`:

```js
import { buildSnapshot as _bs } from './build-payload.mjs';

test('buildSnapshot exposes medianAge from B01002_001E', () => {
  const s = _bs({ B01002_001E: 68 });
  assert.equal(s.medianAge, 68);
});

test('buildBlockSection computes medianAge from P12 bands', () => {
  const v = { P12_001N: 100, P12_022N: 50, P12_046N: 50 }; // all 70-74
  const section = buildBlockSection(v);
  assert.equal(section.snapshot.medianAge, 72.5);
});

test('buildAcsSection tags its explorer file', () => {
  const section = buildAcsSection('2024', { B01001_001E: 5000 });
  assert.equal(section.explorerFile, 'explorer/acs2024.json');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test scripts/build-payload.test.mjs`
Expected: FAIL — `medianAge` undefined / `explorerFile` undefined.

- [ ] **Step 3: Implement**

In `scripts/build-payload.mjs`:

Add the import at the top (after the existing imports):

```js
import { medianAgeFromP12 } from './median-age.mjs';
```

In `buildSnapshot`, add `medianAge` to the returned object (after `age85Plus`):

```js
    age85Plus: (v('B01001_025E') || 0) + (v('B01001_049E') || 0),
    medianAge: v('B01002_001E'),
```

In `buildAcsSection`, add the `explorerFile` field:

```js
export function buildAcsSection(year, values) {
  return {
    year,
    source: `U.S. Census Bureau, ${year} ACS 5-Year Estimates`,
    explorerFile: `explorer/acs${year}.json`,
    snapshot: buildSnapshot(values),
    groups: buildGroups(values),
  };
}
```

In `buildBlockSection`, add `medianAge` to the `snapshot` object (after `pct65Plus`) and `explorerFile` to the returned section:

```js
      pct65Plus: pct(sum(AGE_65_PLUS), totalPop),
      medianAge: medianAgeFromP12(values),
```

```js
  return {
    vintage: '2020 Decennial (DHC)',
    geography: '76 selected census blocks, Oakmont, Sonoma County, CA',
    year: '2020-blocks',
    explorerFile: 'explorer/blocks2020.json',
    snapshot: {
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test scripts/build-payload.test.mjs`
Expected: PASS (all tests, including the new three)

- [ ] **Step 5: Commit**

```bash
git add scripts/build-payload.mjs scripts/build-payload.test.mjs
git commit -m "Add medianAge to ACS/block snapshots and explorerFile per section"
```

## Task 7: ACS full-mirror fetch

**Files:**
- Create: `scripts/fetch-acs-mirror.mjs`

- [ ] **Step 1: Write the module**

```js
// Pull the FULL ACS 5-year detailed-table catalog (incl. race-iterated tables) for the two
// Oakmont tracts, aggregate across them, and return a per-year mirror object for the explorer.
// One request per table via get=group(ID); estimates only. Medians are weighted by tract population.

import { GEO } from './census-variables.mjs';
import { shapeTable } from './mirror.mjs';
import { getJson, mapLimit } from './census-http.mjs';

const API_KEY = (process.env.CENSUS_API_KEY || '').trim();
const KEY = API_KEY ? `&key=${API_KEY}` : '';
const CONCURRENCY = 8;
const POP_VAR = 'B01003_001E';
const base = (year) => `https://api.census.gov/data/${year}/acs/acs5`;
const inClause = `&for=tract:${GEO.tracts.join(',')}&in=state:${GEO.state}+county:${GEO.county}`;

const rowKey = (h, r) => r[h.indexOf('state')] + r[h.indexOf('county')] + r[h.indexOf('tract')];

async function loadLabels(year) {
  const vars = await getJson(`${base(year)}/variables.json`);
  const labels = {};
  for (const [code, meta] of Object.entries(vars.variables || {})) labels[code] = meta.label;
  return labels;
}

async function loadGroups(year) {
  const g = await getJson(`${base(year)}/groups.json`);
  return (g.groups || []).map((x) => ({ id: x.name, concept: x.description }));
}

async function tractPops(year) {
  const json = await getJson(`${base(year)}?get=NAME,${POP_VAR}${inClause}${KEY}`);
  const h = json[0];
  const out = {};
  for (const r of json.slice(1)) out[rowKey(h, r)] = parseInt(r[h.indexOf(POP_VAR)], 10) || 0;
  return out;
}

export async function fetchAcsMirror(year) {
  const [labels, groups, pops] = await Promise.all([loadLabels(year), loadGroups(year), tractPops(year)]);
  const tables = {};
  let done = 0, skipped = 0;
  await mapLimit(groups, CONCURRENCY, async (grp) => {
    try {
      const json = await getJson(`${base(year)}?get=group(${grp.id})${inClause}${KEY}`);
      tables[grp.id] = shapeTable(grp.concept, json, labels, pops, rowKey);
    } catch {
      skipped++;
      return;
    }
    if (++done % 200 === 0) console.log(`  ACS ${year}: ${done}/${groups.length} tables`);
  });
  console.log(`  ACS ${year}: ${Object.keys(tables).length} tables kept, ${skipped} skipped`);
  return { meta: { dataset: 'acs/acs5', year, generatedAt: new Date().toISOString() }, tables };
}
```

- [ ] **Step 2: Live smoke test (single table)**

Confirms the API shape and shaping against one real table (fast; does not fetch the whole catalog).

Run:
```bash
node -e "import('./scripts/mirror.mjs').then(async ({shapeTable}) => { const {getJson}=await import('./scripts/census-http.mjs'); const j=await getJson('https://api.census.gov/data/2022/acs/acs5?get=group(B01001)&for=tract:151601,151602&in=state:06+county:097'); const t=shapeTable('Sex by Age', j, {}, {'06097151601':100,'06097151602':100}, (h,r)=>r[h.indexOf('state')]+r[h.indexOf('county')]+r[h.indexOf('tract')]); console.log('B01001_001E =', t.variables.B01001_001E.value); })"
```
Expected: a positive integer (the two tracts' summed population, ~5,000–6,000). If it errors on the network, retry — TIGERweb/Census can rate-limit keyless.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-acs-mirror.mjs
git commit -m "Add full ACS detailed-table mirror fetch"
```

## Task 8: Block DHC full-mirror fetch

**Files:**
- Modify: `scripts/fetch-blocks.mjs` (add `fetchBlockMirror`; keep `fetchBlockValues`)

- [ ] **Step 1: Add the mirror fetch**

Add these imports at the top of `scripts/fetch-blocks.mjs` (keep the existing `DEC_GEO, DEC_VARS, loadBlockGeoids` import):

```js
import { shapeTable } from './mirror.mjs';
import { getJson, mapLimit } from './census-http.mjs';
```

Append to the end of the file:

```js
const BASE = `https://api.census.gov/data/${DEC_GEO.dataset}`;
const KEY = API_KEY ? `&key=${API_KEY}` : '';

const blockKey = (h, r) =>
  r[h.indexOf('state')] + r[h.indexOf('county')] + r[h.indexOf('tract')] + r[h.indexOf('block')];

async function dhcLabels() {
  const vars = await getJson(`${BASE}/variables.json`);
  const labels = {};
  for (const [c, m] of Object.entries(vars.variables || {})) labels[c] = m.label;
  return labels;
}

async function dhcGroups() {
  const g = await getJson(`${BASE}/groups.json`);
  return (g.groups || []).map((x) => ({ id: x.name, concept: x.description }));
}

async function blockPops(geoids) {
  const pops = {};
  for (const tract of DEC_GEO.tracts) {
    const url = `${BASE}?get=P1_001N&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${KEY}`;
    const json = await getJson(url);
    const h = json[0];
    for (const r of json.slice(1)) {
      const k = blockKey(h, r);
      if (geoids.has(k)) pops[k] = parseInt(r[h.indexOf('P1_001N')], 10) || 0;
    }
  }
  return pops;
}

// Full 2020 DHC mirror summed over the 76 blocks. Only tables the Census publishes at block
// geography are kept; finer tables error on the block query and are skipped.
export async function fetchBlockMirror() {
  const geoids = await loadBlockGeoids();
  const [labels, groups, pops] = await Promise.all([dhcLabels(), dhcGroups(), blockPops(geoids)]);
  const tables = {};
  let skipped = 0;
  await mapLimit(groups, 6, async (grp) => {
    let header = null;
    const kept = [];
    for (const tract of DEC_GEO.tracts) {
      const url = `${BASE}?get=group(${grp.id})&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${KEY}`;
      let json;
      try { json = await getJson(url); } catch { return; } // not block-available -> skip whole table
      header = json[0];
      for (const r of json.slice(1)) if (geoids.has(blockKey(header, r))) kept.push(r);
    }
    if (!header || kept.length === 0) { skipped++; return; }
    tables[grp.id] = shapeTable(grp.concept, [header, ...kept], labels, pops, blockKey);
  });
  console.log(`  Blocks: ${Object.keys(tables).length} DHC tables kept, ${skipped} skipped (not block-level)`);
  return {
    meta: { dataset: DEC_GEO.dataset, geography: '76 Oakmont blocks', generatedAt: new Date().toISOString() },
    tables,
  };
}
```

- [ ] **Step 2: Live smoke test (block pops + one table)**

Run:
```bash
node -e "import('./scripts/fetch-blocks.mjs').then(async m => { const r = await m.fetchBlockValues(); console.log('summed block pop P12_001N =', r.P12_001N); })"
```
Expected: `summed block pop P12_001N = 4994` (with a key) — confirms the existing block fetch still works after edits. (Set `CENSUS_API_KEY` in the environment first; keyless DHC returns a Missing-Key page.)

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-blocks.mjs
git commit -m "Add full block-level DHC mirror fetch"
```

## Task 9: Wire mirror files into the build

**Files:**
- Modify: `scripts/fetch-census.mjs`

- [ ] **Step 1: Add mirror writing to `main()`**

Add imports at the top (after the existing `fetchBlockValues` import):

```js
import { fetchAcsMirror } from './fetch-acs-mirror.mjs';
import { fetchBlockMirror } from './fetch-blocks.mjs';
```

Add near `OUT_PATH`:

```js
const EXPLORER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'explorer');
```

In `main()`, after `await writeFile(OUT_PATH, ...)` and its log line, append:

```js
  await mkdir(EXPLORER_DIR, { recursive: true });
  for (const year of ACS_YEARS) {
    console.log(`Building ACS ${year} full mirror`);
    const mirror = await fetchAcsMirror(year);
    await writeFile(join(EXPLORER_DIR, `acs${year}.json`), JSON.stringify(mirror) + '\n', 'utf8');
  }
  console.log('Building block DHC full mirror');
  const blockMirror = await fetchBlockMirror();
  await writeFile(join(EXPLORER_DIR, 'blocks2020.json'), JSON.stringify(blockMirror) + '\n', 'utf8');
  console.log(`Wrote mirror files to ${EXPLORER_DIR}`);
```

- [ ] **Step 2: Verify the file parses and exports `main`**

Run: `node --check scripts/fetch-census.mjs`
Expected: no output (syntax OK).

(A full run is exercised in Task 18. It is slow and needs a key, so it is deferred to the integration smoke.)

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-census.mjs
git commit -m "Write per-section mirror files alongside data.json"
```

## Task 10: Sample data — median/B19019 values + placeholder mirrors

**Files:**
- Modify: `scripts/sample-data.mjs`

- [ ] **Step 1: Add median-age + B19019 sample values**

In `MEDIAN_SAMPLES`, add median age and the B19019 by-size medians:

```js
const MEDIAN_SAMPLES = {
  'B19013_001E': 95400, 'B25064_001E': 2180, 'B25077_001E': 812400, 'B19301_001E': 61800,
  'B01002_001E': 68, 'B01002_002E': 66, 'B01002_003E': 70,
  'B19019_001E': 95400, 'B19019_002E': 52000, 'B19019_003E': 98000, 'B19019_004E': 112000,
  'B19019_005E': 120000, 'B19019_006E': 108000, 'B19019_007E': 99000, 'B19019_008E': 90000,
};
```

- [ ] **Step 2: Write placeholder mirror files**

Add a helper before the final `assembleData` call (after `oakmont2020` is built):

```js
import { GROUPS as _G } from './census-variables.mjs';
import { DEC_GROUPS as _DG } from './decennial-variables.mjs';

const tableIdOf = (code) => code.split('_')[0];

function sampleMirror(vals, groups, meta) {
  const tables = {};
  for (const g of Object.values(groups)) {
    for (const [code, label] of Object.entries(g.variables)) {
      const id = tableIdOf(code);
      (tables[id] ||= { concept: g.label, variables: {} }).variables[code] = {
        label, value: vals[code] ?? null,
      };
    }
  }
  return { meta, tables };
}
```

After the existing `data` is assembled and before the final `writeFile`, add:

```js
const explorerDir = join(dirname(OUT_PATH), 'explorer');
await mkdir(explorerDir, { recursive: true });
await writeFile(join(explorerDir, 'acs2020.json'),
  JSON.stringify(sampleMirror(values2020, _G, { dataset: 'acs/acs5', year: '2020', sample: true })) + '\n', 'utf8');
await writeFile(join(explorerDir, 'acs2024.json'),
  JSON.stringify(sampleMirror(values2024, _G, { dataset: 'acs/acs5', year: '2024', sample: true })) + '\n', 'utf8');
await writeFile(join(explorerDir, 'blocks2020.json'),
  JSON.stringify(sampleMirror(decValues, _DG, { dataset: '2020/dec/dhc', sample: true })) + '\n', 'utf8');
```

(`mkdir` is already imported at the top of the file.)

- [ ] **Step 3: Run the sample generator and verify all four files exist**

Run: `node scripts/sample-data.mjs && node -e "const fs=require('fs'); ['data.json','explorer/acs2020.json','explorer/acs2024.json','explorer/blocks2020.json'].forEach(f=>console.log(f, fs.existsSync('site/'+f)))"`
Expected: each line ends `true`; the data.json log shows a population.

- [ ] **Step 4: Verify median age is in the sample snapshot**

Run: `node -e "const d=require('./site/data.json'); console.log('acs medianAge', d.acs2024.snapshot.medianAge, '| block medianAge', d.oakmont2020.snapshot.medianAge)"`
Expected: `acs medianAge 68 | block medianAge <a number 65-95>`

- [ ] **Step 5: Commit**

```bash
git add scripts/sample-data.mjs
git commit -m "Sample data: median age, B19019, and placeholder mirror files"
```

## Task 11: Gitignore the generated mirror files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

```
site/explorer/*.json
```

- [ ] **Step 2: Verify the generated files are ignored**

Run: `git status --porcelain site/explorer/`
Expected: no output (the JSON files under `site/explorer/` are ignored).

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "Gitignore generated explorer mirror files"
```

## Task 12: Explorer redesign — Featured + searchable catalog

**Files:**
- Modify: `site/js/explorer.js` (full rewrite)
- Modify: `site/js/page.js`
- Modify: `site/styles.css` (append catalog/search styles)

- [ ] **Step 1: Rewrite `site/js/explorer.js`**

```js
// The Full data explorer: lazy-loads a section's mirror file (all tables), shows Featured
// tables plus a searchable catalog of every table, each a sortable table with a distribution
// bar and CSV export. renderExplorer is async — it fetches the mirror on first open.

import { fmt, escapeHtml } from './format.js';

export async function renderExplorer(root, { explorerFile, featured = [], year = '' }) {
  root.innerHTML = `<p class="explorer-loading">Loading full dataset…</p>`;
  let data;
  try {
    const res = await fetch(`./${explorerFile}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (err) {
    root.innerHTML = `<p class="explorer-loading">Could not load the full dataset (${escapeHtml(String(err.message))}).</p>`;
    return;
  }

  const tables = data.tables || {};
  const ids = Object.keys(tables);
  const tableTotal = (id) => tables[id].variables[`${id}_001E`]?.value
    ?? tables[id].variables[`${id}_001N`]?.value
    ?? Object.values(tables[id].variables)[0]?.value ?? null;
  const isEmpty = (id) => Object.values(tables[id].variables).every((v) => !v.value);

  const featuredIds = featured.filter((id) => tables[id]);
  const state = { tab: featuredIds[0] || ids[0], filter: '', sort: '', hideEmpty: true, search: '' };

  root.innerHTML = `
    ${tables.B19019 ? `<div class="featured-grid" id="income-grid"></div>` : ''}
    <div class="explorer-featured">
      <span class="featured-label">Featured</span>
      ${featuredIds.map((id) => `<button class="chip" data-id="${id}">${escapeHtml(tables[id].concept || id)}</button>`).join('')}
    </div>
    <div class="catalog-controls">
      <input type="search" id="cat-search" placeholder="Search all ${ids.length} tables by name or code…" aria-label="Search tables" />
      <label class="hide-empty"><input type="checkbox" id="cat-hide-empty" checked /> Hide empty tables</label>
    </div>
    <div class="catalog-list" id="cat-list"></div>
    <div class="table-view" id="table-view"></div>`;

  if (tables.B19019) {
    import('./income-grid.js')
      .then(({ renderIncomeGrid }) => renderIncomeGrid(root.querySelector('#income-grid'), tables))
      .catch(() => {}); // grid module lands in a later task; degrade gracefully until then
  }

  const catList = root.querySelector('#cat-list');
  const tableView = root.querySelector('#table-view');
  const searchEl = root.querySelector('#cat-search');
  const hideEmptyEl = root.querySelector('#cat-hide-empty');

  function visibleTableIds() {
    const q = state.search.toLowerCase();
    return ids
      .filter((id) => !(state.hideEmpty && isEmpty(id)))
      .filter((id) => !q || id.toLowerCase().includes(q) || (tables[id].concept || '').toLowerCase().includes(q));
  }

  function renderCatalog() {
    const list = visibleTableIds();
    catList.innerHTML = `<div class="catalog-count">${list.length} tables</div>` +
      list.map((id) => `<button class="catalog-item ${id === state.tab ? 'active' : ''}" data-id="${id}">
        <span class="catalog-id">${id}</span><span class="catalog-concept">${escapeHtml(tables[id].concept || '')}</span>
      </button>`).join('');
    catList.querySelectorAll('.catalog-item').forEach((btn) =>
      btn.addEventListener('click', () => { state.tab = btn.dataset.id; renderCatalog(); renderTable(); }));
  }

  function rowsFor(id) {
    const denom = tableTotal(id);
    return Object.entries(tables[id].variables).map(([code, v]) => ({
      code, label: v.label, value: v.value,
      pct: v.value != null && denom ? (v.value / denom) * 100 : null,
    }));
  }

  function sortRows(rows, key) {
    if (!key) return rows;
    const r = [...rows];
    if (key === 'label') return r.sort((a, b) => a.label.localeCompare(b.label));
    if (key === 'code') return r.sort((a, b) => a.code.localeCompare(b.code));
    const [field, dir] = key.split('-');
    return r.sort((a, b) => {
      const va = a[field] ?? -Infinity, vb = b[field] ?? -Infinity;
      return dir === 'desc' ? vb - va : va - vb;
    });
  }

  function renderTable() {
    const id = state.tab;
    if (!tables[id]) { tableView.innerHTML = ''; return; }
    let rows = rowsFor(id);
    rows = sortRows(rows, state.sort);
    const maxV = Math.max(0, ...rows.map((r) => r.value ?? 0));
    tableView.innerHTML = `
      <div class="table-view-head">
        <h4><span class="catalog-id">${id}</span> ${escapeHtml(tables[id].concept || '')}</h4>
        <button class="btn" id="dl-current">This table (CSV)</button>
        <button class="btn btn-outline" id="dl-all">All data (CSV)</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th data-sort="code">Variable</th><th data-sort="label">Label</th>
          <th data-sort="value" style="text-align:right">Value</th>
          <th data-sort="pct" style="text-align:right">% of total</th><th>Distribution</th>
        </tr></thead>
        <tbody>${rows.map((r) => {
          const value = r.value != null ? fmt(r.value) : '<span class="na">N/A</span>';
          const p = r.pct != null ? `${r.pct.toFixed(1)}%` : '<span class="na">—</span>';
          const w = maxV > 0 && r.value != null ? Math.max(1, Math.round((r.value / maxV) * 100)) : 0;
          return `<tr><td class="code">${r.code}</td><td>${escapeHtml(r.label)}</td>
            <td class="num">${value}</td><td class="pct">${p}</td>
            <td><div class="dist-bar"><i style="width:${w}%"></i></div></td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
    tableView.querySelectorAll('thead th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const b = th.dataset.sort;
      state.sort = b === 'code' || b === 'label' ? b : (state.sort === `${b}-desc` ? `${b}-asc` : `${b}-desc`);
      renderTable();
    }));
    tableView.querySelector('#dl-current').addEventListener('click', () =>
      downloadCsv([['Table', 'Concept', 'Variable', 'Label', 'Value', '% of Total'],
        ...rowsFor(id).map((r) => [id, tables[id].concept || '', r.code, r.label, r.value ?? '',
          r.pct != null ? `${r.pct.toFixed(2)}%` : ''])], `oakmont_${year}_${id}.csv`));
    tableView.querySelector('#dl-all').addEventListener('click', () => {
      const csv = [['Table', 'Concept', 'Variable', 'Label', 'Value', '% of Total']];
      for (const tid of ids) for (const r of rowsFor(tid))
        csv.push([tid, tables[tid].concept || '', r.code, r.label, r.value ?? '',
          r.pct != null ? `${r.pct.toFixed(2)}%` : '']);
      downloadCsv(csv, `oakmont_${year}_all_data.csv`);
    });
  }

  function downloadCsv(rows, filename) {
    const content = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  root.querySelectorAll('.explorer-featured .chip').forEach((btn) =>
    btn.addEventListener('click', () => { state.tab = btn.dataset.id; renderCatalog(); renderTable(); }));
  searchEl.addEventListener('input', () => { state.search = searchEl.value; renderCatalog(); });
  hideEmptyEl.addEventListener('change', () => { state.hideEmpty = hideEmptyEl.checked; renderCatalog(); });

  renderCatalog();
  renderTable();
}
```

- [ ] **Step 2: Update `site/js/page.js` to pass the mirror file and featured tables**

Add a featured-table constant near the top (after the imports):

```js
const FEATURED_ACS = ['B01001', 'B01002', 'B19001', 'B19019', 'B25003', 'B25034', 'B15003', 'B02001'];
const FEATURED_BLOCK = ['P12', 'P3', 'P4', 'H4'];
```

Replace the block-explorer builder call:

```js
      if (!open && !bBuilt) { renderExplorer(bPanel, data.oakmont2020); bBuilt = true; }
```
with:
```js
      if (!open && !bBuilt) {
        bBuilt = true;
        renderExplorer(bPanel, { explorerFile: data.oakmont2020.explorerFile, featured: FEATURED_BLOCK, year: '2020-blocks' });
      }
```

Replace the main-explorer builder call:

```js
    if (!open && !built) { renderExplorer(panel, section); built = true; }
```
with:
```js
    if (!open && !built) {
      built = true;
      renderExplorer(panel, { explorerFile: section.explorerFile, featured: FEATURED_ACS, year: section.year });
    }
```

- [ ] **Step 3: Append catalog/featured styles to `site/styles.css`**

```css
/* ── Explorer catalog ── */
.explorer-loading { padding: 1.5rem; color: var(--ink-soft, #6b625a); }
.explorer-featured { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: 1rem 0; }
.featured-label { font: 600 .75rem/1 'Public Sans', sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-soft, #6b625a); margin-right: .25rem; }
.chip { border: 1px solid var(--line, #e5ddd3); background: var(--paper, #fff); border-radius: 999px; padding: .35rem .8rem; font: 500 .85rem 'Public Sans', sans-serif; cursor: pointer; }
.chip:hover { border-color: var(--terracotta); color: var(--terracotta); }
.catalog-controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin: 1rem 0 .5rem; }
.catalog-controls #cat-search { flex: 1 1 260px; padding: .5rem .75rem; border: 1px solid var(--line, #e5ddd3); border-radius: 8px; font: 400 .9rem 'Public Sans', sans-serif; }
.hide-empty { font: 400 .85rem 'Public Sans', sans-serif; color: var(--ink-soft, #6b625a); display: inline-flex; gap: .4rem; align-items: center; }
.catalog-list { max-height: 320px; overflow-y: auto; border: 1px solid var(--line, #e5ddd3); border-radius: 10px; margin-bottom: 1rem; }
.catalog-count { padding: .5rem .75rem; font: 600 .75rem 'Public Sans', sans-serif; color: var(--ink-soft, #6b625a); border-bottom: 1px solid var(--line, #e5ddd3); }
.catalog-item { display: flex; gap: .75rem; width: 100%; text-align: left; padding: .5rem .75rem; background: none; border: 0; border-bottom: 1px solid var(--line, #f0eae2); cursor: pointer; font: 400 .85rem 'Public Sans', sans-serif; }
.catalog-item:hover, .catalog-item.active { background: var(--wash, #faf6f0); }
.catalog-id { font-family: ui-monospace, monospace; color: var(--terracotta); font-weight: 600; flex: 0 0 5.5rem; }
.catalog-concept { color: var(--ink, #2b2621); }
.table-view-head { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: 1rem 0 .5rem; }
.table-view-head h4 { margin: 0; flex: 1 1 auto; font: 600 1rem 'Public Sans', sans-serif; }
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check site/js/explorer.js && node --check site/js/page.js`
Expected: no output. (The income grid is imported dynamically and its module lands in Task 14; until then the explorer renders without the grid. Full visual check in Task 18.)

- [ ] **Step 5: Commit**

```bash
git add site/js/explorer.js site/js/page.js site/styles.css
git commit -m "Redesign explorer: Featured tables + searchable catalog over lazy mirror"
```

---

# Phase 2 — Presentation features

## Task 13: Block geometry (TIGERweb → blocks.geojson)

**Files:**
- Create: `scripts/fetch-block-geometry.mjs`
- Create (generated, committed): `site/blocks.geojson`

- [ ] **Step 1: Write the fetch script**

```js
// One-time: fetch 2020 Census block polygons for the 76 frozen Oakmont GEOIDs from TIGERweb
// and write site/blocks.geojson. The block list is frozen, so this output is committed and the
// site never calls TIGERweb at runtime. Re-run only if oakmont-blocks.json changes.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlockGeoids } from './decennial-variables.mjs';
import { getJson } from './census-http.mjs';

const SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'blocks.geojson');

async function findBlockLayer() {
  const meta = await getJson(`${SERVICE}/layers?f=json`);
  const layer = (meta.layers || []).find((l) => /2020 Census Blocks/i.test(l.name));
  if (!layer) throw new Error('Could not find the 2020 Census Blocks layer in TIGERweb');
  return layer.id;
}

async function geoidField(layerId) {
  const meta = await getJson(`${SERVICE}/${layerId}?f=json`);
  const field = (meta.fields || []).find((f) => /^GEOID/i.test(f.name));
  if (!field) throw new Error('Could not find a GEOID field on the blocks layer');
  return field.name;
}

function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

async function main() {
  const geoids = [...await loadBlockGeoids()];
  const layerId = await findBlockLayer();
  const field = await geoidField(layerId);
  const features = [];
  for (const part of chunk(geoids, 25)) {
    const inList = part.map((g) => `'${g}'`).join(',');
    const url = `${SERVICE}/${layerId}/query?where=${encodeURIComponent(`${field} IN (${inList})`)}` +
      `&outFields=${field}&returnGeometry=true&outSR=4326&f=geojson`;
    const fc = await getJson(url);
    features.push(...(fc.features || []));
  }
  const out = { type: 'FeatureCollection', features };
  await writeFile(OUT, JSON.stringify(out) + '\n', 'utf8');
  console.log(`Wrote ${features.length} block polygons to ${OUT}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
```

- [ ] **Step 2: Run it and verify 76 features**

Run: `node scripts/fetch-block-geometry.mjs && node -e "const fs=require('fs'); const g=JSON.parse(fs.readFileSync('site/blocks.geojson','utf8')); console.log('features:', g.features.length)"`
(Note: use `JSON.parse(fs.readFileSync(...))`, not `require('./…geojson')` — Node has no `.geojson` require handler.) In this repo TIGERweb's `tigerWMS_Census2020` names the layer `Census Blocks` (id 10), not `2020 Census Blocks`, so `findBlockLayer` uses `/^Census Blocks$/i`.
Expected: `Wrote 76 block polygons ...` then `features: 76`. If the count is not 76 or TIGERweb layer/field discovery fails, inspect `node -e "import('./scripts/census-http.mjs').then(m=>m.getJson('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/layers?f=json')).then(j=>console.log(j.layers.map(l=>l.id+':'+l.name).join('\n')))"` to confirm the layer name, and adjust the regex in `findBlockLayer`.

- [ ] **Step 3: Commit (including the generated geojson)**

```bash
git add scripts/fetch-block-geometry.mjs site/blocks.geojson
git commit -m "Fetch and commit TIGERweb geometry for the 76 Oakmont blocks"
```

## Task 14: Income × household-size grid

> **Superseded by Task 21 (2026-08-11).** This task built a grid of each size's *median income* (B19019).
> John then asked for per-cell **household counts** instead. The shipped grid (`site/js/income-grid.js`)
> shows an estimated count crosstab via iterative proportional fitting over real marginals (income B19001,
> household size B25009) anchored by per-size medians (B19019). See the spec's Feature 3 revision note. The
> steps below are kept for history; the live module differs.

**Files:**
- Create: `site/js/income-grid.js`
- Test: `site/js/income-grid.test.mjs`

- [ ] **Step 1: Write the failing test (pure grid-math helper)**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketIndexFor, INCOME_BRACKETS } from './income-grid.js';

test('bracketIndexFor maps a median income to its bracket row', () => {
  // brackets ascend; $95,400 falls in the $75,000–$99,999 bracket
  const i = bracketIndexFor(95400);
  assert.equal(INCOME_BRACKETS[i].label, '$75–100k');
});

test('bracketIndexFor clamps below and above range', () => {
  assert.equal(bracketIndexFor(0), 0);
  assert.equal(bracketIndexFor(10_000_000), INCOME_BRACKETS.length - 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test site/js/income-grid.test.mjs`
Expected: FAIL — `Cannot find module './income-grid.js'`

- [ ] **Step 3: Write the module**

```js
// The income × household-size grid: y-axis = income brackets, x-axis = household size (1..7+).
// Each size column highlights the bracket row its median income (B19019) falls in, heat-shaded
// on a sequential scale, with the exact median labeled. Reads the mirror's B19019 table.
// All rendered strings are internal constants, so no HTML escaping is needed here.

// Bracket lower bounds mirror B19001; label + [lo, hi) for placing a median.
export const INCOME_BRACKETS = [
  { label: '< $10k', lo: 0, hi: 10000 },
  { label: '$10–15k', lo: 10000, hi: 15000 },
  { label: '$15–25k', lo: 15000, hi: 25000 },
  { label: '$25–35k', lo: 25000, hi: 35000 },
  { label: '$35–50k', lo: 35000, hi: 50000 },
  { label: '$50–75k', lo: 50000, hi: 75000 },
  { label: '$75–100k', lo: 75000, hi: 100000 },
  { label: '$100–150k', lo: 100000, hi: 150000 },
  { label: '$150–200k', lo: 150000, hi: 200000 },
  { label: '$200k +', lo: 200000, hi: Infinity },
];

const SIZES = [
  { code: 'B19019_002E', label: '1' }, { code: 'B19019_003E', label: '2' },
  { code: 'B19019_004E', label: '3' }, { code: 'B19019_005E', label: '4' },
  { code: 'B19019_006E', label: '5' }, { code: 'B19019_007E', label: '6' },
  { code: 'B19019_008E', label: '7+' },
];

export function bracketIndexFor(income) {
  if (income == null) return -1;
  for (let i = 0; i < INCOME_BRACKETS.length; i++) {
    if (income < INCOME_BRACKETS[i].hi) return i;
  }
  return INCOME_BRACKETS.length - 1;
}

const money = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');

export function renderIncomeGrid(container, tables) {
  if (!container || !tables.B19019) return;
  const vars = tables.B19019.variables;
  const medians = SIZES.map((s) => vars[s.code]?.value ?? null);
  const valid = medians.filter((m) => m != null);
  const min = Math.min(...valid, Infinity), max = Math.max(...valid, -Infinity);
  const shade = (m) => {
    if (m == null || max === min) return 0.15;
    return 0.15 + 0.75 * ((m - min) / (max - min)); // 0.15..0.90 opacity
  };

  const header = `<th class="ig-corner">Household income ↓ / size →</th>` +
    SIZES.map((s) => `<th class="ig-size">${s.label}</th>`).join('');

  const body = INCOME_BRACKETS.map((b, bi) => {
    const cells = SIZES.map((s, si) => {
      const m = medians[si];
      const here = bracketIndexFor(m) === bi;
      return here
        ? `<td class="ig-cell ig-hit" style="--a:${shade(m).toFixed(2)}" title="${s.label}-person: ${money(m)}"><span>${money(m)}</span></td>`
        : `<td class="ig-cell"></td>`;
    }).join('');
    return `<tr><th class="ig-bracket">${b.label}</th>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="income-grid-card">
      <div class="chart-kicker">Income × household size</div>
      <h3>What each household size earns</h3>
      <div class="table-wrap"><table class="income-grid" role="img"
        aria-label="Median household income by household size">
        <thead><tr>${header}</tr></thead><tbody>${body}</tbody>
      </table></div>
      <p class="chart-caption">Each column marks where that household size's <strong>median income</strong>
        (Census table B19019) falls on the income scale. Larger households cluster higher.</p>
    </div>`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test site/js/income-grid.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Append grid styles to `site/styles.css`**

```css
/* ── Income × size grid ── */
.income-grid-card { border: 1px solid var(--line, #e5ddd3); border-radius: 14px; padding: 1.25rem; margin-bottom: 1rem; background: var(--paper, #fff); }
table.income-grid { border-collapse: collapse; width: 100%; font: 400 .8rem 'Public Sans', sans-serif; }
table.income-grid th, table.income-grid td { border: 1px solid var(--line, #eee3d6); padding: .35rem .4rem; text-align: center; }
table.income-grid .ig-corner, table.income-grid .ig-bracket { text-align: right; white-space: nowrap; color: var(--ink-soft, #6b625a); font-weight: 500; }
table.income-grid .ig-size { color: var(--ink-soft, #6b625a); font-weight: 600; }
table.income-grid .ig-cell { height: 1.6rem; }
table.income-grid .ig-hit { background: color-mix(in srgb, var(--terracotta) calc(var(--a) * 100%), transparent); }
table.income-grid .ig-hit span { font-weight: 600; color: var(--ink, #2b2621); white-space: nowrap; }
```

- [ ] **Step 6: Commit**

```bash
git add site/js/income-grid.js site/js/income-grid.test.mjs site/styles.css
git commit -m "Add income x household-size grid (B19019) to the explorer"
```

## Task 15: Block map (Leaflet)

**Files:**
- Create: `site/js/block-map.js`
- Modify: `site/index.html` (Leaflet CSS/JS + map card)
- Modify: `site/js/page.js` (call `renderBlockMap`)
- Modify: `site/styles.css` (map styles)

- [ ] **Step 1: Write `site/js/block-map.js`**

```js
// Draw the 76 selected Oakmont blocks over a free Carto light basemap with Leaflet.
// Leaflet is loaded globally (CDN) by index.html; this module reads window.L. Geometry is the
// committed site/blocks.geojson — no runtime call to TIGERweb.

export async function renderBlockMap() {
  const el = document.getElementById('block-map');
  if (!el || !window.L) return;
  const L = window.L;

  let geo;
  try {
    const res = await fetch('./blocks.geojson', { cache: 'force-cache' });
    if (!res.ok) throw new Error(String(res.status));
    geo = await res.json();
  } catch {
    el.innerHTML = '<p class="explorer-loading">Block map unavailable.</p>';
    return;
  }

  const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  const layer = L.geoJSON(geo, {
    style: { color: '#b5502e', weight: 1, fillColor: '#c96a44', fillOpacity: 0.35 },
    onEachFeature: (f, lyr) => {
      lyr.on('mouseover', () => lyr.setStyle({ fillOpacity: 0.6, weight: 2 }));
      lyr.on('mouseout', () => lyr.setStyle({ fillOpacity: 0.35, weight: 1 }));
    },
  }).addTo(map);

  map.fitBounds(layer.getBounds(), { padding: [16, 16] });
}
```

- [ ] **Step 2: Add Leaflet + the map card to `site/index.html`**

In `<head>`, after the `styles.css` link, add the pinned Leaflet CSS/JS (SRI hashes are Leaflet 1.9.4's published values):

```html
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
```

In the `block-panel` section, insert the map card right after the closing `</div>` of `block-panel-head` and before `block-kpis`:

```html
      <figure class="block-map-card">
        <div id="block-map" class="block-map"></div>
        <figcaption>The 76 census blocks selected to trace Oakmont's boundary, over an OpenStreetMap / CARTO basemap.</figcaption>
      </figure>
```

- [ ] **Step 3: Call `renderBlockMap` from `site/js/page.js`**

Inside the `if (data.oakmont2020 && document.getElementById('block-kpis'))` block, after `renderBlockSnapshot(data.oakmont2020);`, add:

```js
    const { renderBlockMap } = await import('./block-map.js');
    renderBlockMap();
```

- [ ] **Step 4: Append map styles to `site/styles.css`**

```css
/* ── Block map ── */
.block-map-card { margin: 1.5rem 0; }
.block-map { height: 420px; width: 100%; border-radius: 14px; border: 1px solid var(--line, #e5ddd3); }
.block-map-card figcaption { margin-top: .6rem; font: 400 .85rem 'Public Sans', sans-serif; color: var(--ink-soft, #6b625a); text-align: center; }
.leaflet-container { background: var(--wash, #faf6f0); font: inherit; }
```

- [ ] **Step 5: Verify no syntax errors**

Run: `node --check site/js/block-map.js && node --check site/js/page.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add site/js/block-map.js site/index.html site/js/page.js site/styles.css
git commit -m "Add Leaflet block map to the Oakmont-proper panel"
```

## Task 16: Median-age KPI on the ACS snapshot

**Files:**
- Modify: `site/js/snapshot.js`

- [ ] **Step 1: Swap the Age 85+ tile for Median age**

In `renderSnapshot`, in the `kpis` array, replace this line:

```js
    kpiTile('Age 85+', fmt(s.age85Plus), 'Residents', cd('age85Plus')),
```
with:
```js
    kpiTile('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years', cd('medianAge')),
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check site/js/snapshot.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add site/js/snapshot.js
git commit -m "Show Median age instead of Age 85+ on the ACS snapshot"
```

## Task 17: Median-age KPI on the block panel

**Files:**
- Modify: `site/js/block-snapshot.js`

- [ ] **Step 1: Swap the Age 85+ tile for Median age**

In `renderBlockSnapshot`, in the `block-kpis` array, replace:

```js
    kpiTile('Age 85+', fmt(s.age85Plus), 'Residents'),
```
with:
```js
    kpiTile('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years'),
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check site/js/block-snapshot.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add site/js/block-snapshot.js
git commit -m "Show Median age instead of Age 85+ on the block panel"
```

---

# Phase 3 — Integration, docs, verification

## Task 18: Full local build + browser smoke

**Files:** none (verification)

- [ ] **Step 1: Regenerate sample data and run the whole test suite**

Run: `node scripts/sample-data.mjs && node --test`
Expected: sample write logs; all test files PASS (aggregate, mirror, median-age, build-payload, format, income-grid).

- [ ] **Step 2: Serve the site and open it**

ES modules + `fetch('./data.json')` require a real HTTP server; `file://` will not work. On this box the Windows Store `python` stub is blocked, so use one of:

- `npx --yes serve site -l 8099` (needs npm/network), or
- run this dependency-free Node static server (background it), then open the page:

```bash
node -e '
const http=require("http"),fs=require("fs"),path=require("path");
const mt={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".geojson":"application/json",".svg":"image/svg+xml",".png":"image/png"};
http.createServer((req,res)=>{
  let fp=path.join("site",decodeURIComponent(req.url.split("?")[0]));
  if(!path.extname(fp)) fp=path.join(fp,"index.html");
  fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);return res.end("404");}
    res.writeHead(200,{"content-type":mt[path.extname(fp)]||"application/octet-stream"}); res.end(d); });
}).listen(8099,()=>console.log("serving on http://localhost:8099/"));
'
```

Open `http://localhost:8099/index.html` and confirm:
- The snapshot shows a **Median age** tile (value ~68) in place of Age 85+.
- The **Oakmont proper** panel shows the Leaflet map with shaded block polygons over the light basemap, and a **Median age** tile.
- Opening **Full data explorer** shows the income×size grid, a Featured row, a searchable catalog with "Hide empty tables" checked, and a working table view + CSV buttons.
- `http://localhost:8099/changes.html` shows Median age with a delta badge and the income×size grid in its explorer (no map).

- [ ] **Step 3: Commit any style tweaks made during the smoke (if needed)**

```bash
git add -A
git commit -m "Polish after local smoke test"
```

## Task 19: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the additions**

Add a section to `README.md` describing: (a) median age (ACS B01002 weighted; block grouped-median from P12 bands); (b) the block map (`fetch-block-geometry.mjs` → committed `site/blocks.geojson`, Leaflet + CARTO); (c) the income×size grid (B19019); (d) the full mirror — dynamic discovery from the API catalog, estimates-only, race-iterated included, medians population-weighted, per-section files under `site/explorer/` (gitignored, CI-generated), lazy-loaded by the explorer; and (e) that DHC block coverage is limited to block-published tables.

```markdown
## Data explorer & full mirror

The public snapshot reads the small committed `site/data.json`. The **Full data explorer**
lazy-loads a per-section mirror under `site/explorer/` (`acs2020.json`, `acs2024.json`,
`blocks2020.json`) — generated in CI, gitignored, never committed. `scripts/fetch-acs-mirror.mjs`
and `fetchBlockMirror()` discover every table from the Census API's own `groups.json`, pull each
whole with `get=group(ID)`, keep estimates only, sum counts, and population-weight medians/means.
Race-iterated tables are included; the explorer hides all-empty tables by default. DHC block
coverage is limited to the tables the Census publishes at block geography.

## Median age, block map, income×size grid

- Median age: ACS `B01002_001E` (population-weighted across tracts); blocks use a grouped median
  interpolated from the summed P12 age bands (`scripts/median-age.mjs`).
- Block map: `node scripts/fetch-block-geometry.mjs` writes `site/blocks.geojson` (committed) from
  TIGERweb; the page renders it with Leaflet over a CARTO light basemap.
- Income × household size: Census table `B19019`, rendered as a 2-axis grid in the explorer.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document mirror, median age, block map, and income grid"
```

## Task 20: Finish the branch

- [ ] **Step 1:** Confirm the working tree is clean and all tests pass.

Run: `node --test && git status --short`
Expected: tests PASS; `git status` shows only ignored `site/explorer/*.json` uncommitted (i.e. clean tracked tree).

- [ ] **Step 2:** Use superpowers:finishing-a-development-branch to decide merge/PR/cleanup with John.

---

## Self-review notes

- **Spec coverage:** median age (Tasks 4–6, 16–17), block map (Tasks 13, 15), income grid (Tasks 5, 14), full ACS mirror incl. race-iterated est-only (Tasks 2–3, 7, 9), block DHC mirror (Task 8), lazy per-section files + gitignore + samples (Tasks 9–11), explorer redesign (Task 12), build wiring + docs (Tasks 9, 18–19). All spec sections map to a task.
- **Aggregation heuristic**, **block-availability skip**, and **hide-empty default** are implemented in `aggregate.mjs`, `fetchBlockMirror`, and `explorer.js` respectively, matching the spec's caveats.
- **Naming consistency:** `shapeTable(concept, json, labels, weightByKey, rowKeyOf)`, `aggregate(label, values, weights)`, `groupedMedian(bands)`, `medianAgeFromP12(values)`, `fetchAcsMirror(year)`, `fetchBlockMirror()`, `renderExplorer(root, {explorerFile, featured, year})`, `renderIncomeGrid(container, tables)`, `renderBlockMap()`, `section.explorerFile` — used identically across tasks.
