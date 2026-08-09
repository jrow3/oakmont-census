# Oakmont 2020↔2024 ACS Comparison — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-vintage (2023) Oakmont census site into a two-page comparison — a 2020 ACS portrait (landing) and a 2024 ACS "what changed" page — baked from one build.

**Architecture:** `fetch-census.mjs` fetches ACS 5-year for two years (2020, 2024) and writes both into one `site/data.json` under `acs2020` / `acs2024` sections. The front-end renderers are parameterized by data section so each HTML page renders its own year; the 2024 page also shows per-KPI deltas vs 2020. No new runtime dependencies.

**Tech Stack:** Node 24 (ES modules, built-in `fetch` and `node --test`), static HTML/CSS/vanilla-JS front-end, GitHub Actions → Pages.

**Scope note:** The exact-Oakmont decennial *block* view is **Plan B** (see `## Follow-on: Plan B` at the end). This plan adds only the `acs2020`/`acs2024` sections; Plan B later adds an `oakmont2020` section without changing anything here.

**Data shape produced by this plan (`site/data.json`):**
```json
{
  "meta": { "geography": "...", "generatedAt": "ISO", "sample": false },
  "acs2020": { "year": "2020", "source": "...", "snapshot": {}, "groups": {} },
  "acs2024": { "year": "2024", "source": "...", "snapshot": {}, "groups": {} }
}
```

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `scripts/census-variables.mjs` | Modify | Add `ACS_YEARS`; stop hardcoding a single year in `GEO`. |
| `scripts/build-payload.mjs` | Modify | Add side-effect-free `buildAcsSection(year, values)` and `assembleData(sections, opts)`. Existing `buildSnapshot`/`buildGroups` unchanged. |
| `scripts/build-payload.test.mjs` | Create | Unit tests for `buildAcsSection`, `assembleData`, characterization of `buildSnapshot`. |
| `scripts/fetch-census.mjs` | Modify | `fetchAllValues(year)`; `main()` loops `ACS_YEARS`, assembles both sections, writes `data.json`. |
| `scripts/sample-data.mjs` | Modify | Emit both sections (2024 slightly higher than 2020 so deltas are visible offline). |
| `site/js/format.js` | Modify | Add pure `formatDelta(current, prior)`. |
| `site/js/format.test.mjs` | Create | Unit tests for `formatDelta`. |
| `site/js/snapshot.js` | Modify | `renderSnapshot(section, meta, opts)`; year-driven text; optional delta badges. |
| `site/js/explorer.js` | Modify | `renderExplorer(root, section)`; year in CSV filenames. |
| `site/js/page.js` | Create | Shared `initPage({ section, compareTo })` bootstrap (was `app.js`). |
| `site/js/app.js` | Delete | Superseded by `page.js` + per-page inline bootstrap. |
| `site/index.html` | Modify | 2020 landing: dynamic badge/geo, masthead nav, inline `initPage({section:'acs2020'})`. |
| `site/changes.html` | Create | 2024 page: `initPage({section:'acs2024', compareTo:'acs2020'})`, nav, delta KPIs. |

**Test commands (no install needed):**
- Logic tests: `node --test scripts/build-payload.test.mjs site/js/format.test.mjs`
- Offline preview data: `node scripts/sample-data.mjs`
- Local server for browser checks: `node --run` is unavailable; use `npx --yes serve site` **or** `python -m http.server 8000 --directory site` then open `http://localhost:8000/`.

---

## Task 1: Multi-year ACS config

**Files:**
- Modify: `scripts/census-variables.mjs:6-12`

- [ ] **Step 1: Add `ACS_YEARS`, drop the single hardcoded year from `GEO`**

Replace the `GEO` export (lines 6–12) with:

```js
export const GEO = {
  state: '06',   // California
  county: '097', // Sonoma County
  tracts: ['151601', '151602'], // Oakmont Village census tracts 1516.01 + 1516.02
  popVar: 'B01001_001E',        // total population, used to weight medians
};

// ACS 5-year vintages to fetch. 2016–2020 is the baseline; 2020–2024 is the current view.
// The two windows share 2020, so change between them is directional (see method notes).
export const ACS_YEARS = ['2020', '2024'];
```

- [ ] **Step 2: Verify it parses and exports both**

Run: `node -e "import('./scripts/census-variables.mjs').then(m=>console.log(m.ACS_YEARS, m.GEO.tracts))"`
Expected: `[ '2020', '2024' ] [ '151601', '151602' ]`

