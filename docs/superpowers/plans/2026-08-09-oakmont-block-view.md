# Exact-Oakmont 2020 Block View — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stacked "Oakmont Proper (2020 blocks)" panel to the 2020 landing page, built from 2020 decennial (DHC) data aggregated over the 90 hand-picked Oakmont blocks — the exact boundary, counts only.

**Architecture:** A frozen block list (`scripts/oakmont-blocks.json`) drives a new `fetch-blocks.mjs` that pulls DHC tables for those blocks, sums them, and produces an `oakmont2020` section in `site/data.json` with the same `{snapshot, groups}` shape as the ACS sections. The generic explorer is reused as-is; a new focused `renderBlockSnapshot` renders the decennial KPIs + age chart, reusing the existing chart primitives.

**Tech Stack:** Node 24 (ES modules, built-in `fetch`/`node --test`), static vanilla-JS front-end, GitHub Actions → Pages, `CENSUS_API_KEY` secret (already configured).

**Depends on:** Plan A (parameterized front-end + multi-section `data.json`). Build on the same branch `feat/2020-2024-comparison`.

**Exact DHC codes (verified against live `api.census.gov/data/2020/dec/dhc` metadata):**
- Dataset: `2020/dec/dhc`. Geography: `for=block:*&in=state:06 county:097 tract:{tract}` per tract, then filter to the frozen GEOIDs.
- Total pop: `P1_001N`.
- Sex by age `P12`: total `P12_001N`; Male `P12_002N` + bands `P12_003N`…`P12_025N`; Female `P12_026N` + bands `P12_027N`…`P12_049N`. **65+** = `P12_020N`+`_021N`+`_022N`+`_023N`+`_024N`+`_025N` + `_044N`+`_045N`+`_046N`+`_047N`+`_048N`+`_049N`. **85+** = `P12_025N`+`P12_049N`. **Under 18** = `P12_003N`+`_004N`+`_005N`+`_006N`+`_027N`+`_028N`+`_029N`+`_030N`.
- Race `P3`: `P3_001N` total, `_002N` White, `_003N` Black, `_004N` AIAN, `_005N` Asian, `_006N` NHPI, `_007N` Some other, `_008N` Two or more.
- Hispanic `P4`: `P4_001N` total, `_002N` Not Hispanic, `_003N` Hispanic.
- Total housing units `H1`: `H1_001N`.
- Occupancy `H3`: `H3_001N` total, `_002N` occupied, `_003N` vacant.
- Tenure `H4`: `H4_001N` total occupied, `_002N` owned with mortgage, `_003N` owned free and clear, `_004N` renter. Owner-occupied = `_002N`+`_003N`.

