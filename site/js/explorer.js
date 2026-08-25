// The Full data explorer: lazy-loads a section's mirror file (all tables), shows Featured
// tables plus a searchable catalog of every table, each a sortable table with a distribution
// bar and CSV export. renderExplorer is async — it fetches the mirror on first open.

import { fmt, escapeHtml } from './format.js';

export async function renderExplorer(root, { explorerFile, featured = [], year = '', isCurrent = () => true }) {
  root.innerHTML = `<p class="explorer-loading">Loading full dataset…</p>`;
  let data;
  try {
    const res = await fetch(`./${explorerFile}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch (err) {
    if (!isCurrent()) return;
    root.innerHTML = `<p class="explorer-loading">Could not load the full dataset (${escapeHtml(String(err.message))}).</p>`;
    return;
  }

  // The reader switched datasets while this mirror was in flight; the newer render owns the DOM.
  if (!isCurrent()) return;

  const tables = data.tables || {};
  const ids = Object.keys(tables);
  const tableTotal = (id) => tables[id].variables[`${id}_001E`]?.value
    ?? tables[id].variables[`${id}_001N`]?.value
    ?? Object.values(tables[id].variables)[0]?.value ?? null;
  const isEmpty = (id) => Object.values(tables[id].variables).every((v) => !v.value);

  const featuredIds = featured.filter((id) => tables[id]);
  const state = { tab: featuredIds[0] || ids[0], filter: '', sort: '', hideEmpty: true, search: '' };

  root.innerHTML = `
    ${tables.B19019 ? `<div class="featured-grid" id="income-grid"></div>` : ''}
    <div class="explorer-featured">
      <span class="featured-label">Featured</span>
      ${featuredIds.map((id) => `<button class="chip" data-id="${id}"><span class="catalog-id">${id}</span> ${escapeHtml(tables[id].concept || id)}</button>`).join('')}
    </div>
    <div class="catalog-controls">
      <input type="search" id="cat-search" placeholder="Search all ${ids.length} tables by name or code…" aria-label="Search tables" />
      <label class="hide-empty"><input type="checkbox" id="cat-hide-empty" checked /> Hide empty tables</label>
    </div>
    <div class="catalog-list" id="cat-list"></div>
    <div class="table-view" id="table-view"></div>`;

  if (tables.B19019) {
    import('./income-grid.js')
      .then(({ renderIncomeGrid }) => renderIncomeGrid(root.querySelector('#income-grid'), tables))
      .catch(() => {}); // the grid is optional; a load/render failure must not break the explorer
  }

  const catList = root.querySelector('#cat-list');
  const tableView = root.querySelector('#table-view');
  const searchEl = root.querySelector('#cat-search');
  const hideEmptyEl = root.querySelector('#cat-hide-empty');

  function visibleTableIds() {
    const q = state.search.toLowerCase();
    return ids
      .filter((id) => !(state.hideEmpty && isEmpty(id)))
      .filter((id) => !q || id.toLowerCase().includes(q) || (tables[id].concept || '').toLowerCase().includes(q));
  }

  function renderCatalog() {
    const list = visibleTableIds();
    catList.innerHTML = `<div class="catalog-count">${list.length} tables</div>` +
      list.map((id) => `<button class="catalog-item ${id === state.tab ? 'active' : ''}" data-id="${id}">
        <span class="catalog-id">${id}</span><span class="catalog-concept">${escapeHtml(tables[id].concept || '')}</span>
      </button>`).join('');
    catList.querySelectorAll('.catalog-item').forEach((btn) =>
      btn.addEventListener('click', () => { state.tab = btn.dataset.id; renderCatalog(); renderTable(); }));
  }

  function rowsFor(id) {
    const denom = tableTotal(id);
    return Object.entries(tables[id].variables).map(([code, v]) => ({
      code, label: v.label, value: v.value, moe: v.moe ?? null,
      pct: v.value != null && denom ? (v.value / denom) * 100 : null,
    }));
  }

  // Decennial tables carry no margins at all, so the column only appears where it means something.
  const hasMargins = (rows) => rows.some((r) => r.moe != null);

  function sortRows(rows, key) {
    if (!key) return rows;
    const r = [...rows];
    if (key === 'label') return r.sort((a, b) => a.label.localeCompare(b.label));
    if (key === 'code') return r.sort((a, b) => a.code.localeCompare(b.code));
    const [field, dir] = key.split('-');
    return r.sort((a, b) => {
      const va = a[field] ?? -Infinity, vb = b[field] ?? -Infinity;
      return dir === 'desc' ? vb - va : va - vb;
    });
  }

  function renderTable() {
    const id = state.tab;
    if (!tables[id]) { tableView.innerHTML = ''; return; }
    let rows = rowsFor(id);
    rows = sortRows(rows, state.sort);
    const maxV = Math.max(0, ...rows.map((r) => r.value ?? 0));
    const showMoe = hasMargins(rows);
    tableView.innerHTML = `
      <div class="table-view-head">
        <h4><span class="catalog-id">${id}</span> ${escapeHtml(tables[id].concept || '')}</h4>
        <button class="btn" id="dl-current">This table (CSV)</button>
        <button class="btn btn-outline" id="dl-all">All data (CSV)</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>
          <th data-sort="code">Variable</th><th data-sort="label">Label</th>
          <th data-sort="value" style="text-align:right">Value</th>
          ${showMoe ? '<th data-sort="moe" style="text-align:right">± Margin of error</th>' : ''}
          <th data-sort="pct" style="text-align:right">% of total</th><th>Distribution</th>
        </tr></thead>
        <tbody>${rows.map((r) => {
          const value = r.value != null ? fmt(r.value) : '<span class="na">N/A</span>';
          const p = r.pct != null ? `${r.pct.toFixed(1)}%` : '<span class="na">—</span>';
          const w = maxV > 0 && r.value != null ? Math.max(1, Math.round((r.value / maxV) * 100)) : 0;
          const moe = !showMoe ? '' : `<td class="num">${r.moe != null ? '±' + fmt(r.moe) : '<span class="na">—</span>'}</td>`;
          return `<tr><td class="code">${r.code}</td><td>${escapeHtml(r.label)}</td>
            <td class="num">${value}</td>${moe}<td class="pct">${p}</td>
            <td><div class="dist-bar"><i style="width:${w}%"></i></div></td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
    tableView.querySelectorAll('thead th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const b = th.dataset.sort;
      state.sort = b === 'code' || b === 'label' ? b : (state.sort === `${b}-desc` ? `${b}-asc` : `${b}-desc`);
      renderTable();
    }));
    tableView.querySelector('#dl-current').addEventListener('click', () =>
      downloadCsv([['Table', 'Concept', 'Variable', 'Label', 'Value', 'Margin of Error', '% of Total'],
        ...rowsFor(id).map((r) => [id, tables[id].concept || '', r.code, r.label, r.value ?? '', r.moe ?? '',
          r.pct != null ? `${r.pct.toFixed(2)}%` : ''])], `oakmont_${year}_${id}.csv`));
    tableView.querySelector('#dl-all').addEventListener('click', () => {
      const csv = [['Table', 'Concept', 'Variable', 'Label', 'Value', 'Margin of Error', '% of Total']];
      for (const tid of ids) for (const r of rowsFor(tid))
        csv.push([tid, tables[tid].concept || '', r.code, r.label, r.value ?? '', r.moe ?? '',
          r.pct != null ? `${r.pct.toFixed(2)}%` : '']);
      downloadCsv(csv, `oakmont_${year}_all_data.csv`);
    });
  }

  function downloadCsv(rows, filename) {
    const content = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  root.querySelectorAll('.explorer-featured .chip').forEach((btn) =>
    btn.addEventListener('click', () => { state.tab = btn.dataset.id; renderCatalog(); renderTable(); }));
  searchEl.addEventListener('input', () => { state.search = searchEl.value; renderCatalog(); });
  hideEmptyEl.addEventListener('change', () => { state.hideEmpty = hideEmptyEl.checked; renderCatalog(); });

  renderCatalog();
  renderTable();
}
