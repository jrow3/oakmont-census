// The income × household-size grid: y-axis = income brackets, x-axis = household size (1..7+).
// Each size column highlights the bracket row its median income (B19019) falls in, heat-shaded
// on a sequential scale, with the exact median labeled. Reads the mirror's B19019 table.
// All rendered strings are internal constants, so no HTML escaping is needed here.

// Bracket lower bounds mirror B19001; label + [lo, hi) for placing a median.
export const INCOME_BRACKETS = [
  { label: '< $10k', lo: 0, hi: 10000 },
  { label: '$10–15k', lo: 10000, hi: 15000 },
  { label: '$15–25k', lo: 15000, hi: 25000 },
  { label: '$25–35k', lo: 25000, hi: 35000 },
  { label: '$35–50k', lo: 35000, hi: 50000 },
  { label: '$50–75k', lo: 50000, hi: 75000 },
  { label: '$75–100k', lo: 75000, hi: 100000 },
  { label: '$100–150k', lo: 100000, hi: 150000 },
  { label: '$150–200k', lo: 150000, hi: 200000 },
  { label: '$200k +', lo: 200000, hi: Infinity },
];

const SIZES = [
  { code: 'B19019_002E', label: '1' }, { code: 'B19019_003E', label: '2' },
  { code: 'B19019_004E', label: '3' }, { code: 'B19019_005E', label: '4' },
  { code: 'B19019_006E', label: '5' }, { code: 'B19019_007E', label: '6' },
  { code: 'B19019_008E', label: '7+' },
];

export function bracketIndexFor(income) {
  if (income == null) return -1;
  for (let i = 0; i < INCOME_BRACKETS.length; i++) {
    if (income < INCOME_BRACKETS[i].hi) return i;
  }
  return INCOME_BRACKETS.length - 1;
}

const money = (n) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');

export function renderIncomeGrid(container, tables) {
  if (!container || !tables.B19019) return;
  const vars = tables.B19019.variables;
  const medians = SIZES.map((s) => vars[s.code]?.value ?? null);
  const valid = medians.filter((m) => m != null);
  const min = Math.min(...valid, Infinity), max = Math.max(...valid, -Infinity);
  const shade = (m) => {
    if (m == null || max === min) return 0.15;
    return 0.15 + 0.75 * ((m - min) / (max - min)); // 0.15..0.90 opacity
  };

  const header = `<th class="ig-corner">Household income ↓ / size →</th>` +
    SIZES.map((s) => `<th class="ig-size">${s.label}</th>`).join('');

  const body = INCOME_BRACKETS.map((b, bi) => {
    const cells = SIZES.map((s, si) => {
      const m = medians[si];
      const here = bracketIndexFor(m) === bi;
      return here
        ? `<td class="ig-cell ig-hit" style="--a:${shade(m).toFixed(2)}" title="${s.label}-person: ${money(m)}"><span>${money(m)}</span></td>`
        : `<td class="ig-cell"></td>`;
    }).join('');
    return `<tr><th class="ig-bracket">${b.label}</th>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="income-grid-card">
      <div class="chart-kicker">Income × household size</div>
      <h3>What each household size earns</h3>
      <div class="table-wrap"><table class="income-grid" role="img"
        aria-label="Median household income by household size">
        <thead><tr>${header}</tr></thead><tbody>${body}</tbody>
      </table></div>
      <p class="chart-caption">Each column marks where that household size's <strong>median income</strong>
        (Census table B19019) falls on the income scale. Larger households cluster higher.</p>
    </div>`;
}
