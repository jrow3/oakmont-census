// Renders the Community Report from data.report2020. Sourced, honest, modeled on the 2010 report.
import { fmt, currency, pct, escapeHtml } from './format.js';
import { horizontalBars, pairedBars, groupedBars, wireTooltips } from './charts.js';

const num = (n) => (n == null ? '—' : fmt(n));
const money = (n) => (n == null ? '—' : currency(n));
const percent = (n) => (n == null ? '—' : pct(n));

const kpi = (label, value, sub, source) =>
  `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div><div class="kpi-src">${source}</div></div>`;

function section(id, kicker, title, source, bodyHtml) {
  return `<section class="report-section reveal" id="${id}">
    <div class="report-head"><p class="chart-kicker">${kicker}</p><h2>${title}</h2><p class="report-source">${source}</p></div>
    ${bodyHtml}
  </section>`;
}

export async function renderReport() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const r = data.report2020;
  if (!r) throw new Error('No report data in data.json');
  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  if (data.meta?.generatedAt) document.getElementById('footer-generated').textContent = `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;

  const root = document.getElementById('report');
  root.innerHTML = [
    summarySection(r),
    ageSexSection(r),
    householdSection(r),
    incomeSection(r),
    incomeSourcesSection(r),
    tenureIncomeSection(r),
    homeValueSection(r),
    educationSection(r),
    raceSection(r),
    maritalSection(r),
    placeOfBirthSection(r),
    methodologySection(r),
  ].join('');
  wireTooltips(root);
}

function summarySection(r) {
  const s = r.summary;
  const tiles = [
    kpi('Population', num(s.population), 'Residents', 'Decennial · exact blocks'),
    kpi('Median age', s.medianAge != null ? String(s.medianAge) : '—', 'Years', 'Decennial · exact blocks'),
    kpi('Age 55+', percent(s.pct55Plus), 'Of residents', 'Decennial · exact blocks'),
    kpi('Avg. household size', s.averageHouseholdSize != null ? String(s.averageHouseholdSize) : '—', 'People per home', 'ACS · tracts'),
    kpi('Owner-occupied', percent(s.ownerOccupiedPct), 'Of occupied homes', 'Decennial · exact blocks'),
    kpi('Median household income', money(s.medianHouseholdIncome), 'Per year', 'ACS · tracts'),
    kpi('Per-capita income', money(s.perCapitaIncome), 'Per year', 'ACS · tracts'),
  ].join('');
  return section('summary', 'Who are we?', 'A 55+ community, in numbers',
    'Counts from the 2020 Decennial Census (exact Oakmont blocks); dollar figures from the 2020 ACS (tracts).',
    `<div class="kpi-grid">${tiles}</div>
     <p class="report-note">Oakmont is an active-adult 55+ community: ${percent(s.pct55Plus)} of residents counted here are 55 or older. (The census counts everyone living in the blocks, including younger spouses, family, and caregivers.) The age bands in this report begin at 55.</p>`);
}

function ageSexSection(r) {
  const rows = r.ageSex.filter((b) => b.band !== 'Under 55');
  const under55 = r.ageSex.find((b) => b.band === 'Under 55');
  const items = rows.map((b) => ({ label: b.band, left: b.male, right: b.female }));
  const totalM = rows.reduce((a, b) => a + b.male, 0), totalF = rows.reduce((a, b) => a + b.female, 0);
  const ratio = totalM ? (totalF / totalM).toFixed(1) : '—';
  const tableRows = rows.map((b) => `<tr><td>${b.band}</td><td class="num">${num(b.male)}</td><td class="num">${num(b.female)}</td><td class="num">${num(b.total)}</td></tr>`).join('');
  return section('age', 'Age & gender', 'Older, and mostly women',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks).',
    `<div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Male</span><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Female</span></div>
     ${pairedBars({ items, ariaLabel: 'Population by age band and sex' })}
     <div class="table-wrap"><table class="report-table"><thead><tr><th>Age</th><th>Male</th><th>Female</th><th>Total</th></tr></thead>
       <tbody>${tableRows}<tr class="total-row"><td>55+ total</td><td class="num">${num(totalM)}</td><td class="num">${num(totalF)}</td><td class="num">${num(totalM + totalF)}</td></tr></tbody></table></div>
     <p class="chart-caption">Among residents 55 and over, women outnumber men about <strong>${ratio}:1</strong>, and the gap widens with age. The blocks also count about ${num(under55 ? under55.total : 0)} residents under 55 (younger spouses, family, and caregivers), not included in the bands above.</p>`);
}

function householdSection(r) {
  const items = r.householdSize.distribution.map((d) => ({ label: `${d.size}-person`, value: d.count }));
  return section('households', 'Households', 'Most of us live alone or as a couple',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Household size from table B25009.',
    `${horizontalBars({ items, ariaLabel: 'Households by size', format: fmt })}
     <p class="chart-caption">Oakmont averages <strong>${r.householdSize.average ?? '—'}</strong> people per household — one- and two-person homes dominate, consistent with a retirement community.</p>`);
}

function incomeSection(r) {
  const i = r.income;
  const items = i.distribution.map((d) => ({ label: d.label, value: d.count }));
  return section('income', 'Income', 'Solidly middle class',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(i.median)}</div><div class="stat-label">Median household income</div></div>
       <div class="stat"><div class="stat-value">${money(i.perCapita)}</div><div class="stat-label">Per-capita income</div></div>
       <div class="stat"><div class="stat-value">${money(i.familyMedian)}</div><div class="stat-label">Median family income</div></div>
       <div class="stat"><div class="stat-value">${money(i.nonfamilyMedian)}</div><div class="stat-label">Median non-family income</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Households by income bracket', format: fmt })}
     <p class="chart-caption">Family households (typically couples) earn well above people living alone — the same split the 2010 report found.</p>`);
}