**`oakmont2020` section shape (added to `site/data.json`):**
```json
{ "vintage": "2020 Decennial (DHC)",
  "geography": "76 selected census blocks, Oakmont, Sonoma County, CA",
  "snapshot": { "totalPopulation": 0, "age65Plus": 0, "age85Plus": 0, "pct65Plus": 0,
                "totalHousingUnits": 0, "occupiedUnits": 0, "vacantUnits": 0,
                "ownerOccupied": 0, "renterOccupied": 0, "ownerOccupiedPct": 0,
                "whiteAlonePct": 0, "hispanicPct": 0 },
  "groups": { "age": {}, "race": {}, "hispanic": {}, "housing": {} } }
```

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/oakmont-blocks.json` | (exists) Commit | Frozen 90 Oakmont block GEOIDs + provenance. |
| `scripts/decennial-variables.mjs` | Create | DHC geo config, the four variable groups with labels, and 65+/85+/under-18 band code lists. |
| `scripts/build-payload.mjs` | Modify | Add `buildBlockSection(values)`; extend `assembleData` to include `oakmont2020`. |
| `scripts/build-payload.test.mjs` | Modify | Tests for `buildBlockSection` + the extended `assembleData`. |
| `scripts/fetch-blocks.mjs` | Create | `fetchBlockValues()` — DHC pull for the frozen blocks, summed. |
| `scripts/fetch-census.mjs` | Modify | Call `fetchBlockValues()` and pass the block section into `assembleData`. |
| `scripts/sample-data.mjs` | Modify | Stub `oakmont2020` for offline preview. |
| `site/js/block-snapshot.js` | Create | `renderBlockSnapshot(section)` — decennial KPIs + age chart + tenure, reusing `charts.js`. |
| `site/js/page.js` | Modify | After the ACS section, render the block panel if `data.oakmont2020` exists. |
| `site/index.html` | Modify | Add the stacked `.block-panel` section (own KPI/chart/method/explorer containers). |
| `site/styles.css` | Modify | Block-panel styling. |
| `README.md` | Modify | Sweep the two stale "2023" references (carried over from Plan A review). |

**Test command:** `node --test scripts/build-payload.test.mjs site/js/format.test.mjs`
**Offline preview:** `node scripts/sample-data.mjs` then serve `site/`.

---

## Task 1: Commit the frozen block list

**Files:** `scripts/oakmont-blocks.json` (already written)

- [ ] **Step 1: Sanity-check the file**

Run: `node -e "const b=require('./scripts/oakmont-blocks.json'); console.log(b.geoids.length, new Set(b.geoids).size, b.tigerwebTotals)"`
Expected: `76 76 { note: ..., blocks: 76, population: 4994, housingUnits: 3451 }` (76 unique GEOIDs).

- [ ] **Step 2: Commit**

```bash
git add scripts/oakmont-blocks.json
git commit -m "Add frozen Oakmont block list for the exact-boundary view"
```

---

## Task 2: Decennial variable definitions

**Files:** Create `scripts/decennial-variables.mjs`

- [ ] **Step 1: Write the module**

```js
// Single source of truth for the 2020 Decennial (DHC) data used by the exact-Oakmont block view.
// Geography is the frozen block list in oakmont-blocks.json; all variables are 100% counts.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DEC_GEO = {
  dataset: '2020/dec/dhc',
  state: '06',
  county: '097',
  tracts: ['151601', '151602'],
};

export async function loadBlockGeoids() {
  const raw = JSON.parse(await readFile(join(here, 'oakmont-blocks.json'), 'utf8'));
  return new Set(raw.geoids);
}

// Age band code groups (Male + Female), used to derive snapshot figures.
export const AGE_65_PLUS = ['P12_020N','P12_021N','P12_022N','P12_023N','P12_024N','P12_025N',
                            'P12_044N','P12_045N','P12_046N','P12_047N','P12_048N','P12_049N'];
export const AGE_85_PLUS = ['P12_025N','P12_049N'];
export const AGE_UNDER_18 = ['P12_003N','P12_004N','P12_005N','P12_006N',
                             'P12_027N','P12_028N','P12_029N','P12_030N'];

