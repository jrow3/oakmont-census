// Shape a Census `get=group(ID)` response into { concept, variables }.
// Estimates only (codes ending in E, excluding geo/annotation columns). Values are
// aggregated across the response's rows (tracts or filtered blocks).

import { aggregate } from './aggregate.mjs';

const GEO_COLS = new Set(['NAME', 'state', 'county', 'tract', 'block', 'GEO_ID', 'us', 'place']);

// Value columns: ACS estimates end in E, DHC counts end in N. Margins (M), annotations (EA/MA/NA),
// and geo columns are excluded.
export function estimateVarCodes(header) {
  return header.filter((h) => /_\d+[EN]$/.test(h) && !GEO_COLS.has(h));
}

// json: [header, ...rows]. labels: code -> label. weightByKey: rowKey -> weight population.
// rowKeyOf(header, row) -> the key into weightByKey (missing keys weight as 1).
export function shapeTable(concept, json, labels, weightByKey, rowKeyOf) {
  const header = json[0];
  const rows = json.slice(1);
  const weights = rows.map((r) => weightByKey[rowKeyOf(header, r)] ?? 1);
  const variables = {};
  for (const code of estimateVarCodes(header)) {
    const idx = header.indexOf(code);
    const label = labels[code] || code;
    const values = rows.map((r) => {
      const n = parseInt(r[idx], 10);
      return Number.isNaN(n) ? null : n;
    });
    variables[code] = { label, value: aggregate(label, values, weights) };
  }
  return { concept, variables };
}
