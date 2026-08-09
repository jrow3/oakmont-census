// Fetch ACS 2020 and 2024 5-year data for Oakmont Village (Sonoma County tracts 1516.01 + 1516.02),
// aggregate across the two tracts, and write site/data.json.
//
// Runs in GitHub Actions with CENSUS_API_KEY as a secret. The key is optional: the Census API
// works without one (rate-limited), so local runs need no key. The key never reaches the browser.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEO, MEDIAN_VARS, GROUPS, ACS_YEARS } from './census-variables.mjs';
import { buildAcsSection, assembleData } from './build-payload.mjs';

const API_KEY = (process.env.CENSUS_API_KEY || '').trim();
const CHUNK_SIZE = 44; // Census API caps ~50 variables/request; leaves room for NAME + popVar.

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'data.json');

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Count variables are summed across tracts; median variables are population-weighted.
// ACS encodes N/A and suppressed values as negatives (e.g. -666666666).
function aggregate(varCode, rows, idx, popIdx) {
  if (MEDIAN_VARS.has(varCode)) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const row of rows) {
      const val = parseInt(row[idx], 10);
      const pop = popIdx >= 0 ? parseInt(row[popIdx], 10) : 1;
      if (!isNaN(val) && val > 0 && !isNaN(pop) && pop > 0) {
        weightedSum += val * pop;
        totalWeight += pop;
      }
    }
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
  }
  let sum = 0;
  let anyValid = false;
  for (const row of rows) {
    const val = parseInt(row[idx], 10);
    if (!isNaN(val) && val >= 0) {
      sum += val;
      anyValid = true;
    }
  }
  return anyValid ? sum : null;
}

async function fetchAllValues(year) {
  const allVars = [...new Set(Object.values(GROUPS).flatMap((g) => Object.keys(g.variables)))];
  const keyParam = API_KEY ? `&key=${API_KEY}` : '';
  const tractStr = GEO.tracts.join(',');
  const values = {};

  for (const varChunk of chunk(allVars, CHUNK_SIZE)) {
    const getVars = [...new Set([GEO.popVar, ...varChunk])];
    const getStr = ['NAME', ...getVars].join(',');
    const url =
      `https://api.census.gov/data/${year}/acs/acs5?get=${getStr}` +
      `&for=tract:${tractStr}&in=state:${GEO.state}+county:${GEO.county}${keyParam}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Census API error ${res.status} ${res.statusText} for chunk starting ${varChunk[0]}`);
    }
    // The Census API returns HTTP 200 with an HTML page (not JSON) for key problems, so
    // guard the parse and surface the page's message instead of a cryptic JSON error.
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      const title = (text.match(/<title>(.*?)<\/title>/i) || [])[1] || text.slice(0, 120).replace(/\s+/g, ' ').trim();
      throw new Error(`Census API returned non-JSON, likely an API key problem. Response said: "${title}"`);
    }
    const headers = json[0];
    const rows = json.slice(1); // one row per tract
    const popIdx = headers.indexOf(GEO.popVar);

    for (const varCode of varChunk) {
      const idx = headers.indexOf(varCode);
      if (idx === -1) continue;
      values[varCode] = aggregate(varCode, rows, idx, popIdx);
    }
  }
  return values;
}

async function main() {
  const sections = {};
  for (const year of ACS_YEARS) {
    console.log(`Fetching ACS ${year} 5-year for tracts ${GEO.tracts.join(', ')} ${API_KEY ? '(with key)' : '(no key)'}`);
    const values = await fetchAllValues(year);
    sections[year] = buildAcsSection(year, values);
    console.log(`  ${year}: population ${sections[year].snapshot.totalPopulation}, median HH income $${sections[year].snapshot.medianHouseholdIncome}`);
  }

  const data = assembleData(sections);
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
