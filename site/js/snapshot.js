// Renders the public-facing snapshot: KPI tiles, four charts with plain-English captions,
// and a row of callouts. Reads the baked data.json payload.

import { fmt, currency, pct, escapeHtml, formatDelta } from './format.js';
import { horizontalBars, stackedBar, wireTooltips } from './charts.js';

const val = (group, code) => (group?.variables?.[code]?.value ?? null);
const sum = (group, codes) => codes.reduce((a, c) => a + (val(group, c) || 0), 0);

// Single-year age bands (male + female) grouped into readable buckets.
const AGE_BUCKETS = [
  { label: 'Under 18', m: ['003', '004', '005', '006'], f: ['027', '028', '029', '030'] },
  { label: '18-34', m: ['007', '008', '009', '010', '011', '012'], f: ['031', '032', '033', '034', '035', '036'] },
  { label: '35-54', m: ['013', '014', '015', '016'], f: ['037', '038', '039', '040'] },
  { label: '55-64', m: ['017', '018', '019'], f: ['041', '042', '043'] },
  { label: '65-74', m: ['020', '021', '022'], f: ['044', '045', '046'] },
  { label: '75-84', m: ['023', '024'], f: ['047', '048'] },
  { label: '85+', m: ['025'], f: ['049'] },
];
const ageCode = (n) => `B01001_${n}E`;

const INCOME_CODES = ['002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017'].map((n) => `B19001_${n}E`);
const INCOME_LABELS = ['< $10k', '$10-15k', '$15-20k', '$20-25k', '$25-30k', '$30-35k', '$35-40k', '$40-45k', '$45-50k', '$50-60k', '$60-75k', '$75-100k', '$100-125k', '$125-150k', '$150-200k', '$200k +'];

const YEAR_BUILT_CODES = ['002', '003', '004', '005', '006', '007', '008', '009', '010', '011'].map((n) => `B25034_${n}E`);

function kpiTile(label, value, sub, delta = '') {
  return `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>${delta}</div>`;
}

function chartCard(kicker, title, chartSvg, captionHtml, legendHtml = '') {
  return `<div class="chart-card reveal">
    <div class="chart-kicker">${kicker}</div>
    <h3>${title}</h3>
    ${chartSvg}
    ${legendHtml}
    <p class="chart-caption">${captionHtml}</p>
  </div>`;
}

function deltaBadge(current, prior) {
  const d = formatDelta(current, prior);
  if (!d || d.dir === 'flat') return '';
  const arrow = d.dir === 'up' ? '▲' : '▼';
  const sign = d.pctChange > 0 ? '+' : '';
  return `<div class="kpi-delta kpi-delta-${d.dir}">${arrow} ${sign}${d.pctChange}% vs prior</div>`;
}

