// Shape a flat { varCode: value } map into the data.json payload the page consumes.
// Shared by fetch-census.mjs (real API values) and sample-data.mjs (placeholder values).

import { GROUPS } from './census-variables.mjs';

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
  };
}
