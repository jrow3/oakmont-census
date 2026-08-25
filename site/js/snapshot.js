// Renders the public-facing snapshot: KPI tiles, four charts with plain-English captions,
// and a row of callouts. Reads the baked data.json payload.

import { fmt, currency, pct, escapeHtml, formatDelta, toCurrentDollars, deltaSentiment } from './format.js';
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

// How a figure changed depends on what kind of figure it is.
//   dollars — compared in constant dollars, reported as a real percentage change
//   rates   — reported in percentage POINTS. A rate moving 3.2% to 4.7% is +1.5 points; calling
//             that "+47%" is technically a relative change and reads as a catastrophe.
//   levels  — median age and the like, reported in its own units. "+15%" of an age is meaningless.
//   counts  — a relative percentage is the right answer.
// Percentages round to whole numbers: two surveys of a few thousand people don't carry a tenth
// of a point.
export function deltaBadge(key, current, prior, opts) {
  const isDollar = opts.dollarFields.includes(key);
  const isRate = (opts.rateFields || []).includes(key);
  const isLevel = (opts.levelFields || []).includes(key);
  if (current == null || prior == null) return '';

  let text;
  let dir;
  if (isRate) {
    const points = Math.round((current - prior) * 10) / 10;
    dir = points > 0 ? 'up' : points < 0 ? 'down' : 'flat';
    text = `${points > 0 ? '+' : ''}${points} points`;
  } else if (isLevel) {
    const diff = Math.round((current - prior) * 10) / 10;
    dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    text = `${diff > 0 ? '+' : ''}${diff}`;
  } else {
    const base = isDollar ? toCurrentDollars(prior, opts.inflationFactor) : prior;
    const d = formatDelta(current, base);
    if (!d) return '';
    const whole = Math.round(d.pctChange);
    dir = whole === 0 ? 'flat' : d.dir;
    text = `${whole > 0 ? '+' : ''}${whole}%${isDollar ? ' in real terms' : ''}`;
  }

  // Say "unchanged" rather than nothing. A blank space where every neighbouring tile has a figure
  // reads as missing data, not as stability.
  if (dir === 'flat') {
    return `<div class="kpi-delta">Unchanged since ${opts.baselineLabel}</div>`;
  }
  const arrow = dir === 'up' ? '▲' : '▼';
  const sentiment = deltaSentiment(key, dir);
  const tone = sentiment ? ` kpi-delta-${sentiment}` : '';
  return `<div class="kpi-delta${tone}">${arrow} ${text} since ${opts.baselineLabel}</div>`;
}