function incomeSourcesSection(r) {
  const rows = r.incomeSources.map((s) => {
    const width = s.pctHouseholds != null ? Math.max(1, Math.round(s.pctHouseholds)) : 0;
    const mean = s.meanAmount != null ? money(s.meanAmount) : '<span class="na">not disclosed</span>';
    return `<div class="src-row" data-tip="${escapeHtml(`<b>${escapeHtml(s.label)}</b><br>${percent(s.pctHouseholds)} of households · mean ${s.meanAmount != null ? money(s.meanAmount) : 'suppressed'}`)}">
      <div class="src-label">${escapeHtml(s.label)}</div>
      <div class="src-bar"><i style="width:${width}%"></i></div>
      <div class="src-pct">${percent(s.pctHouseholds)}</div>
      <div class="src-mean">${mean}</div>
    </div>`;
  }).join('');
  return section('sources', 'Sources of income', 'What households live on',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Shares are % of households receiving each source; means are per receiving household.',
    `<div class="src-head"><div class="src-label"></div><div class="src-bar"></div><div class="src-pct">Households</div><div class="src-mean">Mean amount</div></div>
     <div class="src-list">${rows}</div>
     <p class="chart-caption">These are real ACS figures — not the AARP member survey used in the 2020 draft. Because ACS income is tract-level, shares read a little lower than an Oakmont-only count would (the tracts include younger non-Oakmont households).</p>`);
}