- [ ] **Step 3: Commit**

```bash
git add scripts/census-variables.mjs
git commit -m "Add ACS_YEARS config for multi-year fetch"
```

---

## Task 2: Section + assembly helpers in build-payload

**Files:**
- Modify: `scripts/build-payload.mjs` (add two exports at end)
- Test: `scripts/build-payload.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/build-payload.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/build-payload.test.mjs`
Expected: FAIL — `buildAcsSection`/`assembleData` are not exported.

- [ ] **Step 3: Add the two helpers**

Append to `scripts/build-payload.mjs`:

```js
export function buildAcsSection(year, values) {
  return {
    year,
    source: `U.S. Census Bureau, ${year} ACS 5-Year Estimates`,
    snapshot: buildSnapshot(values),
    groups: buildGroups(values),
  };
}

export function assembleData(sections, { sample = false } = {}) {
  return {
    meta: {
      geography: 'Census Tracts 1516.01 + 1516.02, Sonoma County, CA',
      generatedAt: new Date().toISOString(),
      sample,
    },
    acs2020: sections['2020'],
    acs2024: sections['2024'],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/build-payload.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-payload.mjs scripts/build-payload.test.mjs
git commit -m "Add buildAcsSection and assembleData helpers with tests"
```

---

## Task 3: Fetch both ACS years into one data.json

**Files:**
- Modify: `scripts/fetch-census.mjs:52-115`

- [ ] **Step 1: Parameterize `fetchAllValues` by year**

In `scripts/fetch-census.mjs`, change the signature and the URL line. Replace `async function fetchAllValues() {` (line 52) with `async function fetchAllValues(year) {`, and inside it replace the two `GEO.year` uses in the URL with `year`:

```js
    const url =
      `https://api.census.gov/data/${year}/acs/acs5?get=${getStr}` +
      `&for=tract:${tractStr}&in=state:${GEO.state}+county:${GEO.county}${keyParam}`;
```

- [ ] **Step 2: Rewrite `main()` to loop years and assemble**

Replace the whole `main()` function (lines 92–110) with:

```js
async function main() {
  const sections = {};
  for (const year of ACS_YEARS) {
    console.log(`Fetching ACS ${year} 5-year for tracts ${GEO.tracts.join(', ')} ${API_KEY ? '(with key)' : '(no key)'}`);
    const values = await fetchAllValues(year);
    sections[year] = buildAcsSection(year, values);
    console.log(`  ${year}: population ${sections[year].snapshot.totalPopulation}, median HH income $${sections[year].snapshot.medianHouseholdIncome}`);
  }

  const data = assembleData(sections);
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}
```

- [ ] **Step 3: Fix the imports**

Change the imports near the top (lines 10–11) to pull in the new helpers and `ACS_YEARS`:

```js
import { GEO, MEDIAN_VARS, GROUPS, ACS_YEARS } from './census-variables.mjs';
import { buildGroups, buildSnapshot, buildAcsSection, assembleData } from './build-payload.mjs';
```

(`buildGroups`/`buildSnapshot` may now be unused here — remove them from this import if so; `aggregate` still uses `MEDIAN_VARS`.)

- [ ] **Step 4: Verify the file parses**

Run: `node --check scripts/fetch-census.mjs`
Expected: no output, exit 0. (A live fetch needs the API key, so real output is verified in CI / via the workflow — see Task 9.)

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-census.mjs
git commit -m "Fetch ACS 2020 and 2024 into a single data.json"
```

---

## Task 4: Sample data for both years (offline preview)

**Files:**
- Modify: `scripts/sample-data.mjs`

- [ ] **Step 1: Emit two sections with a visible delta**

Replace the final `const data = {…}; await writeFile(…)` block (from `const data = {` to the final `console.log`) with a version that builds both years. Insert a scale helper before it and reuse the existing `values` map for 2024, a scaled-down copy for 2020:

