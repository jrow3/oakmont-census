// One-time: fetch 2020 Census block polygons for the frozen Oakmont GEOIDs from TIGERweb
// and write site/blocks.geojson. The block list is frozen, so this output is committed and the
// site never calls TIGERweb at runtime. Re-run only if oakmont-blocks.json changes.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlockGeoids } from './decennial-variables.mjs';
import { getJson } from './census-http.mjs';

const SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'blocks.geojson');

async function findBlockLayer() {
  const meta = await getJson(`${SERVICE}/layers?f=json`);
  const layer = (meta.layers || []).find((l) => /^Census Blocks$/i.test(l.name));
  if (!layer) throw new Error('Could not find the 2020 Census Blocks layer in TIGERweb');
  return layer.id;
}

async function geoidField(layerId) {
  const meta = await getJson(`${SERVICE}/${layerId}?f=json`);
  const field = (meta.fields || []).find((f) => /^GEOID/i.test(f.name));
  if (!field) throw new Error('Could not find a GEOID field on the blocks layer');
  return field.name;
}

function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }

async function main() {
  const geoids = [...await loadBlockGeoids()];
  const layerId = await findBlockLayer();
  const field = await geoidField(layerId);
  const features = [];
  for (const part of chunk(geoids, 25)) {
    const inList = part.map((g) => `'${g}'`).join(',');
    const url = `${SERVICE}/${layerId}/query?where=${encodeURIComponent(`${field} IN (${inList})`)}` +
      `&outFields=${field}&returnGeometry=true&outSR=4326&f=geojson`;
    const fc = await getJson(url);
    features.push(...(fc.features || []));
  }
  const out = { type: 'FeatureCollection', features };
  await writeFile(OUT, JSON.stringify(out) + '\n', 'utf8');
  console.log(`Wrote ${features.length} block polygons to ${OUT}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
