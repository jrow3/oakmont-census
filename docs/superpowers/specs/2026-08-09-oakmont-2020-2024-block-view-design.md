# Oakmont Census — 2020 baseline, 2024 comparison, and exact-boundary block view

**Date:** 2026-08-09
**Status:** Approved design, pending implementation plan

## Problem

The live site (`census.jrow3.com`) shows a single **ACS 2023 5-year** snapshot for Oakmont, geographically approximated by summing two whole census tracts (1516.01 + 1516.02). Two gaps:

1. **Geographic imprecision.** The two tracts capture more area than Oakmont proper. There is no Census "place" code for Oakmont (it is an unincorporated community), so the tract sum is only an approximation. The footer already concedes this.
2. **No time dimension.** A single vintage can't show how the community is changing.

## Goals

- Show Oakmont at the **exact OVA boundary**, as precisely as census data allows.
- Add a **time comparison** so high-level change is visible.
- Keep the existing editorial quality (Sonoma Warm style, snapshot + explorer).

## Hard constraints (why the design is shaped this way)

- **No 2024 decennial census exists** (next is 2030). The only 2024 data is ACS. Therefore any 2020→2024 tract comparison must be **ACS-to-ACS**; decennial is usable only for the exact-boundary block layer.
- **ACS does not publish below the block-group level.** Hitting the OVA boundary requires **decennial** block data (2020), which is counts only.
- Tract codes 1516.01 / 1516.02 are **stable across the entire 2020 decade**, so ACS 2016–2020, ACS 2020–2024, and decennial 2020 all align on the same tract geography — no boundary drift between vintages.

## Data model (three sources)

| Layer | Dataset | Geography | Variable richness |
|---|---|---|---|
| 2020 tract baseline | ACS 2016–2020 5-year | Tracts 1516.01 + 1516.02 (summed) | Full (income, education, employment, poverty, housing, age, race) |
| 2024 tract view | ACS 2020–2024 5-year | Same two tracts | Full |
| Exact-Oakmont | Decennial 2020 (PL 94-171 / DHC) | Selected 2020 census blocks inside the OVA boundary | Counts only: population, age, race/ethnicity, housing occupancy/tenure |

The 2016–2020 and 2020–2024 ACS 5-year windows **share the year 2020**. Per Census guidance, overlapping 5-year estimates should be treated as **directional** change, not statistically precise change. The site states this plainly wherever the comparison appears.

## Pages & structure

- **`index.html` — "2020 Portrait" (landing).**
  - Top: ACS 2016–2020 tract snapshot (KPIs, charts, callouts) + full data explorer.
  - Stacked below: **"Oakmont Proper (2020 blocks)"** — the exact-boundary decennial snapshot + its own full explorer (sortable/searchable table + CSV).
- **`changes.html` — "2024 Update" (secondary).**
  - ACS 2020–2024 tract snapshot + explorer.
  - Each headline KPI tile also shows the **2020→2024 delta** (leading with the high-level change). Explorer remains single-vintage (2024).
- A year link in the masthead switches between the two pages.
- The current **2023** view is retired.

## Data pipeline (build-time, GitHub Actions, `CENSUS_API_KEY`)

Three fetches bake one `site/data.json`:

```json
{
  "meta": { "...": "..." },
  "acs2020":     { "snapshot": {}, "groups": {} },
  "acs2024":     { "snapshot": {}, "groups": {} },
  "oakmont2020": { "snapshot": {}, "groups": {} }
}
```

- **`fetch-census.mjs`** — generalized to fetch ACS for a supplied year; run for 2020 and 2024. Existing tract-aggregation logic (sum counts, population-weight medians, handle negative sentinels) is unchanged.
- **`fetch-blocks.mjs`** (new) — fetches decennial 2020 for the committed Oakmont block GEOIDs, sums counts, derives age 65+/85+, race mix, and housing occupancy/tenure. Uses the same key handling and non-JSON-error guard as `fetch-census.mjs`.
- **`sample-data.mjs`** — extended to stub all three sections (flagged `meta.sample`) for keyless offline preview.
- **`census-variables.mjs`** — carries the ACS variable/label definitions (as today) plus a decennial variable set (DHC P12 sex-by-age, P1/P2 race & Hispanic origin, H1 occupancy, tenure).

## Block selection (Approach A — static committed list)

- **`scripts/oakmont-blocks.json`** — committed list of Oakmont block GEOIDs plus provenance (OVA boundary source, retrieval date, selection method).
- **Derivation (one-time, offline):** source the OVA boundary polygon → point-in-polygon test against 2020 TIGER/Line block shapes for the two tracts → candidate block set → render a **confirmation map artifact** for John to approve/tweak → freeze the list. CI never runs geometry; it just reads the frozen GEOID list.
- Rationale: the OVA boundary is effectively static, so build-time recomputation (Approach B, spatial join in CI) adds a geometry dependency and failure surface for no benefit. A one-time human confirmation of the block set is worth more.

## Front-end

- Reuse existing modules: `snapshot.js`, `explorer.js`, `charts.js`, `format.js`.
- Generalize `app.js` so it renders a **given data section into a given container**; each page wires only the sections it needs.
- The block panel is the same snapshot + explorer components fed the `oakmont2020` section, with its own header and a decennial-specific methodology note.
- The 2024 page's KPI tiles render a delta against the matching `acs2020` value.

## Methodology & caveats (surfaced in method notes / footer)

- **ACS overlap:** 2016–2020 vs 2020–2024 share 2020 → directional change only.
- **Block panel:** 100% count, 2020 vintage; differential-privacy noise is present but washes out across ~20-30 aggregated blocks; boundary is the **exact OVA line**, unlike the tract approximation.
- **Tract views** remain the two-tract approximation (ACS cannot go to blocks).

## Feasibility checks (must pass before full build)

1. **OVA boundary polygon sourcing** — the crux. Candidate sources: OVA published map, Sonoma County GIS, OpenStreetMap. If no clean polygon exists, fall back to John hand-picking blocks on the confirmation map.
2. **Block-level age bands** — confirm DHC P12 sex-by-age is available at block level for these tracts. Fallback: PL 94-171 18+/under-18 split (loses the 65+ headline at exact boundary; tract-level age still available).
3. **API key for local verification** — the key is a CI secret. Verify #1 and #2 via a one-off `workflow_dispatch` run (as with the earlier block-population pull) before committing to the full build.

## Out of scope

- No build-time spatial join (Approach B rejected).
- No block-level ACS estimates (do not exist).
- No side-by-side tract-vs-block comparison widget (stacked panels only).
- Retiring the 2023 vintage; not preserving it as a third page.

## Success criteria

- Landing page shows the ACS 2016–2020 tract portrait plus an exact-OVA-boundary 2020 block panel (snapshot + explorer), with the block set confirmed by John.
- The 2024 page (`changes.html`, linked from the masthead) shows the ACS 2020–2024 tract portrait with visible 2020→2024 deltas on headline KPIs.
- CI bakes all three data sections from the `CENSUS_API_KEY` secret and deploys to Pages; keyless local runs render sample data.
- Every comparison and the block panel carry honest methodology notes.
