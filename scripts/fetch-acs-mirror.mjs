// Pull the FULL ACS 5-year detailed-table catalog (incl. race-iterated tables) for the two
// Oakmont tracts, aggregate across them, and return a per-year mirror object for the explorer.
// One request per table via get=group(ID), which returns each estimate and its margin of error in
// the same response. Medians are weighted by tract population.

import { GEO } from './census-variables.mjs';
import { shapeTable } from './mirror.mjs';
import { getJson, mapLimit } from './census-http.mjs';

const API_KEY = (process.env.CENSUS_API_KEY || '').trim();
const KEY = API_KEY ? `&key=${API_KEY}` : '';
const CONCURRENCY = 8;
const POP_VAR = 'B01003_001E';
const base = (year) => `https://api.census.gov/data/${year}/acs/acs5`;
const inClause = `&for=tract:${GEO.tracts.join(',')}&in=state:${GEO.state}+county:${GEO.county}`;

const rowKey = (h, r) => r[h.indexOf('state')] + r[h.indexOf('county')] + r[h.indexOf('tract')];

async function loadLabels(year) {
  const vars = await getJson(`${base(year)}/variables.json`);
  const labels = {};
  for (const [code, meta] of Object.entries(vars.variables || {})) labels[code] = meta.label;
  return labels;
}

async function loadGroups(year) {
  const g = await getJson(`${base(year)}/groups.json`);
  return (g.groups || []).map((x) => ({ id: x.name, concept: x.description }));
}

async function tractPops(year) {
  const json = await getJson(`${base(year)}?get=NAME,${POP_VAR}${inClause}${KEY}`);
  const h = json[0];
  const out = {};
  for (const r of json.slice(1)) out[rowKey(h, r)] = parseInt(r[h.indexOf(POP_VAR)], 10) || 0;
  return out;
}

export async function fetchAcsMirror(year) {
  const [labels, groups, pops] = await Promise.all([loadLabels(year), loadGroups(year), tractPops(year)]);
  const tables = {};
  let done = 0, skipped = 0;
  await mapLimit(groups, CONCURRENCY, async (grp) => {
    try {
      const json = await getJson(`${base(year)}?get=group(${grp.id})${inClause}${KEY}`);
      tables[grp.id] = shapeTable(grp.concept, json, labels, pops, rowKey);
    } catch {
      skipped++;
      return;
    }
    if (++done % 200 === 0) console.log(`  ACS ${year}: ${done}/${groups.length} tables`);
  });
  console.log(`  ACS ${year}: ${Object.keys(tables).length} tables kept, ${skipped} skipped`);
  return { meta: { dataset: 'acs/acs5', year, generatedAt: new Date().toISOString() }, tables };
}