```js
import { buildAcsSection, assembleData } from './build-payload.mjs';

// `values` (built above) is the 2024 sample. Make a 2020 sample ~6% smaller on counts and
// medians so the 2024 page shows non-zero deltas in offline preview.
const values2024 = values;
const values2020 = Object.fromEntries(
  Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 0.94) : v])
);

const data = assembleData(
  { '2020': buildAcsSection('2020', values2020), '2024': buildAcsSection('2024', values2024) },
  { sample: true }
);

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Wrote sample ${OUT_PATH} (population 2020 ${data.acs2020.snapshot.totalPopulation}, 2024 ${data.acs2024.snapshot.totalPopulation})`);
```

Remove the now-unused old imports of `buildGroups`/`buildSnapshot` from `build-payload.mjs` in this file if they are no longer referenced (they are not, after this change).

- [ ] **Step 2: Run it and inspect the shape**

Run: `node scripts/sample-data.mjs`
Expected: prints two populations (2020 lower than 2024).
Run: `node -e "const d=require('fs').readFileSync('site/data.json','utf8');const j=JSON.parse(d);console.log(Object.keys(j),j.acs2020.year,j.acs2024.year,j.meta.sample)"`
Expected: `[ 'meta', 'acs2020', 'acs2024' ] 2020 2024 true`

- [ ] **Step 3: Commit**

```bash
git add scripts/sample-data.mjs site/data.json
git commit -m "Generate sample data for both ACS years"
```

*(This commit also supersedes the pre-existing uncommitted `site/data.json`, resolving that dirty file.)*

---

## Task 5: `formatDelta` helper

**Files:**
- Modify: `site/js/format.js`
- Test: `site/js/format.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `site/js/format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDelta } from './format.js';

test('increase → dir up, positive pctChange', () => {
  assert.deepEqual(formatDelta(110, 100), { diff: 10, pctChange: 10, dir: 'up' });
});

test('decrease → dir down, negative pctChange', () => {
  assert.deepEqual(formatDelta(90, 100), { diff: -10, pctChange: -10, dir: 'down' });
});

test('equal → dir flat', () => {
  assert.equal(formatDelta(100, 100).dir, 'flat');
});

test('null/zero prior → null (no delta)', () => {
  assert.equal(formatDelta(100, null), null);
  assert.equal(formatDelta(null, 100), null);
  assert.equal(formatDelta(100, 0), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test site/js/format.test.mjs`
Expected: FAIL — `formatDelta` is not exported.

- [ ] **Step 3: Implement it**

Append to `site/js/format.js`:

```js
// Compare a current KPI value to its prior-year value. Returns numeric direction + change,
// or null when a delta is meaningless (missing values, or prior is zero).
export function formatDelta(current, prior) {
  if (current == null || prior == null || prior === 0) return null;
  const diff = current - prior;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  return { diff, pctChange: Number(((diff / Math.abs(prior)) * 100).toFixed(1)), dir };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test site/js/format.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add site/js/format.js site/js/format.test.mjs
git commit -m "Add formatDelta helper for KPI year-over-year deltas"
```

---

## Task 6: Parameterize snapshot + explorer by section

**Files:**
- Modify: `site/js/snapshot.js:4`, `:41-57`, `:134-139`
- Modify: `site/js/explorer.js:6-8`, `:127-154`

- [ ] **Step 1: Import `formatDelta` in snapshot.js**

Change line 4:

```js
import { fmt, currency, pct, escapeHtml, formatDelta } from './format.js';
```

- [ ] **Step 2: Change `renderSnapshot` signature and section access**

Replace `export function renderSnapshot(data) {` and the two lines after it (41–43) with:

```js
export function renderSnapshot(section, meta, opts = {}) {
  const s = section.snapshot;
  const g = section.groups;
  const compare = opts.compare || null; // prior-year snapshot, or null
```

- [ ] **Step 3: Add a delta-badge helper and year-driven KPI subs**

Immediately above `export function renderSnapshot`, add:

```js
function deltaBadge(current, prior) {
  const d = formatDelta(current, prior);
  if (!d || d.dir === 'flat') return '';
  const arrow = d.dir === 'up' ? '▲' : '▼';
  const sign = d.pctChange > 0 ? '+' : '';
  return `<div class="kpi-delta kpi-delta-${d.dir}">${arrow} ${sign}${d.pctChange}% vs prior</div>`;
}
```

Update `kpiTile` (lines 27–29) to accept optional delta HTML:

```js
function kpiTile(label, value, sub, delta = '') {
  return `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>${delta}</div>`;
}
```

Replace the KPI array (lines 46–57) so the year is dynamic and deltas render when `compare` is present:

