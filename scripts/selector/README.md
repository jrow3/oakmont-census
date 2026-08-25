# Block selector

Oakmont has no boundary of its own in Census records, so the exact-boundary figures on the site are
built from a hand-picked list of 2020 census blocks in `scripts/oakmont-blocks.json`. This directory
holds the tool for re-picking that list and the script for applying what comes back.

## Re-picking the boundary

```
node scripts/selector/build-selector.mjs
```

Writes `oakmont-block-selector.html` — one self-contained file, no server and no network needed.
Send it to whoever knows the community. It shows every block in the two tracts with its street
names and building footprints, pre-selected to the current list, and has **Copy list** and
**Download** buttons.

The build is reproducible: the same inputs always produce the same bytes, so the file is
gitignored and the four inputs under `data/` are tracked instead.

## Applying what comes back

```
node scripts/selector/apply-selection.mjs <downloaded.json> "why this changed"
node scripts/selector/apply-selection.mjs <downloaded.json> "why this changed" --write
```

The first form only reports the diff — which blocks moved, and what the population and housing-unit
totals become. Nothing is written until you add `--write`, because a block-list change moves every
exact-boundary figure on the site.

**Do not copy the downloaded file over `scripts/oakmont-blocks.json`.** It would run without error:
both files have a `geoids` key, and the fetch scripts read nothing else. But the download has *only*
that key, so the copy silently deletes `description`, `source`, `geography`, `tigerwebTotals` and the
entire `revisions` history — the record of why each block is in or out, including the reasoning
behind the Timber Springs removal. That history is what makes the list defensible rather than a bare
list of numbers. `apply-selection.mjs` merges instead: it keeps all of it, appends a revision entry
naming what moved and what the totals were beforehand, and recomputes the totals so they always
describe the geoids sitting beside them.

## After applying

Push. The deploy re-fetches from the Census API, and `scripts/reconcile.mjs` checks that every chart
still ties to its stated universe before anything goes live.

## Inputs under `data/`

| File | What it is |
|---|---|
| `all-blocks.geojson` | 124 blocks in tracts 1516.01 + 1516.02, with `POP100`/`HU100` from TIGERweb |
| `block-streets.json` | Street names per block, from county address points — how a block is actually recognised |
| `dots.json` | 4,376 building footprint centroids, so empty land reads as empty |
| `context.json` | Surrounding roads and features for orientation |
