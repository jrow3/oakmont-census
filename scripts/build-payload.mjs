// Shape a flat { varCode: value } map into the data.json payload the page consumes.
// Shared by fetch-census.mjs (real API values) and sample-data.mjs (placeholder values).

import { GROUPS } from './census-variables.mjs';
import { DEC_GROUPS, AGE_65_PLUS, AGE_85_PLUS } from './decennial-variables.mjs';
import { medianAgeFromP12 } from './median-age.mjs';

export function buildGroups(values) {
  const groups = {};
  for (const [gid, g] of Object.entries(GROUPS)) {
    groups[gid] = { label: g.label, totalKey: g.totalKey, variables: {} };
    for (const [code, label] of Object.entries(g.variables)) {
      groups[gid].variables[code] = { label, value: values[code] ?? null };
    }
  }
  return groups;
}

export function buildSnapshot(values) {
  const v = (k) => (values[k] ?? null);
  const pct = (num, den) => (den && num != null ? Number(((num / den) * 100).toFixed(1)) : null);
  const owner = v('B25003_002E');
  const renter = v('B25003_003E');
  return {
    totalPopulation: v('B01001_001E'),
    medianHouseholdIncome: v('B19013_001E'),
    perCapitaIncome: v('B19301_001E'),
    totalHousingUnits: v('B25001_001E'),
    ownerOccupiedPct: pct(owner, (owner || 0) + (renter || 0)),
    medianHomeValue: v('B25077_001E'),
    medianGrossRent: v('B25064_001E'),
    unemploymentRate: pct(v('B23025_005E'), v('B23025_003E')),
    povertyRate: pct(v('B17001_002E'), v('B17001_001E')),
    age85Plus: (v('B01001_025E') || 0) + (v('B01001_049E') || 0),
    medianAge: v('B01002_001E'),
  };
}

export function buildAcsSection(year, values) {
  return {
    year,
    source: `U.S. Census Bureau, ${year} ACS 5-Year Estimates`,
    explorerFile: `explorer/acs${year}.json`,
    snapshot: buildSnapshot(values),
    groups: buildGroups(values),
  };
}

export function buildBlockSection(values) {
  const v = (k) => (values[k] ?? null);
  const sum = (codes) => codes.reduce((a, c) => a + (values[c] || 0), 0);
  const pct = (num, den) => (den && num != null ? Number(((num / den) * 100).toFixed(1)) : null);

  const owner = sum(['H4_002N', 'H4_003N']);
  const renter = v('H4_004N') || 0;
  const totalPop = v('P12_001N');
  // The interpolated median is a long float; show it to one decimal like Census median age.
  const rawMedianAge = medianAgeFromP12(values);
  const medianAge = rawMedianAge == null ? null : Math.round(rawMedianAge * 10) / 10;

  const groups = {};
  for (const [gid, g] of Object.entries(DEC_GROUPS)) {
    groups[gid] = { label: g.label, totalKey: g.totalKey, variables: {} };
    for (const [code, label] of Object.entries(g.variables)) {
      groups[gid].variables[code] = { label, value: values[code] ?? null };
    }
  }

  return {
    vintage: '2020 Decennial (DHC)',
    geography: '76 selected census blocks, Oakmont, Sonoma County, CA',
    year: '2020-blocks',
    explorerFile: 'explorer/blocks2020.json',
    snapshot: {
      totalPopulation: totalPop,
      age65Plus: sum(AGE_65_PLUS),
      age85Plus: sum(AGE_85_PLUS),
      pct65Plus: pct(sum(AGE_65_PLUS), totalPop),
      medianAge,
      totalHousingUnits: v('H1_001N'),
      occupiedUnits: v('H3_002N'),
      vacantUnits: v('H3_003N'),
      ownerOccupied: owner,
      renterOccupied: renter,
      ownerOccupiedPct: pct(owner, owner + renter),
      whiteAlonePct: pct(v('P3_002N'), v('P3_001N')),
      hispanicPct: pct(v('P4_003N'), v('P4_001N')),
    },
    groups,
  };
}

export function assembleData(sections, { sample = false, oakmont2020 = null } = {}) {
  const data = {
    meta: {
      geography: 'Census Tracts 1516.01 + 1516.02, Sonoma County, CA',
      generatedAt: new Date().toISOString(),
      sample,
    },
    acs2020: sections['2020'],
    acs2024: sections['2024'],
  };
  if (oakmont2020) data.oakmont2020 = oakmont2020;
  return data;
}
