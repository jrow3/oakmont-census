// Fetch 2020 DHC data for the frozen Oakmont blocks and sum each variable across them.
// Runs in GitHub Actions with CENSUS_API_KEY. Keyless DHC data requests return a "Missing Key"
// HTML page, so a key is required in CI; the non-JSON guard surfaces key problems in the log.

import { DEC_GEO, DEC_VARS, loadBlockGeoids } from './decennial-variables.mjs';
import { shapeTable } from './mirror.mjs';
import { getJson, mapLimit } from './census-http.mjs';

const API_KEY = (process.env.CENSUS_API_KEY || '').trim();
const CHUNK_SIZE = 45; // Census caps ~50 vars/request; leaves room for GEO fields.

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchBlockValues() {
  const geoids = await loadBlockGeoids();
  const keyParam = API_KEY ? `&key=${API_KEY}` : '';
  const values = {};

  for (const tract of DEC_GEO.tracts) {
    for (const varChunk of chunk(DEC_VARS, CHUNK_SIZE)) {
      const getStr = varChunk.join(',');
      const url =
        `https://api.census.gov/data/${DEC_GEO.dataset}?get=${getStr}` +
        `&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${keyParam}`;
      const res = await fetch(url);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        const title = (text.match(/<title>(.*?)<\/title>/i) || [])[1] || text.slice(0, 120).replace(/\s+/g, ' ').trim();
        throw new Error(`DHC returned non-JSON, likely an API key problem. Response said: "${title}"`);
      }
      const headers = json[0];
      const iState = headers.indexOf('state'), iCounty = headers.indexOf('county'),
            iTract = headers.indexOf('tract'), iBlock = headers.indexOf('block');
      for (const row of json.slice(1)) {
        const geoid = row[iState] + row[iCounty] + row[iTract] + row[iBlock];
        if (!geoids.has(geoid)) continue;
        for (const code of varChunk) {
          const idx = headers.indexOf(code);
          if (idx === -1) continue;
          const n = parseInt(row[idx], 10);
          if (!isNaN(n) && n >= 0) values[code] = (values[code] || 0) + n;
        }
      }
    }
  }
  return values;
}

const BASE = `https://api.census.gov/data/${DEC_GEO.dataset}`;
const KEY = API_KEY ? `&key=${API_KEY}` : '';

const blockKey = (h, r) =>
  r[h.indexOf('state')] + r[h.indexOf('county')] + r[h.indexOf('tract')] + r[h.indexOf('block')];

async function dhcLabels() {
  const vars = await getJson(`${BASE}/variables.json`);
  const labels = {};
  for (const [c, m] of Object.entries(vars.variables || {})) labels[c] = m.label;
  return labels;
}

async function dhcGroups() {
  const g = await getJson(`${BASE}/groups.json`);
  return (g.groups || []).map((x) => ({ id: x.name, concept: x.description }));
}

async function blockPops(geoids) {
  const pops = {};
  for (const tract of DEC_GEO.tracts) {
    const url = `${BASE}?get=P1_001N&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${KEY}`;
    const json = await getJson(url);
    const h = json[0];
    for (const r of json.slice(1)) {
      const k = blockKey(h, r);
      if (geoids.has(k)) pops[k] = parseInt(r[h.indexOf('P1_001N')], 10) || 0;
    }
  }
  return pops;
}

// Full 2020 DHC mirror summed over the selected blocks. Only tables the Census publishes at block
// geography are kept; finer tables error on the block query and are skipped.
export async function fetchBlockMirror() {
  const geoids = await loadBlockGeoids();
  const [labels, groups, pops] = await Promise.all([dhcLabels(), dhcGroups(), blockPops(geoids)]);
  const tables = {};
  let skipped = 0;
  await mapLimit(groups, 6, async (grp) => {
    let header = null;
    const kept = [];
    for (const tract of DEC_GEO.tracts) {
      const url = `${BASE}?get=group(${grp.id})&for=block:*&in=state:${DEC_GEO.state}+county:${DEC_GEO.county}+tract:${tract}${KEY}`;
      let json;
      try { json = await getJson(url); } catch { return; } // not block-available -> skip whole table
      header = json[0];
      for (const r of json.slice(1)) if (geoids.has(blockKey(header, r))) kept.push(r);
    }
    if (!header || kept.length === 0) { skipped++; return; }
    tables[grp.id] = shapeTable(grp.concept, [header, ...kept], labels, pops, blockKey);
  });
  console.log(`  Blocks: ${Object.keys(tables).length} DHC tables kept, ${skipped} skipped (not block-level)`);
  return {
    meta: { dataset: DEC_GEO.dataset, geography: `${geoids.size} Oakmont blocks`, generatedAt: new Date().toISOString() },
    tables,
  };
}
