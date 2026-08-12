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
