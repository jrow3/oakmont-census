// Generate site/data.json with realistic PLACEHOLDER values so the page can be previewed
// offline, with no Census API key. Shapes match fetch-census.mjs exactly. These are NOT real
// figures - run `node scripts/fetch-census.mjs` (with CENSUS_API_KEY) for the genuine data.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIAN_VARS, GROUPS } from './census-variables.mjs';
import { buildGroups, buildSnapshot } from './build-payload.mjs';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'data.json');

const GROUP_TOTALS = {
  age: 5839, income: 3210, race: 5839, education: 5180,
  employment: 4760, housing: 3540, poverty: 5810,
};

const MEDIAN_SAMPLES = {
  'B19013_001E': 95400, 'B25064_001E': 2180, 'B25077_001E': 812400, 'B19301_001E': 61800,
};

// Marquee splits, set directly so the snapshot and key charts read like a 55+ community.
const FIXED = {
  'B01001_001E': 5839, 'B01001_002E': 2690, 'B01001_026E': 3149,
  'B02001_001E': 5839, 'B02001_002E': 5210, 'B02001_003E': 60, 'B02001_005E': 300,
  'B02001_008E': 210, 'B03003_001E': 5839, 'B03003_002E': 5479, 'B03003_003E': 360,
  'B25002_002E': 3160, 'B25002_003E': 380, 'B25003_002E': 2660, 'B25003_003E': 500,
  'B25024_002E': 2360, 'B25024_003E': 620, 'B25024_010E': 40,
  'B23025_002E': 1980, 'B23025_003E': 1955, 'B23025_004E': 1870, 'B23025_005E': 85, 'B23025_007E': 2780,
  'B17001_002E': 300, 'B17001_031E': 5510,
  'B15003_017E': 720, 'B15003_022E': 1480, 'B15003_023E': 980, 'B15003_024E': 210, 'B15003_025E': 260,
};

function distribute(codes, total, weightFn) {
  const weights = codes.map((_, i) => weightFn(i));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = {};
  codes.forEach((code, i) => { out[code] = Math.round((total * weights[i]) / sum); });
  return out;
}

function pseudo(code) {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 20 + (h % 380);
}

const ageCodes = Object.keys(GROUPS.age.variables);
const maleBands = ageCodes.slice(2, 25);   // B01001_003E .. _025E, young -> old
const femaleBands = ageCodes.slice(26, 49); // B01001_027E .. _049E, young -> old
const incomeBrackets = Object.keys(GROUPS.income.variables).slice(1, 17); // _002E .. _017E

const oldSkew = (i) => Math.pow(i + 1, 1.8);
const bell = (i) => Math.exp(-((i - 11) ** 2) / (2 * 4 ** 2));

const values = {};
for (const [gid, g] of Object.entries(GROUPS)) values[g.totalKey] = GROUP_TOTALS[gid];
Object.assign(values, MEDIAN_SAMPLES, FIXED);
Object.assign(values, distribute(maleBands, 2690, oldSkew));
Object.assign(values, distribute(femaleBands, 3149, oldSkew));
Object.assign(values, distribute(incomeBrackets, 3210, bell));

for (const g of Object.values(GROUPS)) {
  for (const code of Object.keys(g.variables)) {
    if (values[code] == null && !MEDIAN_VARS.has(code)) values[code] = pseudo(code);
  }
}

const data = {
  meta: {
    source: 'SAMPLE / placeholder data - not real census figures. Run fetch-census.mjs with CENSUS_API_KEY for real numbers.',
    geography: 'Census Tracts 1516.01 + 1516.02, Sonoma County, CA',
    year: '2023',
    generatedAt: new Date().toISOString(),
    sample: true,
  },
  snapshot: buildSnapshot(values),
  groups: buildGroups(values),
};

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Wrote sample ${OUT_PATH} (placeholder data, population ${data.snapshot.totalPopulation})`);
