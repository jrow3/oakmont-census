// Generate site/data.json with realistic PLACEHOLDER values so the page can be previewed
// offline, with no Census API key. Shapes match fetch-census.mjs exactly. These are NOT real
// figures - run `node scripts/fetch-census.mjs` (with CENSUS_API_KEY) for the genuine data.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIAN_VARS, GROUPS } from './census-variables.mjs';

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'data.json');

const GROUP_TOTALS = {
  age: 5839, income: 3210, race: 5839, education: 5180,
  employment: 4760, housing: 3540, poverty: 5810,
};

const MEDIAN_SAMPLES = {
  'B19013_001E': 95400, 'B25064_001E': 2180, 'B25077_001E': 812400, 'B19301_001E': 61800,
  'B01002_001E': 68, 'B01002_002E': 66, 'B01002_003E': 70,
  'B19019_001E': 95400, 'B19019_002E': 52000, 'B19019_003E': 98000, 'B19019_004E': 112000,
  'B19019_005E': 120000, 'B19019_006E': 108000, 'B19019_007E': 99000, 'B19019_008E': 90000,
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
  // Household size by tenure (B25009): a 55+ community skews to 1-2 person owner households.
  'B25009_001E': 3160,
  'B25009_002E': 2660, 'B25009_003E': 980, 'B25009_004E': 1420, 'B25009_005E': 150,
  'B25009_006E': 70, 'B25009_007E': 25, 'B25009_008E': 10, 'B25009_009E': 5,
  'B25009_010E': 500, 'B25009_011E': 300, 'B25009_012E': 150, 'B25009_013E': 30,
  'B25009_014E': 12, 'B25009_015E': 5, 'B25009_016E': 2, 'B25009_017E': 1,
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

import { buildAcsSection, assembleData, buildBlockSection } from './build-payload.mjs';
import { DEC_GROUPS, AGE_65_PLUS } from './decennial-variables.mjs';
import { buildReportSection } from './report-payload.mjs';

// `values` (built above) is the 2024 sample. Make a 2020 sample ~6% smaller on counts and
// medians so the 2024 page shows non-zero deltas in offline preview.
const values2024 = values;
const values2020 = Object.fromEntries(
  Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 0.94) : v])
);

const decValues = { P12_001N: 4994, P3_001N: 4994, P3_002N: 4790,
  P4_001N: 4994, P4_002N: 4810, P4_003N: 184, H1_001N: 3451, H3_002N: 3130, H3_003N: 321,
  H4_002N: 1540, H4_003N: 1390, H4_004N: 200 };
for (const c of AGE_65_PLUS) decValues[c] = 300;             // heavy 65+ presence
for (const g of Object.values(DEC_GROUPS)) for (const c of Object.keys(g.variables)) {
  if (decValues[c] == null) decValues[c] = 40;               // fill remaining bands
}
const oakmont2020 = buildBlockSection(decValues);

function tbl(obj) {
  const tables = {};
  for (const [code, value] of Object.entries(obj)) {
    const id = code.split('_')[0];
    (tables[id] ||= { concept: id, variables: {} }).variables[code] = { label: code, value };
  }
  return tables;
}

const sampleReportTables = tbl({
  B19013_001E: 78534, B19301_001E: 66078, B19126_001E: 114385, B19215_001E: 58853,
  B19001_001E: 3370, B19001_013E: 470, B19001_014E: 360, B19001_015E: 300, B19001_016E: 300, B19001_017E: 260,
  B25077_001E: 707911, B25075_001E: 2490, B25075_019E: 700, B25075_020E: 600, B25075_021E: 500, B25075_022E: 400,
  B15003_001E: 5673, B15003_017E: 900, B15003_021E: 400, B15003_022E: 2000, B15003_023E: 900, B15003_024E: 300, B15003_025E: 163,
  B25119_002E: 85057, B25119_003E: 66691,
  B25118_002E: 2490, B25118_014E: 880, B25118_009E: 700, B25118_010E: 500, B25118_021E: 300, B25118_022E: 120,
  B25009_003E: 900, B25009_011E: 300, B25009_004E: 1200, B25009_012E: 150, B25009_005E: 150, B25009_013E: 30,
  B25009_006E: 70, B25009_014E: 12, B25009_007E: 25, B25009_015E: 5, B25009_008E: 10, B25009_016E: 2, B25009_009E: 5, B25009_017E: 1,
  B19055_001E: 3370, B19055_002E: 2706, B19065_001E: 2706 * 23479,
  B19059_001E: 3370, B19059_002E: 1918, B19069_001E: 1918 * 43466,
  B19051_001E: 3370, B19051_002E: 1240, B19061_001E: 1240 * 106287,
  B19053_001E: 3370, B19053_002E: 300,
  B19056_001E: 3370, B19056_002E: 74, B19066_001E: 74 * 8073,
  B19057_001E: 3370, B19057_002E: 20, B19067_001E: null,
  B22001_001E: 3370, B22001_002E: 30,
  B12001_001E: 5829, B12001_003E: 200, B12001_004E: 1650, B12001_009E: 120, B12001_010E: 300,
  B12001_012E: 260, B12001_013E: 1500, B12001_018E: 620, B12001_019E: 350,
  B05002_001E: 5949, B05002_003E: 2692, B05002_005E: 791, B05002_006E: 911, B05002_007E: 357, B05002_008E: 456, B05002_013E: 713,
});
const report2020 = buildReportSection(sampleReportTables, oakmont2020);

import { GROUPS as _G } from './census-variables.mjs';
import { DEC_GROUPS as _DG } from './decennial-variables.mjs';

const tableIdOf = (code) => code.split('_')[0];

function sampleMirror(vals, groups, meta) {
  const tables = {};
  for (const g of Object.values(groups)) {
    for (const [code, label] of Object.entries(g.variables)) {
      const id = tableIdOf(code);
      (tables[id] ||= { concept: g.label, variables: {} }).variables[code] = {
        label, value: vals[code] ?? null,
      };
    }
  }
  return { meta, tables };
}

const data = assembleData(
  { '2020': buildAcsSection('2020', values2020), '2024': buildAcsSection('2024', values2024) },
  { sample: true, oakmont2020, report2020 }
);

const explorerDir = join(dirname(OUT_PATH), 'explorer');
await mkdir(explorerDir, { recursive: true });
await writeFile(join(explorerDir, 'acs2020.json'),
  JSON.stringify(sampleMirror(values2020, _G, { dataset: 'acs/acs5', year: '2020', sample: true })) + '\n', 'utf8');
await writeFile(join(explorerDir, 'acs2024.json'),
  JSON.stringify(sampleMirror(values2024, _G, { dataset: 'acs/acs5', year: '2024', sample: true })) + '\n', 'utf8');
await writeFile(join(explorerDir, 'blocks2020.json'),
  JSON.stringify(sampleMirror(decValues, _DG, { dataset: '2020/dec/dhc', sample: true })) + '\n', 'utf8');

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Wrote sample ${OUT_PATH} (population 2020 ${data.acs2020.snapshot.totalPopulation}, 2024 ${data.acs2024.snapshot.totalPopulation})`);