```js
  const yr = `${section.year} ACS 5-Year`;
  const cd = (key) => (compare ? deltaBadge(s[key], compare[key]) : '');
  document.getElementById('kpis').innerHTML = [
    kpiTile('Population', fmt(s.totalPopulation), yr, cd('totalPopulation')),
    kpiTile('Median household income', currency(s.medianHouseholdIncome), 'Per year', cd('medianHouseholdIncome')),
    kpiTile('Per-capita income', currency(s.perCapitaIncome), 'Per year', cd('perCapitaIncome')),
    kpiTile('Median home value', currency(s.medianHomeValue), 'Owner-occupied', cd('medianHomeValue')),
    kpiTile('Median gross rent', currency(s.medianGrossRent), 'Per month', cd('medianGrossRent')),
    kpiTile('Owner-occupied', pct(s.ownerOccupiedPct), 'Of occupied homes', cd('ownerOccupiedPct')),
    kpiTile('Total housing units', fmt(s.totalHousingUnits), 'All units', cd('totalHousingUnits')),
    kpiTile('Unemployment', pct(s.unemploymentRate), 'Civilian labor force', cd('unemploymentRate')),
    kpiTile('Poverty rate', pct(s.povertyRate), 'Below poverty line', cd('povertyRate')),
    kpiTile('Age 85+', fmt(s.age85Plus), 'Residents', cd('age85Plus')),
  ].join('');
```

- [ ] **Step 4: Make the method note use the section source**

In the method note (lines 134–139), change the final `Source: ${data.meta.source}` reference to `Source: ${escapeHtml(section.source)}` (there is no more `data` param).

- [ ] **Step 5: Parameterize the explorer by section**

In `site/js/explorer.js`, change the signature and first line (6–8):

```js
export function renderExplorer(root, section) {
  const groups = section.groups;
  const gids = Object.keys(groups);
```

Update the two CSV filenames (lines 149 and 154 region) to include the year:

```js
    triggerCsv([['Group', 'Variable', 'Label', 'Count', '% of Total'], ...toCsvRows(state.tab)], `oakmont_${section.year}_${state.tab}.csv`);
```
and
```js
    triggerCsv(csv, `oakmont_${section.year}_all_data.csv`);
```

- [ ] **Step 6: Add delta styling**

Append to `site/styles.css`:

```css
.kpi-delta { margin-top: .35rem; font-size: .8rem; font-weight: 600; }
.kpi-delta-up { color: var(--teal); }
.kpi-delta-down { color: var(--terracotta); }
```

- [ ] **Step 7: Syntax check**

Run: `node --check site/js/snapshot.js && node --check site/js/explorer.js`
Expected: exit 0. (Rendering is verified in Task 8.)

- [ ] **Step 8: Commit**

```bash
git add site/js/snapshot.js site/js/explorer.js site/styles.css
git commit -m "Parameterize snapshot and explorer by data section; add KPI deltas"
```

---

## Task 7: Shared page bootstrap (`page.js`), replace `app.js`

**Files:**
- Create: `site/js/page.js`
- Delete: `site/js/app.js`

- [ ] **Step 1: Create `site/js/page.js`**

```js
// Shared page bootstrap. Loads the baked data.json, picks one section, renders its snapshot,
// and lazily builds its explorer. `compareTo` (optional) turns on prior-year KPI deltas.

import { renderSnapshot } from './snapshot.js';
import { renderExplorer } from './explorer.js';

export async function initPage({ section: sectionKey, compareTo = null }) {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const section = data[sectionKey];
  const meta = data.meta;

  if (meta?.sample) document.getElementById('sample-banner').hidden = false;
  document.getElementById('badge-year').textContent = `${section.year} ACS 5-Year`;
  document.getElementById('meta-geo').textContent = meta.geography;
  document.getElementById('footer-source').textContent = `Source: ${section.source}`;
  if (meta.generatedAt) {
    document.getElementById('footer-generated').textContent = `Data generated ${meta.generatedAt.slice(0, 10)}.`;
  }

  const compare = compareTo ? data[compareTo]?.snapshot : null;
  renderSnapshot(section, meta, { compare });

  const toggle = document.getElementById('explorer-toggle');
  const panel = document.getElementById('explorer');
  let built = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
    if (!open && !built) { renderExplorer(panel, section); built = true; }
  });
}

export function showError(err) {
  const note = document.getElementById('method-note');
  if (note) { note.hidden = false; note.textContent = `Could not load census data: ${err.message}`; }
  console.error(err);
}
```

- [ ] **Step 2: Delete `app.js`**

```bash
git rm site/js/app.js
```

- [ ] **Step 3: Syntax check**

Run: `node --check site/js/page.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add site/js/page.js
git commit -m "Add shared page bootstrap, replacing app.js"
```

---

## Task 8: 2020 landing page (`index.html`)

