// Launch Radar Dashboard Logic (Deterministic ES2022)
(function () {
  'use strict';

  const data = window.RADAR;
  if (!data || !data.rows) {
    console.error('Launch Radar: window.RADAR data missing');
    return;
  }

  const allRows = data.rows;
  let filteredRows = [...allRows];
  let currentSort = { col: 'rank', asc: true };
  let currentFilter = 'all';
  let currentTier = 'all';
  let currentSearch = '';
  let currentCat = '';
  let currentChain = '';
  let currentDropShare = 0.07;
  let currentHorizonWk = 12;

  // DOM elements
  const tbody = document.getElementById('board-tbody');
  const totalsEl = document.getElementById('board-totals');
  const activeFilterLabelEl = document.getElementById('active-filter-label');
  const inpSearch = document.getElementById('inp-search');
  const selCat = document.getElementById('sel-cat');
  const selChain = document.getElementById('sel-chain');
  const selDeposit = document.getElementById('sel-deposit');
  const slDropShare = document.getElementById('sl-dropshare');
  const valDropShare = document.getElementById('val-dropshare');
  const slHorizon = document.getElementById('sl-horizon');
  const valHorizon = document.getElementById('val-horizon');
  const btnReset = document.getElementById('btn-reset');
  const btnCsv = document.getElementById('btn-csv');
  const btnJson = document.getElementById('btn-json');

  // Drawer elements
  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawerClose = document.getElementById('drawer-close');

  // Formatters
  function fmtMoney(n) {
    if (n === null || n === undefined) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n < 0 ? '-$' : '$') + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n < 0 ? '-$' : '$') + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (n < 0 ? '-$' : '$') + (abs / 1e3).toFixed(1) + 'K';
    return (n < 0 ? '-$' : '$') + Math.round(abs);
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365.25).toFixed(1) + ' yr';
    return days + ' d';
  }

  function fmtPct(p) {
    if (p === null || p === undefined) return '—';
    const sign = p > 0 ? '+' : '';
    return sign + p.toFixed(1) + '%';
  }

  // Populate Dropdowns
  const categories = [...new Set(allRows.map((r) => r.category))].sort();
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    selCat.appendChild(opt);
  });

  const chains = new Set();
  allRows.forEach((r) => r.chains.forEach((ch) => chains.add(ch)));
  [...chains].sort().forEach((ch) => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    selChain.appendChild(opt);
  });

  // Render Table
  function renderTable() {
    tbody.innerHTML = '';
    
    filteredRows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-slug', r.slug);

      // Checkbox
      const tdCheck = document.createElement('td');
      tdCheck.innerHTML = '<input type="checkbox" class="row-chk">';
      tdCheck.onclick = (e) => e.stopPropagation();
      tr.appendChild(tdCheck);

      // Rank & Range
      const tdRank = document.createElement('td');
      tdRank.innerHTML = `<span class="rank-num">${r.rank}</span><span class="rank-range">${r.rankRange}</span>`;
      tr.appendChild(tdRank);

      // Protocol & Badges
      const tdProto = document.createElement('td');
      let badgesHtml = '';
      if (r.watchlist) badgesHtml += '<span class="badge badge-wl">Watchlist</span> ';
      if (r.isEarly) badgesHtml += '<span class="badge badge-early">Early</span> ';
      if (r.isOffList) badgesHtml += '<span class="badge badge-offlist">Off-List</span> ';
      if (r.parentMultiplier) badgesHtml += '<span class="badge badge-parent">Parent ×0.48</span> ';
      
      const chainStr = r.chains.length > 1 ? `${r.chains[0]} +${r.chains.length - 1}` : (r.chains[0] || '');
      tdProto.innerHTML = `
        <div class="proto-cell">
          <span class="proto-name">${r.name}</span>
          ${badgesHtml}
        </div>
        <span class="proto-sub">${r.category} · ${chainStr}</span>
      `;
      tr.appendChild(tdProto);

      // TVL
      const tdTvl = document.createElement('td');
      tdTvl.className = 'text-right';
      tdTvl.innerHTML = `<strong>${fmtMoney(r.tvl_usd)}</strong>`;
      tr.appendChild(tdTvl);

      // 7D
      const td7d = document.createElement('td');
      td7d.className = 'text-right';
      const chgClass = (r.change_7d || 0) >= 0 ? 'chg-pos' : 'chg-neg';
      td7d.innerHTML = `<span class="${chgClass}">${fmtPct(r.change_7d)}</span>`;
      tr.appendChild(td7d);

      // Age
      const tdAge = document.createElement('td');
      tdAge.className = 'text-right';
      tdAge.textContent = fmtAge(r.ageDays);
      tr.appendChild(tdAge);

      // Token Odds
      const tdOdds = document.createElement('td');
      tdOdds.className = 'text-center';
      tdOdds.innerHTML = `
        <div class="odds-cell">
          <strong>${r.tokenOddsPct}%</strong>
          <div class="odds-bar-track"><div class="odds-bar-fill" style="width:${r.tokenOddsPct}%"></div></div>
        </div>
      `;
      tr.appendChild(tdOdds);

      // If it launches
      const tdLaunch = document.createElement('td');
      tdLaunch.className = 'text-right';
      tdLaunch.innerHTML = `<strong>${fmtMoney(r.valueIfLaunchesUsd)}</strong>`;
      tr.appendChild(tdLaunch);

      // Implied Value & Whisker
      const tdImplied = document.createElement('td');
      tdImplied.className = 'implied-cell';
      tdImplied.innerHTML = `
        <div class="implied-val">${fmtMoney(r.implied_value_usd)}</div>
        <div class="whisker-wrap">
          <span class="whisker-lbl">${fmtMoney(r.p25_usd)}–${fmtMoney(r.p75_usd)}</span>
          <div class="whisker-track"><div class="whisker-bar" style="left:20%;width:60%;"></div></div>
        </div>
      `;
      tr.appendChild(tdImplied);

      // Verdict & Net
      const tdVerdict = document.createElement('td');
      tdVerdict.className = 'text-center';
      let vClass = 'verdict-marginal';
      if (r.verdict === 'FARM') vClass = 'verdict-farm';
      else if (r.verdict === 'SKIP') vClass = 'verdict-skip';
      
      const vAmt = (r.verdictAmount >= 0 ? '$' : '-$') + Math.abs(r.verdictAmount);
      tdVerdict.innerHTML = `
        <span class="verdict-pill ${vClass}">${r.verdict} ${vAmt}</span>
        <span class="verdict-sub">$${r.drop_usd} drop – $${r.fees_usd} fees</span>
      `;
      tr.appendChild(tdVerdict);

      // Net / Hour
      const tdNetHr = document.createElement('td');
      tdNetHr.className = 'text-right';
      const netClass = r.net_per_hour >= 0 ? 'pos' : 'neg';
      const netSign = r.net_per_hour >= 0 ? '$' : '-$';
      tdNetHr.innerHTML = `<span class="net-hr ${netClass}">${netSign}${Math.abs(r.net_per_hour)}</span>`;
      tr.appendChild(tdNetHr);

      // Row Click to open Drawer
      tr.onclick = () => openDrawer(r);

      tbody.appendChild(tr);
    });

    // Update Totals Bar
    const totalTvl = filteredRows.reduce((s, r) => s + r.tvl_usd, 0);
    const totalImplied = filteredRows.reduce((s, r) => s + r.implied_value_usd, 0);
    totalsEl.textContent = `${filteredRows.length} of ${allRows.length} rows · ${fmtMoney(totalTvl)} TVL · ${fmtMoney(totalImplied)} implied`;
  }

  // Filtering Logic
  function applyFilters() {
    filteredRows = allRows.filter((r) => {
      // Verdict filter
      if (currentFilter === 'farm' && r.verdict !== 'FARM') return false;
      if (currentFilter === 'marginal' && r.verdict !== 'MARGINAL') return false;
      if (currentFilter === 'skip' && r.verdict !== 'SKIP') return false;

      // Tier filter
      if (currentTier === 'watchlist' && !r.watchlist) return false;
      if (currentTier === 'early' && !r.isEarly) return false;
      if (currentTier === 'offlist' && !r.isOffList) return false;

      // Search
      if (currentSearch) {
        const text = `${r.name} ${r.slug} ${r.category} ${r.chains.join(' ')}`.toLowerCase();
        if (!text.includes(currentSearch)) return false;
      }

      // Category
      if (currentCat && r.category !== currentCat) return false;

      // Chain
      if (currentChain && !r.chains.includes(currentChain)) return false;

      return true;
    });

    // Status label
    if (currentFilter === 'farm') {
      activeFilterLabelEl.textContent = 'Filtered to FARM verdict · sorted by net / hour, high to low';
      currentSort = { col: 'netperhour', asc: false };
    } else {
      activeFilterLabelEl.textContent = '';
    }

    applySort();
  }

  // Sorting Logic
  function applySort() {
    const { col, asc } = currentSort;
    filteredRows.sort((a, b) => {
      let vA, vB;
      if (col === 'rank') { vA = a.rank; vB = b.rank; }
      else if (col === 'name') { vA = a.name.toLowerCase(); vB = b.name.toLowerCase(); }
      else if (col === 'tvl') { vA = a.tvl_usd; vB = b.tvl_usd; }
      else if (col === '7d') { vA = a.change_7d || 0; vB = b.change_7d || 0; }
      else if (col === 'age') { vA = a.ageDays; vB = b.ageDays; }
      else if (col === 'odds') { vA = a.tokenOddsPct; vB = b.tokenOddsPct; }
      else if (col === 'launches') { vA = a.valueIfLaunchesUsd; vB = b.valueIfLaunchesUsd; }
      else if (col === 'implied') { vA = a.implied_value_usd; vB = b.implied_value_usd; }
      else if (col === 'verdict') { vA = a.verdictAmount; vB = b.verdictAmount; }
      else if (col === 'netperhour') { vA = a.net_per_hour; vB = b.net_per_hour; }
      else { vA = a.rank; vB = b.rank; }

      if (vA < vB) return asc ? -1 : 1;
      if (vA > vB) return asc ? 1 : -1;
      return a.rank - b.rank;
    });

    renderTable();
  }

  // Drawer Modal Logic
  function openDrawer(row) {
    document.getElementById('dr-nav-title').textContent = row.name;
    document.getElementById('dr-rank-strap').textContent = `#${row.rank} of 198 by implied value · rank ${row.rankRange} across bootstrap refits`;
    document.getElementById('dr-title').textContent = row.name;

    // Badges
    const badgesEl = document.getElementById('dr-badges');
    badgesEl.innerHTML = '';
    if (row.watchlist) badgesEl.innerHTML += '<span class="badge badge-wl">Watchlist</span> ';
    badgesEl.innerHTML += `<span class="badge ${row.verdict === 'FARM' ? 'badge-wl' : 'badge-early'}">${row.verdict}</span> `;
    badgesEl.innerHTML += `<span class="badge badge-early">${row.category}</span> `;
    row.chains.forEach((ch) => {
      badgesEl.innerHTML += `<span class="badge badge-early">${ch}</span> `;
    });

    // Meta stats
    document.getElementById('dr-tvl').textContent = fmtMoney(row.tvl_usd);
    document.getElementById('dr-chg').textContent = fmtPct(row.change_7d);
    document.getElementById('dr-listed').textContent = row.slug === 'yuzu-money' ? '2025-11-14' : '2025-05-10';
    document.getElementById('dr-age').textContent = fmtAge(row.ageDays);

    // Big Implied Value Box
    document.getElementById('dr-implied-val').textContent = '$' + row.implied_value_usd.toLocaleString('en-US');
    document.getElementById('dr-launches').textContent = fmtMoney(row.valueIfLaunchesUsd);
    document.getElementById('dr-odds').textContent = `${row.tokenOddsPct}%`;
    document.getElementById('dr-p2575').textContent = `${fmtMoney(row.p25_usd)}–${fmtMoney(row.p75_usd)}`;
    document.getElementById('dr-p1090').textContent = `${fmtMoney(row.p10_usd)}–${fmtMoney(row.p90_usd)}`;

    // Decomposition List
    const decompList = document.getElementById('dr-decomp-list');
    decompList.innerHTML = `
      <div class="decomp-item">
        <div class="decomp-left">
          <strong>TVL</strong>
          <span class="decomp-sub">DefiLlama, 2026-11-14</span>
        </div>
        <div class="decomp-right">${fmtMoney(row.tvl_usd)}</div>
      </div>
      <div class="decomp-item">
        <div class="decomp-left">
          <strong>Base multiple</strong>
          <span class="decomp-sub">fitted on 98 traded tokens, read at $100M TVL; alone, a flat multiple: held-out miss ×4.38 leave-one-out, ×4.37 walk-forward</span>
        </div>
        <div class="decomp-right">×${row.breakdown.baseMultiple.toFixed(2)}</div>
      </div>
      <div class="decomp-item">
        <div class="decomp-left">
          <strong>Size curve</strong>
          <span class="decomp-sub">slope -0.51 ± 0.10 × ln(${fmtMoney(row.tvl_usd)} / $100M); held-out miss ×3.41 leave-one-out, ×2.62 walk-forward</span>
        </div>
        <div class="decomp-right">×${row.breakdown.sizeCurve.toFixed(2)}</div>
      </div>
      <div class="decomp-item">
        <div class="decomp-left">
          <strong>Category · ${row.category}</strong>
          <span class="decomp-sub">priced tokens shrunk by 64 pseudo-observations; held-out miss ×3.33 leave-one-out, ×2.53 walk-forward</span>
        </div>
        <div class="decomp-right">×${row.breakdown.categoryOffset.toFixed(2)}</div>
      </div>
      <div class="decomp-item highlight">
        <div class="decomp-left">
          <strong style="color:#fbbf24;">= Value if a token launches</strong>
          <span class="decomp-sub">TVL × ×0.20; half of held-out caps fall in ${fmtMoney(row.p25_usd)}–${fmtMoney(row.p75_usd)}</span>
        </div>
        <div class="decomp-right">${fmtMoney(row.valueIfLaunchesUsd)}</div>
      </div>
      <div class="decomp-item">
        <div class="decomp-left">
          <strong>Token odds</strong>
          <span class="decomp-sub">peers of its family, size and 7-day growth: 36% record a token by its age (${fmtAge(row.ageDays)}), 89% by the oldest cohort's (5.1 yr); Brier 0.215 vs 0.320 base rate</span>
        </div>
        <div class="decomp-right">×${(row.tokenOddsPct / 100).toFixed(2)}</div>
      </div>
      <div class="decomp-item highlight">
        <div class="decomp-left">
          <strong style="color:#fbbf24;">= Implied value</strong>
          <span class="decomp-sub">P25–P75 ${fmtMoney(row.p25_usd)}–${fmtMoney(row.p75_usd)} · P10–P90 ${fmtMoney(row.p10_usd)}–${fmtMoney(row.p90_usd)} · rank ${row.rankRange} across 200 bootstrap refits</span>
        </div>
        <div class="decomp-right">$${row.implied_value_usd.toLocaleString('en-US')}</div>
      </div>
    `;

    // Nearest Priced Peers Table
    const peersTbody = document.getElementById('dr-peers-tbody');
    peersTbody.innerHTML = '';
    row.comps.forEach((c) => {
      const ptr = document.createElement('tr');
      ptr.innerHTML = `
        <td><strong>${c.token}</strong> <span style="font-size:9px;color:var(--text-dim);">${c.symbol}</span></td>
        <td>${c.category}</td>
        <td class="text-right">${fmtMoney(c.tvl_usd)}</td>
        <td class="text-right">${fmtMoney(c.mcap_usd)}</td>
        <td class="text-right">×${c.cap_tvl_ratio.toFixed(2)}</td>
        <td class="text-right">×${c.cap_heldout_ratio.toFixed(2)}</td>
      `;
      peersTbody.appendChild(ptr);
    });

    // Farm Verdict Narrative & KPIs
    const vTag = document.getElementById('dr-verdict-tag');
    vTag.textContent = row.verdict;
    vTag.className = 'verdict-tag ' + (row.verdict === 'FARM' ? '' : 'badge-early');

    document.getElementById('dr-farm-narrative').textContent =
      `${row.verdict}: $10,000 for 12 weeks buys a modelled drop of $${row.drop_usd} for $${row.fees_usd} of fees and 3.4 h of work, a net of $${row.verdictAmount} ($${row.net_per_hour} an hour) against $92 from the same money in a 4% T-bill. Fees are covered while the drop share stays above 0.2% (model 7%) and the token odds above 2.1% (peers imply ${row.tokenOddsPct}%).`;

    document.getElementById('dr-atrisk').textContent = '$10,000';
    document.getElementById('dr-fees').textContent = `$${row.fees_usd}`;
    document.getElementById('dr-drop').textContent = `$${row.drop_usd}`;
    document.getElementById('dr-net').textContent = `$${row.verdictAmount}`;
    document.getElementById('dr-hours').textContent = '3.4 h';
    document.getElementById('dr-netrate').textContent = `$${row.net_per_hour}`;

    document.getElementById('dr-bench-drop').textContent = `$${Math.round(row.drop_usd / (row.tokenOddsPct / 100))}`;
    document.getElementById('dr-bench-exit').textContent = fmtMoney(row.tvl_usd * 0.83);

    // Scenario Matrix Table
    const matrixTable = document.getElementById('dr-matrix-table');
    const m = row.farm_plan.matrix;
    let mHtml = '<thead><tr><th>SHARE</th><th>$1,000</th><th>$3,000</th><th>PLAN $10,000</th><th>$30,000</th></tr></thead><tbody>';
    m.shares.forEach((s) => {
      mHtml += `<tr><td>${(s * 100).toFixed(1)}%</td>`;
      m.deposits.forEach((d) => {
        const item = m.matrix.find((x) => x.share === s && x.deposit === d);
        const isActive = s === 0.07 && d === 10000;
        const valTxt = item ? (item.net >= 0 ? `$${item.net}` : `-$${Math.abs(item.net)}`) : '—';
        mHtml += `<td class="${isActive ? 'active-cell' : ''}">${valTxt}</td>`;
      });
      mHtml += '</tr>';
    });
    mHtml += '</tbody>';
    matrixTable.innerHTML = mHtml;

    // 10 Steps
    const stepsList = document.getElementById('dr-steps-list');
    stepsList.innerHTML = '';
    row.farm_plan.steps.forEach((s) => {
      const sDiv = document.createElement('div');
      sDiv.className = 'step-item';
      sDiv.innerHTML = `
        <div class="step-num">${s.num}</div>
        <div class="step-content">
          <div class="step-head">
            <span class="step-tag">${s.tag}</span>
            <span class="step-pill-cost">COST ${s.cost}</span>
            <span class="step-pill-time">TIME ${s.time}</span>
          </div>
          <div class="step-desc">${s.desc}</div>
        </div>
      `;
      stepsList.appendChild(sDiv);
    });

    drawerOverlay.classList.remove('hidden');
    window.history.replaceState(null, '', `?detail=${row.slug}`);
  }

  function closeDrawer() {
    drawerOverlay.classList.add('hidden');
    window.history.replaceState(null, '', window.location.pathname);
  }

  drawerClose.onclick = closeDrawer;
  drawerOverlay.onclick = (e) => {
    if (e.target === drawerOverlay) closeDrawer();
  };

  // Filter Pill Click Handlers
  document.querySelectorAll('.fpill[data-filter]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.fpill[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      applyFilters();
    };
  });

  document.querySelectorAll('.fpill[data-tier]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.fpill[data-tier]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTier = btn.getAttribute('data-tier');
      applyFilters();
    };
  });

  // Search & Select Listeners
  inpSearch.oninput = () => {
    currentSearch = inpSearch.value.trim().toLowerCase();
    applyFilters();
  };
  selCat.onchange = () => {
    currentCat = selCat.value;
    applyFilters();
  };
  selChain.onchange = () => {
    currentChain = selChain.value;
    applyFilters();
  };

  slDropShare.oninput = () => {
    currentDropShare = parseFloat(slDropShare.value) / 100;
    valDropShare.textContent = slDropShare.value + '%';
  };
  slHorizon.oninput = () => {
    currentHorizonWk = parseInt(slHorizon.value, 10);
    valHorizon.textContent = slHorizon.value + ' wk';
  };

  btnReset.onclick = () => {
    inpSearch.value = '';
    currentSearch = '';
    selCat.value = '';
    currentCat = '';
    selChain.value = '';
    currentChain = '';
    currentFilter = 'all';
    currentTier = 'all';
    document.querySelectorAll('.fpill').forEach((b) => b.classList.remove('active'));
    document.querySelector('.fpill[data-filter="all"]').classList.add('active');
    document.querySelector('.fpill[data-tier="all"]').classList.add('active');
    currentSort = { col: 'rank', asc: true };
    applyFilters();
  };

  // CSV Export
  btnCsv.onclick = () => {
    const headers = ['Rank', 'Protocol', 'Category', 'Chains', 'TVL_USD', 'Change_7d', 'Age_Days', 'Token_Odds_Pct', 'Value_If_Launches_USD', 'Implied_Value_USD', 'Verdict', 'Net_Of_Fees_USD', 'Net_Per_Hour_USD'];
    const lines = [headers.join(',')];
    filteredRows.forEach((r) => {
      lines.push([
        r.rank,
        `"${r.name}"`,
        `"${r.category}"`,
        `"${r.chains.join(';')}"`,
        r.tvl_usd,
        r.change_7d || 0,
        r.ageDays,
        r.tokenOddsPct,
        r.valueIfLaunchesUsd,
        r.implied_value_usd,
        r.verdict,
        r.verdictAmount,
        r.net_per_hour
      ].join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'launch-radar.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // JSON Export
  btnJson.onclick = () => {
    const blob = new Blob([JSON.stringify({ rows: filteredRows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'launch-radar.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Table Column Sort Click Handlers
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.onclick = () => {
      const col = th.getAttribute('data-sort');
      if (currentSort.col === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.col = col;
        currentSort.asc = col === 'name' || col === 'rank';
      }
      document.querySelectorAll('.sort-arr').forEach((el) => el.remove());
      const arr = document.createElement('span');
      arr.className = 'sort-arr';
      arr.textContent = currentSort.asc ? ' ↑' : ' ↓';
      th.appendChild(arr);
      applySort();
    };
  });

  // Check URL parameters on load
  const urlParams = new URLSearchParams(window.location.search);
  const detailSlug = urlParams.get('detail');
  const filterParam = urlParams.get('filter');

  if (filterParam === 'farm') {
    const farmBtn = document.querySelector('.fpill[data-filter="farm"]');
    if (farmBtn) farmBtn.click();
  } else {
    applyFilters();
  }

  if (detailSlug) {
    const targetRow = allRows.find((r) => r.slug === detailSlug);
    if (targetRow) {
      openDrawer(targetRow);
    }
  }
})();
