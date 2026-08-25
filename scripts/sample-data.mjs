// Generate site/data.json with realistic PLACEHOLDER values so the page can be previewed
// offline, with no Census API key. Shapes match fetch-census.mjs exactly. These are NOT real
// figures - run `node scripts/fetch-census.mjs` (with CENSUS_API_KEY) for the genuine data.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIAN_VARS, GROUPS } from './census-variables.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(here, '..', 'site', 'data.json');
const ENCLAVES_PATH = join(here, 'enclaves.json');

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
import { DEC_GROUPS, AGE_65_PLUS, loadBlockGeoids } from './decennial-variables.mjs';
import { buildReportSection } from './report-payload.mjs';
import { buildEnclaveSection } from './enclave-impact.mjs';

// `values` (built above) is the 2024 sample. Make a 2020 sample ~6% smaller on counts and
// medians so the 2024 page shows non-zero deltas in offline preview.
const values2024 = values;
const values2020 = Object.fromEntries(
  Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 0.94) : v])
);

// The 2020 snapshot and the Community Report read the SAME ACS codes from different sample
// sources, so without this they disagree on figures that agree in production — which makes local
// preview misleading and has already sent a review chasing a bug that doesn't exist.
// SHARED_2020 is the single sample value for every code both paths render.
const SHARED_2020 = {
  B19013_001E: 78534,   // median household income
  B19301_001E: 66078,   // per-capita income
  B25077_001E: 707911,  // median home value
  B19001_001E: 3370,    // households (snapshot callout + report income universe)
};
Object.assign(values2020, SHARED_2020);

const decValues = { P12_001N: 4946, P3_001N: 4946, P3_002N: 4744,
  P4_001N: 4946, P4_002N: 4763, P4_003N: 183, H1_001N: 3427, H3_002N: 3110, H3_003N: 317,
  H4_002N: 1530, H4_003N: 1380, H4_004N: 200 };