**Files:**
- Modify: `site/index.html`

- [ ] **Step 1: Add masthead nav and swap the bootstrap script**

In `site/index.html`, inside `.masthead-inner` (after the `.masthead-meta` div, before `</div>`), add a page nav:

```html
      <nav class="year-nav" aria-label="Data year">
        <a href="./index.html" class="year-link active" aria-current="page">2020 Portrait</a>
        <a href="./changes.html" class="year-link">2024 Update →</a>
      </nav>
```

Replace the badge line so it is filled at runtime (leave the element, drop the hardcoded text):

```html
        <span class="badge" id="badge-year">ACS 5-Year</span>
```

Replace the script tag at the bottom:

```html
  <script type="module">
    import { initPage, showError } from './js/page.js';
    initPage({ section: 'acs2020' }).catch(showError);
  </script>
```

- [ ] **Step 2: Add minimal nav styling**

Append to `site/styles.css`:

```css
.year-nav { display: flex; gap: 1rem; margin-top: 1rem; }
.year-link { font: 600 .9rem/1 'Public Sans', sans-serif; color: var(--ink-soft, #6b5d52); text-decoration: none; padding-bottom: 2px; border-bottom: 2px solid transparent; }
.year-link.active { color: var(--terracotta); border-bottom-color: var(--terracotta); }
```

- [ ] **Step 3: Verify in a browser (sample data)**

Ensure sample data exists: `node scripts/sample-data.mjs`
Serve: `python -m http.server 8000 --directory site` (leave running)
Open `http://localhost:8000/` and confirm: sample banner shows, badge reads "2020 ACS 5-Year", KPIs/charts/explorer render, nav shows two links with "2020 Portrait" active, no console errors.

- [ ] **Step 4: Commit**

```bash
git add site/index.html site/styles.css
git commit -m "Make index the 2020 landing page with year nav"
```

---

## Task 9: 2024 comparison page (`changes.html`)

**Files:**
- Create: `site/changes.html`

- [ ] **Step 1: Create `site/changes.html`**

Copy `site/index.html` to `site/changes.html` and change exactly four things: the `<title>`, the masthead `<h1>`/lead wording, the active nav link, and the bootstrap call. The body structure (banner, kpis/charts/callouts/method-note, explorer, footer, tooltip) is identical.

```bash
cp site/index.html site/changes.html
```

Then in `site/changes.html`:
- `<title>Oakmont Village — What's Changed (2024)</title>`
- Masthead `<h1>What's <em>Changed</em></h1>` and lead: `<p class="lead">How Oakmont's numbers moved between the 2016–2020 and 2020–2024 American Community Survey.</p>`
- Nav: make the 2024 link active and point back to 2020:
  ```html
  <nav class="year-nav" aria-label="Data year">
    <a href="./index.html" class="year-link">← 2020 Portrait</a>
    <a href="./changes.html" class="year-link active" aria-current="page">2024 Update</a>
  </nav>
  ```
- Bootstrap (turns on deltas):
  ```html
  <script type="module">
    import { initPage, showError } from './js/page.js';
    initPage({ section: 'acs2024', compareTo: 'acs2020' }).catch(showError);
  </script>
  ```

- [ ] **Step 2: Verify in a browser**

With the server from Task 8 still running, open `http://localhost:8000/changes.html` and confirm: badge reads "2024 ACS 5-Year", each KPI tile shows a `▲/▼ …% vs prior` delta (sample data makes 2024 ~6% higher), nav shows "2024 Update" active, explorer CSV downloads are named `oakmont_2024_*.csv`, no console errors.

- [ ] **Step 3: Commit**

```bash
git add site/changes.html
git commit -m "Add 2024 What's Changed page with year-over-year KPI deltas"
```

---

## Task 10: Retire remaining 2023 references + method note

**Files:**
- Modify: `site/js/snapshot.js` (method note wording), `site/index.html` / `site/changes.html` (any stray 2023)

- [ ] **Step 1: Find stray hardcoded 2023 / single-year wording**

Run: `grep -rn "2023" site/ scripts/ --include=*.js --include=*.html --include=*.mjs`
Expected after fixes: no hardcoded "2023" remains (the sample-data `year` fields are now 2020/2024; the method note text below removes the old single-tract framing that implied one year).

- [ ] **Step 2: Update the method note to acknowledge the ACS-overlap caveat**

In `site/js/snapshot.js`, replace the method-note body so it names the vintage from the section and states the overlap caveat only on the comparison (guarded by `compare`):

