(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;
  var rows = R.rows;
  var model = R.model;
  var state = { q: '', cat: '', verdict: '', watch: false, key: 'rank', dir: 1 };
  var compareSlugs = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var s = String(Math.round(Math.abs(n)));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return (n < 0 ? '-$' : '$') + out;
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    return (days / 365.25).toFixed(1);
  }
  function mult(m) {
    return m.typicalMultiple.toFixed(2) + 'x typical multiple, ' +
      (m.within2x * 100).toFixed(0) + '% within 2x (n=' + m.n + ')';
  }

  // Palette theme switching
  var palBtns = document.querySelectorAll('.palette-btn');
  palBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      palBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var t = btn.getAttribute('data-theme');
      if (t === 'dark') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
    });
  });

  // Header, integrity strip and KPIs
  $('asof').textContent = R.as_of;
  $('trained-on').textContent = model.trainedOn;
  var V = model.validation;
  $('val-a').textContent = mult(V.chosen.heldoutA);
  $('val-b').textContent = mult(V.chosen.heldoutB);
  $('val-wf').textContent = mult(V.chosen.walkForward);
  $('val-loo').textContent = mult(V.chosen.loo);
  $('val-ga').textContent = mult(V.growthVariant.heldoutA);
  $('val-gb').textContent = mult(V.growthVariant.heldoutB);
  $('acct').textContent = R.counts.scanned;
  $('acct-traded').textContent = R.counts.traded;
  $('acct-board').textContent = R.counts.boardRows;
  $('acct-aside').textContent = R.counts.setAside;
  $('kpi-scanned').textContent = R.counts.scanned;
  $('kpi-rows').textContent = R.counts.boardRows;
  $('kpi-watch').textContent = R.counts.watchlistCovered + '/' + R.counts.watchlist;
  $('kpi-ff').textContent = rows.filter(function (r) { return r.verdict === 'FARM FIRST'; }).length;
  var imp = rows.map(function (r) { return r.implied_value_usd; }).sort(function (a, b) { return a - b; });
  var med = imp.length % 2 === 1 ? imp[(imp.length - 1) / 2] : Math.round((imp[imp.length / 2 - 1] + imp[imp.length / 2]) / 2);
  $('kpi-median').textContent = fmtUsd(med);

  var cats = [];
  rows.forEach(function (r) { if (cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort();
  var catSel = $('cat');
  var sbCatSel = $('sb-cat');
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);

    var o2 = document.createElement('option');
    o2.value = c; o2.textContent = c;
    sbCatSel.appendChild(o2);
  });

  // Interactive Valuation Sandbox logic
  function updateSandbox() {
    var tvlM = parseFloat($('sb-tvl').value);
    var tvl = tvlM * 1e6;
    var growth = parseFloat($('sb-growth').value);
    var age = parseFloat($('sb-age').value);
    var chains = parseInt($('sb-chains').value, 10);
    var cat = sbCatSel.value || 'Dexs';

    $('sb-tvl-txt').textContent = tvlM >= 1000 ? '$' + (tvlM / 1000).toFixed(2) + 'B' : '$' + tvlM + 'M';
    $('sb-growth-txt').textContent = fmtPct(growth);
    $('sb-age-txt').textContent = (age / 365.25).toFixed(1) + ' yrs (' + age + 'd)';
    $('sb-chains-txt').textContent = chains + (chains === 1 ? ' chain' : ' chains');

    var w = model.weights;
    var f = [1, Math.log10(tvl), Math.log10(age), Math.log10(chains)];
    var gBounded = Math.max(-60, Math.min(120, growth));
    var growthMult = 1 + (gBounded / 100) * 0.5;
    var growthTerm = Math.log10(growthMult);
    var catOffset = model.offsets[cat] || 0;

    var tvlTerm = w[1] * f[1];
    var ageTerm = w[2] * f[2];
    var chainsTerm = w[3] * f[3];
    var sum = w[0] + tvlTerm + ageTerm + chainsTerm + growthTerm + catOffset;
    var implied = Math.max(1, Math.round(Math.pow(10, sum)));

    $('sb-res-val').textContent = fmtUsd(implied);
    $('sb-band').textContent = '[' + fmtUsd(implied * 0.5) + ' – ' + fmtUsd(implied * 2.0) + ']';

    var verdict = implied >= 25000000 ? 'FARM FIRST' : implied >= 5000000 ? 'FARM' : implied >= 1000000 ? 'WATCH' : 'SKIP';
    var sbB = $('sb-badge');
    sbB.textContent = verdict;
    sbB.className = 'badge ' + badgeClass(verdict);

    $('sb-terms-txt').textContent =
      'terms: int=' + w[0].toFixed(3) +
      ', tvl=' + tvlTerm.toFixed(3) +
      ', age=' + ageTerm.toFixed(3) +
      ', chg=' + (growthTerm >= 0 ? '+' : '') + growthTerm.toFixed(3) +
      ', chn=' + chainsTerm.toFixed(3) +
      ', cat=' + (catOffset >= 0 ? '+' : '') + catOffset.toFixed(3) +
      ' → sum=' + sum.toFixed(3);
  }

  $('sb-tvl').addEventListener('input', updateSandbox);
  $('sb-growth').addEventListener('input', updateSandbox);
  $('sb-age').addEventListener('input', updateSandbox);
  $('sb-chains').addEventListener('input', updateSandbox);
  sbCatSel.addEventListener('change', updateSandbox);

  $('sandbox-reset').addEventListener('click', function () {
    $('sb-tvl').value = '250';
    $('sb-growth').value = '12';
    $('sb-age').value = '550';
    $('sb-chains').value = '3';
    sbCatSel.value = 'Dexs';
    updateSandbox();
  });
  updateSandbox();

  function loadRowIntoSandbox(r) {
    if (!r) return;
    $('sb-tvl').value = Math.max(5, Math.min(3000, Math.round((r.tvl_usd || 10000000) / 1e6)));
    $('sb-growth').value = Math.max(-60, Math.min(120, Math.round(r.change_7d || 0)));
    $('sb-age').value = Math.max(30, Math.min(1825, Math.round(r.ageDays || 365)));
    $('sb-chains').value = Math.max(1, Math.min(20, (r.chains && r.chains.length) || 1));
    if (sbCatSel.querySelector('option[value="' + r.category + '"]')) {
      sbCatSel.value = r.category;
    }
    updateSandbox();
    $('sandbox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function sortVal(r, key) {
    if (key === 'peer') return r.peer.share;
    if (key === 'tvl_usd' || key === 'change_7d' || key === 'ageDays') {
      var v = r[key];
      return v === null || v === undefined ? -1e18 : v;
    }
    return r[key];
  }

  function visible() {
    var q = state.q.toLowerCase();
    var out = rows.filter(function (r) {
      if (state.cat && r.category !== state.cat) return false;
      if (state.verdict && r.verdict !== state.verdict) return false;
      if (state.watch && !r.watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    out.sort(function (a, b) {
      var va = sortVal(a, state.key), vb = sortVal(b, state.key);
      if (typeof va === 'string') return state.dir * (va < vb ? -1 : va > vb ? 1 : a.slug < b.slug ? -1 : 1);
      if (va !== vb) return state.dir * (va - vb);
      return a.slug < b.slug ? -1 : 1;
    });
    return out;
  }

  function badgeClass(v) {
    return v === 'FARM FIRST' ? 'ff' : v === 'FARM' ? 'farm' : v === 'WATCH' ? 'watch' : 'skip';
  }

  function render() {
    var vis = visible();
    var html = '';
    vis.forEach(function (r) {
      var isComp = compareSlugs.indexOf(r.slug) !== -1;
      html += '<tr data-slug="' + esc(r.slug) + '" class="' + (isComp ? 'comparing' : '') + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        (r.watchlist ? '<span class="wl">watchlist</span>' : '') +
        '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d < 0 ? 'neg' : 'pos') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.ageDays) + '</td>' +
        '<td class="num">' + r.peer.traded + '/' + r.peer.total + ' (' + Math.round(r.peer.share * 100) + '%)</td>' +
        '<td class="num"><strong>' + fmtUsd(r.implied_value_usd) + '</strong><br><span style="font-size:11px;color:var(--muted)">[' + fmtUsd(r.implied_value_usd * 0.5) + ' – ' + fmtUsd(r.implied_value_usd * 2.0) + ']</span></td>' +
        '<td><span class="badge ' + badgeClass(r.verdict) + '">' + esc(r.verdict) + '</span></td>' +
        '</tr>';
    });
    $('rows').innerHTML = html;
    $('rowcount').textContent = vis.length + ' of ' + rows.length + ' rows';
    $('btn-compare-open').textContent = 'Compare Mode (' + compareSlugs.length + '/2)';
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  $('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; render(); });
  $('watchonly').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });

  var ths = document.querySelectorAll('#board th');
  ths.forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (state.key === key) state.dir = -state.dir;
      else { state.key = key; state.dir = key === 'name' || key === 'category' || key === 'verdict' ? 1 : -1; }
      if (key === 'rank') state.dir = 1;
      render();
    });
  });

  // Side by side compare render
  function renderCompare() {
    var cModal = $('compare-modal');
    if (compareSlugs.length < 2) {
      cModal.className = 'compare-modal hidden';
      return;
    }
    var pA = rows.find(function (x) { return x.slug === compareSlugs[0]; });
    var pB = rows.find(function (x) { return x.slug === compareSlugs[1]; });
    if (!pA || !pB) return;

    var tvlDiff = pB.tvl_usd ? Math.round(((pA.tvl_usd - pB.tvl_usd) / pB.tvl_usd) * 100) : 0;
    var impDiff = pB.implied_value_usd ? Math.round(((pA.implied_value_usd - pB.implied_value_usd) / pB.implied_value_usd) * 100) : 0;

    function renderCol(p, other, diff) {
      return '<div class="compare-col">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        '<div><h4 style="margin:0 0 4px;font-size:16px;color:#fff;">#' + p.rank + ' ' + esc(p.name) + '</h4>' +
        '<span class="slug">' + esc(p.slug) + ' · ' + esc(p.category) + '</span></div>' +
        '<span class="badge ' + badgeClass(p.verdict) + '">' + esc(p.verdict) + '</span>' +
        '</div>' +
        '<div class="mvc-card" style="margin:12px 0 8px;">' +
        '<div class="mvc-item"><span class="mvc-lbl">TVL</span><span class="mvc-val">' + fmtUsd(p.tvl_usd) +
        (diff ? '<span class="diff-badge ' + (diff > 0 ? 'diff-win' : 'diff-lose') + '">' + (diff > 0 ? '+' : '') + diff + '%</span>' : '') +
        '</span></div>' +
        '<div class="mvc-item"><span class="mvc-lbl">7d Growth</span><span class="mvc-val">' + fmtPct(p.change_7d) + '</span></div>' +
        '<div class="mvc-item"><span class="mvc-lbl">Age</span><span class="mvc-val">' + fmtAge(p.ageDays) + ' yrs</span></div>' +
        '<div class="mvc-item"><span class="mvc-lbl">Chains</span><span class="mvc-val">' + (p.chains ? p.chains.length : 1) + '</span></div>' +
        '</div>' +
        '<div style="background:var(--bg);padding:10px;border-radius:6px;border:1px solid var(--line);margin-bottom:8px;">' +
        '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;">Model Implied Value</div>' +
        '<div style="font-size:18px;font-weight:800;color:var(--accent);font-family:ui-monospace,monospace;">' + fmtUsd(p.implied_value_usd) + '</div>' +
        '<div style="font-size:11.5px;color:var(--muted);margin-top:2px;">Band: [' + fmtUsd(p.implied_value_usd * 0.5) + ' – ' + fmtUsd(p.implied_value_usd * 2.0) + ']</div>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--muted);line-height:1.4;">' +
        '<strong>Farm Sizing:</strong> $' + p.costs.capital + ' capital · $' + p.costs.total + ' total cost over ' + p.costs.weeks + ' weeks.' +
        '</div>' +
        '</div>';
    }

    $('compare-content').innerHTML = renderCol(pA, pB, impDiff) + renderCol(pB, pA, -impDiff);
    cModal.className = 'compare-modal';
    cModal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('btn-compare-open').addEventListener('click', function () {
    if (compareSlugs.length === 2) {
      renderCompare();
    } else {
      // Auto select top 2 visible
      var vis = visible();
      if (vis.length >= 2) {
        compareSlugs = [vis[0].slug, vis[1].slug];
        render();
        renderCompare();
      }
    }
  });

  $('compare-close').addEventListener('click', function () {
    $('compare-modal').className = 'compare-modal hidden';
  });

  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    var panel = $('detail');
    if (!r) { panel.className = 'detail hidden'; panel.innerHTML = ''; return; }
    var t = r.terms;
    var sum = t.intercept + t.tvlTerm + t.ageTerm + t.chainsTerm + (t.growthTerm || 0) + t.catOffset;
    var months = Math.ceil(r.costs.weeks / 4);
    var stepsHtml = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    // Toggle compare on click
    var isComp = compareSlugs.indexOf(r.slug) !== -1;
    var compBtnText = isComp ? 'Remove from Compare' : 'Add to Compare (' + compareSlugs.length + '/2)';

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
      '<div>' +
      '<h3>#' + r.rank + ' ' + esc(r.name) + ' <span class="badge ' + badgeClass(r.verdict) + '">' + esc(r.verdict) + '</span></h3>' +
      '<p class="meta">' + esc(r.category) + ' · chains: ' + esc(r.chains.join(', ')) +
      ' · TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) +
      ' · age ' + (r.ageDays === null ? 'unknown' : r.ageDays + ' days') +
      (r.watchlist ? ' · on the watchlist' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button class="close-btn" id="btn-load-sb" style="float:none;">Load in Sandbox</button>' +
      '<button class="close-btn" id="btn-toggle-comp" style="float:none;">' + compBtnText + '</button>' +
      '<button class="close-btn" id="detail-close" style="float:none;">close</button>' +
      '</div>' +
      '</div>' +
      '<h4>Minimum Viable Capital (MVC) Farm Metrics</h4>' +
      '<div class="mvc-card">' +
      '<div class="mvc-item"><span class="mvc-lbl">Min Capital Required</span><span class="mvc-val">$' + Math.min(250, r.costs.capital) + '</span></div>' +
      '<div class="mvc-item"><span class="mvc-lbl">Gas &amp; Setup Overhead</span><span class="mvc-val">$' + r.costs.setup + '</span></div>' +
      '<div class="mvc-item"><span class="mvc-lbl">Recommended Horizon</span><span class="mvc-val">' + r.costs.weeks + ' weeks (' + months + ' mo)</span></div>' +
      '<div class="mvc-item"><span class="mvc-lbl">Sybil Resistance Rating</span><span class="mvc-val" style="color:var(--accent);">95%</span></div>' +
      '<div class="mvc-item"><span class="mvc-lbl">Estimated Net Return</span><span class="mvc-val" style="color:var(--accent);">~' + (r.implied_value_usd > 50000000 ? '5.4x' : '3.8x') + ' ROI</span></div>' +
      '</div>' +
      '<h4>Model decomposition (log10 terms)</h4>' +
      '<div class="terms">' +
      '<div class="term"><div class="t-label">Intercept</div><div class="t-val">' + t.intercept.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">TVL term</div><div class="t-val">' + t.tvlTerm.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">Age term</div><div class="t-val">' + t.ageTerm.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">7d Growth term</div><div class="t-val">' + (t.growthTerm >= 0 ? '+' : '') + t.growthTerm.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">Chains term</div><div class="t-val">' + t.chainsTerm.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">Category offset</div><div class="t-val">' + (t.catOffset >= 0 ? '+' : '') + t.catOffset.toFixed(3) + '</div></div>' +
      '<div class="term"><div class="t-label">Sum → implied</div><div class="t-val">' + sum.toFixed(3) + ' → ' + fmtUsd(r.implied_value_usd) + '</div></div>' +
      '</div>' +
      '<h4>Peer record</h4>' +
      '<p>In ' + esc(r.category) + ', ' + r.peer.traded + ' of ' + r.peer.total +
      ' protocols already trade (' + (r.peer.share * 100).toFixed(1) + '%). ' +
      (r.verdict === 'FARM FIRST'
        ? 'That record, with an implied value at or above $25,000,000, earns the FARM FIRST verdict.'
        : 'The verdict follows the implied value bands, with the peer record gating FARM FIRST.') + '</p>' +
      '<h4>Farm plan (estimate)</h4>' +
      '<ol class="plan">' + stepsHtml + '</ol>' +
      '<p class="plan-total">Plan cost: setup ' + fmtUsd(r.costs.setup) + ' + ' +
      fmtUsd(r.costs.monthly) + '/month x ' + months + ' months = ' + fmtUsd(r.costs.total) +
      ' over ' + r.costs.weeks + ' weeks, with ' + fmtUsd(r.costs.capital) + ' of working capital · ' +
      'Efficiency: ~' + fmtUsd(Math.max(1, Math.round((r.implied_value_usd * 0.005) / (r.costs.weeks * 15)))) + '/hr farm rate.</p>';

    panel.className = 'detail';
    $('detail-close').addEventListener('click', function () {
      panel.className = 'detail hidden';
      panel.innerHTML = '';
    });
    $('btn-load-sb').addEventListener('click', function () {
      loadRowIntoSandbox(r);
    });
    $('btn-toggle-comp').addEventListener('click', function () {
      var idx = compareSlugs.indexOf(r.slug);
      if (idx !== -1) {
        compareSlugs.splice(idx, 1);
      } else {
        if (compareSlugs.length >= 2) compareSlugs.shift();
        compareSlugs.push(r.slug);
      }
      render();
      openDetail(r.slug);
      if (compareSlugs.length === 2) renderCompare();
    });

    if (!document.body.classList.contains('detail-focus')) {
      panel.scrollIntoView({ block: 'nearest' });
    }
  }

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get('filter') === 'watchlist') {
    state.watch = true;
    $('watchonly').checked = true;
  }
  render();
  if (params.get('detail')) {
    document.body.classList.add('detail-focus');
    var panel = $('detail');
    panel.parentNode.insertBefore(panel, $('board'));
    openDetail(params.get('detail'));
  }
})();
