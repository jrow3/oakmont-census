# Oakmont Community Report (2020) — design

Date: 2026-08-12
Status: draft for review

## Goal

A new **"Community Report · 2020"** page on census.jrow3.com that recreates the Oakmont LRPC demographic
report **reliably, using only U.S. Census Bureau data** — no AARP survey, no LexisNexis/commercial data.
It is modeled on Jim Ouimette's trusted 2010 report (the baseline the community expects), extended with
the additional topics the board asked for. Every figure traces to a named Census table.

## Background & the methodology finding

Two prior reports exist (in `~/Downloads`, extracted to the scratchpad):

- **2010 (Jim Ouimette, trusted, widely used):** honest, all-Census-Bureau. Used **tract-level ACS** and
  openly caveated that "Oakmont is ~72% of Census Tract 1516, which also includes ~1,760 younger
  non-Oakmont residents." Sections: Age & Gender, Marital Status, Home Ownership & Tenure, Past
  Characteristics, Income & Employment (incl. a per-source income table), Where residents come from.
- **2020 (LRPC volunteers, never released, deemed unreliable):** blended ACS with the **AARP member
  survey** (1,997 self-selected members), City data, and **LexisNexis**. It claimed to "GEO-code ACS
  block by block" and exclude blocks (St. Francis, Lawndale, Wild Oak fringe, Oakmont Gardens).

