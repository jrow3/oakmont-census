// Renders the Community Report from data.report2020. Sourced, honest, modeled on the 2010 report.
import { fmt, currency, pct, escapeHtml } from './format.js';
import { horizontalBars, pairedBars, groupedBars, wireTooltips } from './charts.js';

const YEAR_BUILT_CODES = ['002', '003', '004', '005', '006', '007', '008', '009', '010', '011']
  .map((n) => `B25034_${n}E`);

const num = (n) => (n == null ? '—' : fmt(n));
const money = (n) => (n == null ? '—' : currency(n));
const percent = (n) => (n == null ? '—' : pct(n));

const kpi = (label, value, sub, source) =>
  `<div class="kpi reveal"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div><div class="kpi-src">${source}</div></div>`;

// Who a section counts. This stays on the report because dropping it would turn a scoped figure
// into an apparently unscoped one — a home-value median covering only owner-occupied homes reads
// as covering every home once the qualifier is gone. The reasoning behind each choice lives on the
// methodology page, not here.
const basisTag = (basis) => !basis ? '' :
  `<p class="report-basis">Counts <strong>${escapeHtml(basis.label)}</strong> · <a href="./methodology.html#${basis.anchor || 'bases'}">why</a></p>`;

// Plain statement first, chart second, citation last and folded away. A reader who wants to know
// which Census table this came from can ask; one who just wants to know what it says shouldn't
// have to read past a table code to find out.
function section(id, kicker, title, source, bodyHtml, basis) {
  return `<section class="report-section reveal" id="${id}">
    <div class="report-head"><p class="chart-kicker">${kicker}</p><h2>${title}</h2>${basisTag(basis)}</div>
    ${bodyHtml}
    <details class="report-details report-source-detail">
      <summary>Where this figure comes from</summary>
      <p class="report-source">${source}</p>
    </details>
  </section>`;
}

const lead = (text) => `<p class="report-lead">${text}</p>`;

export async function renderReport() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load data.json (${res.status})`);
  const data = await res.json();
  const r = data.report2020;
  if (!r) throw new Error('No report data in data.json');
  if (data.meta?.sample) document.getElementById('sample-banner').hidden = false;
  if (data.meta?.generatedAt) document.getElementById('footer-generated').textContent = `Data generated ${data.meta.generatedAt.slice(0, 10)}.`;

  // Survey-only figures the Decennial doesn't measure — rent, work, when homes were built.
  // They used to live on a separate page that showed the same community with different numbers.
  const acs = data.acs2020 || null;

  const root = document.getElementById('report');
  root.innerHTML = [
    summarySection(r),
    boundarySection(r),
    ageSexSection(r),
    householdSection(r),
    incomeSection(r),
    incomeSourcesSection(r),
    tenureIncomeSection(r),
    workSection(acs),
    homeValueSection(r, data.enclaves2020, acs),
    housingAgeSection(acs),
    educationSection(r),
    raceSection(r),
    maritalSection(r),
    placeOfBirthSection(r),
    methodologySection(r),
  ].filter(Boolean).join('');
  wireTooltips(root);

  // The block map is the clearest explanation of "exact boundary" on the site, so it sits with
  // the population figures it explains rather than on a page of its own.
  if (document.getElementById('block-map')) {
    const { renderBlockMap } = await import('./block-map.js');
    renderBlockMap();
  }
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
     <p class="report-note">Oakmont is an active-adult 55+ community: ${percent(s.pct55Plus)} of residents counted here are 55 or older.
       The tiles marked <em>Decennial · exact blocks</em> count Oakmont itself. Those marked <em>ACS · tracts</em>
       come from a survey covering a wider area, because the survey isn't published small enough to match
       Oakmont's edge.</p>`,
    // Mixed by design: four tiles are Oakmont exactly, three are the wider survey area. The tiles
    // carry their own source line, so the tag names the mix rather than claiming one of them.
    { label: 'Oakmont exactly for counts, the two tracts for dollars', anchor: 'bases' });
}

