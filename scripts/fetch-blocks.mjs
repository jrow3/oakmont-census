// Fetch 2020 DHC data for the frozen Oakmont blocks and sum each variable across them.
// Runs in GitHub Actions with CENSUS_API_KEY. Keyless DHC data requests return a "Missing Key"
// HTML page, so a key is required in CI; the non-JSON guard surfaces key problems in the log.

import { DEC_GEO, DEC_VARS, loadBlockGeoids } from './decennial-variables.mjs';

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
