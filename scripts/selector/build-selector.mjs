// Builds the standalone block-selector page: a self-contained HTML file with the block geometry,
// street names, building footprints and the current selection baked in, so it can be handed to
// someone with local knowledge and opened with no server and no network.
//
// Run: node scripts/selector/build-selector.mjs
// Then send the file it writes. What comes back goes through apply-selection.mjs — never straight
// into oakmont-blocks.json, which carries provenance the selector's download does not.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');
const BLOCKS_PATH = join(HERE, '..', 'oakmont-blocks.json');
const OUT_PATH = join(HERE, 'oakmont-block-selector.html');

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const blocks = read(join(DATA, 'all-blocks.geojson'));
const context = read(join(DATA, 'context.json'));
const streets = read(join(DATA, 'block-streets.json'));
const dots = read(join(DATA, 'dots.json'));
const current = read(BLOCKS_PATH).geoids;

// A GEOID means nothing to a reader; the street names in a block are how anyone actually
// recognises it on the map.
for (const f of blocks.features) {
  const s = streets[f.properties.GEOID];
  if (s) { f.properties.ST = s.s; f.properties.NA = s.n; }
}

const template = readFileSync(join(HERE, 'selector-template.html'), 'utf8');
const out = template
  .replace('DATA_BLOCKS', JSON.stringify(blocks))
  .replace('DATA_CONTEXT', JSON.stringify(context))
  .replace('DATA_DOTS', JSON.stringify(dots))
  .replace('DATA_BASELINE', JSON.stringify(current));

writeFileSync(OUT_PATH, out);
console.log(`wrote ${OUT_PATH}  (${(out.length / 1024).toFixed(0)} KB)`);
console.log(`  blocks ${blocks.features.length}, pre-selected ${current.length}`);
console.log(`  buildings plotted ${dots.length}`);
console.log(`  blocks with street names ${blocks.features.filter((f) => f.properties.ST).length}`);