export function renderSnapshot(section, meta, opts = {}) {
  const s = section.snapshot;
  const g = section.groups;
  const compare = opts.compare || null; // baseline snapshot, or null
  const cmp = opts.compareMeta || null;  // { baselineLabel, inflationFactor, dollarFields }

  // ── How the comparison works ──
  // Shown before the numbers, not footnoted after them: a reader who sees "+19%" without knowing
  // it is inflation-adjusted has been misled, and the correction has to arrive first.
  const basisEl = document.getElementById('change-basis');
  if (basisEl && compare && cmp) {
    const then = compare.medianHouseholdIncome;
    const adjusted = toCurrentDollars(then, cmp.inflationFactor);
    const now = s.medianHouseholdIncome;
    const real = adjusted ? Math.round(((now - adjusted) / adjusted) * 100) : null;
    basisEl.innerHTML = `<div class="change-basis">
      <p class="chart-kicker">How this comparison works</p>
      <p>These are two Census surveys that <strong>share no years</strong> — ${escapeHtml(cmp.baselineLabel)} and
         ${escapeHtml(cmp.currentLabel)}. Each reports money in the dollars of its own final year, so every dollar
         figure below is restated in ${section.year} dollars before comparing. Otherwise the comparison would
         mostly measure inflation.</p>
      <div class="basis-math">
        <div><span class="basis-label">${escapeHtml(cmp.baselineLabel)} median household income</span>
             <span class="basis-value">${currency(then)}</span>
             <span class="basis-note">in ${cmp.baselineDollarYear} dollars</span></div>
        <div><span class="basis-label">the same money, restated</span>
             <span class="basis-value">${currency(adjusted)}</span>
             <span class="basis-note">in ${section.year} dollars (×${cmp.inflationFactor})</span></div>
        <div><span class="basis-label">${escapeHtml(cmp.currentLabel)} median household income</span>
             <span class="basis-value">${currency(now)}</span>
             <span class="basis-note">in ${section.year} dollars</span></div>
        <div class="basis-result"><span class="basis-label">Real change</span>
             <span class="basis-value">${real == null ? '—' : (real > 0 ? '+' : '') + real + '%'}</span>
             <span class="basis-note">after inflation</span></div>
      </div>
    </div>`;
  }

  // ── KPI tiles ──
  const yr = `${Number(section.year) - 4}–${section.year} survey`;
  const cd = (key) => (compare && cmp ? deltaBadge(key, s[key], compare[key], cmp) : '');
  document.getElementById('kpis').innerHTML = [
    kpiTile('Population', fmt(s.totalPopulation), yr, cd('totalPopulation')),
    kpiTile('Median household income', currency(s.medianHouseholdIncome), 'Per year', cd('medianHouseholdIncome')),
    kpiTile('Per-capita income', currency(s.perCapitaIncome), 'Per year', cd('perCapitaIncome')),
    kpiTile('Median home value', currency(s.medianHomeValue), 'Owner-occupied', cd('medianHomeValue')),
    kpiTile('Median gross rent', currency(s.medianGrossRent), 'Per month', cd('medianGrossRent')),
    kpiTile('Owner-occupied', pct(s.ownerOccupiedPct), 'Of occupied homes', cd('ownerOccupiedPct')),
    // No caveat needed on the count itself, but the change deserves one: a survey showing several
    // hundred fewer homes across five years is sampling, not demolition.
    kpiTile('Total housing units', fmt(s.totalHousingUnits), 'All units, survey estimate', cd('totalHousingUnits')),
    kpiTile('Unemployment', pct(s.unemploymentRate), 'Civilian labor force', cd('unemploymentRate')),
    kpiTile('Poverty rate', pct(s.povertyRate), 'Below poverty line', cd('povertyRate')),
    kpiTile('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years', cd('medianAge')),
  ].join('');

  // ── Charts ──
  const pop = s.totalPopulation || 1;

  const ageItems = AGE_BUCKETS.map((b) => ({
    label: b.label,
    value: sum(g.age, [...b.m, ...b.f].map(ageCode)),
  }));
  // Oakmont is a 55+ community, so 55 is the line that means something here. This figure covers
  // the two tracts, which reach past Oakmont — the Community Report's 55+ share is higher because
  // it counts Oakmont's blocks exactly. Saying so stops the two pages looking like they disagree.
  const age55plus = ageItems.filter((d) => ['55-64', '65-74', '75-84', '85+'].includes(d.label)).reduce((a, d) => a + d.value, 0);
  const ageChart = chartCard(
    'Residents by age',
    'A community that skews older',
    horizontalBars({ items: ageItems, ariaLabel: 'Population by age bucket' }),
    `<strong>${pct((age55plus / pop) * 100)}</strong> of people in these two tracts are 55 or older. ` +
    `Drawn to Oakmont's own boundary the share is higher still — see the Community Report.`
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
    callout(pct((bachelorsPlus / eduTotal) * 100), "Of residents 25 and over, hold a bachelor's degree or higher"),
    callout(pct((age55plus / pop) * 100), 'Of people in these tracts are 55 or older'),
    callout(pct((hispanic / raceTotal) * 100), 'Identify as Hispanic or Latino'),
    callout(fmt(households), 'Households in these two tracts'),
  ].join('');

  // ── Method note ──
  const overlapNote = compare && cmp
    ? ` Change is measured against the ${escapeHtml(cmp.baselineLabel)} survey, which shares no years with this one — ` +
      `the Census advises against comparing surveys that overlap. Dollar figures are stated in ${section.year} dollars ` +
      `so the comparison isn't measuring inflation.`
    : '';
  document.getElementById('method-note').innerHTML =
    `<strong>About this data.</strong> Oakmont has no boundary of its own in Census records — it sits inside ` +
    `the City of Santa Rosa — so these figures cover Census Tracts 1516.01 and 1516.02 in Sonoma County ` +
    `(${section.year} ACS 5-Year), an area whose population (~${fmt(s.totalPopulation)}) runs a little wider than ` +
    `Oakmont itself. Counts are summed across the two tracts; medians are population-weighted ` +
    `approximations.${overlapNote} Source: ${escapeHtml(section.source)}.`;
}