// What "Oakmont" means in this report, shown rather than described. The map answers the question
// a reader would otherwise carry through every figure: which houses are we counting?
function boundarySection(r) {
  const blocks = r.geography?.counts || 'the selected census blocks';
  return section('boundary', 'The boundary', 'Which homes count as Oakmont',
    'U.S. Census Bureau, 2020 Decennial Census.',
    `<p class="report-note">Oakmont has no boundary of its own in Census records — it sits inside the City of
       Santa Rosa. So the exact counts in this report are built from ${escapeHtml(blocks)}, traced by hand to
       follow the community's edge.</p>
     <figure class="block-map-card">
       <div id="block-map" class="block-map" role="img" aria-label="Map of the census blocks that trace Oakmont's boundary"></div>
       <figcaption>Each shaded block is counted in full. Survey figures — income, education, home values —
         cover a wider area, because the survey isn't published this small.</figcaption>
     </figure>`,
    { label: 'everyone living in Oakmont', anchor: 'bases' });
}

// Survey-only figures. The Decennial asks nobody about work or poverty, so these exist at tract
// level or not at all.
function workSection(acs) {
  if (!acs?.snapshot) return '';
  const s = acs.snapshot;
  if (s.unemploymentRate == null && s.povertyRate == null) return '';
  return section('work', 'Work and hardship', 'Most residents are retired',
    'U.S. Census Bureau, 2016–2020 American Community Survey (tracts).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${percent(s.unemploymentRate)}</div><div class="stat-label">Unemployment, of those in the labor force</div></div>
       <div class="stat"><div class="stat-value">${percent(s.povertyRate)}</div><div class="stat-label">Living below the poverty line</div></div>
     </div>
     <p class="chart-caption">Unemployment counts only people who are working or looking for work, so in a
       retirement community it describes a small minority of residents.</p>`,
    // Both figures are person-level, not household-level — the tag said households and was wrong.
    { label: 'people in the two tracts', anchor: 'bases' });
}

function housingAgeSection(acs) {
  if (!acs?.groups?.housing) return '';
  const g = acs.groups.housing;
  const items = YEAR_BUILT_CODES
    .map((c) => ({ label: (g.variables?.[c]?.label || '').replace('Built ', ''), value: g.variables?.[c]?.value ?? null }))
    .filter((d) => d.label);
  if (!items.length) return '';
  const top = [...items].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  return section('housing-age', 'The housing stock', 'When Oakmont was built',
    'U.S. Census Bureau, 2016–2020 American Community Survey (tracts). Table B25034.',
    `${horizontalBars({ items, ariaLabel: 'Housing units by year built', format: fmt })}
     <p class="chart-caption">Most of Oakmont went up <strong>${escapeHtml(top?.label || '')}</strong>.</p>`,
    { label: 'all homes in the two tracts', anchor: 'bases' });
}

function ageSexSection(r) {
  const rows = r.ageSex.filter((b) => b.band !== 'Under 55');
  const under55 = r.ageSex.find((b) => b.band === 'Under 55');
  const items = rows.map((b) => ({ label: b.band, left: b.male, right: b.female }));
  const totalM = rows.reduce((a, b) => a + b.male, 0), totalF = rows.reduce((a, b) => a + b.female, 0);
  const ratio = totalM ? (totalF / totalM).toFixed(1) : '—';
  const u = under55 || { male: 0, female: 0, total: 0 };
  const cells = (m, f, t) => `<td class="num">${num(m)}</td><td class="num">${num(f)}</td><td class="num">${num(t)}</td>`;
  const bandRows = rows.map((b) => `<tr><td>${b.band}</td>${cells(b.male, b.female, b.total)}</tr>`).join('');
  return section('age', 'Age & gender', 'Older, and mostly women',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks).',
    `${lead('Most people here are past retirement age, and women outnumber men by more in every band as the ages climb.')}
     <div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Male</span><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Female</span></div>
     ${pairedBars({ items, ariaLabel: 'Population by age band and sex' })}
     <div class="table-wrap"><table class="report-table"><thead><tr><th>Age</th><th>Male</th><th>Female</th><th>Total</th></tr></thead>
       <tbody>
         <tr><td>Under 55</td>${cells(u.male, u.female, u.total)}</tr>
         ${bandRows}
         <tr class="total-row"><td>55 and over</td>${cells(totalM, totalF, totalM + totalF)}</tr>
         <tr class="total-row"><td>All residents</td>${cells(u.male + totalM, u.female + totalF, u.total + totalM + totalF)}</tr>
       </tbody></table></div>
     <p class="chart-caption">Among residents 55 and over, women outnumber men about <strong>${ratio}:1</strong>, and the gap widens with age.</p>`,
    { label: 'everyone living in Oakmont; bars show 55+', anchor: 'bases' });
}

function householdSection(r) {
  const items = r.householdSize.distribution.map((d) => ({ label: `${d.size}-person`, value: d.count }));
  return section('households', 'Households', 'Most of us live alone or as a couple',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Household size from table B25009.',
    `${lead('Almost every home here holds one person or two.')}
     ${horizontalBars({ items, ariaLabel: 'Households by size', format: fmt })}
     <p class="chart-caption">Across ${num(r.householdSize.total)} households in the two tracts, the average is <strong>${r.householdSize.average ?? '—'}</strong> people per household — one- and two-person homes dominate, consistent with a retirement community. A size showing zero means the survey found too few to measure, not that none exist.</p>`,
    { label: 'households in the two tracts', anchor: 'bases' });
}

function incomeSection(r) {
  const i = r.income;
  const items = i.distribution.map((d) => ({ label: d.label, value: d.count }));
  const households = i.distribution.reduce((sum, d) => sum + (d.count || 0), 0);
  return section('income', 'Income', 'Household and family income',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts).',
    `${lead('Half of households take in more than the median figure below, and half less.')}
     <div class="stat-row">
       <div class="stat"><div class="stat-value">${money(i.median)}</div><div class="stat-label">Median household income</div></div>
       <div class="stat"><div class="stat-value">${money(i.perCapita)}</div><div class="stat-label">Per-capita income</div></div>
       <div class="stat"><div class="stat-value">${money(i.familyMedian)}</div><div class="stat-label">Median family income</div></div>
       <div class="stat"><div class="stat-value">${money(i.nonfamilyMedian)}</div><div class="stat-label">Median non-family income</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Households by income bracket', format: fmt })}
     <p class="chart-caption">Covers ${num(households)} households across the two tracts, a wider area than Oakmont itself. Family households — two or more related people sharing a home, typically couples — take in well above people living alone.</p>`,
    { label: 'households in the two tracts', anchor: 'bases' });
}

const AMOUNT_MISSING = {
  notPublished: { text: 'not published', tip: 'the Census publishes no dollar amount for this source' },
  notDisclosed: { text: 'not disclosed', tip: 'too few households to publish without identifying them' },
  noHouseholds: { text: '—', tip: 'no households report this source' },
};

function incomeSourcesSection(r) {
  const rows = [...r.incomeSources].sort((a, b) => (b.pctHouseholds || 0) - (a.pctHouseholds || 0)).map((s) => {
    // A zero share draws nothing; only non-zero shares get the 1% minimum so they stay visible.
    const width = s.pctHouseholds ? Math.max(1, Math.round(s.pctHouseholds)) : 0;
    const missing = AMOUNT_MISSING[s.amountStatus] || AMOUNT_MISSING.notDisclosed;
    const mean = s.meanAmount != null ? money(s.meanAmount) : `<span class="na">${missing.text}</span>`;
    const amountTip = s.meanAmount != null ? money(s.meanAmount) : missing.tip;
    return `<div class="src-row" data-tip="${escapeHtml(`<b>${escapeHtml(s.label)}</b><br>${percent(s.pctHouseholds)} of households · ${amountTip}`)}">
      <div class="src-label">${escapeHtml(s.label)}</div>
      <div class="src-bar"><i style="width:${width}%"></i></div>
      <div class="src-pct">${percent(s.pctHouseholds)}</div>
      <div class="src-mean">${mean}</div>
    </div>`;
  }).join('');
  return section('sources', 'Sources of income', 'What households live on',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Shares are % of households receiving each source.',
    `${lead('Most households here live on Social Security and a pension rather than a pay cheque.')}
     <div class="src-head"><div class="src-label"></div><div class="src-bar"></div><div class="src-pct">Households</div><div class="src-mean">Average amount</div></div>
     <div class="src-list">${rows}</div>
     <p class="chart-caption">Amounts are an average per receiving household, not a median — the Census publishes no median by income source. Shares are of all households in the two tracts.</p>`,
    { label: 'households in the two tracts', anchor: 'bases' });
}

function tenureIncomeSection(r) {
  const t = r.incomeByTenure;
  const items = t.distribution.map((d) => ({ label: d.label, a: d.owner, b: d.renter }));
  return section('tenure-income', 'Owners vs. renters', 'Owners have more income',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Tables B25119 (medians) and B25118 (distribution).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(t.ownerMedian)}</div><div class="stat-label">Owner median income · ${num(t.ownerHouseholds)} homes in the two tracts</div></div>
       <div class="stat"><div class="stat-value">${money(t.renterMedian)}</div><div class="stat-label">Renter median income · ${num(t.renterHouseholds)} homes in the two tracts</div></div>
     </div>
     <div class="legend-row"><span class="legend-item"><span class="legend-swatch" style="background:var(--terracotta)"></span>Owner-occupied</span><span class="legend-item"><span class="legend-swatch" style="background:var(--teal)"></span>Renter-occupied</span></div>
     ${groupedBars({ items, ariaLabel: 'Household income by tenure' })}`,
    { label: 'households in the two tracts', anchor: 'bases' });
}