export const DEC_GROUPS = {
  age: {
    label: 'Age & Sex (2020)',
    totalKey: 'P12_001N',
    variables: {
      'P12_001N': 'Total Population', 'P12_002N': 'Male - Total',
      'P12_003N': 'Male - Under 5 years', 'P12_004N': 'Male - 5 to 9 years',
      'P12_005N': 'Male - 10 to 14 years', 'P12_006N': 'Male - 15 to 17 years',
      'P12_007N': 'Male - 18 and 19 years', 'P12_008N': 'Male - 20 years',
      'P12_009N': 'Male - 21 years', 'P12_010N': 'Male - 22 to 24 years',
      'P12_011N': 'Male - 25 to 29 years', 'P12_012N': 'Male - 30 to 34 years',
      'P12_013N': 'Male - 35 to 39 years', 'P12_014N': 'Male - 40 to 44 years',
      'P12_015N': 'Male - 45 to 49 years', 'P12_016N': 'Male - 50 to 54 years',
      'P12_017N': 'Male - 55 to 59 years', 'P12_018N': 'Male - 60 and 61 years',
      'P12_019N': 'Male - 62 to 64 years', 'P12_020N': 'Male - 65 and 66 years',
      'P12_021N': 'Male - 67 to 69 years', 'P12_022N': 'Male - 70 to 74 years',
      'P12_023N': 'Male - 75 to 79 years', 'P12_024N': 'Male - 80 to 84 years',
      'P12_025N': 'Male - 85 years and over', 'P12_026N': 'Female - Total',
      'P12_027N': 'Female - Under 5 years', 'P12_028N': 'Female - 5 to 9 years',
      'P12_029N': 'Female - 10 to 14 years', 'P12_030N': 'Female - 15 to 17 years',
      'P12_031N': 'Female - 18 and 19 years', 'P12_032N': 'Female - 20 years',
      'P12_033N': 'Female - 21 years', 'P12_034N': 'Female - 22 to 24 years',
      'P12_035N': 'Female - 25 to 29 years', 'P12_036N': 'Female - 30 to 34 years',
      'P12_037N': 'Female - 35 to 39 years', 'P12_038N': 'Female - 40 to 44 years',
      'P12_039N': 'Female - 45 to 49 years', 'P12_040N': 'Female - 50 to 54 years',
      'P12_041N': 'Female - 55 to 59 years', 'P12_042N': 'Female - 60 and 61 years',
      'P12_043N': 'Female - 62 to 64 years', 'P12_044N': 'Female - 65 and 66 years',
      'P12_045N': 'Female - 67 to 69 years', 'P12_046N': 'Female - 70 to 74 years',
      'P12_047N': 'Female - 75 to 79 years', 'P12_048N': 'Female - 80 to 84 years',
      'P12_049N': 'Female - 85 years and over',
    },
  },
  race: {
    label: 'Race (2020)',
    totalKey: 'P3_001N',
    variables: {
      'P3_001N': 'Total Population', 'P3_002N': 'White alone',
      'P3_003N': 'Black or African American alone', 'P3_004N': 'American Indian and Alaska Native alone',
      'P3_005N': 'Asian alone', 'P3_006N': 'Native Hawaiian and Other Pacific Islander alone',
      'P3_007N': 'Some Other Race alone', 'P3_008N': 'Two or More Races',
    },
  },
  hispanic: {
    label: 'Hispanic or Latino Origin (2020)',
    totalKey: 'P4_001N',
    variables: {
      'P4_001N': 'Total Population', 'P4_002N': 'Not Hispanic or Latino',
      'P4_003N': 'Hispanic or Latino',
    },
  },
  housing: {
    label: 'Housing (2020)',
    totalKey: 'H1_001N',
    variables: {
      'H1_001N': 'Total Housing Units', 'H3_002N': 'Occupied', 'H3_003N': 'Vacant',
      'H4_002N': 'Owner-occupied, with a mortgage or loan', 'H4_003N': 'Owner-occupied, free and clear',
      'H4_004N': 'Renter-occupied',
    },
  },
};

// Every variable code the fetch needs (deduped).
export const DEC_VARS = [...new Set(Object.values(DEC_GROUPS).flatMap((g) => Object.keys(g.variables)))];
```

- [ ] **Step 2: Verify it parses and lists the vars**

Run: `node -e "import('./scripts/decennial-variables.mjs').then(m=>console.log(m.DEC_VARS.length, m.AGE_65_PLUS.length, m.DEC_GEO.dataset))"`
Expected: `61 12 2020/dec/dhc` (61 unique variable codes).

- [ ] **Step 3: Commit**

```bash
git add scripts/decennial-variables.mjs
git commit -m "Add 2020 DHC variable definitions for the block view"
```

---

## Task 3: buildBlockSection + assembleData extension (TDD)

**Files:** Modify `scripts/build-payload.mjs`, `scripts/build-payload.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `scripts/build-payload.test.mjs`:

```js
import { buildBlockSection } from './build-payload.mjs';

test('buildBlockSection derives 65+/85+/tenure from summed DHC values', () => {
  const v = {
    P1_001N: 5000, P12_001N: 5000,
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/build-payload.test.mjs`
Expected: FAIL — `buildBlockSection` not exported.

- [ ] **Step 3: Implement `buildBlockSection` and extend `assembleData`**

Add to the top imports of `scripts/build-payload.mjs`:

```js
import { DEC_GROUPS, AGE_65_PLUS, AGE_85_PLUS } from './decennial-variables.mjs';
```

Append `buildBlockSection`:

