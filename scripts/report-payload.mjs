// Derive the compact `report2020` payload from the 2020 ACS mirror table map and the
// Decennial block section. Pure functions; the mirror already aggregated its values.

export const av = (tables, code) => tables?.[code.split('_')[0]]?.variables?.[code]?.value ?? null;
const bv = (section, gid, code) => section?.groups?.[gid]?.variables?.[code]?.value ?? null;
export const pctOf = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);
const meanOf = (agg, cnt) => (agg != null && cnt ? Math.round(agg / cnt) : null);
const sum = (tables, codes) => codes.reduce((a, c) => a + (av(tables, c) || 0), 0);

const INCOME_SOURCES = [
  { label: 'Social Security', cnt: 'B19055_002E', uni: 'B19055_001E', agg: 'B19065_001E' },
  { label: 'Retirement / pension', cnt: 'B19059_002E', uni: 'B19059_001E', agg: 'B19069_001E' },
  { label: 'Earnings (work)', cnt: 'B19051_002E', uni: 'B19051_001E', agg: 'B19061_001E' },
  { label: 'Self-employment', cnt: 'B19053_002E', uni: 'B19053_001E', agg: null },
  { label: 'Supplemental Security Income (SSI)', cnt: 'B19056_002E', uni: 'B19056_001E', agg: 'B19066_001E' },
  { label: 'Cash public assistance', cnt: 'B19057_002E', uni: 'B19057_001E', agg: 'B19067_001E' },
  { label: 'SNAP / food stamps', cnt: 'B22001_002E', uni: 'B22001_001E', agg: null },
];

export function deriveIncomeSources(tables) {
  return INCOME_SOURCES.map((s) => ({
    label: s.label,
    withCount: av(tables, s.cnt),
    pctHouseholds: pctOf(av(tables, s.cnt), av(tables, s.uni)),
    meanAmount: s.agg ? meanOf(av(tables, s.agg), av(tables, s.cnt)) : null,
  }));
}

const HH_SIZES = [
  { size: 1, w: 1, codes: ['B25009_003E', 'B25009_011E'] },
  { size: 2, w: 2, codes: ['B25009_004E', 'B25009_012E'] },
  { size: 3, w: 3, codes: ['B25009_005E', 'B25009_013E'] },
  { size: 4, w: 4, codes: ['B25009_006E', 'B25009_014E'] },
  { size: 5, w: 5, codes: ['B25009_007E', 'B25009_015E'] },
  { size: 6, w: 6, codes: ['B25009_008E', 'B25009_016E'] },
  { size: '7+', w: 7.5, codes: ['B25009_009E', 'B25009_017E'] },
];

export function deriveHouseholdSize(tables) {
  const rows = HH_SIZES.map((s) => ({ size: s.size, w: s.w, count: sum(tables, s.codes) }));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const weighted = rows.reduce((a, r) => a + r.w * r.count, 0);
  return {
    total,
    average: total ? Number((weighted / total).toFixed(2)) : null,
    distribution: rows.map((r) => ({ size: String(r.size), count: r.count, pct: pctOf(r.count, total) })),
  };
}

// P12 (block) sex-by-age codes grouped into 55+ reporting bands, plus an Under-55 rollup.
const AGE_SEX_BANDS = [
  { band: 'Under 55', m: ['P12_003N','P12_004N','P12_005N','P12_006N','P12_007N','P12_008N','P12_009N','P12_010N','P12_011N','P12_012N','P12_013N','P12_014N','P12_015N','P12_016N'],
                      f: ['P12_027N','P12_028N','P12_029N','P12_030N','P12_031N','P12_032N','P12_033N','P12_034N','P12_035N','P12_036N','P12_037N','P12_038N','P12_039N','P12_040N'] },
  { band: '55-59', m: ['P12_017N'], f: ['P12_041N'] },
  { band: '60-64', m: ['P12_018N','P12_019N'], f: ['P12_042N','P12_043N'] },
  { band: '65-69', m: ['P12_020N','P12_021N'], f: ['P12_044N','P12_045N'] },
  { band: '70-74', m: ['P12_022N'], f: ['P12_046N'] },
  { band: '75-79', m: ['P12_023N'], f: ['P12_047N'] },
  { band: '80-84', m: ['P12_024N'], f: ['P12_048N'] },
  { band: '85+', m: ['P12_025N'], f: ['P12_049N'] },
];

export function deriveAgeSex(blockSection) {
  const s = (codes) => codes.reduce((a, c) => a + (bv(blockSection, 'age', c) || 0), 0);
  return AGE_SEX_BANDS.map((b) => {
    const male = s(b.m), female = s(b.f);
    return { band: b.band, male, female, total: male + female };
  });
}

