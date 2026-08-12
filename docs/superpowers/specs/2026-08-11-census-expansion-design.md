# Census site expansion — design

Date: 2026-08-11
Status: approved (brainstorming), pending implementation plan

## Goal

Four additions to the live Oakmont census site (census.jrow3.com), decided with John:

1. **Median age** replaces the "over-a-threshold" age count as the headline age stat.
2. A **map of the 76 selected blocks** over a free basemap, in the "Oakmont proper" panel.
3. A **2-axis income × household-size grid** in the full data explorer.
4. **Mirror all available Census data** for these geographies — not just the curated subset — into the explorer.

The public snapshot (KPI tiles, charts, callouts) stays curated. "Pull everything" applies to the
**Full data explorer**, whose subtitle already promises "every variable."

## Locked decisions

- **Median age scope:** swap the `Age 85+` tile for `Median age` on both the ACS snapshot and the
  exact-boundary block panel. Keep everything else — per-capita income, the `65+` share, the age chart.
- **Basemap:** Leaflet + a free light basemap (Carto Positron), no API key, no billing. Blocks draw as a
  shaded/outlined overlay.
- **Income × size grid:** Census table **B19019** (median household income by household size) — real
  tract-level data. A true count matrix of income-bracket × size is NOT published at tract level (only
  PUMS at PUMA scale), so B19019 is the honest cross of the two variables.
- **Mirror breadth:** ALL ACS 5-year detailed tables **including race-iterated** (`B01001A`–`I`, …),
  **estimates only** (no margins of error).
- **Blocks:** mirror **all block-published 2020 DHC tables** too (not just the current hand-picked set).
- **Mirror storage:** the big mirror files are **gitignored and CI-generated**; `sample-data.mjs` writes
  small placeholders for local preview. `data.json` stays committed as today.

## Feature 1 — Median age

**ACS (tract) view.** Add `B01002_001E/_002E/_003E` (median age total/male/female) to the *Age
Distribution* group and to the population-weighted set. `buildSnapshot` gains `medianAge = B01002_001E`.
`snapshot.js` renders a **Median age** KPI tile in place of `Age 85+`, with the existing year-over-year
delta badge on the 2024 page. The `65+` callout and age-distribution chart are unchanged.

**Block (DHC) view.** Decennial has no single median-age number that can be summed across 76 blocks, so
compute a **grouped median** from the already-summed `P12` age bands: locate the band containing the
N/2-th person and linearly interpolate within it (`median = L + ((N/2 − cumBelow) / bandCount) × width`).
The `P12` bands and their numeric bounds live as a constant in `decennial-variables.mjs`; the calculation
is a pure function with a unit test. `block-snapshot.js` renders a **Median age** tile in place of
`Age 85+`, keeping the `Age 65+` % tile (the signature stat of the exact-boundary view).

## Feature 2 — Block map

**Geometry.** New one-time script `scripts/fetch-block-geometry.mjs` queries the Census **TIGERweb**
REST API (2020 blocks layer) for the 76 frozen GEOIDs, `f=geojson&outSR=4326`, and writes
`site/blocks.geojson` (committed — the block list is frozen, so no build-time dependency).

**Render.** New module `site/js/block-map.js` uses **Leaflet 1.9.4** (pinned CDN + SRI, matching how the
site already pulls Google Fonts) over **Carto Positron** light tiles (free, attributed). Blocks draw as
terracotta shaded/outlined polygons; the map auto-fits to their bounds with a hover highlight. It mounts
in a map card inside the "Oakmont proper" panel on `index.html` only (not `changes.html`). `page.js`
calls `renderBlockMap()` when `#block-map` is present. Leaflet CSS/JS tags are added to `index.html`
`<head>` only.

## Feature 3 — Income × household-size grid

The mirror (Feature 4) already pulls B19019, so this is a **featured rendering** on top of mirrored data.
New module `site/js/income-grid.js` renders a 2-axis grid in the explorer's Featured section:

- **y-axis:** income brackets (the B19001 bracket ranges already used on the site).
- **x-axis:** household size (1, 2, 3, 4, 5, 6, 7+).
- **cell:** for each size column, the bracket-row its median income (B19019) falls into is heat-shaded on a
  sequential scale, with the exact median $ labeled.

Appears on both ACS pages; absent from the decennial block explorer (no income at block level).

## Feature 4 — Full data mirror + explorer redesign

### Discovery (no hand-listing)

Fetch scripts read the API's own catalog and pull each table whole:

- ACS: `GET acs5/groups.json` → every detailed + race-iterated table. For each, `get=group(<ID>)` for the
  two tracts (one request per table).
- DHC blocks: `GET dec/dhc/groups.json` → for each table, `get=group(<ID>)&for=block:*` per tract, filter
  to the 76 GEOIDs. Tables not published at block geography return an error → skip and log.