function homeValueSection(r, enclaves, acs) {
  const items = r.homeValue.distribution.map((d) => ({ label: d.label, value: d.count }));
  const h = r.housing || {};
  // Rentals split into the one senior-living building and the ordinary homes owners let out.
  const gardens = (enclaves?.areas || []).find((a) => a.tenure)?.addresses ?? null;
  const otherRentals = h.renterOccupied != null && gardens != null ? h.renterOccupied - gardens : null;
  // Census renter count minus a county address count — two independent measurements, so only
  // state the split when it actually resolves to a sensible positive remainder.
  const rentalSplit = otherRentals == null || otherRentals <= 0 ? '' :
    ` Of those rentals, ${num(gardens)} are at Oakmont Gardens and ${num(otherRentals)} are ordinary homes let out by their owners.`;
  return section('home-value', 'Home value', 'Where owner-estimated values land',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Owner-reported values (table B25075/B25077).',
    `<div class="stat-row">
       <div class="stat"><div class="stat-value">${money(r.homeValue.median)}</div><div class="stat-label">Median value, owner-estimated</div></div>
       <div class="stat"><div class="stat-value">${money(acs?.snapshot?.medianGrossRent)}</div><div class="stat-label">Median rent, per month</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Owner-occupied homes by value', format: fmt })}
     <p class="chart-caption">Covers the ${num(r.incomeByTenure.ownerHouseholds)} <strong>owner-occupied</strong> homes the survey covers across the two tracts — renters report no value and vacant units aren't counted. Oakmont itself has ${num(h.totalUnits)} homes: ${num(h.ownerOccupied)} owner-occupied, ${num(h.renterOccupied)} rented and ${num(h.vacantUnits)} vacant.${rentalSplit}</p>`,
    // The value chart is owner-occupied only; the rent figure beside it is renter-occupied by
    // definition, so the tag has to cover both rather than claim one.
    { label: 'owner-occupied homes for value, rented homes for rent', anchor: 'bases' });
}

