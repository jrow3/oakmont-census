// Shape a Census `get=group(ID)` response into { concept, variables }.
// Values are aggregated across the response's rows (tracts or filtered blocks). The Census returns
// each estimate's margin of error in the same group response, so it is kept rather than discarded:
// a page that shows an estimate without its margin invites the reader to treat it as a count.

import { aggregate, aggregateMargin } from './aggregate.mjs';

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
    const value = aggregate(label, values, weights);
    // Only ACS estimates (E) have margins; the Decennial's N-suffix counts have none.
    const mIdx = code.endsWith('E') ? header.indexOf(code.slice(0, -1) + 'M') : -1;
    const moe = mIdx < 0 ? null : aggregateMargin(label, rows.map((r) => {
      const n = parseInt(r[mIdx], 10);
      // The Census signals "not applicable" and "not calculable" with large negative sentinels.
      return Number.isNaN(n) || n < 0 ? null : n;
    }));
    variables[code] = moe == null ? { label, value } : { label, value, moe };
  }
  return { concept, variables };
}