```js
export function buildBlockSection(values) {
  const v = (k) => (values[k] ?? null);
  const sum = (codes) => codes.reduce((a, c) => a + (values[c] || 0), 0);
  const pct = (num, den) => (den && num != null ? Number(((num / den) * 100).toFixed(1)) : null);

  const owner = sum(['H4_002N', 'H4_003N']);
  const renter = v('H4_004N') || 0;
  const totalPop = v('P1_001N');

  const groups = {};
  for (const [gid, g] of Object.entries(DEC_GROUPS)) {
    groups[gid] = { label: g.label, totalKey: g.totalKey, variables: {} };
    for (const [code, label] of Object.entries(g.variables)) {
      groups[gid].variables[code] = { label, value: values[code] ?? null };
    }
  }

  return {
    vintage: '2020 Decennial (DHC)',
    geography: '76 selected census blocks, Oakmont, Sonoma County, CA',
    snapshot: {
      totalPopulation: totalPop,
      age65Plus: sum(AGE_65_PLUS),
      age85Plus: sum(AGE_85_PLUS),
      pct65Plus: pct(sum(AGE_65_PLUS), totalPop),
      totalHousingUnits: v('H1_001N'),
      occupiedUnits: v('H3_002N'),
      vacantUnits: v('H3_003N'),
      ownerOccupied: owner,
      renterOccupied: renter,
      ownerOccupiedPct: pct(owner, owner + renter),
      whiteAlonePct: pct(v('P3_002N'), v('P3_001N')),
      hispanicPct: pct(v('P4_003N'), v('P4_001N')),
    },
    groups,
  };
}
```

Change `assembleData` to accept and include the block section (new optional third-key). Replace the existing `assembleData` with:

```js
export function assembleData(sections, { sample = false, oakmont2020 = null } = {}) {
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
  return data;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test scripts/build-payload.test.mjs`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-payload.mjs scripts/build-payload.test.mjs
git commit -m "Add buildBlockSection and oakmont2020 assembly with tests"
```

---

## Task 4: fetch-blocks.mjs (DHC pull for the frozen blocks)

**Files:** Create `scripts/fetch-blocks.mjs`

- [ ] **Step 1: Write the module**

```js
// Fetch 2020 DHC data for the frozen Oakmont blocks and sum each variable across them.
// Runs in GitHub Actions with CENSUS_API_KEY. Keyless DHC data requests return a "Missing Key"
// HTML page, so a key is required in CI; the non-JSON guard surfaces key problems in the log.

import { DEC_GEO, DEC_VARS, loadBlockGeoids } from './decennial-variables.mjs';

const API_KEY = (process.env.CENSUS_API_KEY || '').trim();
const CHUNK_SIZE = 45; // Census caps ~50 vars/request; leaves room for GEO fields.

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchBlockValues() {
  const geoids = await loadBlockGeoids();
  const keyParam = API_KEY ? `&key=${API_KEY}` : '';
  const values = {};

  for (const tract of DEC_GEO.tracts) {
    for (const varChunk of chunk(DEC_VARS, CHUNK_SIZE)) {
      const getStr = varChunk.join(',');
      const url =
        `https://api.census.gov/data/${DEC_GEO.dataset}?get=${getStr}` +
        `&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${keyParam}`;
      const res = await fetch(url);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        const title = (text.match(/<title>(.*?)<\/title>/i) || [])[1] || text.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(`DHC returned non-JSON, likely an API key problem. Response said: "${title}"`);
      }
      const headers = json[0];
      const iState = headers.indexOf('state'), iCounty = headers.indexOf('county'),
            iTract = headers.indexOf('tract'), iBlock = headers.indexOf('block');
      for (const row of json.slice(1)) {
        const geoid = row[iState] + row[iCounty] + row[iTract] + row[iBlock];
        if (!geoids.has(geoid)) continue;
        for (const code of varChunk) {
          const idx = headers.indexOf(code);
          if (idx === -1) continue;
          const n = parseInt(row[idx], 10);
          if (!isNaN(n) && n >= 0) values[code] = (values[code] || 0) + n;
        }
      }
    }
  }
  return values;
}
```

- [ ] **Step 2: Verify it parses**

Run: `node --check scripts/fetch-blocks.mjs`
Expected: exit 0. (A live pull needs the key; real data is verified in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-blocks.mjs
git commit -m "Add fetch-blocks: DHC pull summed over the Oakmont blocks"
```

---

## Task 5: Wire the block section into the build

**Files:** Modify `scripts/fetch-census.mjs`

- [ ] **Step 1: Import the block fetch + builder**

Add to the imports:

```js
import { fetchBlockValues } from './fetch-blocks.mjs';
import { buildBlockSection } from './build-payload.mjs';
```

(Extend the existing `build-payload.mjs` import if cleaner: add `buildBlockSection` there.)

- [ ] **Step 2: Fetch blocks and pass into assembleData in `main()`**

In `main()`, after the ACS year loop builds `sections`, and before `assembleData`, add:

