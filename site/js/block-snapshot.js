// Renders the exact-Oakmont block panel: decennial KPI tiles, an age chart, and a tenure bar.
// Reads the oakmont2020 section (2020 DHC counts). Reuses the shared chart primitives.

import { fmt, pct } from './format.js';
import { horizontalBars, stackedBar, wireTooltips } from './charts.js';

const AGE_BUCKETS = [
  { label: 'Under 18', codes: ['P12_003N','P12_004N','P12_005N','P12_006N','P12_027N','P12_028N','P12_029N','P12_030N'] },
  { label: '18-34', codes: ['P12_007N','P12_008N','P12_009N','P12_010N','P12_011N','P12_012N','P12_031N','P12_032N','P12_033N','P12_034N','P12_035N','P12_036N'] },
  { label: '35-54', codes: ['P12_013N','P12_014N','P12_015N','P12_016N','P12_037N','P12_038N','P12_039N','P12_040N'] },
  { label: '55-64', codes: ['P12_017N','P12_018N','P12_019N','P12_041N','P12_042N','P12_043N'] },
  { label: '65-74', codes: ['P12_020N','P12_021N','P12_022N','P12_044N','P12_045N','P12_046N'] },
  { label: '75-84', codes: ['P12_023N','P12_024N','P12_047N','P12_048N'] },
  { label: '85+', codes: ['P12_025N','P12_049N'] },
];

const val = (group, code) => (group?.variables?.[code]?.value ?? null);
const sum = (group, codes) => codes.reduce((a, c) => a + (val(group, c) || 0), 0);

function kpiTile(label, value, sub) {
  return `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

export function renderBlockSnapshot(section) {
  const s = section.snapshot;
  const g = section.groups;

  document.getElementById('block-kpis').innerHTML = [
    kpiTile('Population', fmt(s.totalPopulation), 'Exact boundary'),
    kpiTile('Age 55+', pct(s.pct55Plus), 'Of residents'),
    kpiTile('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years'),
    kpiTile('Housing units', fmt(s.totalHousingUnits), 'All units'),
    kpiTile('Owner-occupied', pct(s.ownerOccupiedPct), 'Of occupied homes'),
    kpiTile('Hispanic or Latino', pct(s.hispanicPct), 'Of residents'),
  ].join('');

  const ageItems = AGE_BUCKETS.map((b) => ({ label: b.label, value: sum(g.age, b.codes) }));
  const tenureLegend = `<div class="legend-row">
    <span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span>
    <span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span>
  </div>`;

  const charts = document.getElementById('block-charts');
  charts.innerHTML =
    `<div class="chart-card reveal"><div class="chart-kicker">Residents by age</div><h3>An older community, precisely drawn</h3>` +
    horizontalBars({ items: ageItems, ariaLabel: 'Population by age bucket' }) +
    `<p class="chart-caption"><strong>${pct(s.pct55Plus)}</strong> of residents in Oakmont's exact boundary are 55 or older.</p></div>` +
    `<div class="chart-card reveal"><div class="chart-kicker">How homes are held</div><h3>Owners vs. renters</h3>` +
    stackedBar({ segments: [
      { label: 'Owner-occupied', value: s.ownerOccupied, color: 'var(--terracotta)' },
      { label: 'Renter-occupied', value: s.renterOccupied, color: 'var(--teal)' },
    ], ariaLabel: 'Owner vs renter occupied homes' }) +
    tenureLegend +
    `<p class="chart-caption"><strong>${pct(s.ownerOccupiedPct)}</strong> of occupied homes are owner-occupied.</p></div>`;
  wireTooltips(charts);

  document.getElementById('block-method-note').innerHTML =
    `<strong>Exact boundary.</strong> These figures are the 2020 Decennial Census (100% count) summed over ${fmt(s.blockCount)} ` +
    `census blocks hand-selected to match Oakmont's community boundary — tighter than the two-tract approximation above. ` +
    `Decennial data is counts only (no income, education, or home values); small block-level differential-privacy noise averages out across the blocks.`;
}
