// Applies a selection returned from the block-selector page to scripts/oakmont-blocks.json.
//
// Run: node scripts/selector/apply-selection.mjs <downloaded.json> "why this changed"
//      node scripts/selector/apply-selection.mjs <downloaded.json> "why" --write
//
// Without --write it only reports what would change. Nothing is written until you have read the
// diff, because a block list change moves every exact-boundary figure on the site.
//
// This exists because the selector's download and the repo's file share a `geoids` key and
// nothing else. Copying the download over the repo file would run without error and silently
// delete `description`, `source`, `geography`, `tigerwebTotals`, and the whole `revisions`
// history — the record of why each block is in or out. That history is the only thing standing
// between "traced by hand from local knowledge" and "a list of numbers nobody can defend".

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BLOCKS_PATH = join(HERE, '..', 'oakmont-blocks.json');
const GEOMETRY_PATH = join(HERE, 'data', 'all-blocks.geojson');

const GEOID = /^\d{15}$/;

// The selector reports POP100/HU100 from TIGERweb for whatever is selected. Recomputing them here
// from the same geometry means the totals in the file always describe the geoids beside them,
// rather than being carried over from a previous selection.
export function totalsFor(geoids, features) {
  const by = new Map(features.map((f) => [f.properties.GEOID, f.properties]));
  let population = 0;
  let housingUnits = 0;
  for (const id of geoids) {
    const p = by.get(id);
    if (!p) continue;
    population += Number(p.POP100) || 0;
    housingUnits += Number(p.HU100) || 0;
  }
  return { blocks: geoids.length, population, housingUnits };
}

export function applySelection(current, incoming, { date, note, features = [] }) {
  const geoids = incoming.geoids;
  if (!Array.isArray(geoids) || !geoids.length) {
    throw new Error('The selection has no geoids. Is this the file the selector downloaded?');
  }
  const bad = geoids.filter((id) => !GEOID.test(id));
  if (bad.length) {
    throw new Error(`${bad.length} entries are not 15-digit block GEOIDs, e.g. ${bad[0]}`);
  }
  if (new Set(geoids).size !== geoids.length) {
    throw new Error('The selection contains duplicate GEOIDs.');
  }

  const before = new Set(current.geoids);
  const after = new Set(geoids);
  const added = geoids.filter((id) => !before.has(id)).sort();
  const removed = current.geoids.filter((id) => !after.has(id)).sort();
  if (!added.length && !removed.length) {
    return { unchanged: true, added, removed, next: current };
  }

  const totals = features.length ? totalsFor(geoids, features) : null;
  const next = {
    ...current,
    source: `Manual selection via the block-selector map, ${date}`,
    // Newest first: whoever opens this file is asking what changed most recently.
    revisions: [
      {
        date,
        change: note,
        added,
        removed,
        priorTotals: {
          blocks: current.tigerwebTotals?.blocks ?? current.geoids.length,
          population: current.tigerwebTotals?.population ?? null,
          housingUnits: current.tigerwebTotals?.housingUnits ?? null,
        },
      },
      ...(current.revisions || []),
    ],
    tigerwebTotals: totals
      ? { ...current.tigerwebTotals, ...totals }
      : current.tigerwebTotals,
    geoids: [...geoids].sort(),
  };
  return { unchanged: false, added, removed, totals, next };
}

function main() {
  const [file, note, ...flags] = process.argv.slice(2);
  const write = flags.includes('--write');
  if (!file || !note) {
    console.log('usage: node scripts/selector/apply-selection.mjs <downloaded.json> "why this changed" [--write]');
    process.exitCode = 1;
    return;
  }

  const current = JSON.parse(readFileSync(BLOCKS_PATH, 'utf8'));
  const incoming = JSON.parse(readFileSync(file, 'utf8'));
  const features = JSON.parse(readFileSync(GEOMETRY_PATH, 'utf8')).features;
  // Passed in rather than read from the clock so the same inputs always produce the same file.
  const date = new Date().toISOString().slice(0, 10);

  const result = applySelection(current, incoming, { date, note, features });
  if (result.unchanged) {
    console.log('The selection matches the current block list exactly. Nothing to do.');
    return;
  }

  const t = result.totals;
  const prior = current.tigerwebTotals || {};
  console.log(`added   ${result.added.length}`);
  for (const id of result.added) console.log(`  + ${id}`);
  console.log(`removed ${result.removed.length}`);
  for (const id of result.removed) console.log(`  - ${id}`);
  if (t) {
    console.log(`\nblocks        ${prior.blocks} -> ${t.blocks}`);
    console.log(`population    ${prior.population} -> ${t.population}`);
    console.log(`housing units ${prior.housingUnits} -> ${t.housingUnits}`);
  }

  if (!write) {
    console.log('\nNothing written. Re-run with --write once the diff above looks right.');
    return;
  }
  writeFileSync(BLOCKS_PATH, JSON.stringify(result.next, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${BLOCKS_PATH}. Push to rebuild — every exact-boundary figure will move.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
