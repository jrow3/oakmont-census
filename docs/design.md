# Oakmont Census — Redesign & Deploy Design

Date: 2026-08-08
Status: approved

## Goal

Replace the manual-key, live-fetch census page (currently at `djrow3.com/dump/oakmont_census.html`)
with a version that:

1. Holds the Census API key as a **GitHub Actions secret** — never in the browser, never committed.
2. Deploys from GitHub to **`census.jrow3.com`** via GitHub Pages.
3. Is a **full visual redesign**: a public-facing snapshot on top, the full data explorer below.

## Core architecture — build-time data baking

The Census API key is only useful where a secret can live: inside GitHub Actions. The page itself
ships no key and makes no keyed API call.

```
GitHub Actions runner (secret: CENSUS_API_KEY)
  └─ node scripts/fetch-census.mjs
       ├─ fetch ACS 2023 5-year, tracts 1516.01 + 1516.02, Sonoma County CA
       ├─ sum counts across tracts; population-weight medians
       └─ write site/data.json  (public census numbers — safe to serve)
  └─ deploy site/ → GitHub Pages → census.jrow3.com

Browser: load census.jrow3.com → fetch('./data.json') → render. No key. Instant.
```

- The Census API now returns a "Missing Key" page for keyless requests, so a key is required for
  real fetches; the CI secret supplies it. For offline/local dev without a key, `scripts/sample-data.mjs`
  writes realistic placeholder data (flagged `meta.sample`, which shows a banner on the page).
- `site/data.json` is committed so the repo/site work standalone; CI refreshes it on each deploy.

## Repo layout

```
oakmont-census/
  scripts/
    census-variables.mjs        # geo + variable/label definitions (single source of truth)
    fetch-census.mjs            # fetch ACS + aggregate → site/data.json (needs a key)
    build-payload.mjs           # shared: shape {code: value} into the data.json payload
    sample-data.mjs             # write placeholder data.json for keyless local preview
  site/
    index.html                  # single page
    styles.css
    js/{app,snapshot,explorer,charts,format}.js
    data.json                   # baked data (committed, CI-refreshed)
    CNAME                       # census.jrow3.com (must live in the published folder)
  .github/workflows/deploy.yml  # push + manual → fetch, build, deploy to Pages
  docs/design.md
  README.md
```

## The page — hybrid layout, Sonoma Warm style

### Snapshot (top, public-facing)
- Header: "Oakmont Village — Community Snapshot", geography line, "2023 ACS 5-Year" badge.
- KPI row: Population, Median HH Income, Per-Capita Income, Median Home Value, Median Rent,
  Owner-Occupied %, Unemployment, Poverty rate, Age 85+.
- Charts (hand-rolled inline SVG, on-palette), each with one plain-English caption:
  - Age distribution (bucketed bands — fitting for a 55+ community)
  - Household income distribution
  - Housing tenure (owner vs renter)
  - Housing age or type
  - Callouts: education (% bachelor's+), race/ethnicity

### Explorer (below, behind "Full data explorer ▾")
- All 8 tabs (Overview, Age, Income, Race, Education, Employment, Housing, Poverty).
- Every raw variable, filter box, sortable columns, CSV export (current tab / all).
- Reads the same `data.json`. No browser key.

### Visual style — Sonoma Warm
- Cream `#faf5ec`, warm brown ink `#4a3520`, terracotta primary `#c1652f`,
  gold `#d9a441` + sage `#6b8f6b` chart accents.
- Palatino/serif headlines, clean sans body + tables. Responsive. Light-only for v1.

## Data contract — site/data.json

```jsonc
{
  "meta": {
    "source": "U.S. Census Bureau, 2023 ACS 5-Year Estimates",
    "geography": "Census Tracts 1516.01 + 1516.02, Sonoma County, CA",
    "year": "2023",
    "generatedAt": "<ISO timestamp, stamped by CI>"
  },
  "snapshot": {                     // pre-computed headline numbers
    "totalPopulation": 5839,
    "medianHouseholdIncome": 0,
    "perCapitaIncome": 0,
    "totalHousingUnits": 0,
    "ownerOccupiedPct": 0,
    "medianHomeValue": 0,
    "medianGrossRent": 0,
    "unemploymentRate": 0,
    "povertyRate": 0,
    "age85Plus": 0
  },
  "groups": {                       // full explorer data, label+value per variable
    "age":    { "label": "...", "totalKey": "B01001_001E",
                "variables": { "B01001_001E": { "label": "Total Population", "value": 5839 } } }
    // income, race, education, employment, housing, poverty ...
  }
}
```

- Variable label definitions live once, in `fetch-census.mjs`, and are emitted into the JSON so the
  page is data-driven.
- Aggregation reuses the proven logic from the current page: `parseInt`, treat negatives / -666666666
  as N/A, sum counts, population-weight the four median variables.

## Deploy & handoff

CI (`deploy.yml`): triggers on push to `main` and `workflow_dispatch` (manual "Run workflow"). Steps:
checkout → setup Node → `node scripts/fetch-census.mjs` (env `CENSUS_API_KEY` from secret) →
upload `site/` as Pages artifact → deploy.

Manual steps for John (I provide exact click-paths; I never handle the key or push):
1. Create public repo `jrow3/oakmont-census`, push local `main`.
2. Repo → Settings → Secrets and variables → Actions → add `CENSUS_API_KEY`.
3. Repo → Settings → Pages → Source = GitHub Actions.
4. Cloudflare DNS: CNAME `census` → `jrow3.github.io` (proxied off / DNS-only as Pages requires).
5. Repo → Settings → Pages → Custom domain = `census.jrow3.com` (writes/uses the CNAME file).

## Out of scope (v1)
- Dark mode (clean add-on later).
- Live in-browser API fetch (removed — baked data only).
- Comparisons to other geographies / historical trend lines.