function tenureIncomeSection(r) {
  const t = r.incomeByTenure;
  const items = t.distribution.map((d) => ({ label: d.label, a: d.owner, b: d.renter }));
  return section('tenure-income', 'Owners vs. renters', 'Owners earn more',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Tables B25119 (medians) and B25118 (distribution).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(t.ownerMedian)}</div><div class="stat-label">Owner median income (${num(t.ownerHouseholds)} homes)</div></div>
       <div class="stat"><div class="stat-value">${money(t.renterMedian)}</div><div class="stat-label">Renter median income (${num(t.renterHouseholds)} homes)</div></div>
     </div>
     <div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span></div>
     ${groupedBars({ items, ariaLabel: 'Household income by tenure' })}`);
}

function homeValueSection(r) {
  const items = r.homeValue.distribution.map((d) => ({ label: d.label, value: d.count }));
  return section('home-value', 'Home value', 'Where owner-estimated values land',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Owner-reported values (table B25075/B25077).',
    `<p class="report-note">Median owner-estimated home value: <strong>${money(r.homeValue.median)}</strong>.</p>
     ${horizontalBars({ items, ariaLabel: 'Owner-occupied homes by value', format: fmt })}`);
}

function educationSection(r) {
  const e = r.education;
  const items = e.bands.map((b) => ({ label: b.label, value: b.count }));
  return section('education', 'Education', 'A highly educated community',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Population 25 and over (table B15003).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${percent(e.pctBachelorsPlus)}</div><div class="stat-label">Bachelor's degree or higher</div></div>
       <div class="stat"><div class="stat-value">${percent(e.pctGraduatePlus)}</div><div class="stat-label">Graduate or professional degree</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Educational attainment', format: fmt })}
     <p class="chart-caption">Totals are bounded by the ${num(e.total25plus)} residents aged 25+ — unlike the 2020 draft, which reported more degrees than people.</p>`);
}

function raceSection(r) {
  const items = r.race.groups.filter((g) => (g.count || 0) > 0).map((g) => ({ label: g.label, value: g.count }));
  return section('race', 'Race & ethnicity', 'Predominantly white',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks). Race and Hispanic origin are separate questions.',
    `${horizontalBars({ items, ariaLabel: 'Residents by race', format: fmt })}
     <p class="chart-caption"><strong>${percent(r.race.hispanicPct)}</strong> of residents identify as Hispanic or Latino (of any race). Presented as clean Census counts rather than an unreconcilable survey table.</p>`);
}

function maritalSection(r) {
  const m = r.marital;
  const items = [
    { label: 'Now married', value: m.pctMarried }, { label: 'Widowed', value: m.pctWidowed },
    { label: 'Divorced', value: m.pctDivorced }, { label: 'Never married', value: m.pctNever },
  ];
  return section('marital', 'Marital status', 'Married, widowed, or on their own',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Population 15+ (table B12001).',
    `${horizontalBars({ items, ariaLabel: 'Marital status', format: (n) => percent(n) })}
     <p class="chart-caption">A note on precision: in 2020 the federal ACS did not consistently record same-sex married couples as married, which understates marriage among Oakmont's same-sex couples.</p>`);
}

function placeOfBirthSection(r) {
  const items = r.placeOfBirth.regions.map((g) => ({ label: g.label, value: g.pct }));
  return section('origin', 'Where residents come from', 'Mostly California and elsewhere in the U.S.',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Place of birth (table B05002).',
    `${horizontalBars({ items, ariaLabel: 'Place of birth', format: (n) => percent(n) })}
     <p class="chart-caption">Place of birth is the Census surrogate for "where did you move from" — the region-of-origin detail in prior reports isn't published in a standard table.</p>`);
}

function methodologySection(r) {
  return section('methodology', 'Methodology & sources', 'How this report was built',
    'U.S. Census Bureau only.',
    `<div class="method-body">
       <p>This report uses <strong>only U.S. Census Bureau data</strong> — no AARP survey, no commercial or address-level data.</p>
       <ul>
         <li><strong>Counts</strong> (population, age, sex, race, owner/renter) come from the <strong>2020 Decennial Census</strong>, summed over ${escapeHtml(r.geography.counts)} — exact to Oakmont's boundary.</li>
         <li><strong>Estimates</strong> (income, income sources, education, home value, tenure, marital status, place of birth) come from the <strong>2020 ACS 5-Year</strong> for ${escapeHtml(r.geography.estimates)}. ${escapeHtml(r.geography.note)}</li>
       </ul>
       <p>ACS estimates carry sampling margins of error; small percentages (SSI, public assistance, SNAP) are approximate, and some aggregate amounts are suppressed by the Census Bureau for privacy and shown as "not disclosed."</p>
       <p class="report-note">Vintage: ${escapeHtml(r.vintage)}.</p>
     </div>`);
}

export function showReportError(err) {
  const root = document.getElementById('report');
  if (root) root.innerHTML = `<p class="explorer-loading">Could not load the report: ${escapeHtml(err.message)}</p>`;
  console.error(err);
}
