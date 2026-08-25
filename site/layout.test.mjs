// The page frame is three separate elements — the masthead, main, and the footer — that are not
// nested in one another, so nothing forces them to share a left edge. They had drifted apart:
// the masthead sat one gutter outside main, and on the report page main was a 920px column inside
// a 1120px masthead, leaving the headline 120px left of the text it introduced.
//
// These are text assertions on the stylesheet rather than rendered measurements, because there is
// no browser in CI. They pin the invariant that produced the drift: every part of the frame must
// take its width and its gutter from the same two variables, and nothing inside main may declare
// the shell a second time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');

// The declaration block for a top-level selector, e.g. rule('main').
function rule(selector) {
  const i = CSS.indexOf(`\n${selector} {`) + 1 || CSS.indexOf(`\n${selector} {\n`) + 1;
  assert.notEqual(i, 0, `no rule found for "${selector}"`);
  const open = CSS.indexOf('{', i);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

const FRAME = ['.masthead-inner', 'main', '.site-footer'];

test('every part of the page frame takes its width from the same variable', () => {
  for (const sel of FRAME) {
    assert.match(rule(sel), /max-width:\s*var\(--col\)/,
      `${sel} must use var(--col), or it will not line up with the rest of the frame`);
  }
});

test('every part of the page frame takes its side padding from the same variable', () => {
  // The masthead originally had none, which is what put the headline a gutter out from the body.
  for (const sel of FRAME) {
    assert.match(rule(sel), /padding:[^;]*var\(--gutter\)/,
      `${sel} must pad with var(--gutter)`);
  }
});

test('regions inside main do not declare the page shell a second time', () => {
  // .explorer-section and .explore-intro each set max-width + margin auto + 24px padding while
  // sitting inside main, which had already applied all three. That doubled the gutter and pushed
  // the explore and comparison pages 24px right of their own mastheads.
  for (const sel of ['.explorer-section', '.explore-intro', '.report', '.method']) {
    const body = rule(sel);
    assert.doesNotMatch(body, /max-width:\s*var\(--(col|maxw)\)/,
      `${sel} is inside main and must not set the column width again`);
    assert.doesNotMatch(body, /padding:\s*[^;]*\d+(px|rem)\s+\d+(px|rem)/,
      `${sel} is inside main and must not add a second side gutter — use padding-block`);
  }
});

// The declarations inside the first @media block matching `label`, so a failure prints the block
// rather than the whole stylesheet.
function mediaBlock(label) {
  const i = CSS.indexOf(`@media (${label})`);
  assert.notEqual(i, -1, `no @media (${label}) block`);
  return CSS.slice(i, CSS.indexOf('\n}', i));
}

test('the narrow-screen gutter moves the variable, not one element', () => {
  // The mobile rule used to narrow main alone, which left the masthead and the footer at 24px and
  // pulled the frame apart again below 560px.
  const block = mediaBlock('max-width: 560px');
  assert.match(block, /:root \{ --gutter: \d+px; \}/,
    'the 560px breakpoint must override --gutter so the whole frame follows');
  assert.doesNotMatch(block, /padding-left:/,
    'nothing may narrow one region\'s side padding on its own — move --gutter instead');
});

test('the methodology column can shrink below its content', () => {
  // `1fr` floors at min-content, so one unshrinkable child pushed the column to 392px on a 375px
  // screen and the page scrolled sideways.
  assert.match(mediaBlock('max-width: 800px'), /\.method-layout \{ grid-template-columns: minmax\(0, 1fr\)/,
    'the stacked methodology layout needs minmax(0, 1fr), not 1fr');
});

test('the rule under the masthead spans the text, not the column plus its gutters', () => {
  assert.match(rule('.masthead::after'), /width:\s*calc\(min\(var\(--col\), 100%\) - 2 \* var\(--gutter\)\)/);
});

test('a delta badge is kept to one line', () => {
  // A badge that wraps drops its tile's sub-label below its neighbours' and the row stops
  // reading as a row.
  assert.match(rule('.kpi-delta'), /white-space:\s*nowrap/);
});