export function renderSnapshot(section, meta, opts = {}) {
  const s = section.snapshot;
  const g = section.groups;
  const compare = opts.compare || null; // prior-year snapshot, or null

  // ── KPI tiles ──
  const yr = `${section.year} ACS 5-Year`;
  const cd = (key) => (compare ? deltaBadge(s[key], compare[key]) : '');
  document.getElementById('kpis').innerHTML = [
    kpiTile('Population', fmt(s.totalPopulation), yr, cd('totalPopulation')),
    kpiTile('Median household income', currency(s.medianHouseholdIncome), 'Per year', cd('medianHouseholdIncome')),
    kpiTile('Per-capita income', currency(s.perCapitaIncome), 'Per year', cd('perCapitaIncome')),
    kpiTile('Median home value', currency(s.medianHomeValue), 'Owner-occupied', cd('medianHomeValue')),
    kpiTile('Median gross rent', currency(s.medianGrossRent), 'Per month', cd('medianGrossRent')),
    kpiTile('Owner-occupied', pct(s.ownerOccupiedPct), 'Of occupied homes', cd('ownerOccupiedPct')),
    kpiTile('Total housing units', fmt(s.totalHousingUnits), 'All units', cd('totalHousingUnits')),
    kpiTile('Unemployment', pct(s.unemploymentRate), 'Civilian labor force', cd('unemploymentRate')),
    kpiTile('Poverty rate', pct(s.povertyRate), 'Below poverty line', cd('povertyRate')),
    kpiTile('Age 85+', fmt(s.age85Plus), 'Residents', cd('age85Plus')),
  ].join('');

  // ── Charts ──
  const pop = s.totalPopulation || 1;

  const ageItems = AGE_BUCKETS.map((b) => ({
    label: b.label,
    value: sum(g.age, [...b.m, ...b.f].map(ageCode)),
  }));
  const age65plus = ageItems.filter((d) => ['65-74', '75-84', '85+'].includes(d.label)).reduce((a, d) => a + d.value, 0);
  const ageChart = chartCard(
    'Residents by age',
    'A community that skews older',
    horizontalBars({ items: ageItems, ariaLabel: 'Population by age bucket' }),
    `<strong>${pct((age65plus / pop) * 100)}</strong> of residents are 65 or older, a hallmark of Oakmont's retirement community.`
  );

  const incomeItems = INCOME_CODES.map((c, i) => ({ label: INCOME_LABELS[i], value: val(g.income, c) }));
  const incomeChart = chartCard(
    'Households by income',
    'Household income',
    horizontalBars({ items: incomeItems, ariaLabel: 'Households by income bracket', format: fmt }),
    `The median household earns <strong>${currency(s.medianHouseholdIncome)}</strong> a year.`
  );

  const owner = val(g.housing, 'B25003_002E');
  const renter = val(g.housing, 'B25003_003E');
  const tenureLegend = `<div class="legend-row">
    <span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span>
    <span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span>
  </div>`;
  const tenureChart = chartCard(
    'How homes are held',
    'Owners vs. renters',
    stackedBar({
      segments: [
        { label: 'Owner-occupied', value: owner, color: 'var(--terracotta)' },
        { label: 'Renter-occupied', value: renter, color: 'var(--teal)' },
      ],
      ariaLabel: 'Owner vs renter occupied homes',
    }),
    `<strong>${pct(s.ownerOccupiedPct)}</strong> of occupied homes are owned outright or with a mortgage.`,
    tenureLegend
  );

  const yearItems = YEAR_BUILT_CODES.map((c) => ({
    label: (g.housing.variables[c]?.label || '').replace('Built ', ''),
    value: val(g.housing, c),
  }));
  const topDecade = [...yearItems].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  const builtChart = chartCard(
    'When homes were built',
    'Age of the housing stock',
    horizontalBars({ items: yearItems, ariaLabel: 'Housing units by year built' }),
    `The largest share of homes was built <strong>${escapeHtml(topDecade?.label || '')}</strong>.`
  );

  const charts = document.getElementById('charts');
  charts.innerHTML = ageChart + incomeChart + tenureChart + builtChart;
  wireTooltips(charts);

  // ── Callouts ──
  const bachelorsPlus = sum(g.education, ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E']);
  const eduTotal = val(g.education, 'B15003_001E') || 1;
  const hispanic = val(g.race, 'B03003_003E');
  const raceTotal = val(g.race, 'B03003_001E') || 1;
  const households = val(g.income, 'B19001_001E');

  const callout = (value, label) => `<div class="callout"><div class="callout-value">${value}</div><div class="callout-label">${label}</div></div>`;
  document.getElementById('callouts').innerHTML = [
    callout(pct((bachelorsPlus / eduTotal) * 100), "Hold a bachelor's degree or higher"),
    callout(pct((age65plus / pop) * 100), 'Residents are age 65 or older'),
    callout(pct((hispanic / raceTotal) * 100), 'Identify as Hispanic or Latino'),
    callout(fmt(households), 'Total households'),
  ].join('');

  // ── Method note ──
  document.getElementById('method-note').innerHTML =
    `<strong>About this data.</strong> Oakmont Village is an unincorporated community with no Census place code. ` +
    `These figures aggregate Census Tracts 1516.01 and 1516.02 in Sonoma County, whose combined population ` +
    `(~${fmt(s.totalPopulation)}) closely tracks Oakmont's footprint. Counts are summed across the two tracts; ` +
    `medians (income, rent, home value) are population-weighted approximations. ` +
    `Source: ${escapeHtml(section.source)}.`;
}