const BACHELORS_PLUS = ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E'];
const GRADUATE_PLUS = ['B15003_023E', 'B15003_024E', 'B15003_025E'];
const EDU_BANDS = [
  { label: 'High school diploma or less', codes: ['B15003_002E','B15003_003E','B15003_004E','B15003_005E','B15003_006E','B15003_007E','B15003_008E','B15003_009E','B15003_010E','B15003_011E','B15003_012E','B15003_013E','B15003_014E','B15003_015E','B15003_016E','B15003_017E','B15003_018E'] },
  { label: 'Some college / associate', codes: ['B15003_019E','B15003_020E','B15003_021E'] },
  { label: "Bachelor's degree", codes: ['B15003_022E'] },
  { label: "Master's degree", codes: ['B15003_023E'] },
  { label: 'Professional degree', codes: ['B15003_024E'] },
  { label: 'Doctorate', codes: ['B15003_025E'] },
];

export function deriveEducation(tables) {
  const total = av(tables, 'B15003_001E');
  return {
    total25plus: total,
    pctBachelorsPlus: pctOf(sum(tables, BACHELORS_PLUS), total),
    pctGraduatePlus: pctOf(sum(tables, GRADUATE_PLUS), total),
    bands: EDU_BANDS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })),
  };
}

// B25118: owner brackets _003.._013, renter _015.._025 (same 11 income bands each; verified labels).
const TENURE_INCOME_BANDS = [
  '< $5k','$5-10k','$10-15k','$15-20k','$20-25k','$25-35k','$35-50k','$50-75k','$75-100k','$100-150k','$150k +',
];
const ownerCode = (i) => `B25118_${String(3 + i).padStart(3, '0')}E`;
const renterCode = (i) => `B25118_${String(15 + i).padStart(3, '0')}E`;

export function deriveIncomeByTenure(tables) {
  return {
    ownerMedian: av(tables, 'B25119_002E'),
    renterMedian: av(tables, 'B25119_003E'),
    ownerHouseholds: av(tables, 'B25118_002E'),
    renterHouseholds: av(tables, 'B25118_014E'),
    distribution: TENURE_INCOME_BANDS.map((label, i) => ({
      label, owner: av(tables, ownerCode(i)) || 0, renter: av(tables, renterCode(i)) || 0,
    })),
  };
}

const INCOME_BRACKETS = [
  { label: '< $10k', codes: ['B19001_002E'] }, { label: '$10-15k', codes: ['B19001_003E'] },
  { label: '$15-25k', codes: ['B19001_004E','B19001_005E'] }, { label: '$25-35k', codes: ['B19001_006E','B19001_007E'] },
  { label: '$35-50k', codes: ['B19001_008E','B19001_009E','B19001_010E'] }, { label: '$50-75k', codes: ['B19001_011E','B19001_012E'] },
  { label: '$75-100k', codes: ['B19001_013E'] }, { label: '$100-150k', codes: ['B19001_014E','B19001_015E'] },
  { label: '$150-200k', codes: ['B19001_016E'] }, { label: '$200k +', codes: ['B19001_017E'] },
];

export function deriveIncome(tables) {
  const total = av(tables, 'B19001_001E');
  return {
    median: av(tables, 'B19013_001E'),
    perCapita: av(tables, 'B19301_001E'),
    familyMedian: av(tables, 'B19126_001E'),
    nonfamilyMedian: av(tables, 'B19215_001E'),
    distribution: INCOME_BRACKETS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })),
  };
}

// B25075 has 26 value brackets (_002.._027); grouped here against the verified boundaries.
const VALUE_BANDS = [
  { label: '< $300k', codes: ['B25075_002E','B25075_003E','B25075_004E','B25075_005E','B25075_006E','B25075_007E','B25075_008E','B25075_009E','B25075_010E','B25075_011E','B25075_012E','B25075_013E','B25075_014E','B25075_015E','B25075_016E','B25075_017E','B25075_018E','B25075_019E','B25075_020E'] },
  { label: '$300-500k', codes: ['B25075_021E','B25075_022E'] },
  { label: '$500-750k', codes: ['B25075_023E'] },
  { label: '$750k-1M', codes: ['B25075_024E'] },
  { label: '$1M +', codes: ['B25075_025E','B25075_026E','B25075_027E'] },
];

export function deriveHomeValue(tables) {
  const total = av(tables, 'B25075_001E');
  return { median: av(tables, 'B25077_001E'), distribution: VALUE_BANDS.map((b) => ({ label: b.label, count: sum(tables, b.codes), pct: pctOf(sum(tables, b.codes), total) })) };
}

