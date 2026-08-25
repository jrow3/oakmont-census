// Checks that every chart on the report ties to the universe it claims to cover. Unit tests can't
// catch this: each derive* function is correct on its own, and the drift only shows up once real
// data flows through all of them onto one page, where a reader sees a bar chart of 2,200 homes
// captioned "2,490 homes".
//
// Run after fetch-census.mjs, before deploy. Sample builds are reported but not enforced, because
// the sample generator fabricates each section independently and cannot tie.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ACS band counts come from the same table as their universe, so they sum exactly. A tolerance
// exists only for the derived percentage checks, where the payload rounds to one decimal.
const PCT_SLACK = 0.3;

export function reconcile(data) {
  const problems = [];
  const r = data.report2020;
  const block = data.oakmont2020?.snapshot;
  if (!r || !block) return [{ what: 'payload', detail: 'report2020 or oakmont2020 missing' }];

  const fail = (what, detail) => problems.push({ what, detail });
  const sum = (rows, key) => rows.reduce((a, row) => a + (row[key] || 0), 0);
  const ties = (what, parts, whole, label) => {
    if (whole == null) return;
    if (parts !== whole) fail(what, `parts sum to ${parts}, ${label} is ${whole}`);
  };

  ties('age bands', sum(r.ageSex, 'total'), block.totalPopulation, 'the block population');
  ties('age bands by sex', sum(r.ageSex, 'male') + sum(r.ageSex, 'female'), sum(r.ageSex, 'total'), 'the band total');
  ties('race groups', sum(r.race.groups, 'count'), r.race.total, 'the stated total');
  ties('race total', r.race.total, block.totalPopulation, 'the block population');

  const h = r.housing;
  ties('tenure', (h.ownerOccupied || 0) + (h.renterOccupied || 0), h.occupiedUnits, 'occupied units');
  ties('occupancy', (h.occupiedUnits || 0) + (h.vacantUnits || 0), h.totalUnits, 'total units');

  ties('education bands', sum(r.education.bands, 'count'), r.education.total45plus, 'the 45+ total');
  const degreeBands = r.education.bands.filter((b) => /Bachelor|Graduate/.test(b.label));
  const bachelorsPlus = degreeBands.reduce((a, b) => a + (b.pct || 0), 0);
  if (Math.abs(bachelorsPlus - r.education.pctBachelorsPlus) > PCT_SLACK) {
    fail('bachelors-or-higher', `headline says ${r.education.pctBachelorsPlus}%, bands sum to ${bachelorsPlus.toFixed(1)}%`);
  }

  ties('place of birth', sum(r.placeOfBirth.regions, 'count'), r.placeOfBirth.total, 'the stated total');
  if (r.placeOfBirth55Plus) {
    ties('place of birth 55+', sum(r.placeOfBirth55Plus.categories, 'count'), r.placeOfBirth55Plus.total, 'the stated total');
  }

  ties('household sizes', sum(r.householdSize.distribution, 'count'), r.householdSize.total, 'the stated total');

  // B19001 (income brackets) and B25119 (income by tenure) share a universe: occupied housing
  // units. If these disagree the page shows two different household counts a section apart.
  const tenureHouseholds = (r.incomeByTenure.ownerHouseholds || 0) + (r.incomeByTenure.renterHouseholds || 0);
  ties('income brackets', sum(r.income.distribution, 'count'), tenureHouseholds, 'owner plus renter households');
  ties('households vs. income', r.householdSize.total, tenureHouseholds, 'owner plus renter households');

  // B25075 (home value) covers owner-occupied units, the same universe as B25119's owner column.
  ties('home values', sum(r.homeValue.distribution, 'count'), r.incomeByTenure.ownerHouseholds, 'owner households');

  // The report says "X% of residents counted here are 55 or older" over the block population.
  if (block.age55Plus != null && block.totalPopulation) {
    const derived = (block.age55Plus / block.totalPopulation) * 100;
    if (Math.abs(derived - block.pct55Plus) > PCT_SLACK) {
      fail('55+ share', `snapshot says ${block.pct55Plus}%, ${block.age55Plus}/${block.totalPopulation} is ${derived.toFixed(1)}%`);
    }
  }

  // Every survey figure on the report is tract-based, so each must exceed the block count it sits
  // beside. A subset larger than the whole is the single most quotable error on the page — but so
  // is a "wider area" figure that comes out smaller.
  const tractPop = data.acs2020?.snapshot?.totalPopulation;
  if (tractPop != null && block.totalPopulation != null && tractPop <= block.totalPopulation) {
    fail('tract vs. block', `tract population ${tractPop} is not larger than the block population ${block.totalPopulation}`);
  }

  return problems;
}

function main() {
  const path = join(ROOT, 'site', 'data.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const problems = reconcile(data);
  const sample = Boolean(data.meta?.sample);

  if (!problems.length) {
    console.log(`Reconciled: every chart ties to its stated universe.${sample ? ' (sample build)' : ''}`);
    return;
  }
  for (const p of problems) console.log(`  ${p.what}: ${p.detail}`);
  if (sample) {
    console.log(`\n${problems.length} discrepancies in a SAMPLE build — not failing. Sample sections are`);
    console.log('fabricated independently and are not expected to tie. Re-run against a real fetch.');
    return;
  }
  console.log(`\n${problems.length} discrepancies in real data. The report would contradict itself.`);
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