```js
  console.log('Fetching 2020 DHC for the Oakmont blocks');
  const blockValues = await fetchBlockValues();
  const oakmont2020 = buildBlockSection(blockValues);
  console.log(`  Oakmont blocks: population ${oakmont2020.snapshot.totalPopulation}, ${oakmont2020.snapshot.pct65Plus}% age 65+`);
```

Change the assemble call to:

```js
  const data = assembleData(sections, { oakmont2020 });
```

- [ ] **Step 3: Verify parse**

Run: `node --check scripts/fetch-census.mjs`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-census.mjs
git commit -m "Bake the oakmont2020 block section into data.json"
```

---

## Task 6: Sample data stub for the block section

**Files:** Modify `scripts/sample-data.mjs`

- [ ] **Step 1: Build a placeholder block section**

Add near the other imports:

```js
import { buildBlockSection } from './build-payload.mjs';
import { DEC_GROUPS, AGE_65_PLUS } from './decennial-variables.mjs';
```

Before the `assembleData` call, build sample decennial values (skewed old, mostly owner-occupied, ~96% White):

```js
const decValues = { P1_001N: 4994, P12_001N: 4994, P3_001N: 4994, P3_002N: 4790,
  P4_001N: 4994, P4_002N: 4810, P4_003N: 184, H1_001N: 3451, H3_002N: 3130, H3_003N: 321,
  H4_002N: 1540, H4_003N: 1390, H4_004N: 200 };
for (const c of AGE_65_PLUS) decValues[c] = 300;             // heavy 65+ presence
for (const g of Object.values(DEC_GROUPS)) for (const c of Object.keys(g.variables)) {
  if (decValues[c] == null) decValues[c] = 40;               // fill remaining bands
}
const oakmont2020 = buildBlockSection(decValues);
```

Change the `assembleData` call to pass it:

```js
const data = assembleData(
  { '2020': buildAcsSection('2020', values2020), '2024': buildAcsSection('2024', values2024) },
  { sample: true, oakmont2020 }
);
```

- [ ] **Step 2: Verify shape**

Run: `node scripts/sample-data.mjs` then
`node -e "const j=require('./site/data.json'); console.log(Object.keys(j), j.oakmont2020.snapshot.totalPopulation, j.oakmont2020.snapshot.pct65Plus)"`
Expected: keys include `oakmont2020`; population `4994`; a plausible `pct65Plus`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-data.mjs site/data.json
git commit -m "Add sample data for the Oakmont block section"
```

---

## Task 7: Block-panel renderer

**Files:** Create `site/js/block-snapshot.js`

- [ ] **Step 1: Write the renderer (reuses `charts.js` primitives)**

```js
// Renders the exact-Oakmont block panel: decennial KPI tiles, an age chart, and a tenure bar.
// Reads the oakmont2020 section (2020 DHC counts). Reuses the shared chart primitives.

import { fmt, pct } from './format.js';
import { horizontalBars, stackedBar, wireTooltips } from './charts.js';

const AGE_BUCKETS = [
  { label: 'Under 18', codes: ['P12_003N','P12_004N','P12_005N','P12_006N','P12_027N','P12_028N','P12_029N','P12_030N'] },
  { label: '18-34', codes: ['P12_007N','P12_008N','P12_009N','P12_010N','P12_011N','P12_012N','P12_031N','P12_032N','P12_033N','P12_034N','P12_035N','P12_036N'] },
  { label: '35-54', codes: ['P12_013N','P12_014N','P12_015N','P12_016N','P12_037N','P12_038N','P12_039N','P12_040N'] },
  { label: '55-64', codes: ['P12_017N','P12_018N','P12_019N','P12_041N','P12_042N','P12_043N'] },
  { label: '65-74', codes: ['P12_020N','P12_021N','P12_022N','P12_044N','P12_045N','P12_046N'] },
  { label: '75-84', codes: ['P12_023N','P12_024N','P12_047N','P12_048N'] },
  { label: '85+', codes: ['P12_025N','P12_049N'] },
];

const val = (group, code) => (group?.variables?.[code]?.value ?? null);
const sum = (group, codes) => codes.reduce((a, c) => a + (val(group, c) || 0), 0);

function kpiTile(label, value, sub) {
  return `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

