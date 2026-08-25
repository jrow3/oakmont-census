import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySelection, totalsFor } from './apply-selection.mjs';

const CURRENT = {
  description: 'Traced by hand against a block map.',
  source: 'Manual selection via the block-selector map, 2026-08-09',
  geography: 'Selected 2020 census blocks within Census Tracts 1516.01 + 1516.02',
  revisions: [{ date: '2026-08-24', change: 'Removed Timber Springs Drive.' }],
  tigerwebTotals: { note: 'POP100/HU100 from TIGERweb.', blocks: 3, population: 300, housingUnits: 200 },
  geoids: ['060971516011000', '060971516011001', '060971516011002'],
};

const FEATURES = [
  { properties: { GEOID: '060971516011000', POP100: 100, HU100: 70 } },
  { properties: { GEOID: '060971516011001', POP100: 100, HU100: 70 } },
  { properties: { GEOID: '060971516011002', POP100: 100, HU100: 60 } },
  { properties: { GEOID: '060971516011003', POP100: 40, HU100: 25 } },
];

const OPTS = { date: '2026-09-01', note: 'Monica re-picked the boundary.', features: FEATURES };
const apply = (geoids, opts = OPTS) => applySelection(CURRENT, { geoids }, opts);

test('provenance survives a re-pick', () => {
  // The whole reason this script exists: the selector's download has none of these keys, so
  // copying it over the repo file would delete them without erroring.
  const { next } = apply(['060971516011000', '060971516011001', '060971516011003']);
  assert.equal(next.description, CURRENT.description);
  assert.equal(next.geography, CURRENT.geography);
  assert.equal(next.tigerwebTotals.note, CURRENT.tigerwebTotals.note);
});

test('the existing revision history is kept and the new entry goes on top', () => {
  const { next } = apply(['060971516011000', '060971516011001', '060971516011003']);
  assert.equal(next.revisions.length, 2);
  assert.equal(next.revisions[0].date, '2026-09-01');
  assert.equal(next.revisions[1].change, 'Removed Timber Springs Drive.');
});

test('the new revision records what moved and what the totals were before', () => {
  const { next } = apply(['060971516011000', '060971516011001', '060971516011003']);
  const rev = next.revisions[0];
  assert.deepEqual(rev.added, ['060971516011003']);
  assert.deepEqual(rev.removed, ['060971516011002']);
  assert.deepEqual(rev.priorTotals, { blocks: 3, population: 300, housingUnits: 200 });
});

test('totals are recomputed for the new selection, not carried over', () => {
  // Stale totals beside a changed list is exactly the failure the reconcile check guards against
  // elsewhere on the site.
  const { next, totals } = apply(['060971516011000', '060971516011001', '060971516011003']);
  assert.deepEqual(totals, { blocks: 3, population: 240, housingUnits: 165 });
  assert.equal(next.tigerwebTotals.population, 240);
});

test('an identical selection is a no-op rather than an empty revision', () => {
  const r = apply([...CURRENT.geoids]);
  assert.equal(r.unchanged, true);
  assert.equal(r.next, CURRENT);
});

test('reordering alone is not a change', () => {
  const r = apply([...CURRENT.geoids].reverse());
  assert.equal(r.unchanged, true);
});

test('geoids are stored sorted so a diff shows real changes, not reshuffles', () => {
  const { next } = apply(['060971516011003', '060971516011000', '060971516011001']);
  assert.deepEqual(next.geoids, ['060971516011000', '060971516011001', '060971516011003']);
});

test('a file that is not a selection is rejected rather than emptying the list', () => {
  assert.throws(() => applySelection(CURRENT, { count: 3 }, OPTS), /no geoids/);
  assert.throws(() => applySelection(CURRENT, { geoids: [] }, OPTS), /no geoids/);
});

test('malformed and duplicate GEOIDs are rejected', () => {
  assert.throws(() => apply(['060971516011000', '12345']), /not 15-digit block GEOIDs/);
  assert.throws(() => apply(['060971516011000', '060971516011000']), /duplicate/);
});

test('totalsFor ignores a GEOID with no geometry rather than counting it as zero silently', () => {
  // It still returns, but the block count and the summed population disagree, which is what the
  // caller prints — better than a total that looks complete.
  const t = totalsFor(['060971516011000', '069999999999999'], FEATURES);
  assert.equal(t.blocks, 2);
  assert.equal(t.population, 100);
});
