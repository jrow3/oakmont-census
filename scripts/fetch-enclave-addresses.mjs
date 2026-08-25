// One-time: measure the two sub-areas people ask about — Wild Oak and Oakmont Gardens — using
// Sonoma County's public address-point layer, and write scripts/enclaves.json.
//
// Neither area can be excluded from the Census figures: census blocks don't nest inside either
// boundary, and nothing is published below the block. What we can do is size them exactly, which
// is what this produces. County address points calibrate well against Census housing units
// (see `calibration` in the output), so they are a sound basis for the share arithmetic.
//
// Keyless (county GIS + TIGERweb, no Census API key). Not run in CI — the output is committed.
// Re-run only if oakmont-blocks.json or the area definitions change.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getJson } from './census-http.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BLOCKS_GEOJSON = join(here, '..', 'site', 'blocks.geojson');
const OUT = join(here, 'enclaves.json');

const ADDRESSES = 'https://socogis.sonomacounty.ca.gov/map/rest/services/BASEPublic/Addresses_Public/MapServer/0/query';
const TIGER_BLOCKS = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/10/query';
const PAGE = 2000; // the county layer caps a single response here and sets exceededTransferLimit

// Each area is defined by how its addresses are matched, not by a block — the whole point is that
// the blocks are larger than the areas.
const AREAS = [
  {
    key: 'wild-oak',
    label: 'Wild Oak',
    match: { streets: ['Wild Oak'] },
    note: 'Wild Oak Dr and Wild Oak Ct.',
  },
  {
    key: 'oakmont-gardens',
    label: 'Oakmont Gardens',
    match: { streets: ['White Oak'], number: 301 },
    note: 'All unit addresses at 301 White Oak Dr.',
    allRental: true,
  },
];

function ringContains(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    if (!ringContains(point, polygon[0])) continue;
    const inHole = polygon.slice(1).some((hole) => ringContains(point, hole));
    if (!inHole) return true;
  }
  return false;
}

function boundsOf(features) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
      return;
    }
    coords.forEach(walk);
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  return [minX, minY, maxX, maxY];
}

async function fetchAddresses(bbox) {
  const rows = [];
  for (let offset = 0; ; ) {
    const params = new URLSearchParams({
      geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: 'Num,Name,Type,Unit,Lat,Long',
      returnGeometry: 'false', outSR: '4326',
      resultOffset: String(offset), resultRecordCount: String(PAGE), f: 'json',
    });
    const json = await getJson(`${ADDRESSES}?${params}`);
    const features = json.features || [];
    if (!features.length) break;
    rows.push(...features.map((f) => f.attributes));
    offset += features.length;
    if (!json.exceededTransferLimit) break;
  }
  return rows;
}

async function fetchBlockAttributes(geoids) {
  const attrs = {};
  for (let i = 0; i < geoids.length; i += 25) {
    const inList = geoids.slice(i, i + 25).map((g) => `'${g}'`).join(',');
    const params = new URLSearchParams({
      where: `GEOID IN (${inList})`, outFields: 'GEOID,POP100,HU100',
      returnGeometry: 'false', f: 'json',
    });
    const json = await getJson(`${TIGER_BLOCKS}?${params}`);
    for (const f of json.features || []) attrs[f.attributes.GEOID] = f.attributes;
  }
  return attrs;
}

const matches = (row, match) =>
  match.streets.some((s) => String(row.Name || '').toLowerCase() === s.toLowerCase()) &&
  (match.number == null || row.Num === match.number);

async function main() {
  const blocks = JSON.parse(await readFile(BLOCKS_GEOJSON, 'utf8'));
  const geoids = blocks.features.map((f) => f.properties.GEOID);
  const bbox = boundsOf(blocks.features);

  const addresses = await fetchAddresses(bbox);
  console.log(`Fetched ${addresses.length} county address points across the footprint bbox`);

  const assigned = [];
  for (const row of addresses) {
    if (row.Long == null || row.Lat == null) continue;
    const hit = blocks.features.find((f) => polygonContains([row.Long, row.Lat], f.geometry));
    assigned.push({ ...row, geoid: hit ? hit.properties.GEOID : null });
  }
  const inside = assigned.filter((a) => a.geoid);

  const attrs = await fetchBlockAttributes(geoids);
  const censusHousingUnits = geoids.reduce((a, g) => a + (attrs[g]?.HU100 || 0), 0);

  const areas = AREAS.map((area) => {
    const hits = inside.filter((row) => matches(row, area.match));
    if (!hits.length) throw new Error(`No addresses matched for ${area.label} — check the match rule`);
    const byBlock = {};
    for (const h of hits) byBlock[h.geoid] = (byBlock[h.geoid] || 0) + 1;
    const blockGeoids = Object.keys(byBlock);
    if (blockGeoids.length !== 1) {
      console.warn(`  ${area.label} spans ${blockGeoids.length} blocks: ${JSON.stringify(byBlock)}`);
    }
    const geoid = blockGeoids.sort((a, b) => byBlock[b] - byBlock[a])[0];
    const blockAddresses = inside.filter((row) => row.geoid === geoid).length;
    console.log(`  ${area.label}: ${hits.length} addresses in ${geoid} (block holds ${blockAddresses})`);
    return {
      key: area.key,
      label: area.label,
      note: area.note,
      ...(area.allRental ? { allRental: true } : {}),
      blockGeoid: geoid,
      addresses: hits.length,
      blockAddresses,
      blockPopulation: attrs[geoid]?.POP100 ?? null,
      blockHousingUnits: attrs[geoid]?.HU100 ?? null,
    };
  });

  // Largest non-enclave multi-unit property, so the "only apartments in Oakmont" claim is checked
  // by the data rather than asserted.
  const byBase = {};
  for (const row of inside) {
    const base = `${row.Num} ${row.Name} ${row.Type || ''}`.trim();
    byBase[base] = (byBase[base] || 0) + 1;
  }
  const multiUnit = Object.entries(byBase)
    .filter(([, n]) => n >= 5)
    .sort((a, b) => b[1] - a[1])
    .map(([address, records]) => ({ address, records }));

  const out = {
    description:
      'Sub-areas of Oakmont that people ask about. Neither can be excluded from the Census figures: ' +
      'census blocks do not nest inside either boundary and nothing is published below the block. ' +
      'These counts let the site state how large each area is instead.',
    source: 'Sonoma County GIS BASEPublic/Addresses_Public (address points) + TIGERweb 2020 Census Blocks (POP100/HU100)',
    accessed: new Date().toISOString().slice(0, 10),
    calibration: {
      note: 'County address points vs. Census housing units across the footprint; close agreement is what makes the share arithmetic sound.',
      addressPointsInFootprint: inside.length,
      censusHousingUnits,
      ratio: Number((inside.length / censusHousingUnits).toFixed(3)),
    },
    multiUnitProperties: multiUnit,
    areas,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