export function renderBlockSnapshot(section) {
  const s = section.snapshot;
  const g = section.groups;

  document.getElementById('block-kpis').innerHTML = [
    kpiTile('Population', fmt(s.totalPopulation), 'Exact boundary'),
    kpiTile('Age 65+', pct(s.pct65Plus), 'Of residents'),
    kpiTile('Age 85+', fmt(s.age85Plus), 'Residents'),
    kpiTile('Housing units', fmt(s.totalHousingUnits), 'All units'),
    kpiTile('Owner-occupied', pct(s.ownerOccupiedPct), 'Of occupied homes'),
    kpiTile('Hispanic or Latino', pct(s.hispanicPct), 'Of residents'),
  ].join('');

  const ageItems = AGE_BUCKETS.map((b) => ({ label: b.label, value: sum(g.age, b.codes) }));
  const tenureLegend = `<div class="legend-row">
    <span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span>
    <span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span>
  </div>`;

  const charts = document.getElementById('block-charts');
  charts.innerHTML =
    `<div class="chart-card reveal"><div class="chart-kicker">Residents by age</div><h3>An older community, precisely drawn</h3>` +
    horizontalBars({ items: ageItems, ariaLabel: 'Population by age bucket' }) +
    `<p class="chart-caption"><strong>${pct(s.pct65Plus)}</strong> of residents in Oakmont's exact boundary are 65 or older.</p></div>` +
    `<div class="chart-card reveal"><div class="chart-kicker">How homes are held</div><h3>Owners vs. renters</h3>` +
    stackedBar({ segments: [
      { label: 'Owner-occupied', value: s.ownerOccupied, color: 'var(--terracotta)' },
      { label: 'Renter-occupied', value: s.renterOccupied, color: 'var(--teal)' },
    ], ariaLabel: 'Owner vs renter occupied homes' }) +
    tenureLegend +
    `<p class="chart-caption"><strong>${pct(s.ownerOccupiedPct)}</strong> of occupied homes are owner-occupied.</p></div>`;
  wireTooltips(charts);

  document.getElementById('block-method-note').innerHTML =
    `<strong>Exact boundary.</strong> These figures are the 2020 Decennial Census (100% count) summed over ${fmt(76)} ` +
    `census blocks hand-selected to match Oakmont's community boundary — tighter than the two-tract approximation above. ` +
    `Decennial data is counts only (no income, education, or home values); small block-level differential-privacy noise averages out across the blocks.`;
}
```

- [ ] **Step 2: Verify parse**

Run: `node --check site/js/block-snapshot.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add site/js/block-snapshot.js
git commit -m "Add block-panel renderer for the exact-Oakmont view"
```

---

## Task 8: Block panel markup + page wiring + styles

**Files:** Modify `site/index.html`, `site/js/page.js`, `site/styles.css`

- [ ] **Step 1: Add the block panel to `index.html`**

Immediately after the `.explorer-section` block (before `</main>`), add:

```html
    <section class="block-panel" aria-label="Oakmont proper, 2020 blocks">
      <div class="block-panel-head">
        <p class="kicker">The exact boundary · 2020 Decennial Census</p>
        <h2>Oakmont <em>proper</em></h2>
        <p class="lead">The same community drawn to its actual block boundary — 100% counts, no survey estimation.</p>
      </div>
      <div class="kpi-grid" id="block-kpis"></div>
      <div class="chart-grid" id="block-charts"></div>
      <p class="method-note" id="block-method-note"></p>
      <div class="explorer-section">
        <button class="explorer-toggle" id="block-explorer-toggle" aria-expanded="false" aria-controls="block-explorer">
          <span class="explorer-toggle-label">Full block-level explorer</span>
          <span class="explorer-toggle-sub">Every 2020 decennial variable, sortable, with CSV export</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        <div class="explorer" id="block-explorer" hidden></div>
      </div>
    </section>
```

- [ ] **Step 2: Wire the panel in `page.js`**

In `initPage`, after `renderSnapshot(section, meta, { compare });` and before the explorer toggle wiring, add the block panel (only on the page that has it and when data is present):

```js
  if (data.oakmont2020 && document.getElementById('block-kpis')) {
    const { renderBlockSnapshot } = await import('./block-snapshot.js');
    renderBlockSnapshot(data.oakmont2020);
    const bToggle = document.getElementById('block-explorer-toggle');
    const bPanel = document.getElementById('block-explorer');
    let bBuilt = false;
    bToggle.addEventListener('click', () => {
      const open = bToggle.getAttribute('aria-expanded') === 'true';
      bToggle.setAttribute('aria-expanded', String(!open));
      bPanel.hidden = open;
      if (!open && !bBuilt) { renderExplorer(bPanel, data.oakmont2020); bBuilt = true; }
    });
  }