Variable labels come from `variables.json` (one fetch per dataset/year) mapped code → {label, concept,
group}. Only estimate variables (codes ending in `E`) are kept; `M`/`EA`/`MA`/`NAME`/geo columns dropped.

### Aggregation rule (applies across ~40k variables)

- **Counts** (the default): sum across tracts / blocks. Negative ACS sentinels (`-666666666`, …) → null.
- **Non-summable** (label matches `/median|mean|per capita|gini|ratio/i`): **population-weighted** by
  tract/block total population — consistent with the site's existing "population-weighted approximation"
  disclaimer. A handful of exotic variables may aggregate imperfectly across the two tracts; the method
  note discloses this.

### Files and loading

- **`data.json`** stays small and curated (today's file + median age). Drives the landing snapshot.
  Committed.
- **`site/explorer/acs2020.json`, `acs2024.json`, `blocks2020.json`** — the full mirror, one per section
  (~8–15 MB each). **Gitignored**, generated by the fetch script in CI. The explorer **lazy-loads** only
  the file for the section being viewed, only when opened.
- `sample-data.mjs` writes small placeholder mirror files for keyless local preview.

Mirror file schema (per section):

```json
{
  "meta": { "dataset": "acs/acs5", "year": "2024", "generatedAt": "..." },
  "tables": {
    "B01001": {
      "concept": "Sex by Age",
      "variables": { "B01001_001E": { "label": "...", "value": 5839 }, "...": {} }
    }
  }
}
```

### Explorer redesign

`explorer.js` is reworked from "7 fixed tabs" to:

- **Featured views** (top): the previously-curated tables (age, income, housing, …) for quick access,
  **plus the Income × Size grid** (Feature 3).
- **Table catalog** (below): a global search over all ~40k variables by code or label, or pick a table by
  ID/concept → the existing sortable table with distribution bars + CSV. An **"hide empty tables" toggle,
  on by default** (race-iterated tables are almost all zeros for ~96%-white Oakmont).
- CSV export: current table, or all-data (a several-MB client-side download).

The block explorer uses the same UI against `blocks2020.json`.

### Build / performance

~4,000 table requests per full run — parallelized (concurrency ~8) with retry. A few minutes in CI with
`CENSUS_API_KEY`; the key makes rate limits a non-issue. Browser parses a single lazy-loaded ~10 MB file
in well under a second; only the selected table renders to the DOM, and global search filters in memory.

## Testing

- Grouped-median-from-bands: pure function, unit test (known distribution → known median).
- Aggregation classifier: unit test that median/mean/per-capita labels are weighted and counts summed.
- `build-payload` block/ACS snapshot: extend existing tests for the new `medianAge` fields.
- Mirror shaping (`group(...)` response → table map, estimate-only filter): unit test with a fixture.
- Verify a real (or sample) build produces valid `data.json` + mirror files and the pages render.

## Risks / caveats

- **Aggregation heuristic** mis-handles a few exotic variables (weighting where a different universe would
  be more correct). Only two tracts, so the error is small; disclosed in the method note.
- **Block DHC coverage** is limited to block-published tables — the finer DHC cross-tabs don't exist at
  block resolution. The explorer notes what was skipped.
- **Race-iterated tables** are mostly zero/suppressed for Oakmont; the "hide empty" default keeps the
  catalog usable while retaining all data.
- **Long CI build** (thousands of requests). Mitigated by whole-table `group()` requests, concurrency,
  and retry.

## Out of scope

- Subject (`S`) and Data Profile (`DP`) tables — declined; they overlap the detailed tables.
- Margins of error — declined.
- PUMS-based joint distributions.
- Any redesign of the public snapshot beyond the median-age swap.

## Implementation phasing

One spec, two phases in the plan:

1. **Pipeline + explorer redesign** — dynamic discovery, aggregation classifier, per-section mirror files,
   lazy loading, catalog/search explorer UI, block DHC mirror, gitignore + sample placeholders.
2. **Presentation features** — median age (both views), block map, income × size featured grid.

## Files

**New:** `scripts/fetch-block-geometry.mjs`, `site/blocks.geojson`, `site/js/block-map.js`,
`site/js/income-grid.js`, mirror/aggregation module(s), grouped-median + aggregation unit tests.

**Modified:** `scripts/census-variables.mjs`, `scripts/decennial-variables.mjs`,
`scripts/build-payload.mjs`, `scripts/fetch-census.mjs`, `scripts/fetch-blocks.mjs`,
`scripts/sample-data.mjs`, `site/index.html` (Leaflet + map card), `site/js/snapshot.js`,
`site/js/block-snapshot.js`, `site/js/explorer.js`, `site/js/page.js`, `site/styles.css`, `.gitignore`,
`README.md`.

**Unchanged:** `site/changes.html`, `.github/workflows/deploy.yml`.