function educationSection(r) {
  const e = r.education;
  const items = e.bands.map((b) => ({ label: b.label, value: b.count }));
  return section('education', 'Education', 'A highly educated community',
    'U.S. Census Bureau, 2020 ACS 5-Year (tracts). Population 45 and over (table B15001).',
    `${lead('More than half of Oakmont\'s older residents hold a university degree, and about a quarter hold a postgraduate one.')}
     <div class="stat-row">
       <div class="stat"><div class="stat-value">${percent(e.pctBachelorsPlus)}</div><div class="stat-label">Bachelor's degree or higher</div></div>
       <div class="stat"><div class="stat-value">${percent(e.pctGraduatePlus)}</div><div class="stat-label">Graduate or professional degree</div></div>
     </div>
     ${horizontalBars({ items, ariaLabel: 'Educational attainment', format: fmt })}
     <p class="chart-caption">Covers ${num(e.total45plus)} people aged 45 and over across the two tracts — a wider area than Oakmont itself, so this is more people than live in Oakmont.</p>`,
    { label: 'residents 45 and over', anchor: 'bases' });
}

function raceSection(r) {
  const items = r.race.groups.filter((g) => (g.count || 0) > 0)
    .map((g) => ({ label: g.label, value: g.count }))
    .sort((a, b) => b.value - a.value);
  return section('race', 'Race & ethnicity', 'Predominantly white',
    'U.S. Census Bureau, 2020 Decennial Census (exact Oakmont blocks). Race and Hispanic origin are separate questions.',
    `${lead('Oakmont is overwhelmingly white, more so than Sonoma County as a whole.')}
     ${horizontalBars({ items, ariaLabel: 'Residents by race', format: fmt })}
     <p class="chart-caption"><strong>${percent(r.race.hispanicPct)}</strong> of residents identify as Hispanic or Latino (of any race).</p>`,
    { label: 'everyone living in Oakmont', anchor: 'bases' });
}

