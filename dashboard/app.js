// Token Radar: Interactive crypto airdrop aggregator & valuation terminal.
// Pure client logic: 100% network-free, reads window.RADAR written beside dashboard.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = {
    q: '',
    category: 'all',
    conviction: 'all',
    view: 'pre-token',
    sort: 'rank',
    dir: 1, // 1 for asc, -1 for desc
    selected: null,
  };

  // Currency & Percentage formatters
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '0.00%';
    var sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // DOM references
  var tableBody = document.getElementById('table-body');
  var noResults = document.getElementById('no-results');
  var searchInput = document.getElementById('search-input');
  var clearSearchBtn = document.getElementById('clear-search');
  var resultsCount = document.getElementById('results-count');
  var drawerBackdrop = document.getElementById('drawer-backdrop');
  var closeDrawerBtn = document.getElementById('close-drawer');

  // KPI elements
  var kpiFdv = document.getElementById('kpi-fdv');
  var kpiAirdrop = document.getElementById('kpi-airdrop');
  var kpiCount = document.getElementById('kpi-count');
  var kpiHighConviction = document.getElementById('kpi-high-conviction');
  var asofTag = document.getElementById('asof-tag');
  var modelTag = document.getElementById('model-tag');

  // Populate static KPIs
  if (asofTag) asofTag.textContent = 'AS OF: ' + DATA.as_of;
  if (modelTag) modelTag.textContent = 'MODEL: ' + DATA.model_version.toUpperCase();
  if (kpiFdv) kpiFdv.textContent = fmtUsd(DATA.total_implied_usd);
  if (kpiAirdrop) kpiAirdrop.textContent = fmtUsd(DATA.total_airdrop_usd);
  if (kpiCount) kpiCount.textContent = DATA.board_size;

  var highCount = 0;
  for (var h = 0; h < DATA.rows.length; h++) {
    if (DATA.rows[h].conviction === 'STRONG FARM') highCount++;
  }
  if (kpiHighConviction) kpiHighConviction.textContent = highCount;

  // Filter & Search predicate
  function filterRows() {
    var query = state.q.toLowerCase().trim();
    var filtered = [];
    var sourceRows = state.view === 'live' ? DATA.live : DATA.rows;

    for (var i = 0; i < sourceRows.length; i++) {
      var r = sourceRows[i];

      // Quick views filter
      if (state.view === 'watchlist' && r.rank > DATA.watchlist_size) continue;
      if (state.view === 'early' && r.rank <= DATA.watchlist_size) continue;

      // Category filter
      if (state.category !== 'all') {
        var cat = (r.category || '').toLowerCase();
        if (cat.indexOf(state.category.toLowerCase()) === -1) continue;
      }

      // Conviction filter
      if (state.conviction !== 'all' && state.view !== 'live') {
        if (r.conviction !== state.conviction) continue;
      }

      // Search query
      if (query) {
        var nameMatch = (r.name || '').toLowerCase().indexOf(query) !== -1;
        var slugMatch = (r.slug || '').toLowerCase().indexOf(query) !== -1;
        var catMatch = (r.category || '').toLowerCase().indexOf(query) !== -1;
        var chainMatch = false;
        if (r.chains) {
          for (var c = 0; c < r.chains.length; c++) {
            if (r.chains[c].toLowerCase().indexOf(query) !== -1) {
              chainMatch = true;
              break;
            }
          }
        }
        if (!nameMatch && !slugMatch && !catMatch && !chainMatch) continue;
      }

      filtered.push(r);
    }

    // Sort
    filtered.sort(function (a, b) {
      var keyA, keyB;
      if (state.sort === 'rank') { keyA = a.rank || 0; keyB = b.rank || 0; }
      else if (state.sort === 'name') { keyA = (a.name || '').toLowerCase(); keyB = (b.name || '').toLowerCase(); }
      else if (state.sort === 'category') { keyA = (a.category || '').toLowerCase(); keyB = (b.category || '').toLowerCase(); }
      else if (state.sort === 'tvl') { keyA = a.tvl_usd || 0; keyB = b.tvl_usd || 0; }
      else if (state.sort === 'change') { keyA = a.change_7d || 0; keyB = b.change_7d || 0; }
      else if (state.sort === 'implied') { keyA = a.implied_value_usd || 0; keyB = b.implied_value_usd || 0; }
      else if (state.sort === 'airdrop') { keyA = a.airdrop_est_usd || 0; keyB = b.airdrop_est_usd || 0; }
      else if (state.sort === 'odds') { keyA = a.launch_odds || 0; keyB = b.launch_odds || 0; }
      else { keyA = a.rank || 0; keyB = b.rank || 0; }

      if (keyA < keyB) return -1 * state.dir;
      if (keyA > keyB) return 1 * state.dir;
      return 0;
    });

    return filtered;
  }

  // Render Table Rows
  function renderTable() {
    var rows = filterRows();
    tableBody.innerHTML = '';

    if (rows.length === 0) {
      noResults.style.display = 'block';
      resultsCount.textContent = 'Showing 0 matching protocols';
      return;
    }

    noResults.style.display = 'none';
    resultsCount.textContent = 'Showing ' + rows.length + ' of ' + (state.view === 'live' ? DATA.live.length : DATA.rows.length) + ' protocols';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');
      tr.setAttribute('data-slug', r.slug);

      // Rank
      var tdRank = document.createElement('td');
      tdRank.className = 'cell-rank';
      var rNum = r.rank || (i + 1);
      var badgeCls = rNum === 1 ? 'rank-1' : rNum === 2 ? 'rank-2' : rNum === 3 ? 'rank-3' : '';
      tdRank.innerHTML = badgeCls ? '<span class="rank-badge ' + badgeCls + '">' + rNum + '</span>' : '#' + rNum;
      tr.appendChild(tdRank);

      // Protocol
      var tdProto = document.createElement('td');
      tdProto.className = 'cell-protocol';
      tdProto.innerHTML = '<span class="proto-name">' + r.name + '</span><span class="proto-slug">' + r.slug + '</span>';
      tr.appendChild(tdProto);

      // Sector
      var tdCat = document.createElement('td');
      tdCat.innerHTML = '<span class="category-tag">' + (r.category || 'DeFi') + '</span>';
      tr.appendChild(tdCat);

      // Chains
      var tdChains = document.createElement('td');
      var chainHtml = '<div class="chain-chips">';
      var maxChains = Math.min(3, (r.chains || []).length);
      for (var c = 0; c < maxChains; c++) {
        chainHtml += '<span class="chain-chip">' + r.chains[c] + '</span>';
      }
      if ((r.chains || []).length > 3) {
        chainHtml += '<span class="chain-chip">+' + (r.chains.length - 3) + '</span>';
      }
      chainHtml += '</div>';
      tdChains.innerHTML = chainHtml;
      tr.appendChild(tdChains);

      // TVL
      var tdTvl = document.createElement('td');
      tdTvl.className = 'cell-numeric';
      tdTvl.textContent = fmtUsd(r.tvl_usd);
      tr.appendChild(tdTvl);

      // 7D Flow
      var tdFlow = document.createElement('td');
      tdFlow.className = 'cell-numeric ' + ((r.change_7d || 0) >= 0 ? 'flow-up' : 'flow-down');
      tdFlow.textContent = fmtPct(r.change_7d);
      tr.appendChild(tdFlow);

      // Implied FDV
      var tdFdv = document.createElement('td');
      tdFdv.className = 'cell-numeric val-cyan';
      tdFdv.textContent = state.view === 'live' ? fmtUsd(r.mcap_usd) : fmtUsd(r.implied_value_usd);
      tr.appendChild(tdFdv);

      // Est. Airdrop
      var tdAirdrop = document.createElement('td');
      tdAirdrop.className = 'cell-numeric val-emerald';
      tdAirdrop.textContent = state.view === 'live' ? 'Circulating' : fmtUsd(r.airdrop_est_usd);
      tr.appendChild(tdAirdrop);

      // Launch Odds
      var tdOdds = document.createElement('td');
      if (state.view === 'live') {
        tdOdds.innerHTML = '<span class="badge">TRADED</span>';
      } else {
        var odds = Math.round((r.launch_odds || 0.7) * 100);
        var oddsColor = odds >= 85 ? 'high' : odds >= 65 ? 'med' : '';
        tdOdds.innerHTML = '<div class="odds-bar-wrap"><div class="odds-track"><div class="odds-fill ' + oddsColor + '" style="width:' + odds + '%"></div></div><span style="font-size:11px;font-family:var(--font-mono)">' + odds + '%</span></div>';
      }
      tr.appendChild(tdOdds);

      // Action / Conviction
      var tdAction = document.createElement('td');
      if (state.view === 'live') {
        tdAction.innerHTML = '<button class="action-inspect-btn">View Comps</button>';
      } else {
        var conv = r.conviction || 'SELECTIVE';
        var convClass = conv === 'STRONG FARM' ? 'badge-strong' : conv === 'ACCUMULATE' ? 'badge-accumulate' : conv === 'MONITOR' ? 'badge-monitor' : 'badge-selective';
        tdAction.innerHTML = '<span class="conviction-badge ' + convClass + '">' + conv + '</span>';
      }
      tr.appendChild(tdAction);

      // Click row to open detail drawer
      (function (rowItem) {
        tr.addEventListener('click', function () {
          openDrawer(rowItem);
        });
      })(r);

      tableBody.appendChild(tr);
    }
  }

  // Open Protocol Detail Drawer
  function openDrawer(row) {
    state.selected = row;

    document.getElementById('drawer-rank').textContent = '#' + (row.rank || 1);
    document.getElementById('drawer-name').textContent = row.name;
    document.getElementById('drawer-category').textContent = row.category || 'DeFi';

    var convElem = document.getElementById('drawer-conviction');
    var conv = row.conviction || 'SELECTIVE';
    convElem.textContent = conv;
    convElem.className = 'badge conviction ' + (conv === 'STRONG FARM' ? 'badge-strong' : conv === 'ACCUMULATE' ? 'badge-accumulate' : 'badge-selective');

    document.getElementById('drawer-age').textContent = 'Listed: ' + fmtAge(row.age_days);

    // Valuation terms
    document.getElementById('drawer-tvl').textContent = fmtUsd(row.tvl_usd);
    var mult = DATA.sector_multiples[row.category || ''] || DATA.model.default_multiple;
    document.getElementById('drawer-multiple').textContent = mult.toFixed(2) + 'x';
    document.getElementById('drawer-growth').textContent = (row.growth_multiplier || 1.0).toFixed(2) + 'x';
    document.getElementById('drawer-odds').textContent = Math.round((row.launch_odds || 0.7) * 100) + '%';
    document.getElementById('drawer-fdv').textContent = fmtUsd(row.implied_value_usd);
    document.getElementById('drawer-airdrop').textContent = fmtUsd(row.airdrop_est_usd);

    // Metadata
    document.getElementById('drawer-chains').textContent = (row.chains || []).join(', ') || 'Ethereum';
    document.getElementById('drawer-7d-flow').textContent = fmtPct(row.change_7d);
    var isWl = (row.rank || 0) <= DATA.watchlist_size;
    document.getElementById('drawer-wl-status').textContent = isWl ? 'SEALED WATCHLIST (TIER 1)' : 'EARLY DISCOVERY (TIER 2)';

    // Concrete Farm Plan Steps
    var stepsList = document.getElementById('drawer-steps');
    stepsList.innerHTML = '';

    var capital = row.tvl_usd >= 1e9 ? 350 : row.tvl_usd >= 250e6 ? 200 : row.tvl_usd >= 50e6 ? 100 : 50;
    var gas = row.tvl_usd >= 1e9 ? 12 : 6;
    var chain = (row.chains && row.chains.length > 0) ? row.chains[0] : 'primary chain';
    var cat = (row.category || '').toLowerCase();

    var stepsData = [
      {
        num: '01',
        title: 'Sybil Defense & Wallet Isolation',
        text: 'Fund fresh burner wallet directly from centralized exchange withdrawal; never transfer funds between your own farming addresses to prevent Sybil clustering.',
        cost: 'under $' + Math.max(2, Math.round(gas * 0.4)) + ' transfer gas',
        time: '5 mins',
      },
      {
        num: '02',
        title: 'Core Liquidity / Collateral Deployment',
        text: cat.indexOf('dex') !== -1
          ? 'Deposit $' + capital + ' in concentrated liquidity pool on ' + chain + ' across active tick range.'
          : cat.indexOf('perp') !== -1
          ? 'Deposit $' + capital + ' margin into ' + row.name + ' on ' + chain + ' and open a 1x hedged position.'
          : cat.indexOf('restak') !== -1
          ? 'Deposit $' + capital + ' LST into ' + row.name + ' on ' + chain + ' to accrue native restaking points.'
          : 'Supply $' + capital + ' of USDC or collateral into ' + row.name + ' on ' + chain + ' to establish baseline balance.',
        cost: '$' + capital + ' capital + $' + gas + ' gas',
        time: '10 mins',
      },
      {
        num: '03',
        title: 'Active Volume & Protocol Interaction',
        text: 'Execute bi-weekly qualifying transactions (micro-swap, collateral rebalance, or governance vote) to register continuous on-chain activity.',
        cost: 'under $' + gas + ' gas fee',
        time: '5 mins / bi-weekly',
      },
      {
        num: '04',
        title: 'Epoch Retention & Snapshot Holding',
        text: 'Maintain the $' + capital + ' position for at least 45 to 60 days to satisfy time-weighted snapshot criteria across multiple calendar months.',
        cost: 'Principal actively earning yield',
        time: '45-60 days',
      },
      {
        num: '05',
        title: 'Community Verification & Points Check',
        text: 'Connect wallet to official points dashboard or Discord/Farcaster community role to verify telemetry tracking and multiplier boosts.',
        cost: 'Zero fee',
        time: '5 mins',
      },
      {
        num: '06',
        title: 'TGE Claim & Orderly Unwind',
        text: 'Upon TGE contract deployment, verify claim eligibility strictly through official contracts and harvest airdrop tokens with minimal slippage.',
        cost: 'Zero claim fee; verify contract hash',
        time: '5 mins',
      },
    ];

    for (var s = 0; s < stepsData.length; s++) {
      var st = stepsData[s];
      var li = document.createElement('li');
      li.className = 'farm-step-item';
      li.innerHTML =
        '<div class="step-num">' + st.num + '</div>' +
        '<div class="step-content">' +
          '<div class="step-text"><strong>' + st.title + ':</strong> ' + st.text + '</div>' +
          '<div class="step-meta">' +
            '<span><strong>Cost:</strong> ' + st.cost + '</span>' +
            '<span><strong>Time:</strong> ' + st.time + '</span>' +
          '</div>' +
        '</div>';
      stepsList.appendChild(li);
    }

    drawerBackdrop.style.display = 'flex';
  }

  function closeDrawer() {
    drawerBackdrop.style.display = 'none';
    state.selected = null;
  }

  // Event Listeners
  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', function (e) {
      if (e.target === drawerBackdrop) closeDrawer();
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawerBackdrop.style.display !== 'none') {
      closeDrawer();
    }
  });

  // Search input handler
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.q = searchInput.value;
      if (clearSearchBtn) clearSearchBtn.style.display = state.q ? 'block' : 'none';
      renderTable();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', function () {
      state.q = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      renderTable();
    });
  }

  // Category filter pills
  var catPills = document.querySelectorAll('#category-filters .pill');
  for (var cp = 0; cp < catPills.length; cp++) {
    catPills[cp].addEventListener('click', function () {
      for (var k = 0; k < catPills.length; k++) catPills[k].classList.remove('active');
      this.classList.add('active');
      state.category = this.getAttribute('data-cat') || 'all';
      renderTable();
    });
  }

  // Conviction filter pills
  var convPills = document.querySelectorAll('#conviction-filters .pill');
  for (var cv = 0; cv < convPills.length; cv++) {
    convPills[cv].addEventListener('click', function () {
      for (var k = 0; k < convPills.length; k++) convPills[k].classList.remove('active');
      this.classList.add('active');
      state.conviction = this.getAttribute('data-conv') || 'all';
      renderTable();
    });
  }

  // Quick view tabs
  var tabs = [
    { id: 'tab-pre-token', view: 'pre-token' },
    { id: 'tab-watchlist', view: 'watchlist' },
    { id: 'tab-early', view: 'early' },
    { id: 'tab-live', view: 'live' },
  ];
  for (var t = 0; t < tabs.length; t++) {
    (function (tabItem) {
      var elem = document.getElementById(tabItem.id);
      if (elem) {
        elem.addEventListener('click', function () {
          for (var j = 0; j < tabs.length; j++) {
            var el = document.getElementById(tabs[j].id);
            if (el) el.classList.remove('active');
          }
          this.classList.add('active');
          state.view = tabItem.view;
          state.sort = tabItem.view === 'live' ? 'tvl' : 'rank';
          state.dir = tabItem.view === 'live' ? -1 : 1;
          renderTable();
        });
      }
    })(tabs[t]);
  }

  // Table header sorting
  var headers = document.querySelectorAll('.radar-table thead th.sortable');
  for (var th = 0; th < headers.length; th++) {
    headers[th].addEventListener('click', function () {
      var sortField = this.getAttribute('data-sort');
      if (state.sort === sortField) {
        state.dir = state.dir * -1; // toggle direction
      } else {
        state.sort = sortField;
        state.dir = (sortField === 'rank' || sortField === 'name') ? 1 : -1;
      }

      for (var k = 0; k < headers.length; k++) {
        var arrow = headers[k].querySelector('.arrow');
        if (arrow) arrow.textContent = '';
      }
      var curArrow = this.querySelector('.arrow');
      if (curArrow) curArrow.textContent = state.dir === 1 ? '↑' : '↓';

      renderTable();
    });
  }

  // Initial table render
  renderTable();
})();