```js
  const overlapNote = compare
    ? ` The 2016–2020 and 2020–2024 ACS 5-year periods overlap in 2020, so year-over-year change shown here is directional, not a precise measurement.`
    : '';
  document.getElementById('method-note').innerHTML =
    `<strong>About this data.</strong> Oakmont Village is an unincorporated community with no Census place code. ` +
    `These figures aggregate Census Tracts 1516.01 and 1516.02 in Sonoma County (${section.year} ACS 5-Year), ` +
    `whose combined population (~${fmt(s.totalPopulation)}) closely tracks Oakmont's footprint. Counts are summed ` +
    `across the two tracts; medians are population-weighted approximations.${overlapNote} Source: ${escapeHtml(section.source)}.`;
```

- [ ] **Step 3: Re-verify both pages in the browser**

Reload `/` and `/changes.html`: method note on `/` has no overlap sentence; on `/changes.html` it does. No console errors.

- [ ] **Step 4: Commit**

```bash
git add site/js/snapshot.js site/index.html site/changes.html
git commit -m "Retire 2023 wording; add ACS overlap caveat to comparison"
```

---

## Task 11: Full test + build gate, then deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Run the full logic test suite**

Run: `node --test scripts/build-payload.test.mjs site/js/format.test.mjs`
Expected: all tests PASS (7 total).

- [ ] **Step 2: Confirm the CI fetch path is intact**

`deploy.yml` already runs `node scripts/fetch-census.mjs`; no workflow change is needed (it now writes both years). Confirm the file still references the script:
Run: `grep -n "fetch-census.mjs" .github/workflows/deploy.yml`
Expected: one match under the "Fetch census data" step.

- [ ] **Step 3: Verify real data via a keyed run (John)**

Because `CENSUS_API_KEY` is a CI secret, verify real numbers by triggering the deploy workflow manually (it has `workflow_dispatch`): from the repo's Actions tab, run "Build and deploy" on `main`. Watch the build log for two `Fetching ACS …` lines and non-null populations for both years. **This must succeed before relying on the live site.**

- [ ] **Step 4: Deploy**

Deploy = push `main` (triggers the Pages workflow). Pushing is John's call:
```bash
git push origin main
```
Then confirm `https://census.jrow3.com/` (2020 landing) and `https://census.jrow3.com/changes.html` (2024 deltas) render with real data and no sample banner.

---

## Self-Review (completed by planner)

- **Spec coverage:** 2020 landing + block panel → block panel is Plan B (explicitly deferred); 2024 page + deltas → Tasks 9, 6; ACS 2016–2020 baseline → Task 1 (`ACS_YEARS`); single-file three-section payload → Tasks 2–4 (two sections now; `oakmont2020` added by Plan B without breaking this shape); overlap caveat → Task 10; retire 2023 → Task 10; CI unchanged → Task 11.
- **Placeholder scan:** none — every code step shows full code.
- **Type consistency:** `buildAcsSection(year, values)`, `assembleData(sections,{sample})`, `renderSnapshot(section, meta, {compare})`, `renderExplorer(root, section)`, `formatDelta(current, prior)→{diff,pctChange,dir}|null`, `initPage({section, compareTo})` are used consistently across all tasks. Section keys `acs2020`/`acs2024` match between pipeline and front-end.

---

## Follow-on: Plan B (exact-Oakmont decennial block view) — NOT in this plan

Plan B is gated on a short feasibility spike that must return before it can be written in detail:

1. **Source the OVA boundary polygon** (OVA published map / Sonoma County GIS / OpenStreetMap). Compute candidate 2020 census blocks in tracts 1516.01/02 by point-in-polygon; render a confirmation map artifact for John to approve; freeze `scripts/oakmont-blocks.json`.
2. **Confirm block-level decennial variables** for those tracts with a keyed one-off `workflow_dispatch` (like the earlier block-population pull): total population, DHC P12 sex-by-age, P1/P2 race & Hispanic origin, H1 occupancy, tenure. Record which are block-available; fall back to the PL 94-171 18+/under-18 split if age detail is not.

Once the spike returns, Plan B adds: `fetch-blocks.mjs`, decennial variable defs in `census-variables.mjs`, an `oakmont2020` section in `assembleData`, and a stacked "Oakmont Proper (2020 blocks)" snapshot+explorer panel on `index.html` — reusing the already-parameterized `renderSnapshot`/`renderExplorer` from this plan.
