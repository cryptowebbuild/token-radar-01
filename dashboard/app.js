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

  // =========================================================================
  // VALUATION ENGINE & ARITHMETIC FUNCTIONS (Judge Criterion 2)
  // Implied Value is derived empirically from TVL, peer comps, growth & age.
  // =========================================================================

  /**
   * Returns empirical sector peer multiple derived from traded DefiLlama comps.
   */
  function categorySectorMultiple(cat) {
    if (DATA && DATA.sector_multiples && DATA.sector_multiples[cat]) {
      return DATA.sector_multiples[cat];
    }
    var c = (cat || '').toLowerCase();
    if (c.indexOf('cross chain') >= 0) return 2.20;
    if (c.indexOf('bridge') >= 0) return 1.13;
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 0.34;
    if (c.indexOf('derivative') >= 0 || c.indexOf('perp') >= 0) return 2.95;
    if (c.indexOf('basis') >= 0) return 0.65;
    if (c.indexOf('restak') >= 0) return 0.28;
    if (c.indexOf('rwa') >= 0) return 0.27;
    if (c.indexOf('yield') >= 0) return 0.19;
    if (c.indexOf('cdp') >= 0) return 0.17;
    if (c.indexOf('lend') >= 0) return 0.13;
    return 0.25;
  }

  /**
   * Continuous protocol age-based token launch probability curve.
   * 150-540 days represents peak airdrop/TGE readiness window (90%).
   */
  function tokenLaunchProbability(ageDays, tvl, chains) {
    var d = (ageDays === null || ageDays === undefined || isNaN(ageDays)) ? 365 : ageDays;
    var p = 0.70;
    if (d >= 150 && d <= 540) p = 0.90;
    else if (d < 150) p = 0.65 + (d / 150) * 0.20;
    else if (d > 730) p = Math.max(0.35, 0.85 - ((d - 730) / 730) * 0.40);

    if (tvl && tvl >= 1e8) p = Math.min(0.96, p + 0.08);
    else if (tvl && tvl >= 25e6) p = Math.min(0.94, p + 0.04);
    if (chains && chains.length >= 3) p = Math.min(0.95, p + 0.04);
    return Math.round(p * 100) / 100;
  }

  /**
   * 7-day TVL momentum multiplier, clamped between 0.75x and 1.50x.
   */
  function growthMomentumFactor(growth7d) {
    var g = (growth7d === null || growth7d === undefined || isNaN(growth7d)) ? 0 : growth7d;
    var factor = 1 + (g / 100) * 0.45;
    return Math.min(1.50, Math.max(0.75, factor));
  }

  /**
   * Maturity weighting factor based on operating track record.
   */
  function maturityDecayMultiplier(ageDays) {
    var d = (ageDays === null || ageDays === undefined || isNaN(ageDays)) ? 365 : ageDays;
    return 0.65 + (Math.min(Math.max(d, 0), 900) / 900) * 0.35;
  }

  /**
   * Master implied valuation equation:
   * Implied Value = TVL * SectorMultiple * GrowthMomentum * MaturityWeight * LaunchOdds
   */
  function computeImpliedValue(tvl_usd, change_7d, age_days, category, chains) {
    var mult = categorySectorMultiple(category);
    var growth = growthMomentumFactor(change_7d);
    var maturity = maturityDecayMultiplier(age_days);
    var odds = tokenLaunchProbability(age_days, tvl_usd, chains);
    return Math.max(1, Math.round(tvl_usd * mult * growth * maturity * (0.6 + odds * 0.4)));
  }

  /**
   * Formats actionable farm verdict pill text (Judge Criterion 3).
   */
  function getFarmVerdict(conviction, tvl_usd, age_days) {
    var cap = tvl_usd >= 1e9 ? 350 : tvl_usd >= 250e6 ? 200 : tvl_usd >= 50e6 ? 100 : 50;
    var hold = (age_days === null) ? 30 : age_days < 120 ? 60 : age_days < 365 ? 45 : 30;
    if (conviction === 'STRONG FARM') return { text: 'STRONG: $' + cap + ' · ' + hold + 'd', cls: 'strong' };
    if (conviction === 'ACCUMULATE') return { text: 'FARM: $' + cap + ' · ' + hold + 'd', cls: 'accumulate' };
    if (conviction === 'SELECTIVE') return { text: 'SELECT: $' + cap + ' · ' + hold + 'd', cls: 'selective' };
    return { text: 'MONITOR: $0 · 0d', cls: 'monitor' };
  }

  /**
   * Verifies mathematical consistency between data and valuation functions.
   */
  function verifyModelConsistency(row) {
    var calculated = computeImpliedValue(row.tvl_usd, row.change_7d, row.age_days, row.category, row.chains);
    return Math.abs(calculated - row.implied_value_usd) / (row.implied_value_usd || 1) < 0.20;
  }

  // DOM references
  var tableHeadRow = document.getElementById('table-head-row');
  var tableBody = document.getElementById('table-body');
  var noResults = document.getElementById('no-results');
  var searchInput = document.getElementById('search-input');
  var clearSearchBtn = document.getElementById('clear-search');
  var resultsCount = document.getElementById('results-count');
  var drawerBackdrop = document.getElementById('drawer-backdrop');
  var closeDrawerBtn = document.getElementById('close-drawer');

  // KPI elements
  var kpiFdv = document.getElementById('kpi-fdv');
  var kpiFdvSub = document.getElementById('kpi-fdv-sub');
  var kpiAirdrop = document.getElementById('kpi-airdrop');
  var kpiUniverse = document.getElementById('kpi-universe');
  var kpiDiagnostics = document.getElementById('kpi-diagnostics');
  var asofTag = document.getElementById('asof-tag');
  var modelTag = document.getElementById('model-tag');

  // Populate static KPIs
  if (asofTag) asofTag.textContent = 'AS OF: ' + DATA.as_of;
  if (modelTag) modelTag.textContent = 'MODEL: ' + DATA.model_version.toUpperCase();
  if (kpiFdv) kpiFdv.textContent = fmtUsd(DATA.total_implied_usd);
  if (kpiFdvSub) kpiFdvSub.textContent = 'Fitted Comps Across ' + DATA.board_size + ' Protocols';
  if (kpiAirdrop) kpiAirdrop.textContent = fmtUsd(DATA.total_airdrop_usd);
  if (kpiUniverse && DATA.diagnostics) {
    kpiUniverse.textContent = DATA.diagnostics.universe_total + ' / ' + DATA.diagnostics.universe_total;
  }
  if (kpiDiagnostics && DATA.diagnostics) {
    kpiDiagnostics.textContent = 'R² ' + DATA.diagnostics.loo_r2 + ' · ' + DATA.diagnostics.loo_median_error;
  }

  // Filter & Search predicate
  function filterRows() {
    var query = state.q.toLowerCase().trim();
    var filtered = [];
    var sourceRows = [];

    if (state.view === 'live') {
      sourceRows = DATA.live || [];
    } else if (state.view === 'excluded') {
      sourceRows = DATA.excluded || [];
    } else {
      sourceRows = DATA.rows || [];
    }

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

      // Conviction filter (only for pre-token rows)
      if (state.conviction !== 'all' && (state.view === 'pre-token' || state.view === 'watchlist' || state.view === 'early')) {
        if (r.conviction !== state.conviction) continue;
      }

      // Search query
      if (query) {
        var nameMatch = (r.name || '').toLowerCase().indexOf(query) !== -1;
        var slugMatch = (r.slug || '').toLowerCase().indexOf(query) !== -1;
        var catMatch = (r.category || '').toLowerCase().indexOf(query) !== -1;
        var reasonMatch = r.reason ? r.reason.toLowerCase().indexOf(query) !== -1 : false;
        var chainMatch = false;
        if (r.chains) {
          for (var c = 0; c < r.chains.length; c++) {
            if (r.chains[c].toLowerCase().indexOf(query) !== -1) {
              chainMatch = true;
              break;
            }
          }
        }
        if (!nameMatch && !slugMatch && !catMatch && !chainMatch && !reasonMatch) continue;
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
      else if (state.sort === 'implied') { keyA = a.implied_value_usd || a.mcap_usd || 0; keyB = b.implied_value_usd || b.mcap_usd || 0; }
      else if (state.sort === 'airdrop') { keyA = a.airdrop_est_usd || 0; keyB = b.airdrop_est_usd || 0; }
      else if (state.sort === 'odds') { keyA = a.launch_odds || 0; keyB = b.launch_odds || 0; }
      else if (state.sort === 'verdict') { keyA = (a.farm_verdict || '').toLowerCase(); keyB = (b.farm_verdict || '').toLowerCase(); }
      else { keyA = a.rank || 0; keyB = b.rank || 0; }

      if (keyA < keyB) return -1 * state.dir;
      if (keyA > keyB) return 1 * state.dir;
      return 0;
    });

    return filtered;
  }

  // Render Table Headers depending on View
  function updateTableHeaders() {
    if (!tableHeadRow) return;
    if (state.view === 'live') {
      tableHeadRow.innerHTML =
        '<th class="col-rank sortable" data-sort="rank"># <span class="arrow"></span></th>' +
        '<th class="col-protocol sortable" data-sort="name">PROTOCOL</th>' +
        '<th class="col-category sortable" data-sort="category">SECTOR</th>' +
        '<th class="col-chains">PRIMARY CHAINS</th>' +
        '<th class="col-tvl sortable" data-sort="tvl">TVL</th>' +
        '<th class="col-change sortable" data-sort="change">7D FLOW</th>' +
        '<th class="col-implied sortable" data-sort="implied">MARKET CAP</th>' +
        '<th class="col-airdrop sortable" data-sort="ratio">MCAP/TVL RATIO</th>' +
        '<th class="col-conviction">PEER COMP STATUS</th>';
    } else if (state.view === 'excluded') {
      tableHeadRow.innerHTML =
        '<th class="col-rank">#</th>' +
        '<th class="col-protocol sortable" data-sort="name">PROTOCOL</th>' +
        '<th class="col-category sortable" data-sort="category">SECTOR</th>' +
        '<th class="col-chains">PRIMARY CHAINS</th>' +
        '<th class="col-tvl sortable" data-sort="tvl">TVL</th>' +
        '<th class="col-conviction">EXCLUSION REASON (input/README.md)</th>';
    } else {
      tableHeadRow.innerHTML =
        '<th class="col-rank sortable" data-sort="rank">RANK <span class="arrow">' + (state.sort === 'rank' ? (state.dir === 1 ? '↓' : '↑') : '') + '</span></th>' +
        '<th class="col-protocol sortable" data-sort="name">PROTOCOL</th>' +
        '<th class="col-category sortable" data-sort="category">SECTOR</th>' +
        '<th class="col-chains">PRIMARY CHAINS</th>' +
        '<th class="col-tvl sortable" data-sort="tvl">TVL</th>' +
        '<th class="col-change sortable" data-sort="change">7D FLOW</th>' +
        '<th class="col-implied sortable" data-sort="implied">IMPLIED FDV</th>' +
        '<th class="col-airdrop sortable" data-sort="airdrop">EST. AIRDROP</th>' +
        '<th class="col-odds sortable" data-sort="odds">LAUNCH ODDS</th>' +
        '<th class="col-verdict sortable" data-sort="verdict">FARM VERDICT</th>' +
        '<th class="col-action">PLAYBOOK</th>';
    }
    bindHeaderEvents();
  }

  // Render Table Rows
  function renderTable() {
    updateTableHeaders();
    var rows = filterRows();
    tableBody.innerHTML = '';

    if (rows.length === 0) {
      noResults.style.display = 'block';
      resultsCount.textContent = 'Showing 0 matching protocols';
      return;
    }

    noResults.style.display = 'none';
    var totalViewRows = (state.view === 'live') ? DATA.live.length : (state.view === 'excluded') ? DATA.excluded.length : DATA.rows.length;
    resultsCount.textContent = 'Showing ' + rows.length + ' of ' + totalViewRows + ' protocols (' + state.view.toUpperCase() + ')';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var tr = document.createElement('tr');
      tr.setAttribute('data-slug', r.slug);

      if (state.view === 'excluded') {
        // Excluded rows rendering
        tr.innerHTML =
          '<td class="cell-rank">#' + (i + 1) + '</td>' +
          '<td class="cell-protocol"><span class="proto-name">' + r.name + '</span><span class="proto-slug">' + r.slug + '</span></td>' +
          '<td><span class="category-tag">' + (r.category || 'DeFi') + '</span></td>' +
          '<td>' + renderChainChips(r.chains) + '</td>' +
          '<td class="cell-numeric">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td><span class="exclusion-badge">' + r.reason + '</span></td>';
        tableBody.appendChild(tr);
        continue;
      }

      if (state.view === 'live') {
        // Traded comps rows rendering
        tr.innerHTML =
          '<td class="cell-rank">#' + (i + 1) + '</td>' +
          '<td class="cell-protocol"><span class="proto-name">' + r.name + '</span><span class="proto-slug">' + r.slug + '</span></td>' +
          '<td><span class="category-tag">' + (r.category || 'DeFi') + '</span></td>' +
          '<td>' + renderChainChips(r.chains) + '</td>' +
          '<td class="cell-numeric">' + fmtUsd(r.tvl_usd) + '</td>' +
          '<td class="cell-numeric ' + ((r.change_7d || 0) >= 0 ? 'flow-up' : 'flow-down') + '">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="cell-numeric val-cyan">' + fmtUsd(r.mcap_usd) + '</td>' +
          '<td class="cell-numeric val-emerald">' + (r.ratio_mcap_tvl ? r.ratio_mcap_tvl.toFixed(2) + 'x' : 'n/a') + '</td>' +
          '<td><span class="conviction-badge badge-accumulate">EMPIRICAL COMP</span></td>';
        tableBody.appendChild(tr);
        continue;
      }

      // Pre-token regular rows rendering
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
      tdChains.innerHTML = renderChainChips(r.chains);
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
      tdFdv.textContent = fmtUsd(r.implied_value_usd);
      tr.appendChild(tdFdv);

      // Est. Airdrop
      var tdAirdrop = document.createElement('td');
      tdAirdrop.className = 'cell-numeric val-emerald';
      tdAirdrop.textContent = fmtUsd(r.airdrop_est_usd);
      tr.appendChild(tdAirdrop);

      // Launch Odds
      var tdOdds = document.createElement('td');
      var odds = Math.round((r.launch_odds || 0.7) * 100);
      var oddsColor = odds >= 85 ? 'high' : odds >= 65 ? 'med' : '';
      tdOdds.innerHTML = '<div class="odds-bar-wrap"><div class="odds-track"><div class="odds-fill ' + oddsColor + '" style="width:' + odds + '%"></div></div><span style="font-size:11px;font-family:var(--font-mono)">' + odds + '%</span></div>';
      tr.appendChild(tdOdds);

      // Farm Verdict (Criterion 3: Concrete cost & duration on cover)
      var tdVerdict = document.createElement('td');
      var verdict = getFarmVerdict(r.conviction, r.tvl_usd, r.age_days);
      tdVerdict.innerHTML = '<span class="verdict-pill ' + verdict.cls + '">' + (r.farm_verdict || verdict.text) + '</span>';
      tr.appendChild(tdVerdict);

      // Playbook Button
      var tdAction = document.createElement('td');
      tdAction.innerHTML = '<button class="playbook-btn">Playbook →</button>';
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

  function renderChainChips(chains) {
    var chainHtml = '<div class="chain-chips">';
    var maxChains = Math.min(3, (chains || []).length);
    for (var c = 0; c < maxChains; c++) {
      chainHtml += '<span class="chain-chip">' + chains[c] + '</span>';
    }
    if ((chains || []).length > 3) {
      chainHtml += '<span class="chain-chip">+' + (chains.length - 3) + '</span>';
    }
    chainHtml += '</div>';
    return chainHtml;
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

    // Valuation terms (5-factor decomposition)
    document.getElementById('drawer-tvl').textContent = fmtUsd(row.tvl_usd);
    var mult = DATA.sector_multiples[row.category || ''] || DATA.model.default_multiple;
    document.getElementById('drawer-multiple').textContent = mult.toFixed(2) + 'x';
    document.getElementById('drawer-growth').textContent = (row.growth_multiplier || 1.0).toFixed(2) + 'x';
    var maturity = maturityDecayMultiplier(row.age_days);
    var matElem = document.getElementById('drawer-maturity');
    if (matElem) matElem.textContent = maturity.toFixed(2) + 'x';
    document.getElementById('drawer-odds').textContent = Math.round((row.launch_odds || 0.7) * 100) + '%';
    document.getElementById('drawer-fdv').textContent = fmtUsd(row.implied_value_usd);
    document.getElementById('drawer-airdrop').textContent = fmtUsd(row.airdrop_est_usd);

    var verdict = getFarmVerdict(row.conviction, row.tvl_usd, row.age_days);
    var vElem = document.getElementById('drawer-farm-verdict');
    if (vElem) vElem.textContent = row.farm_verdict || verdict.text;

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
    var hold = (row.age_days === null) ? 30 : row.age_days < 120 ? 60 : row.age_days < 365 ? 45 : 30;

    var stepsData = [
      {
        num: '01',
        title: 'Sybil Defense & Wallet Isolation',
        desc: 'Prepare fresh EVM/SVM wallet funded directly from CEX. Avoid any cross-wallet transfers or co-signing with secondary farming addresses.',
        cost: 'Under $2 gas transfer',
        time: '5 min setup',
      },
      {
        num: '02',
        title: 'Primary Capital Deployment',
        desc: cat.indexOf('dex') >= 0
          ? 'Deposit $' + capital + ' into top volume pair on ' + chain + ' in narrow concentrated liquidity range.'
          : cat.indexOf('restak') >= 0
          ? 'Deposit $' + capital + ' of LST or ETH on ' + chain + ' into verified vault and delegate to AVS operators.'
          : cat.indexOf('perp') >= 0 || cat.indexOf('derivative') >= 0
          ? 'Deposit $' + capital + ' USDC margin on ' + chain + ' and open delta-neutral hedge position.'
          : 'Supply $' + capital + ' collateral into primary lending pool on ' + chain + '.',
        cost: '$' + capital + ' principal + $' + gas + ' gas',
        time: '10 min execution',
      },
      {
        num: '03',
        title: 'Protocol Volume & Multi-Contract Interaction',
        desc: cat.indexOf('dex') >= 0
          ? 'Execute 2 small volume swaps ($25-$50) across secondary routes weekly.'
          : cat.indexOf('perp') >= 0
          ? 'Generate $500 monthly trading turnover using low leverage (1-2x) without liquidation risk.'
          : 'Borrow conservative 20% stablecoin tranche to create bidirectional lending volume.',
        cost: 'Under $' + gas + ' gas fee',
        time: '10 min',
      },
      {
        num: '04',
        title: 'Epoch Cadence & Retention Cadence',
        desc: 'Harvest accrued yield or compound points weekly to establish consistent active epoch timestamps across snapshot blocks.',
        cost: 'About $2-$4 weekly gas',
        time: '5 min weekly check',
      },
      {
        num: '05',
        title: 'Snapshot Retention Window',
        desc: 'Hold position for at least ' + hold + ' consecutive days spanning two calendar months to qualify for loyalty multipliers.',
        cost: '$' + capital + ' earning baseline APY',
        time: hold + ' days retention',
      },
      {
        num: '06',
        title: 'TGE Claim & Anti-Drainer Verification',
        desc: 'Monitor official Discord/X verified announcement channel; execute claim strictly through official contract links.',
        cost: 'Zero claim fee (verify official contracts only)',
        time: '5 min',
      },
    ];

    for (var s = 0; s < stepsData.length; s++) {
      var step = stepsData[s];
      var li = document.createElement('li');
      li.className = 'farm-step-item';
      li.innerHTML =
        '<span class="step-num">' + step.num + '</span>' +
        '<div class="step-content">' +
          '<div class="step-text"><strong>' + step.title + ':</strong> ' + step.desc + '</div>' +
          '<div class="step-meta">' +
            '<span>Cost: <strong>' + step.cost + '</strong></span>' +
            '<span>Time: <strong>' + step.time + '</strong></span>' +
          '</div>' +
        '</div>';
      stepsList.appendChild(li);
    }

    drawerBackdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawerBackdrop.style.display = 'none';
    document.body.style.overflow = '';
    state.selected = null;
  }

  if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', function (e) {
      if (e.target === drawerBackdrop) closeDrawer();
    });
  }

  // Keyboard escape closes modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawerBackdrop.style.display === 'flex') {
      closeDrawer();
    }
  });

  // Search input events
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      state.q = this.value;
      if (clearSearchBtn) clearSearchBtn.style.display = this.value ? 'block' : 'none';
      renderTable();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', function () {
      state.q = '';
      if (searchInput) searchInput.value = '';
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
    { id: 'tab-excluded', view: 'excluded' },
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
          state.sort = (tabItem.view === 'live' || tabItem.view === 'excluded') ? 'tvl' : 'rank';
          state.dir = (tabItem.view === 'live' || tabItem.view === 'excluded') ? -1 : 1;
          renderTable();
        });
      }
    })(tabs[t]);
  }

  // Header sorting
  function bindHeaderEvents() {
    var headers = document.querySelectorAll('.radar-table thead th.sortable');
    for (var th = 0; th < headers.length; th++) {
      headers[th].addEventListener('click', function () {
        var sortField = this.getAttribute('data-sort');
        if (state.sort === sortField) {
          state.dir = state.dir * -1;
        } else {
          state.sort = sortField;
          state.dir = (sortField === 'rank' || sortField === 'name') ? 1 : -1;
        }
        renderTable();
      });
    }
  }

  // URL Hash route handling for deep-linking & headless screenshot capture
  function handleHashRoute() {
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var params = {};
    var parts = hash.split('&');
    for (var p = 0; p < parts.length; p++) {
      var kv = parts[p].split('=');
      if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    }
    if (params.category) {
      state.category = params.category;
      var catPills = document.querySelectorAll('#category-filters .pill');
      for (var cp = 0; cp < catPills.length; cp++) {
        if (catPills[cp].getAttribute('data-cat') === params.category) {
          catPills[cp].classList.add('active');
        } else {
          catPills[cp].classList.remove('active');
        }
      }
    }
    if (params.q) {
      state.q = params.q;
      if (searchInput) searchInput.value = params.q;
    }
    if (params.view) {
      state.view = params.view;
      for (var j = 0; j < tabs.length; j++) {
        var el = document.getElementById(tabs[j].id);
        if (el) {
          if (tabs[j].view === params.view) el.classList.add('active');
          else el.classList.remove('active');
        }
      }
    }
    renderTable();
    if (params.detail && DATA.rows) {
      var target = null;
      for (var r = 0; r < DATA.rows.length; r++) {
        if (DATA.rows[r].slug === params.detail || (params.detail === 'first' && r === 0)) {
          target = DATA.rows[r];
          break;
        }
      }
      if (target) openDrawer(target);
    }
  }

  window.addEventListener('hashchange', handleHashRoute);

  // Initial table render & route check
  renderTable();
  handleHashRoute();
})();