**Methodology assessment (why the 2020 report is unreliable):** the block-exclusion *concept* is sound —
it's what this project already does for the Decennial block view — but it was applied to the wrong data.
**Excluding blocks works for the Decennial Census (100% counts, published block-by-block); it does not
work for the ACS, which is not published below the tract/block-group level.** There is no block-level ACS
income/education data to "GEO-code," so the "block-coded ACS microdata" they describe is a capability that
does not exist (ACS PUMS microdata is anonymized to the PUMA, ~100k people, and can never be tied to a
block or address). The address-level extraction they show is TIGER geographic reference data (block
shapes/IDs — real) plus LexisNexis (commercial, not Census); the demographic gap was filled with the AARP
survey. The tells are in their own tables: an **education table totaling 6,845 people in a 4,655-person
community**; **income-source percentages summing to 255%/199%** (survey multi-select, not ACS shares);
race that "cannot be reconciled with the total population"; and a **median age of 76** ("unchanged since
2010") that real ACS puts at ~71 (tract) / ~74 (exact blocks).

**This report follows Jim's honest model instead.**

## Decisions (locked with John)

- **Deliverable:** a report *page* on census.jrow3.com (not a standalone PDF).
- **Model:** Jim's 2010 report structure/tone is the baseline; add the richer topics on top.
- **Framing:** present Oakmont as the **55+ active-adult community** — age bands begin at 55-59, the
  summary leads with "55+", and the small under-55 share is noted rather than featured.
- **Geography — hybrid** (matches how the data is actually published):
  - **Counts** (age/sex, race counts, household size, owner/renter, total population) → the **exact 76
    -block 2020 Decennial (DHC)** view already built. This is the legitimate way to "exclude blocks."
  - **Estimates** (income, income sources, per-capita, owner-vs-renter income, education, home value,
    tenure length, marital status, place of birth) → **tract-level 2020 ACS 5-year** (1516.01 + 1516.02),
    labeled the two-tract footprint with Jim's caveat.
- **Blocks:** keep the existing 76-block set as-is (population 4,994). No refinement — John confirms the
  footprint is correct. (Benchmark for reference, not a target: 4,699 dues-paying residents; 3,044 SFH
  units + 167 Oakmont Gardens rentals.)
- **Vintage:** 2020 ACS 5-year (2016–2020) + 2020 Decennial — a genuine "2020" report.

## Data model & pipeline

- Add a compact **`report2020`** section to the curated `site/data.json` (NOT the big mirror), so the
  report page loads fast without pulling the 10 MB explorer file. `report.html` reads `data.report2020`.
- To populate it, add the report's ACS tables to the curated `GROUPS` in `census-variables.mjs` so (a) the
  curated fetch pulls them into the 2020 ACS section, and (b) `sample-data.mjs` (which builds from
  `GROUPS`) produces a previewable sample automatically. A new `buildReportSection(acs2020, oakmont2020)`
  in `build-payload.mjs` derives the report figures from the 2020 ACS section values and the block
  section. Wired into both `fetch-census.mjs` (real) and `sample-data.mjs` (sample).
- **New curated ACS tables** (all confirmed present in the live mirror): income sources
  `B19051` (earnings), `B19052` (wage/salary), `B19053` (self-employment), `B19055` (Social Security),
  `B19056` (SSI), `B19057` (public assistance), `B19059` (retirement); aggregates for means `B19065`
  (agg Social Security), `B19066` (agg SSI), `B19067` (agg public assistance), `B19069` (agg retirement),
  `B19061` (agg earnings) — **exact aggregate codes verified against the live mirror at implementation**;
  SNAP `B22001`; tenure income `B25118`, `B25119`; home value `B25077` (have), `B25075`; education
  `B15003` (have); tenure length `B25038`, `B25039`; average size `B25010`; marital `B12001`; family vs
  nonfamily income `B19126`, `B19215`; place of birth `B05002`.
- Age/sex, race counts, household size, owner/renter counts, total population come from the existing
  `oakmont2020` (DHC block) section — no new fetch.

## Page structure (`report.html`)

Same Sonoma-Warm design; linked from the site's year-nav ("Community Report"). Each section states its
source inline (Decennial vs ACS) and, for ACS, the tract caveat. Numbered narrative findings + a chart,
in Jim's voice (plain, factual, quantified).

1. **Who are we? (Summary)** — 55+ framing. KPI row tagged by source: population (Decennial 4,994),
   median age (Decennial ~74), % age 65+ (Decennial), average household size (~1.5), owner-occupied %,
   median household income (ACS), per-capita income (ACS).
2. **Age & Gender** *(Decennial blocks)* — male/female age bands from 55-59 to 85+ (note the small
   under-55 share), a paired/diverging bar chart, median age, and the female skew (women ~2× men at 85+).
   Reproduces the 2020 report's age table with correct counts.
3. **Marital Status** *(ACS, `B12001`)* — compact table/chart, with the honest caveat both prior reports
   raised (2020 federal ACS treated same-sex married couples inconsistently). Kept light per John.
4. **Home Ownership & Tenure** *(Decennial counts + ACS)* — owner-occupied % (Decennial), household size
   / people-per-household and share living alone, average size by tenure (`B25010`), and **how long
   residents stay** — median move-in year and tenure-length distribution by owner/renter (`B25038/39`).
5. **Income & Employment** *(tract ACS)* — median household income (`B19013`), income distribution
   (`B19001`), per-capita (`B19301`), family vs nonfamily median income (`B19126`/`B19215`, i.e. couples
   vs singles like Jim), and labor-force status (`B23025`). Tract caveat stated.
6. **Sources of Income** *(tract ACS)* — the marquee chart: **% of households with** Social Security,
   retirement/pension, SSI, public assistance, SNAP, and earnings/self-employment, with **mean $** per
   source (aggregate ÷ households-with). Rebuilds Jim's page-7 table with real ACS. Explicitly replaces
   the 2020 report's AARP-survey version; notes that tract figures read "younger" than exact-Oakmont
   (e.g., ~80% on Social Security here vs Jim's exact-Oakmont 95%) because ACS is tract-level.
7. **Owner vs Renter Income** *(tract ACS, `B25119`/`B25118`)* — median income for owners vs renters and
   income distribution by tenure. The board's "page-5 chart," with real data.
8. **Home Value** *(tract ACS, `B25077`/`B25075`)* — median and distribution.
9. **Education** *(tract ACS, `B15003`)* — attainment 25+, % bachelor's+/graduate. Corrected: totals never
   exceed the 25+ population (unlike the 2020 report's 6,845).
10. **Race & Ethnicity** *(Decennial counts + ACS)* — race and Hispanic-origin figures presented cleanly
    (single-race counts + Hispanic ethnicity), with a note on multi-race reporting instead of an
    unreconcilable table.
11. **Where do residents come from?** *(tract ACS, `B05002`)* — place of birth (native/foreign; region if
    feasible) as the same surrogate both prior reports used. Optional/last.
12. **Methodology & Sources** — the credibility anchor: block-exact Decennial for counts, tract ACS for
    estimates, the tract caveat, **no AARP or commercial data**, a table-by-table citation list, and a
    plain note on ACS margins of error for small estimates.

## Charts

Reuse the existing primitives in `site/js/charts.js` where possible (`horizontalBars`, `stackedBar`).
New primitives, added minimally and unit-agnostic:
- **Paired horizontal bars** (male vs female by age band) for Age & Gender.
- **Grouped bars** (owner vs renter) for the tenure-income and household-size comparisons.
- **Labeled percent rows** (share + mean $) for the Sources of Income chart.

## Corrections vs. the 2020 volunteer report (explicit)

- Income sources from **ACS**, not the AARP survey; shares are real ACS household percentages.
- Education totals bounded by the 25+ population (no 6,845-in-4,655).
- Race presented as clean Census counts, not an "unreconcilable" survey table.
- Median age from real data (~74 exact blocks / ~71 tract), not the AARP-influenced 76.
- No COVID-relief, MLS, assessor, or LexisNexis figures.

## Out of scope

- AARP survey, LexisNexis, City/County, MLS/assessor data.
- Block-level ACS (does not exist).
- A standalone PDF (page only for now; can add a print stylesheet later).
- Margins-of-error columns (a plain note suffices; MoE not fetched).

## Files

**New:** `site/report.html`, `site/js/report.js` (renderer), report chart additions in
`site/js/charts.js`, `buildReportSection` in `scripts/build-payload.mjs` (+ tests).
**Modified:** `scripts/census-variables.mjs` (report tables), `scripts/fetch-census.mjs` and
`scripts/sample-data.mjs` (emit `report2020`), `site/index.html` + `site/changes.html` (year-nav link),
`site/styles.css`, `README.md`.
**Unchanged:** the explorer, mirror pipeline, block map.

## Testing

- `buildReportSection`: unit tests over the derived figures (source shares, means, owner/renter medians,
  age-band totals) with a fixture; guards for null/zero denominators.
- Any new chart math (paired-bar scaling) unit-tested.
- Sample build produces a valid `report2020`; `report.html` renders locally with no console errors;
  live spot-check after deploy.

## Phasing

1. Data: add tables, `buildReportSection`, wire fetch + sample, tests.
2. Page: `report.html` + `report.js` + charts + styles + nav link.
3. Methodology/prose + corrections, docs, verify, deploy.
