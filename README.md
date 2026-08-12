# Oakmont Village Community Snapshot

An interactive census portrait of **Oakmont Village**, an unincorporated 55+ community in Sonoma
County, California, built from the U.S. Census Bureau's American Community Survey and the 2020
Decennial Census. A 2020 portrait leads; a companion page shows what changed by the 2024 ACS.

**Live:** https://census.jrow3.com

Each page pairs a readable snapshot (headline stats + charts) with a full data explorer (every
variable, sortable and searchable, with CSV export) behind an expander. The 2020 page also carries
an **Oakmont proper** panel: the same community drawn to its exact block boundary from the 2020
Decennial Census (100% counts), tighter than the two-tract approximation.

## How the API key stays secret

The page ships **no** API key and makes **no** keyed request from the browser. Instead, GitHub
Actions fetches the data at build time using a `CENSUS_API_KEY` repository secret, bakes it into
`site/data.json`, and publishes the static site. The key only ever exists inside the Actions runner.

```
GitHub Actions (secret: CENSUS_API_KEY)
  -> node scripts/fetch-census.mjs   (fetch ACS 2020 + 2024 tracts and 2020 DHC Oakmont blocks)
       -> site/data.json             (small, curated -> the snapshot; committed)
       -> site/explorer/*.json       (full table mirror -> the explorer; gitignored, CI-built)
  -> deploy site/ to GitHub Pages -> census.jrow3.com
Browser: load page -> fetch('./data.json') -> render snapshot. Explorer lazily fetches its mirror. No key.
```

Census figures are public, so the baked `site/data.json` is safe to serve and commit.

## Local development

No key needed for a preview: generate realistic **placeholder** data, then serve the folder.

```bash
node scripts/sample-data.mjs      # writes site/data.json flagged as sample (shows a banner)
npx serve site                    # or any static server; open the printed localhost URL
```

To generate the **real** data locally you need a free key
(https://api.census.gov/data/key_signup.html):

```bash
# macOS / Linux
CENSUS_API_KEY=your_key node scripts/fetch-census.mjs

# Windows PowerShell
$env:CENSUS_API_KEY="your_key"; node scripts/fetch-census.mjs
```

## Deployment

Pushing to `main` (or running the workflow manually from the Actions tab) triggers
`.github/workflows/deploy.yml`, which fetches fresh data and deploys to GitHub Pages.

One-time setup:

1. **Secret:** repo Settings -> Secrets and variables -> Actions -> add `CENSUS_API_KEY`.
2. **Pages:** repo Settings -> Pages -> Source = GitHub Actions.
3. **DNS:** add a CNAME record `census` -> `jrow3.github.io` (DNS-only / not proxied).
4. **Custom domain:** repo Settings -> Pages -> Custom domain = `census.jrow3.com`
   (`site/CNAME` already pins it).

## Project structure

```
scripts/
  census-variables.mjs   ACS geography + curated variable/label definitions
  decennial-variables.mjs 2020 DHC variable/label definitions + P12 age bands
  census-http.mjs        shared getJson (retry) + mapLimit (bounded concurrency)
  aggregate.mjs          sum counts / population-weight medians across geographies
  mirror.mjs             shape a get=group(ID) response into a table object
  median-age.mjs         grouped median age from the P12 bands
  fetch-census.mjs       fetch curated ACS -> data.json + write the full mirrors
  fetch-acs-mirror.mjs   discover + pull every ACS detailed table for the tracts
  fetch-blocks.mjs       curated DHC block fetch + full block-level DHC mirror
  fetch-block-geometry.mjs one-time: TIGERweb block polygons -> site/blocks.geojson
  build-payload.mjs      shared: shape {code: value} maps into the data.json sections
  sample-data.mjs        placeholder data + placeholder mirrors for keyless preview
  oakmont-blocks.json    the 76 census blocks that make up Oakmont proper
site/
  index.html             2020 portrait + Oakmont-proper block panel (+ block map)
  changes.html           2024 update (year-over-year deltas)
  styles.css             "Sonoma Warm" design system
  js/                    page, snapshot, block-snapshot, explorer, charts, format,
                         block-map, income-grid modules
  data.json              baked snapshot data (committed, refreshed by CI)
  explorer/*.json        full table mirrors (gitignored, CI-built; sample writes placeholders)
  blocks.geojson         geometry for the 76 Oakmont blocks (committed)
  CNAME                  census.jrow3.com
```

## Data explorer & full mirror

The public snapshot reads the small committed `site/data.json`. The **Full data explorer** lazy-loads a
per-section mirror under `site/explorer/` (`acs2020.json`, `acs2024.json`, `blocks2020.json`) — generated
in CI, gitignored, never committed. `scripts/fetch-acs-mirror.mjs` and `fetchBlockMirror()` discover every
table from the Census API's own `groups.json`, pull each whole with `get=group(ID)`, keep estimates only,
sum counts, and population-weight anything whose label marks it a median / mean / per-capita / ratio.
Race-iterated tables are included; the explorer hides all-empty tables by default. DHC block coverage is
limited to the tables the Census publishes at block geography (finer cross-tabs don't exist that small and
are skipped).

## Median age, block map, income-by-size grid

- **Median age** replaces the old "Age 85+" tile on both the ACS snapshot and the block panel. The ACS
  value is `B01002_001E` (population-weighted across tracts); the block value is a grouped median
  interpolated from the summed P12 age bands (`scripts/median-age.mjs`).
- **Block map:** `node scripts/fetch-block-geometry.mjs` writes `site/blocks.geojson` (committed) from
  Census TIGERweb; the 2020 page renders it with Leaflet over a CARTO light basemap.
- **Income × household size:** a featured grid in the explorer. A real household-count crosstab of income
  by size isn't published at the tract level, so the interior is **estimated** — the row totals (income,
  B19001) and column totals (household size, B25009) are real Census counts, and the interior cells are
  modeled by iterative proportional fitting to fit those totals plus each size's median income (B19019).
  The interior is labeled an estimate, not a measurement.

## Geography and method

Oakmont Village has no Census place code. The ACS pages aggregate **Census Tracts 1516.01 and
1516.02** (Sonoma County), whose combined population closely tracks Oakmont's footprint; counts are
summed across the two tracts and medians are population-weighted approximations. The **Oakmont
proper** panel instead sums the 2020 Decennial Census over 76 hand-selected blocks matching the
community's actual boundary — geographically exact, but counts only (no income, education, or home
values). The 2016–2020 and 2020–2024 ACS 5-year periods overlap in 2020, so year-over-year change is
directional, not precise.

Sources: U.S. Census Bureau, American Community Survey 5-Year Estimates (2016–2020 and 2020–2024);
2020 Census Demographic and Housing Characteristics (DHC).
