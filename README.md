# Oakmont Village Community Snapshot

An interactive census snapshot of **Oakmont Village**, an unincorporated 55+ community in Sonoma
County, California, built from the U.S. Census Bureau's American Community Survey (2023 ACS 5-Year).

**Live:** https://census.jrow3.com

A readable snapshot (headline stats + charts) sits on top; a full data explorer (every variable,
sortable and searchable, with CSV export) sits behind an expander below.

## How the API key stays secret

The page ships **no** API key and makes **no** keyed request from the browser. Instead, GitHub
Actions fetches the data at build time using a `CENSUS_API_KEY` repository secret, bakes it into
`site/data.json`, and publishes the static site. The key only ever exists inside the Actions runner.

```
GitHub Actions (secret: CENSUS_API_KEY)
  -> node scripts/fetch-census.mjs   (fetch ACS, aggregate the two tracts, write site/data.json)
  -> deploy site/ to GitHub Pages -> census.jrow3.com
Browser: load page -> fetch('./data.json') -> render. No key, instant.
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
  census-variables.mjs   geography + variable/label definitions (single source of truth)
  fetch-census.mjs       fetch ACS + aggregate the two tracts -> site/data.json (needs a key)
  build-payload.mjs      shared: shape a {code: value} map into the data.json payload
  sample-data.mjs        placeholder data for keyless local preview
site/
  index.html             single page
  styles.css             "Sonoma Warm" design system
  js/                    app, snapshot, explorer, charts, format modules
  data.json              baked data (committed, refreshed by CI)
  CNAME                  census.jrow3.com
```

## Geography and method

Oakmont Village has no Census place code. Figures aggregate **Census Tracts 1516.01 and 1516.02**
(Sonoma County), whose combined population (~5,800) closely tracks Oakmont's footprint, far tighter
than the surrounding ZIP code. Count variables are summed across the two tracts; medians (income,
rent, home value) are population-weighted approximations.

Source: U.S. Census Bureau, 2023 American Community Survey 5-Year Estimates.
