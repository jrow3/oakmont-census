// Fetch ACS 2023 5-year data for Oakmont Village (Sonoma County tracts 1516.01 + 1516.02),
// aggregate across the two tracts, and write site/data.json.
//
// Runs in GitHub Actions with CENSUS_API_KEY as a secret. The key is optional: the Census API
// works without one (rate-limited), so local runs need no key. The key never reaches the browser.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEO, MEDIAN_VARS, GROUPS } from './census-variables.mjs';
import { buildGroups, buildSnapshot } from './build-payload.mjs';

const API_KEY = process.env.CENSUS_API_KEY || '';
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

async function fetchAllValues() {
  const allVars = [...new Set(Object.values(GROUPS).flatMap((g) => Object.keys(g.variables)))];
  const keyParam = API_KEY ? `&key=${API_KEY}` : '';
  const tractStr = GEO.tracts.join(',');
  const values = {};

  for (const varChunk of chunk(allVars, CHUNK_SIZE)) {
    const getVars = [...new Set([GEO.popVar, ...varChunk])];
    const getStr = ['NAME', ...getVars].join(',');
    const url =
      `https://api.census.gov/data/${GEO.year}/acs/acs5?get=${getStr}` +
      `&for=tract:${tractStr}&in=state:${GEO.state}+county:${GEO.county}${keyParam}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Census API error ${res.status} ${res.statusText} for chunk starting ${varChunk[0]}`);
    }
    const json = await res.json();
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
  console.log(`Fetching ACS ${GEO.year} 5-year for tracts ${GEO.tracts.join(', ')} ${API_KEY ? '(with key)' : '(no key)'}`);
  const values = await fetchAllValues();
  const data = {
    meta: {
      source: 'U.S. Census Bureau, 2023 ACS 5-Year Estimates',
      geography: 'Census Tracts 1516.01 + 1516.02, Sonoma County, CA',
      year: GEO.year,
      generatedAt: new Date().toISOString(),
    },
    snapshot: buildSnapshot(values),
    groups: buildGroups(values),
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Population ${data.snapshot.totalPopulation}, median HH income $${data.snapshot.medianHouseholdIncome}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