function maritalSection(r) {
  const m55 = r.marital55Plus;
  const m = r.marital;
  const bars = (b) => horizontalBars({
    items: [
      { label: 'Now married', value: b.pctMarried }, { label: 'Widowed', value: b.pctWidowed },
      { label: 'Divorced', value: b.pctDivorced }, { label: 'Never married', value: b.pctNever },
    ],
    ariaLabel: 'Marital status', format: (n) => percent(n),
  });
  // The 55+ cut leads because it matches who actually lives here; the all-ages figures stay
  // beneath it rather than being replaced, since they are what the tracts actually publish.
  const allAges = `<details class="report-details"><summary>Everyone aged 15 and over in the two tracts (${num(m.total)})</summary>
     ${bars(m)}</details>`;
  return section('marital', 'Marital status', 'Married, widowed, or on their own',
    `U.S. Census Bureau, 2020 ACS 5-Year (tracts). ${m55 ? 'Residents 55+ (table B12002); all-ages figures from B12001.' : 'Population 15+ (table B12001).'}`,
    m55
      ? `${lead('Among people aged 55 and over, a little over half are married. Widowhood is far more common here than in most places, which is what an older population looks like.')}
         ${bars(m55)}<p class="chart-caption">Among ${num(m55.total)} people aged 55 and over across the two tracts.</p>${allAges}`
      : bars(m),
    { label: m55 ? 'residents 55 and over' : 'residents 15 and over', anchor: 'bases' });
}

function placeOfBirthSection(r) {
  const items = r.placeOfBirth.regions
    .map((g) => ({ label: g.label, value: g.pct }))
    .sort((a, b) => b.value - a.value);
  const p55 = r.placeOfBirth55Plus;
  // No ACS table carries both birth region and age, so the 55+ cut leads with the four categories
  // it does publish, and the region detail follows at all ages rather than being dropped.
  const headline = !p55 ? '' : `<div class="stat-row">${p55.categories.map((c) =>
    `<div class="stat"><div class="stat-value">${percent(c.pct)}</div><div class="stat-label">${escapeHtml(c.label)}</div></div>`).join('')}</div>
     <p class="chart-caption">Among ${num(p55.total)} people aged 55 and over across the two tracts.</p>`;
  // California leads the all-ages chart but not the 55+ figures above it, so the one claim that
  // holds on both cuts — a majority born outside California — is the one the heading makes.
  const california = r.placeOfBirth.regions.find((g) => /California/.test(g.label));
  const outsideCalifornia = california?.pct != null ? 100 - california.pct : null;
  return section('origin', 'Where residents were born', 'A majority were born outside California',
    `U.S. Census Bureau, 2020 ACS 5-Year (tracts). ${p55 ? 'Residents 55+ (table B06001); regional detail from B05002, all ages.' : 'Place of birth (table B05002).'}`,
    `${lead('This is where people were born, not where they last lived — the survey does not ask that. Among residents 55 and over, more were born in another state than in California.')}
     ${headline}
     <h3 class="report-subhead">Where in the country, all residents</h3>
     ${horizontalBars({ items, ariaLabel: 'Place of birth', format: (n) => percent(n) })}
     <p class="chart-caption">Across all ages in the two tracts, California is the single largest origin, but the other categories together account for ${percent(outsideCalifornia)} of residents. Percentages are of ${num(r.placeOfBirth.total)} people.</p>`,
    { label: p55 ? 'residents 55 and over, then all residents' : 'all residents', anchor: 'bases' });
}

// The report carries findings; the reasoning behind every table, geography and population basis
// lives on the methodology page so it is written once and read in one place.
function methodologySection(r) {
  return section('methodology', 'Methodology & sources', 'How this report was built',
    `U.S. Census Bureau only. Vintage: ${escapeHtml(r.vintage)}.`,
    // r.geography.counts / .estimates already name their dataset, so wrapping them in "the 2020
    // Decennial Census (...)" printed the dataset twice inside nested brackets.
    `<div class="method-body">
       <p>Exact counts: ${escapeHtml(r.geography.counts)}. Survey estimates: ${escapeHtml(r.geography.estimates)}.</p>
       <p><a class="method-link" href="./methodology.html">Read the full methodology</a> — which dataset answers which question, who each figure counts, what the Census does and doesn't publish, and the limits of every number here.</p>
     </div>`);
}

export function showReportError(err) {
  const root = document.getElementById('report');
  if (root) root.innerHTML = `<p class="explorer-loading">Could not load the report: ${escapeHtml(err.message)}</p>`;
  console.error(err);
}
