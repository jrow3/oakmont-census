// Derive the compact `report2020` payload from the 2020 ACS mirror table map and the
// Decennial block section. Pure functions; the mirror already aggregated its values.

export const av = (tables, code) => tables?.[code.split('_')[0]]?.variables?.[code]?.value ?? null;
const bv = (section, gid, code) => section?.groups?.[gid]?.variables?.[code]?.value ?? null;
export const pctOf = (num, den) => (den ? Number(((num / den) * 100).toFixed(1)) : null);
const meanOf = (agg, cnt) => (agg != null && cnt ? Math.round(agg / cnt) : null);
const sum = (tables, codes) => codes.reduce((a, c) => a + (av(tables, c) || 0), 0);

// `agg: null` means the Census publishes no aggregate-dollar table for that source at any
// geography — distinct from an aggregate that exists but comes back suppressed. The two used to
// render identically as "not disclosed", which claimed data was being withheld when it simply
// isn't collected. `amountStatus` below keeps them apart.
const INCOME_SOURCES = [
  { label: 'Social Security', cnt: 'B19055_002E', uni: 'B19055_001E', agg: 'B19065_001E' },
  { label: 'Retirement / pension', cnt: 'B19059_002E', uni: 'B19059_001E', agg: 'B19069_001E' },
  { label: 'Earnings (work)', cnt: 'B19051_002E', uni: 'B19051_001E', agg: 'B19061_001E' },
  { label: 'Self-employment', cnt: 'B19053_002E', uni: 'B19053_001E', agg: 'B19063_001E' },
  { label: 'Interest, dividends or rental income', cnt: 'B19054_002E', uni: 'B19054_001E', agg: 'B19064_001E' },
  { label: 'Supplemental Security Income (SSI)', cnt: 'B19056_002E', uni: 'B19056_001E', agg: 'B19066_001E' },
  { label: 'Cash public assistance', cnt: 'B19057_002E', uni: 'B19057_001E', agg: 'B19067_001E' },
  { label: 'SNAP / food stamps', cnt: 'B22001_002E', uni: 'B22001_001E', agg: null },
];

