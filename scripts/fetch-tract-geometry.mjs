// One-time: fetch 2020 Census tract polygons for Oakmont's two tracts (1516.01, 1516.02) from
// TIGERweb and write site/tracts.geojson. The tracts are fixed, so this output is committed and
// the site never calls TIGERweb at runtime. Re-run only if DEC_GEO changes.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEC_GEO } from './decennial-variables.mjs';
import { getJson } from './census-http.mjs';

const SERVICE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'tracts.geojson');

async function findTractLayer() {
  const meta = await getJson(`${SERVICE}/layers?f=json`);
  const layer = (meta.layers || []).find((l) => /^Census Tracts$/i.test(l.name));
  if (!layer) throw new Error('Could not find the 2020 Census Tracts layer in TIGERweb');
  return layer.id;
}

async function geoidField(layerId) {
  const meta = await getJson(`${SERVICE}/${layerId}?f=json`);
  const field = (meta.fields || []).find((f) => /^GEOID/i.test(f.name));
  if (!field) throw new Error('Could not find a GEOID field on the tracts layer');
  return field.name;
}

async function main() {
  const geoids = DEC_GEO.tracts.map((t) => `${DEC_GEO.state}${DEC_GEO.county}${t}`);
  const layerId = await findTractLayer();
  const field = await geoidField(layerId);
  const inList = geoids.map((g) => `'${g}'`).join(',');
  const url = `${SERVICE}/${layerId}/query?where=${encodeURIComponent(`${field} IN (${inList})`)}` +
    `&outFields=${field}&returnGeometry=true&outSR=4326&f=geojson`;
  const fc = await getJson(url);
  const out = { type: 'FeatureCollection', features: fc.features || [] };
  await writeFile(OUT, JSON.stringify(out) + '\n', 'utf8');
  console.log(`Wrote ${out.features.length} tract polygons to ${OUT}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
