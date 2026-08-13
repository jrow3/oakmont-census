# Methodology page — design

Date: 2026-08-13
Status: draft for review

## Goal

A new **Methodology** page on census.jrow3.com that explains, in one read, what data the site
uses, at what geographic level each figure exists, and *why* some parts of the Community Report
must fall back to broader (tract-level) data while others use exact (block-level) counts. It is
written as a **progressive gradient**: it opens ELI5 and gets steadily more technical as you
scroll, so a casual resident and a data professional both find their level on the same page.

## Decisions (locked with John)

- **Presentation — progressive gradient.** One page, top-to-bottom from plain to precise. A sticky
  jump-nav lets an expert skip straight to the deep end. No Simple/Detailed toggle, no per-section
  expand/collapse — the scroll *is* the depth control.
- **The block-ACS problem — principle, no names.** Explain generally why block-level ACS
  demographics don't exist (ACS is a survey; to protect privacy its detailed tables are only
  published for areas of ~1,200+ people, so income/education for a single block are never
  published) and why survey/commercial workarounds aren't Census-reliable. Do **not** single out
  the unreleased 2020 volunteer report or name people. (Contrast: the Community Report spec keeps
  the named critique internal; this public page teaches the principle only.)
- **Nav name — "Methodology"**, added as the 4th page link.
- **Nav order (all pages), left to right:** **Community Report · 2020 Portrait · 2024 Update ·
  Methodology.** This reorders the existing three links (currently 2020 Portrait · 2024 Update ·
  Community Report) and appends Methodology.

## Content — the five bands (plain → precise)

1. **The short version** *(ELI5).* Three sentences: Oakmont isn't its own "city" in Census data, so
   we traced it from 76 census blocks; some numbers are exact head-counts and others are survey
   estimates; that mix is why the report pulls different figures from different places.
2. **Two kinds of Census data.** A side-by-side comparison:
   - **Decennial Census (DHC)** — a 100% head-count taken every 10 years. *Counts only:* age, sex,
     race, household occupancy, owner/renter. Exact, no margin of error, published all the way down
     to the individual block.
   - **American Community Survey (ACS)** — a rolling **sample** survey, published as 5-year
     estimates. The *rich* variables: income, education, home value, marital status, place of
     birth. Comes with margins of error, and its detailed tables stop at the tract.
3. **The geography ladder** *(centerpiece diagram).* Nested levels Nation → State → County →
   **Tract → Block Group → Block**, with Oakmont's 76 blocks highlighted. The diagram shows
   Decennial reaching the **Block** and ACS detailed tables stopping at the **Tract**. This is the
   visual that makes "why limited data for some parts" click. Below it, the Oakmont-specific
   wrinkle: there is **no Census place code** for Oakmont and **no machine-readable OVA boundary
   polygon**, which is why the exact view is a hand-picked set of 76 blocks rather than an
   off-the-shelf geography.
4. **Which number comes from where** *(source-mapping table).* One row per report topic:
   *figure → dataset → geography → why.* Examples: age/sex, race, household size, owner/renter,
   population → **2020 Decennial, exact 76 blocks**; income, per-capita, income sources, education,
   home value, marital status, place of birth → **2020 ACS 5-year, tracts 1516.01 + 1516.02**.
   The "why" column carries the payoff: counts exist at the block, estimates only at the tract.
5. **The fine print** *(expert tier).* The "why can't you just use block-level ACS?" answer stated
   as principle (survey → ~1,200+ population threshold → block-level income/education simply are not
   published → workarounds like member surveys or commercial address data aren't Census-reliable, so
   this site doesn't use them). Plus: 2020 Decennial **differential-privacy noise** (small,
   averages out across 76 blocks); **ACS margins of error** (estimates, not exact); the actual
   variable codes used (age/sex `P12`, race `P3`, Hispanic `P4`, occupancy `H3`, tenure `H4`;
   income `B19013`/`B19301`, education `B15001` 45+, home value `B25077`, etc.); and the **55+ vs
   65+** derivation (55+ = total − under-55 from the block P12 age bands; the site reports the 55+
   share because Oakmont is a 55+ community).

## Architecture

Follows the existing per-page pattern (static HTML shell + a JS module + shared `styles.css`), with
one deliberate divergence: because this page is **documentation prose, not a data dashboard**, the
prose lives as semantic HTML in the page rather than being rendered from JS.

- **`site/methodology.html`** — the shell: same masthead/footer, the reordered `year-nav` with the
  active Methodology link, a sample-data banner, and the five bands as semantic `<section>`s of real
  HTML prose. Anchor figures that could drift are marked with `data-figure="..."` spans for JS to
  fill. Sticky jump-nav is a `<nav>` listing the five section anchors.
- **`site/js/methodology.js`** — three jobs, no data *fetching* beyond the shared `data.json`:
  1. **Anchor injection** — read the small `data.json` (already loaded pattern), honor `meta.sample`
     (show the banner), and fill each `data-figure` span (population 4,994, block count 76, tract
     IDs 1516.01/1516.02, 55+ share 92%). Keeps the prose honest and self-updating.
  2. **Geography-ladder diagram + source table** — build with CSS/SVG nested boxes and a plain
     `<table>`. **No new library.**
  3. **Scroll-spy** — a pure `activeSectionFor(scrollY, sections)` helper marks the current
     jump-nav link; wired to a scroll listener.
- **Nav reorder** touches `index.html`, `changes.html`, `report.html` (reorder the three existing
  links, append Methodology) and the new `methodology.html`.
- **Styling** — additions to `styles.css` for the gradient sections, the geography diagram, the
  source table, and the sticky jump-nav. Reuse existing Sonoma-Warm tokens; no new fonts/colors.

## Testing

- **`activeSectionFor(scrollY, sections)`** — pure function, unit-tested (`node --test`): returns
  the last section whose top is at/above the scroll offset; clamps at the first section above the
  first threshold and the last section at the bottom.
- **Anchor injection** — a small pure helper that maps `data.json` → a `{figureKey: value}` object
  is unit-tested against a sample payload (asserts population, block count, 55+ share resolve).
- Pure prose, the diagram, and scroll wiring are verified by rendering the page locally and reading
  it (browser), not by unit tests.

## Out of scope (YAGNI)

- No Simple/Detailed toggle, no collapsible sections (the gradient replaces both).
- No new data fetching, no new `data.json` fields — reuses what the site already bakes.
- No naming/critique of the unreleased 2020 volunteer report (principle, no names).
- No PDF/print export.

## Verification

Build the sample `data.json`, serve `site/` locally, and confirm in the browser: the four nav
links appear in order **Community Report · 2020 Portrait · 2024 Update · Methodology** on every
page; the anchor figures resolve (not blank); the geography diagram renders with Oakmont
highlighted; the source table lists each topic with its dataset/geography/why; and the jump-nav
highlights the section in view as you scroll. Then deploy = push to main (John's call).