export function deriveIncomeSources(tables) {
  return INCOME_SOURCES.map((s) => {
    const withCount = av(tables, s.cnt);
    const meanAmount = s.agg ? meanOf(av(tables, s.agg), withCount) : null;
    let amountStatus = 'reported';
    if (meanAmount == null) {
      // Order matters: no households means there is genuinely nothing to report, which is more
      // informative than noting the table's absence.
      if (!withCount) amountStatus = 'noHouseholds';
      else if (!s.agg) amountStatus = 'notPublished';   // no aggregate table exists at any geography
      else amountStatus = 'notDisclosed';               // table exists, Bureau suppressed the value
    }
    return {
      label: s.label,
      withCount,
      pctHouseholds: pctOf(withCount, av(tables, s.uni)),
      meanAmount,
      amountStatus,
    };
  });
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

// Education for the population 45+ (B15001), summed over the 45-64 and 65+ blocks of each sex.
// The ACS has no 55 boundary; 45+ is the closest cut that drops the younger non-Oakmont fringe.
// Attainment offsets within each age block: +1 <9th, +2 9-12th, +3 HS, +4 some college, +5
// associate, +6 bachelor's, +7 graduate/professional (B15001 doesn't split master's/doctorate).
const EDU45_STARTS = ['B15001_027E', 'B15001_035E', 'B15001_068E', 'B15001_076E'];
const eduCode = (start, off) => `B15001_${String(Number(start.slice(7, 10)) + off).padStart(3, '0')}E`;
const eduOff = (off) => EDU45_STARTS.map((s) => eduCode(s, off));
const codesForOffsets = (offsets) => offsets.flatMap((o) => eduOff(o));
const EDU_BANDS = [
  { label: 'High school diploma or less', offsets: [1, 2, 3] },
  { label: 'Some college / associate', offsets: [4, 5] },
  { label: "Bachelor's degree", offsets: [6] },
  { label: 'Graduate or professional degree', offsets: [7] },
];

export function deriveEducation(tables) {
  const total = sum(tables, EDU45_STARTS);
  return {
    total45plus: total,
    pctBachelorsPlus: pctOf(sum(tables, codesForOffsets([6, 7])), total),
    pctGraduatePlus: pctOf(sum(tables, eduOff(7)), total),
    bands: EDU_BANDS.map((b) => ({ label: b.label, count: sum(tables, codesForOffsets(b.offsets)), pct: pctOf(sum(tables, codesForOffsets(b.offsets)), total) })),
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

// B12002 (sex by marital status by age) carries age only on its leaves, in 14 bands each:
// 15-17, 18-19, 20-24, 25-29, 30-34, 35-39, 40-44, 45-49, 50-54, 55-59, 60-64, 65-74, 75-84, 85+.
// So 55+ is offsets +10..+14 from a leaf's parent code.
//
// "Now married" is three leaves (spouse present, separated, other) whose PARENT — _018 male,
// _111 female — carries no age at all. Summing the parent alongside its leaves double-counts
// married, which is the bug the B12001 path was already written to avoid.
const AGE_55_OFFSETS = [10, 11, 12, 13, 14];
const b12002At = (parent) => AGE_55_OFFSETS.map((o) => `B12002_${String(parent + o).padStart(3, '0')}E`);
const MARITAL_55_LEAVES = {
  nowMarried: [19, 35, 50, 112, 128, 143], // spouse present + separated + other, male then female
  widowed: [65, 158],
  divorced: [80, 173],
  never: [3, 96],
};

export function deriveMarital55Plus(tables) {
  const bucket = (parents) => parents.reduce((a, p) => a + sum(tables, b12002At(p)), 0);
  const nowMarried = bucket(MARITAL_55_LEAVES.nowMarried);
  const widowed = bucket(MARITAL_55_LEAVES.widowed);
  const divorced = bucket(MARITAL_55_LEAVES.divorced);
  const never = bucket(MARITAL_55_LEAVES.never);
  const total = nowMarried + widowed + divorced + never;
  if (!total) return null;
  return {
    basis: 'Residents 55 and over',
    total,
    pctMarried: pctOf(nowMarried, total),
    pctWidowed: pctOf(widowed, total),
    pctDivorced: pctOf(divorced, total),
    pctNever: pctOf(never, total),
  };
}

// B06001 (place of birth by age) has 11 age bands per category: Under 5, 5-17, 18-24, 25-34,
// 35-44, 45-54, 55-59, 60-61, 62-64, 65-74, 75+. 55+ is offsets +7..+11. Categories sit 12 apart.
const B06001_55_OFFSETS = [7, 8, 9, 10, 11];
const b06001At = (parent) => B06001_55_OFFSETS.map((o) => `B06001_${String(parent + o).padStart(3, '0')}E`);
const BIRTH_55_CATEGORIES = [
  { label: 'Born in California', parent: 13 },
  { label: 'Born in another state', parent: 25 },
  { label: 'Born abroad to U.S. parents', parent: 37 },
  { label: 'Foreign-born', parent: 49 },
];

export function derivePlaceOfBirth55Plus(tables) {
  const total = sum(tables, b06001At(1));
  if (!total) return null;
  return {
    basis: 'Residents 55 and over',
    total,
    categories: BIRTH_55_CATEGORIES.map((c) => {
      const count = sum(tables, b06001At(c.parent));
      return { label: c.label, count, pct: pctOf(count, total) };
    }),
  };
}

// B05002 breaks "born in another state" into Census regions (_005-_008) — the surrogate for
// "where did you move from" both prior reports used. It has no age dimension, and no ACS table
// carries both region and age, so the regional detail stays all-ages and sits alongside the
// 55+ summary above rather than being replaced by it.
const BIRTH_REGIONS = [
  { label: 'California', code: 'B05002_003E' },
  { label: 'Northeast', code: 'B05002_005E' },
  { label: 'Midwest', code: 'B05002_006E' },
  { label: 'South', code: 'B05002_007E' },
  { label: 'West (other states)', code: 'B05002_008E' },
  // _009 (born outside the US to American parents) was missing, so the bars summed 29 short of
  // the total printed above them. Small, but it is the sort of gap a reader adds up by hand.
  { label: 'Born abroad to U.S. parents', code: 'B05002_009E' },
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

// Oakmont's own housing counts, from the Decennial block view. Kept distinct from the ACS
// household counts used by the income tables: the ACS numbers are tract-level and include the
// non-Oakmont fringe, so they must never be described as Oakmont's housing stock.
function deriveHousing(block) {
  const s = block?.snapshot;
  if (!s) return null;
  return {
    basis: 'Decennial, exact blocks',
    totalUnits: s.totalHousingUnits ?? null,
    occupiedUnits: s.occupiedUnits ?? null,
    vacantUnits: s.vacantUnits ?? null,
    ownerOccupied: s.ownerOccupied ?? null,
    renterOccupied: s.renterOccupied ?? null,
    ownerOccupiedPct: s.ownerOccupiedPct ?? null,
  };
}

export function buildReportSection(acsTables, blockSection) {
  const householdSize = deriveHouseholdSize(acsTables);
  const ageSex = deriveAgeSex(blockSection);
  return {
    vintage: '2020 ACS 5-Year (2016–2020) + 2020 Decennial Census',
    geography: {
      counts: `${blockSection?.blockCount ?? 'Selected'} selected Oakmont census blocks (2020 Decennial)`,
      estimates: 'Census Tracts 1516.01 + 1516.02 (2020 ACS 5-Year)',
      note: 'Counts are exact to Oakmont; ACS estimates are tract-level and include the non-Oakmont fringe within the two tracts.',
    },
    summary: deriveSummary(acsTables, blockSection, householdSize, ageSex),
    ageSex,
    householdSize,
    housing: deriveHousing(blockSection),
    income: deriveIncome(acsTables),
    incomeSources: deriveIncomeSources(acsTables),
    incomeByTenure: deriveIncomeByTenure(acsTables),
    homeValue: deriveHomeValue(acsTables),
    education: deriveEducation(acsTables),
    race: deriveRace(blockSection),
    marital: deriveMarital(acsTables),
    marital55Plus: deriveMarital55Plus(acsTables),
    placeOfBirth: derivePlaceOfBirth(acsTables),
    placeOfBirth55Plus: derivePlaceOfBirth55Plus(acsTables),
  };
}
