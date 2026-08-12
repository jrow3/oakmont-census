// Income × household-size grid. A real per-cell household-count crosstab of income by household
// size isn't published at the tract level, so the interior is ESTIMATED: counts are modeled to
// fit three real Census inputs via iterative proportional fitting — the income-bracket totals
// (B19001), the household-size totals (B25009), and each size's median income (B19019). The row
// and column totals shown are the real Census counts; only the interior cells are modeled.

// Income brackets (grid rows): label, representative midpoint, and the B19001 codes summed into it.
export const INCOME_BRACKETS = [
  { label: '< $10k',    mid: 5000,   codes: ['B19001_002E'] },
  { label: '$10–15k',   mid: 12500,  codes: ['B19001_003E'] },
  { label: '$15–25k',   mid: 20000,  codes: ['B19001_004E', 'B19001_005E'] },
  { label: '$25–35k',   mid: 30000,  codes: ['B19001_006E', 'B19001_007E'] },
  { label: '$35–50k',   mid: 42500,  codes: ['B19001_008E', 'B19001_009E', 'B19001_010E'] },
  { label: '$50–75k',   mid: 62500,  codes: ['B19001_011E', 'B19001_012E'] },
  { label: '$75–100k',  mid: 87500,  codes: ['B19001_013E'] },
  { label: '$100–150k', mid: 125000, codes: ['B19001_014E', 'B19001_015E'] },
  { label: '$150–200k', mid: 175000, codes: ['B19001_016E'] },
  { label: '$200k +',   mid: 250000, codes: ['B19001_017E'] },
];

// Household sizes (grid columns): label, the B19019 per-size median-income code, and the B25009
// codes (owner + renter of that size) summed into the size total.
const SIZES = [
  { label: '1',  medianCode: 'B19019_002E', countCodes: ['B25009_003E', 'B25009_011E'] },
  { label: '2',  medianCode: 'B19019_003E', countCodes: ['B25009_004E', 'B25009_012E'] },
  { label: '3',  medianCode: 'B19019_004E', countCodes: ['B25009_005E', 'B25009_013E'] },
  { label: '4',  medianCode: 'B19019_005E', countCodes: ['B25009_006E', 'B25009_014E'] },
  { label: '5',  medianCode: 'B19019_006E', countCodes: ['B25009_007E', 'B25009_015E'] },
  { label: '6',  medianCode: 'B19019_007E', countCodes: ['B25009_008E', 'B25009_016E'] },
  { label: '7+', medianCode: 'B19019_008E', countCodes: ['B25009_009E', 'B25009_017E'] },
];

const SIGMA = 55000; // income spread ($) controlling how tightly a size concentrates near its median

// Model a joint count matrix M[row][col] whose column sums match sizeMarginal and whose rows
// track incomeMarginal, seeded so each size concentrates near its median income. Seeded IPF.
export function estimateJointCounts({ incomeMarginal, sizeMarginal, sizeMedians, mids, sigma = SIGMA, iterations = 30 }) {
  const R = incomeMarginal.length, C = sizeMarginal.length;
  const M = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => {
    const m = sizeMedians[c];
    if (m == null) return 1;
    const z = (mids[r] - m) / sigma;
    return Math.exp(-0.5 * z * z);
  }));

  for (let it = 0; it < iterations; it++) {
    for (let r = 0; r < R; r++) {            // scale rows toward the income marginal
      const sum = M[r].reduce((a, b) => a + b, 0);
      const f = sum > 0 ? incomeMarginal[r] / sum : 0;
      for (let c = 0; c < C; c++) M[r][c] *= f;
    }
    for (let c = 0; c < C; c++) {            // scale columns to the size marginal (exact)
      let sum = 0; for (let r = 0; r < R; r++) sum += M[r][c];
      const f = sum > 0 ? sizeMarginal[c] / sum : 0;
      for (let r = 0; r < R; r++) M[r][c] *= f;
    }
  }
  return M;
}

const val = (tables, code) => tables?.[code.split('_')[0]]?.variables?.[code]?.value ?? null;
const fmtCount = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));

export function renderIncomeGrid(container, tables) {
  if (!container || !tables.B19001 || !tables.B25009) return;

  const incomeMarginal = INCOME_BRACKETS.map((b) => b.codes.reduce((a, c) => a + (val(tables, c) || 0), 0));
  const sizeMarginal = SIZES.map((s) => s.countCodes.reduce((a, c) => a + (val(tables, c) || 0), 0));
  const sizeMedians = SIZES.map((s) => val(tables, s.medianCode));
  const mids = INCOME_BRACKETS.map((b) => b.mid);

  const M = estimateJointCounts({ incomeMarginal, sizeMarginal, sizeMedians, mids });
  const maxCell = Math.max(1, ...M.flat());
  const shade = (v) => (0.06 + 0.84 * (v / maxCell)).toFixed(2);
  const grandTotal = sizeMarginal.reduce((a, b) => a + b, 0);

  const header = `<th class="ig-corner">Income ↓ / size →</th>` +
    SIZES.map((s) => `<th class="ig-size">${s.label}</th>`).join('') +
    `<th class="ig-total">All</th>`;

  const body = INCOME_BRACKETS.map((b, r) => {
    const cells = SIZES.map((s, c) =>
      `<td class="ig-cell" style="--a:${shade(M[r][c])}" title="${b.label}, ${s.label}-person (est.): ${fmtCount(M[r][c])}">${fmtCount(M[r][c])}</td>`
    ).join('');
    return `<tr><th class="ig-bracket">${b.label}</th>${cells}<td class="ig-total">${fmtCount(incomeMarginal[r])}</td></tr>`;
  }).join('');

  const footer = `<tr><th class="ig-total">All</th>` +
    SIZES.map((s, c) => `<td class="ig-total">${fmtCount(sizeMarginal[c])}</td>`).join('') +
    `<td class="ig-total">${fmtCount(grandTotal)}</td></tr>`;

  container.innerHTML = `
    <div class="income-grid-card">
      <div class="chart-kicker">Income × household size</div>
      <h3>How many households, by income and size</h3>
      <div class="table-wrap"><table class="income-grid" role="img"
        aria-label="Estimated household counts by income and household size">
        <thead><tr>${header}</tr></thead><tbody>${body}${footer}</tbody>
      </table></div>
      <p class="chart-caption"><strong>Estimated.</strong> The row and column <em>totals</em> are real Census
        counts (income B19001, household size B25009). The interior cells are <strong>modeled</strong> to fit
        those totals and each size's median income (B19019) — the Census does not publish a household count by
        income and size at this geography, so the cells are an estimate, not a direct measurement.</p>
    </div>`;
}