```

(`renderExplorer` is already imported in `page.js`.)

- [ ] **Step 3: Style the block panel**

Append to `site/styles.css`:

```css
.block-panel { max-width: 1080px; margin: 0 auto; padding: 3rem 1.5rem 1rem; border-top: 1px solid var(--line, #e4dbcf); }
.block-panel-head { margin-bottom: 1.5rem; }
.block-panel-head h2 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(1.8rem, 4vw, 2.6rem); margin: .2rem 0; }
.block-panel-head h2 em { color: var(--terracotta); font-style: italic; }
```

- [ ] **Step 4: Verify in a browser (sample data)**

`node scripts/sample-data.mjs`, serve `site/`, open `/`. Confirm: the "Oakmont proper" panel renders below the ACS explorer with its 6 KPIs, age + tenure charts, method note, and a working block explorer (CSV filenames `oakmont_undefined_*`? no — the block section has no `year`; the explorer CSV name uses `section.year`). NOTE: the oakmont2020 section has no `year` field, so `renderExplorer`'s CSV filename would read `oakmont_undefined_*`. Fix in Step 5.

- [ ] **Step 5: Give the block section a `year` for the explorer CSV name**

In `buildBlockSection` (build-payload.mjs) add `year: '2020-blocks'` to the returned object so `renderExplorer`'s `oakmont_${section.year}_*.csv` reads `oakmont_2020-blocks_*.csv`. Re-run `node scripts/sample-data.mjs` and re-check the browser download name.

- [ ] **Step 6: Commit**

```bash
git add site/index.html site/js/page.js site/styles.css scripts/build-payload.mjs
git commit -m "Render the stacked Oakmont-proper block panel on the 2020 page"
```

---

## Task 9: Docs sweep, full test, keyed verification, deploy

**Files:** `README.md` (+ verification)

- [ ] **Step 1: Sweep stale 2023 wording in README**

Update `README.md:4` and `README.md:82` (the "2023 ACS 5-Year" / "2023 American Community Survey" references) to describe the current 2020↔2024 comparison + the exact-Oakmont block view. Commit:

```bash
git add README.md
git commit -m "Update README for the 2020/2024 comparison and block view"
```

- [ ] **Step 2: Full logic test suite**

Run: `node --test scripts/build-payload.test.mjs site/js/format.test.mjs`
Expected: all pass.

- [ ] **Step 3: Keyed verification (John) — confirm real DHC block data**

Because `CENSUS_API_KEY` is a CI secret, trigger the "Build and deploy" workflow manually (`workflow_dispatch`) from the Actions tab on `feat/2020-2024-comparison` **or** run locally if John exports the key: `CENSUS_API_KEY=... node scripts/fetch-census.mjs`. Confirm the log shows a non-null Oakmont block population near ~4,994 and a high `% age 65+`. **This must pass before merging** — it's the first time the DHC block pull runs for real.

- [ ] **Step 4: Deploy**

Deploy = push `main` (John's call). Merge `feat/2020-2024-comparison` to `main` and push; confirm `https://census.jrow3.com/` shows the ACS 2020 portrait, the stacked Oakmont-proper block panel, and `/changes.html` shows 2024 deltas.

---

## Self-Review (planner)

- **Spec coverage:** exact-OVA block view via decennial blocks → Tasks 2–7; stacked panel + snapshot + full explorer → Tasks 7–8; honest method note (decennial, DP noise, exact boundary) → Task 7; frozen block set → Task 1; retire 2023 (README) → Task 9.
- **Placeholder scan:** none — all variable codes are the verified real DHC codes; every code step shows full code.
- **Type consistency:** `buildBlockSection(values)→{vintage,geography,year,snapshot,groups}`, `assembleData(sections,{sample,oakmont2020})`, `fetchBlockValues()→{code:sum}`, `renderBlockSnapshot(section)` reading `block-kpis`/`block-charts`/`block-method-note`, `renderExplorer(root, section)` reused unchanged. Section key `oakmont2020` consistent across pipeline, sample data, and `page.js`.