for (const c of AGE_65_PLUS) decValues[c] = 300;             // heavy 65+ presence
for (const g of Object.values(DEC_GROUPS)) for (const c of Object.keys(g.variables)) {
  if (decValues[c] == null) decValues[c] = 40;               // fill remaining bands
}
const blockCount = (await loadBlockGeoids()).size;
const oakmont2020 = buildBlockSection(decValues, { blockCount });

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
  B15001_027E: 344, B15001_030E: 31, B15001_031E: 59, B15001_033E: 108, B15001_034E: 95,
  B15001_035E: 1706, B15001_038E: 93, B15001_039E: 274, B15001_041E: 613, B15001_042E: 619,
  B15001_068E: 522, B15001_071E: 50, B15001_072E: 68, B15001_074E: 158, B15001_075E: 178,
  B15001_076E: 2461, B15001_079E: 340, B15001_080E: 682, B15001_082E: 651, B15001_083E: 487,
  B25119_002E: 85057, B25119_003E: 66691,
  B25118_002E: 2490, B25118_014E: 880, B25118_009E: 700, B25118_010E: 500, B25118_021E: 300, B25118_022E: 120,
  B25009_003E: 900, B25009_011E: 300, B25009_004E: 1200, B25009_012E: 150, B25009_005E: 150, B25009_013E: 30,
  B25009_006E: 70, B25009_014E: 12, B25009_007E: 25, B25009_015E: 5, B25009_008E: 10, B25009_016E: 2, B25009_009E: 5, B25009_017E: 1,
  B19055_001E: 3370, B19055_002E: 2706, B19065_001E: 2706 * 23479,
  B19059_001E: 3370, B19059_002E: 1918, B19069_001E: 1918 * 43466,
  B19051_001E: 3370, B19051_002E: 1240, B19061_001E: 1240 * 106287,
  B19053_001E: 3370, B19053_002E: 427, B19063_001E: 427 * 41200,
  B19054_001E: 3370, B19054_002E: 1820, B19064_001E: 1820 * 28400,
  B19056_001E: 3370, B19056_002E: 74, B19066_001E: 74 * 8073,
  // Public assistance is suppressed by the Bureau at this size, and no household reports SNAP.
  // Between them these exercise all three "no amount" states in the sources table.
  B19057_001E: 3370, B19057_002E: 20, B19067_001E: null,
  B22001_001E: 3370, B22001_002E: 0,
  B12001_001E: 5829, B12001_003E: 200, B12001_004E: 1650, B12001_009E: 120, B12001_010E: 300,
  B12001_012E: 260, B12001_013E: 1500, B12001_018E: 620, B12001_019E: 350,
  // B12002 55+ leaves: never married, spouse-present, separated, other, widowed, divorced (M then F)
  B12002_013E: 30, B12002_014E: 30, B12002_015E: 40, B12002_016E: 25, B12002_017E: 10,
  B12002_029E: 190, B12002_030E: 210, B12002_031E: 330, B12002_032E: 200, B12002_033E: 70,
  B12002_045E: 4, B12002_046E: 4, B12002_047E: 5, B12002_048E: 3, B12002_049E: 1,
  B12002_060E: 6, B12002_061E: 6, B12002_062E: 7, B12002_063E: 4, B12002_064E: 2,
  B12002_075E: 20, B12002_076E: 26, B12002_077E: 60, B12002_078E: 70, B12002_079E: 45,
  B12002_090E: 45, B12002_091E: 50, B12002_092E: 75, B12002_093E: 45, B12002_094E: 15,
  B12002_108E: 35, B12002_109E: 35, B12002_110E: 45, B12002_106E: 28, B12002_107E: 12,
  B12002_122E: 185, B12002_123E: 205, B12002_124E: 320, B12002_125E: 180, B12002_126E: 60,
  B12002_138E: 5, B12002_139E: 5, B12002_140E: 6, B12002_141E: 4, B12002_142E: 2,
  B12002_153E: 7, B12002_154E: 7, B12002_155E: 8, B12002_156E: 5, B12002_157E: 2,
  B12002_168E: 55, B12002_169E: 70, B12002_170E: 190, B12002_171E: 230, B12002_172E: 150,
  B12002_183E: 60, B12002_184E: 70, B12002_185E: 105, B12002_186E: 60, B12002_187E: 20,
  // B06001 55+ bands: total, born in state, another state, born abroad to US parents, foreign born
  B06001_008E: 260, B06001_009E: 110, B06001_010E: 165, B06001_011E: 1450, B06001_012E: 2600,
  B06001_020E: 120, B06001_021E: 50, B06001_022E: 75, B06001_023E: 640, B06001_024E: 1140,
  B06001_032E: 105, B06001_033E: 45, B06001_034E: 67, B06001_035E: 590, B06001_036E: 1060,
  B06001_044E: 5, B06001_045E: 2, B06001_046E: 3, B06001_047E: 30, B06001_048E: 55,
  B06001_056E: 30, B06001_057E: 13, B06001_058E: 20, B06001_059E: 190, B06001_060E: 345,
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
      const value = vals[code] ?? null;
      // Sample margins so the explorer's margin column is visible in a keyless preview. Real
      // margins come from the Census in the same response as the estimate.
      const moe = !String(meta.dataset || '').startsWith('acs') || value == null ? null : Math.max(1, Math.round(Math.sqrt(Math.abs(value)) * 3));
      (tables[id] ||= { concept: g.label, variables: {} }).variables[code] =
        moe == null ? { label, value } : { label, value, moe };
    }
  }
  return { meta, tables };
}

// The enclave counts are frozen county-GIS measurements, not Census values, so the real file is
// used even in sample mode — only the block snapshot it is measured against is synthetic.
const enclaves = JSON.parse(await readFile(ENCLAVES_PATH, 'utf8'));
const enclaves2020 = buildEnclaveSection(enclaves, oakmont2020.snapshot);

// 2015-2019 baseline for the change page. Counts ~8% below 2020; dollar figures set so that
// after the real inflation factor is applied the preview shows a modest positive real change,
// rather than the wild swing an unadjusted comparison would invent.
const values2019 = Object.fromEntries(
  Object.entries(values2020).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 0.92) : v])
);

const data = assembleData(
  {
    '2019': buildAcsSection('2019', values2019),
    '2020': buildAcsSection('2020', values2020),
    '2024': buildAcsSection('2024', values2024),
  },
  { sample: true, oakmont2020, report2020, enclaves2020 }
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