// Race & Hispanic origin from the Decennial block section (exact-Oakmont counts).
const RACE_GROUPS = [
  { label: 'White', code: 'P3_002N' }, { label: 'Black', code: 'P3_003N' },
  { label: 'American Indian / Alaska Native', code: 'P3_004N' }, { label: 'Asian', code: 'P3_005N' },
  { label: 'Native Hawaiian / Pacific Islander', code: 'P3_006N' }, { label: 'Some other race', code: 'P3_007N' },
  { label: 'Two or more races', code: 'P3_008N' },
];

export function deriveRace(blockSection) {
  const total = bv(blockSection, 'race', 'P3_001N');
  const hispanic = bv(blockSection, 'hispanic', 'P4_003N');
  const hispanicTotal = bv(blockSection, 'hispanic', 'P4_001N');
  return {
    total,
    groups: RACE_GROUPS.map((g) => ({ label: g.label, count: bv(blockSection, 'race', g.code), pct: pctOf(bv(blockSection, 'race', g.code), total) })),
    hispanicPct: pctOf(hispanic, hispanicTotal),
  };
}

export function deriveMarital(tables) {
  const total = av(tables, 'B12001_001E');
  // "Now married" is the parent total per sex (_004 male, _013 female); its _005/_006 children must
  // NOT be added or married is double-counted. Never/widowed/divorced: male _003/_009/_010, female _012/_018/_019.
  const nowMarried = sum(tables, ['B12001_004E', 'B12001_013E']);
  const widowed = sum(tables, ['B12001_009E', 'B12001_018E']);
  const divorced = sum(tables, ['B12001_010E', 'B12001_019E']);
  const never = sum(tables, ['B12001_003E', 'B12001_012E']);
  return { total, pctMarried: pctOf(nowMarried, total), pctWidowed: pctOf(widowed, total), pctDivorced: pctOf(divorced, total), pctNever: pctOf(never, total) };
}

// B05002 breaks "born in another state" into Census regions (_005-_008) — the surrogate for
// "where did you move from" both prior reports used.
const BIRTH_REGIONS = [
  { label: 'California', code: 'B05002_003E' },
  { label: 'Northeast', code: 'B05002_005E' },
  { label: 'Midwest', code: 'B05002_006E' },
  { label: 'South', code: 'B05002_007E' },
  { label: 'West (other states)', code: 'B05002_008E' },
  { label: 'Foreign-born', code: 'B05002_013E' },
];

export function derivePlaceOfBirth(tables) {
  const total = av(tables, 'B05002_001E');
  return {
    total,
    regions: BIRTH_REGIONS.map((r) => ({ label: r.label, count: av(tables, r.code), pct: pctOf(av(tables, r.code), total) })),
  };
}

function deriveSummary(tables, block, householdSize, ageSex) {
  // Oakmont is a 55+ community, so the headline age stat is the 55+ share, from the block age bands.
  const totalAge = ageSex.reduce((a, b) => a + b.total, 0);
  const under55 = ageSex.find((b) => b.band === 'Under 55')?.total || 0;
  return {
    population: block?.snapshot?.totalPopulation ?? null,
    medianAge: block?.snapshot?.medianAge ?? null,
    pct55Plus: totalAge ? Number((((totalAge - under55) / totalAge) * 100).toFixed(1)) : null,
    ownerOccupiedPct: block?.snapshot?.ownerOccupiedPct ?? null,
    averageHouseholdSize: householdSize.average,
    medianHouseholdIncome: av(tables, 'B19013_001E'),
    perCapitaIncome: av(tables, 'B19301_001E'),
  };
}

export function buildReportSection(acsTables, blockSection) {
  const householdSize = deriveHouseholdSize(acsTables);
  const ageSex = deriveAgeSex(blockSection);
  return {
    vintage: '2020 ACS 5-Year (2016–2020) + 2020 Decennial Census',
    geography: {
      counts: '76 selected Oakmont census blocks (2020 Decennial)',
      estimates: 'Census Tracts 1516.01 + 1516.02 (2020 ACS 5-Year)',
      note: 'Counts are exact to Oakmont; ACS estimates are tract-level and include the non-Oakmont fringe within the two tracts.',
    },
    summary: deriveSummary(acsTables, blockSection, householdSize, ageSex),
    ageSex,
    householdSize,
    income: deriveIncome(acsTables),
    incomeSources: deriveIncomeSources(acsTables),
    incomeByTenure: deriveIncomeByTenure(acsTables),
    homeValue: deriveHomeValue(acsTables),
    education: deriveEducation(acsTables),
    race: deriveRace(blockSection),
    marital: deriveMarital(acsTables),
    placeOfBirth: derivePlaceOfBirth(acsTables),
  };
}
