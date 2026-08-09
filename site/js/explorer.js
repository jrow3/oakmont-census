// The "Full data explorer": one tab per variable group, each a sortable, filterable table
// with a distribution bar and CSV export. Reads the same baked data.json as the snapshot.

import { fmt, escapeHtml } from './format.js';

export function renderExplorer(root, section) {
  const groups = section.groups;
  const gids = Object.keys(groups);
  const state = { tab: gids[0], filter: '', sort: '' };

  root.innerHTML = `
    <div class="tab-bar" role="tablist">
      ${gids.map((gid) => `<button class="tab" data-gid="${gid}" role="tab">${escapeHtml(groups[gid].label)}</button>`).join('')}
    </div>
    <div class="explorer-controls">
      <input type="search" id="exp-filter" placeholder="Filter by label or variable code…" aria-label="Filter rows" />
      <select id="exp-sort" aria-label="Sort rows">
        <option value="">Sort…</option>
        <option value="label">Label (A to Z)</option>
        <option value="code">Variable code</option>
        <option value="value-desc">Count (high to low)</option>
        <option value="value-asc">Count (low to high)</option>
        <option value="pct-desc">% of total (high to low)</option>
        <option value="pct-asc">% of total (low to high)</option>
      </select>
      <span class="row-count" id="exp-count"></span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th data-sort="code">Variable</th>
          <th data-sort="label">Label</th>
          <th data-sort="value" style="text-align:right">Count</th>
          <th data-sort="pct" style="text-align:right">% of total</th>
          <th>Distribution</th>
        </tr></thead>
        <tbody id="exp-tbody"></tbody>
      </table>
    </div>
    <div class="explorer-downloads">
      <span>Download</span>
      <button class="btn" id="dl-current">This tab (CSV)</button>
      <button class="btn btn-outline" id="dl-all">All data (CSV)</button>
    </div>`;

  const rowsFor = (gid) => {
    const grp = groups[gid];
    const total = grp.variables[grp.totalKey]?.value ?? null;
    const denom = total && total > 0 ? total : null;
    return Object.entries(grp.variables).map(([code, v]) => ({
      code,
      label: v.label,
      value: v.value,
      pct: v.value != null && denom ? (v.value / denom) * 100 : null,
    }));
  };

  const sortRows = (rows, key) => {
    if (!key) return rows;
    const r = [...rows];
    if (key === 'label') return r.sort((a, b) => a.label.localeCompare(b.label));
    if (key === 'code') return r.sort((a, b) => a.code.localeCompare(b.code));
    const [field, dir] = key.split('-');
    return r.sort((a, b) => {
      const va = a[field] ?? -Infinity;
      const vb = b[field] ?? -Infinity;
      return dir === 'desc' ? vb - va : va - vb;
    });
  };

  const tbody = root.querySelector('#exp-tbody');
  const countEl = root.querySelector('#exp-count');
  const filterEl = root.querySelector('#exp-filter');
  const sortEl = root.querySelector('#exp-sort');

  function markHeaders() {
    root.querySelectorAll('thead th[data-sort]').forEach((th) => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      const base = th.dataset.sort;
      if (state.sort === base || state.sort === `${base}-asc`) th.classList.add('sorted-asc');
      else if (state.sort === `${base}-desc`) th.classList.add('sorted-desc');
    });
  }

  function renderTable() {
    let rows = rowsFor(state.tab);
    const q = state.filter.toLowerCase();
    if (q) rows = rows.filter((r) => r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    rows = sortRows(rows, state.sort);

    const maxV = Math.max(0, ...rows.map((r) => r.value ?? 0));
    countEl.textContent = `${rows.length} rows`;
    tbody.innerHTML = rows.map((r) => {
      const count = r.value != null ? fmt(r.value) : '<span class="na">N/A</span>';
      const p = r.pct != null ? `${r.pct.toFixed(1)}%` : '<span class="na">—</span>';
      const w = maxV > 0 && r.value != null ? Math.max(1, Math.round((r.value / maxV) * 100)) : 0;
      return `<tr>
        <td class="code">${r.code}</td>
        <td>${escapeHtml(r.label)}</td>
        <td class="num">${count}</td>
        <td class="pct">${p}</td>
        <td><div class="dist-bar"><i style="width:${w}%"></i></div></td>
      </tr>`;
    }).join('');
    markHeaders();
  }

  function setActiveTab() {
    root.querySelectorAll('.tab').forEach((btn) => {
      const on = btn.dataset.gid === state.tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', String(on));
    });
  }

  function triggerCsv(rows, filename) {
    const content = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const toCsvRows = (gid) => {
    const grp = groups[gid];
    return rowsFor(gid).map((r) => [grp.label, r.code, r.label, r.value ?? '', r.pct != null ? `${r.pct.toFixed(2)}%` : '']);
  };

  // ── Events ──
  root.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => { state.tab = btn.dataset.gid; setActiveTab(); renderTable(); });
  });
  filterEl.addEventListener('input', () => { state.filter = filterEl.value; renderTable(); });
  sortEl.addEventListener('change', () => { state.sort = sortEl.value; renderTable(); });
  root.querySelectorAll('thead th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const base = th.dataset.sort;
      state.sort = base === 'code' || base === 'label'
        ? base
        : (state.sort === `${base}-desc` ? `${base}-asc` : `${base}-desc`);
      sortEl.value = state.sort;
      renderTable();
    });
  });
  root.querySelector('#dl-current').addEventListener('click', () => {
    triggerCsv([['Group', 'Variable', 'Label', 'Count', '% of Total'], ...toCsvRows(state.tab)], `oakmont_${section.year}_${state.tab}.csv`);
  });
  root.querySelector('#dl-all').addEventListener('click', () => {
    const csv = [['Group', 'Variable', 'Label', 'Count', '% of Total']];
    for (const gid of gids) csv.push(...toCsvRows(gid));
    triggerCsv(csv, `oakmont_${section.year}_all_data.csv`);
  });

  setActiveTab();
  renderTable();
}
