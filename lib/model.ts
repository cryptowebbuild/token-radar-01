// Token Radar Model: OLS log-log regression fitting log10(Mcap) on log-features
// of traded protocols, combined with empirical Bayesian category shrinkage offsets.
// Deterministic standard library only (Node 22, erasable TypeScript).

import { createHash } from 'node:crypto';

export interface Proto {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface EvalMetrics {
  n: number;
  medianRatio: number;
  medianAbsLog10: number;
  typicalMultiple: number;
  within2x: number;
}

export interface Fitted {
  weights: number[];
  offsets: Record<string, number>;
  growth: boolean;
}

export interface Ctx {
  asOf: string;
  medAge: number;
  medChg: number;
  bigcats: Set<string>;
}

const DAY_MS = 86400000;

function utcDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function ageDays(p: Proto, asOf: string): number | null {
  if (p.listed_at === null) return null;
  return Math.round((utcDay(asOf) - utcDay(p.listed_at)) / DAY_MS);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function trainingPool(snap: Snapshot): Proto[] {
  return snap.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd !== null && p.tvl_usd > 0,
  );
}

export function buildCtx(snap: Snapshot, train: Proto[]): Ctx {
  const ages: number[] = [];
  const chgs: number[] = [];
  for (const p of train) {
    const a = ageDays(p, snap.as_of);
    if (a !== null) ages.push(a);
    if (p.change_7d !== null) chgs.push(p.change_7d);
  }
  const counts = new Map<string, number>();
  for (const p of train) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const bigcats = new Set<string>();
  for (const [c, n] of counts) if (n >= 6) bigcats.add(c);
  return { asOf: snap.as_of, medAge: median(ages), medChg: median(chgs), bigcats };
}

function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function feats(p: Proto, ctx: Ctx, growth: boolean): number[] {
  const age = ageDays(p, ctx.asOf);
  const ageImp = age === null ? ctx.medAge : age;
  const base = [
    1,
    Math.log10(p.tvl_usd as number),
    Math.log10(Math.max(ageImp, 1)),
    Math.log10(Math.max(p.chains.length, 1)),
  ];
  if (!growth) return base;
  const g = clip(p.change_7d === null ? ctx.medChg : p.change_7d, -60, 120);
  return [base[0], base[1], g, base[2], base[3]];
}

// Solve (X'X + 1e-8 I) w = X'y by Gaussian elimination with partial pivoting.
export function ols(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const a: number[][] = [];
  for (let i = 0; i < k; i++) {
    a.push(new Array(k + 1).fill(0));
    a[i][i] += 1e-8;
  }
  for (let r = 0; r < X.length; r++) {
    const row = X[r];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i][j] += row[i] * row[j];
      a[i][k] += row[i] * y[r];
    }
  }
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    }
    if (piv !== col) {
      const tmp = a[piv];
      a[piv] = a[col];
      a[col] = tmp;
    }
    if (Math.abs(a[col][col]) < 1e-12) a[col][col] = 1e-12;
    const pv = a[col][col];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r][col] / pv;
      if (f === 0) continue;
      for (let j = col; j <= k; j++) a[r][j] -= f * a[col][j];
    }
  }
  const w = new Array(k).fill(0);
  for (let i = 0; i < k; i++) w[i] = a[i][k] / a[i][i];
  return w;
}

export function fit(train: Proto[], ctx: Ctx, growth: boolean): Fitted {
  const X = train.map((p) => feats(p, ctx, growth));
  const y = train.map((p) => Math.log10(p.mcap_usd as number));
  const w1 = ols(X, y);
  const residByCat = new Map<string, number[]>();
  train.forEach((p, i) => {
    let pred = 0;
    for (let j = 0; j < w1.length; j++) pred += w1[j] * X[i][j];
    const arr = residByCat.get(p.category) ?? [];
    arr.push(y[i] - pred);
    residByCat.set(p.category, arr);
  });
  const offsets: Record<string, number> = {};
  for (const c of [...residByCat.keys()].sort()) {
    if (!ctx.bigcats.has(c)) continue;
    const rs = residByCat.get(c) as number[];
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
    offsets[c] = mean * (rs.length / (rs.length + 4));
  }
  const y2 = train.map((p, i) => y[i] - (offsets[p.category] ?? 0));
  const weights = ols(X, y2);
  return { weights, offsets, growth };
}

export function predict(p: Proto, model: Fitted, ctx: Ctx): number {
  const f = feats(p, ctx, model.growth);
  let s = model.offsets[p.category] ?? 0;
  for (let j = 0; j < model.weights.length; j++) s += model.weights[j] * f[j];
  return Math.pow(10, s);
}

export function foldOf(slug: string): number {
  const hex = createHash('md5').update(slug, 'utf8').digest('hex');
  let acc = 0;
  for (const ch of hex) acc = (acc * 16 + parseInt(ch, 16)) % 5;
  return acc;
}

function metrics(pairs: { pred: number; actual: number }[]): EvalMetrics {
  const ratios = pairs.map((x) => x.pred / x.actual);
  const absLogs = ratios.map((r) => Math.abs(Math.log10(r)));
  const medAbs = median(absLogs);
  const inside = ratios.filter((r) => r >= 0.5 && r <= 2).length;
  return {
    n: pairs.length,
    medianRatio: median(ratios),
    medianAbsLog10: medAbs,
    typicalMultiple: Math.pow(10, medAbs),
    within2x: pairs.length === 0 ? 0 : inside / pairs.length,
  };
}

function evaluate(model: Fitted, test: Proto[], ctx: Ctx): EvalMetrics {
  return metrics(
    test.map((p) => ({ pred: predict(p, model, ctx), actual: p.mcap_usd as number })),
  );
}

export interface Validation {
  chosen: { heldoutA: EvalMetrics; heldoutB: EvalMetrics; walkForward: EvalMetrics; loo: EvalMetrics };
  growthVariant: { heldoutA: EvalMetrics; heldoutB: EvalMetrics };
}

export function runValidation(train: Proto[], ctx: Ctx): Validation {
  const testA = train.filter((p) => foldOf(p.slug) === 0);
  const trainA = train.filter((p) => foldOf(p.slug) !== 0);
  const testB = train.filter((p) => foldOf(p.slug) === 2);
  const trainB = train.filter((p) => foldOf(p.slug) !== 2);
  const heldoutA = evaluate(fit(trainA, ctx, false), testA, ctx);
  const heldoutB = evaluate(fit(trainB, ctx, false), testB, ctx);
  const dated = train
    .filter((p) => p.listed_at !== null)
    .sort((a, b) =>
      a.listed_at === b.listed_at
        ? a.slug < b.slug
          ? -1
          : 1
        : (a.listed_at as string) < (b.listed_at as string)
          ? -1
          : 1,
    );
  const cut = Math.floor(dated.length * 0.7);
  const walkForward = evaluate(fit(dated.slice(0, cut), ctx, false), dated.slice(cut), ctx);
  const looPairs: { pred: number; actual: number }[] = [];
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    looPairs.push({ pred: predict(train[i], fit(rest, ctx, false), ctx), actual: train[i].mcap_usd as number });
  }
  const growthA = evaluate(fit(trainA, ctx, true), testA, ctx);
  const growthB = evaluate(fit(trainB, ctx, true), testB, ctx);
  return {
    chosen: { heldoutA, heldoutB, walkForward, loo: metrics(looPairs) },
    growthVariant: { heldoutA: growthA, heldoutB: growthB },
  };
}

export interface PeerRec {
  traded: number;
  total: number;
  share: number;
}

export function peerTable(snap: Snapshot): { byCat: Map<string, { traded: number; total: number }>; global: { traded: number; total: number } } {
  const byCat = new Map<string, { traded: number; total: number }>();
  let gTraded = 0;
  for (const p of snap.protocols) {
    const traded = p.gecko_id !== null || p.symbol !== null;
    if (traded) gTraded++;
    const rec = byCat.get(p.category) ?? { traded: 0, total: 0 };
    rec.total++;
    if (traded) rec.traded++;
    byCat.set(p.category, rec);
  }
  return { byCat, global: { traded: gTraded, total: snap.protocols.length } };
}

export function peerFor(
  category: string,
  table: { byCat: Map<string, { traded: number; total: number }>; global: { traded: number; total: number } },
): PeerRec {
  const rec = table.byCat.get(category);
  const use = rec !== undefined && rec.total >= 8 ? rec : table.global;
  return { traded: use.traded, total: use.total, share: use.traded / use.total };
}

const EXCLUDED_CATS = new Set([
  'Canonical Bridge',
  'CEX',
]);
const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

export function asideReason(p: Proto): string | null {
  if (EXCLUDED_CATS.has(p.category)) return `excluded category: ${p.category}`;
  if (VERSION_RE.test(p.name)) return 'versioned product name';
  for (const pre of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(pre)) return 'exchange-branded product';
  }
  if (p.name === 'Wrapped' || p.name === 'WBTC' || p.name.startsWith('Wrapped Bitcoin')) return 'wrapped token pool';
  return null;
}

export function isEligible(p: Proto): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  return asideReason(p) === null;
}

export interface Costs {
  setup: number;
  monthly: number;
  weeks: number;
  capital: number;
  total: number;
}

const ARCHETYPES: Record<string, { setup: number; monthly: number; weeks: number; capital: number }> = {
  Dexs: { setup: 40, monthly: 25, weeks: 6, capital: 500 },
  Lending: { setup: 35, monthly: 15, weeks: 8, capital: 1000 },
  Yield: { setup: 25, monthly: 10, weeks: 8, capital: 500 },
  Derivatives: { setup: 50, monthly: 60, weeks: 6, capital: 1000 },
  'Risk Curators': { setup: 30, monthly: 12, weeks: 8, capital: 750 },
  'Onchain Capital Allocator': { setup: 30, monthly: 12, weeks: 8, capital: 750 },
  CDP: { setup: 35, monthly: 15, weeks: 8, capital: 1000 },
  'Basis Trading': { setup: 45, monthly: 40, weeks: 6, capital: 1500 },
  Bridge: { setup: 35, monthly: 20, weeks: 6, capital: 500 },
  'Cross Chain Bridge': { setup: 35, monthly: 20, weeks: 6, capital: 500 },
  'Liquid Staking': { setup: 25, monthly: 10, weeks: 8, capital: 500 },
  'Liquid Restaking': { setup: 30, monthly: 15, weeks: 8, capital: 750 },
  Restaking: { setup: 30, monthly: 15, weeks: 8, capital: 750 },
  'Restaked BTC': { setup: 30, monthly: 15, weeks: 8, capital: 1000 },
  'Staking Pool': { setup: 25, monthly: 10, weeks: 8, capital: 500 },
  RWA: { setup: 40, monthly: 15, weeks: 8, capital: 1000 },
  Chain: { setup: 30, monthly: 15, weeks: 8, capital: 500 },
  'Yield Aggregator': { setup: 25, monthly: 10, weeks: 8, capital: 500 },
};
const DEFAULT_ARCH = { setup: 20, monthly: 10, weeks: 6, capital: 250 };

export function costsFor(p: Proto): Costs {
  const a = ARCHETYPES[p.category] ?? DEFAULT_ARCH;
  const setup = a.setup + 8 * Math.min(Math.max(p.chains.length - 1, 0), 5);
  const months = Math.ceil(a.weeks / 4);
  return { setup, monthly: a.monthly, weeks: a.weeks, capital: a.capital, total: setup + a.monthly * months };
}

const ACTIVITY: Record<string, string> = {
  Dexs: 'swap between the main pairs and add two-sided liquidity',
  Lending: 'supply collateral and run a conservative borrow loop',
  Yield: 'deposit into the flagship vaults and compound the yield',
  Derivatives: 'trade the main perpetual markets with small, hedged size',
  'Risk Curators': 'allocate into the curated vaults and track curator risk scores',
  'Onchain Capital Allocator': 'allocate into the managed strategies and follow the allocation reports',
  CDP: 'open a collateral position and mint against it within safe ratios',
  'Basis Trading': 'run delta-neutral basis positions across spot and perpetuals',
  Bridge: 'bridge native assets between supported networks on a regular weekly cadence',
  'Cross Chain Bridge': 'route volume through the cross-chain router between target L1 and L2 chains',
  'Liquid Staking': 'stake underlying assets into the protocol and hold yield-bearing receipt tokens',
  'Liquid Restaking': 'deposit liquid staking tokens to secure active validation services and accumulate points',
  Restaking: 'delegate native tokens to actively validated services on the restaking layer',
  'Restaked BTC': 'deposit native or wrapped BTC into Bitcoin restaking vaults to earn restaking yields',
  'Staking Pool': 'stake network tokens into validator pools and compound rewards',
  RWA: 'complete KYC/onboarding if required and deposit into tokenized treasury or private credit vaults',
  Chain: 'bridge funds to the native network, deploy contracts, and interact with the ecosystem dApps',
  'Yield Aggregator': 'route assets into optimal yield auto-compounding vaults',
};

const AIRDROP_PCT: Record<string, number> = {
  Dexs: 12,
  Derivatives: 12,
  'Basis Trading': 12,
  Chain: 10,
  Bridge: 7,
  'Cross Chain Bridge': 7,
  'Liquid Staking': 8,
  'Liquid Restaking': 8,
  Restaking: 8,
  'Restaked BTC': 8,
  'Staking Pool': 8,
  Lending: 8,
  CDP: 8,
  Yield: 8,
  'Yield Aggregator': 8,
  RWA: 6,
  'Risk Curators': 7,
  'Onchain Capital Allocator': 7,
};

export function fmtUsd(n: number): string {
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return (n < 0 ? '-$' : '$') + out;
}

export function verdictFor(implied: number, peerShare: number): string {
  if (implied >= 25000000 && peerShare >= 0.4) return 'FARM FIRST';
  if (implied >= 15000000) return 'FARM';
  if (implied >= 6000000) return 'WATCH';
  return 'SKIP';
}

export function farmSteps(p: Proto, peer: PeerRec, implied: number, verdict: string, costs: Costs): string[] {
  const main = p.chains[0] ?? 'its main chain';
  const act = ACTIVITY[p.category] ?? 'use the core protocol flows end to end';
  const tvl = fmtUsd(p.tvl_usd ?? 0);
  const chg = p.change_7d === null ? 'no 7d change reading' : `a 7d change of ${p.change_7d.toFixed(1)}%`;
  const months = Math.ceil(costs.weeks / 4);
  return [
    `Prepare a dedicated wallet and bridge funds to ${main}, the main chain of ${p.name} (${p.chains.length} chain${p.chains.length === 1 ? '' : 's'} total, TVL ${tvl}). Budget the one-off setup cost of ${fmtUsd(costs.setup)} and allow 2 days for bridging, approvals and test transactions.`,
    `Start the core activity on ${p.name}: ${act}, with ${fmtUsd(costs.capital)} of working capital on ${main}. With TVL at ${tvl} and ${chg}, keep size small and reversible; allow the first 7 days to learn fees, slippage and the points rules.`,
    `Repeat the activity on a fixed weekly rhythm for ${costs.weeks} weeks (about ${months} months). The recurring budget is ${fmtUsd(costs.monthly)} per month, ${fmtUsd(costs.monthly * months)} of running costs on top of setup, and steady consistency is what points systems reward. Sybil defense: randomize interaction days, avoid round-number CEX withdrawals, and maintain balance.`,
    `Expand to a second chain where ${p.name} is live, or into its governance and points layer, and log progress weekly. The peer record for ${p.category} is ${peer.traded} of ${peer.total} protocols already trading, which frames the launch odds; setup takes about 1 week and stays inside the ${fmtUsd(costs.monthly)} monthly budget.`,
    `Watch for launch signals from ${p.name} (snapshot announcements, claim pages, exchange listings) against an implied value of ${fmtUsd(implied)} and a ${verdict} verdict. Keep records of every step so a claim can be filed within days; monitoring costs $0 extra and runs until launch.`,
  ];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  category: string;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  ageDays: number | null;
  watchlist: boolean;
  priority_watchlist: boolean;
  tier1_watchlist: boolean;
  peer: PeerRec;
  terms: { intercept: number; tvlTerm: number; ageTerm: number; chainsTerm: number; growthTerm: number; catOffset: number };
  implied_value_usd: number;
  est_airdrop_usd: number;
  airdrop_share_pct: number;
  verdict: string;
  costs: Costs;
  farm_steps: string[];
}

export interface Board {
  as_of: string;
  floor_usd: number;
  counts: {
    scanned: number;
    traded: number;
    preToken: number;
    boardRows: number;
    setAside: number;
    watchlist: number;
    watchlistCovered: number;
    priorityWatchlist: number;
    tier1Watchlist: number;
  };
  model: {
    trainedOn: number;
    weights: number[];
    offsets: Record<string, number>;
    medAge: number;
    medChg: number;
    validation: Validation;
  };
  rows: BoardRow[];
  live: { slug: string; name: string; category: string; tvl_usd: number | null; mcap_usd: number | null }[];
  setAside: { slug: string; name: string; reason: string }[];
}

export function buildBoard(snap: Snapshot): Board {
  const train = trainingPool(snap);
  const ctx = buildCtx(snap, train);
  const model = fit(train, ctx, false);
  const validation = runValidation(train, ctx);
  const table = peerTable(snap);
  const watch = new Set(snap.watchlist);
  const eligibleProtos = snap.protocols.filter(isEligible);
  const sortedByTvl = [...eligibleProtos].sort((a, b) => (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0));
  const pWatch = new Set(watch);
  for (const p of sortedByTvl) {
    if (pWatch.size >= 104) break;
    pWatch.add(p.slug);
  }
  const rows: BoardRow[] = [];
  for (const p of snap.protocols) {
    if (!isEligible(p)) continue;
    const peer = peerFor(p.category, table);
    const age = ageDays(p, snap.as_of);
    const f = feats(p, ctx, false);
    const g = clip(p.change_7d === null ? ctx.medChg : p.change_7d, -60, 120);
    const growthMult = 1 + (g / 100) * 0.5;
    const growthTerm = Math.log10(growthMult);
    const catOffset = model.offsets[p.category] ?? 0;
    const logImplied =
      model.weights[0] +
      model.weights[1] * f[1] +
      model.weights[2] * f[2] +
      model.weights[3] * f[3] +
      growthTerm +
      catOffset;
    const implied = Math.max(1, Math.round(Math.pow(10, logImplied)));
    const verdict = verdictFor(implied, peer.share);
    const costs = costsFor(p);
    const airdropPct = AIRDROP_PCT[p.category] ?? 8;
    const estAirdrop = Math.round(implied * (airdropPct / 100));
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      category: p.category,
      chains: [...p.chains],
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      ageDays: age,
      watchlist: watch.has(p.slug),
      priority_watchlist: pWatch.has(p.slug),
      tier1_watchlist: watch.has(p.slug) || (p.tvl_usd !== null && p.tvl_usd >= 75_000_000),
      peer,
      terms: {
        intercept: model.weights[0],
        tvlTerm: model.weights[1] * f[1],
        ageTerm: model.weights[2] * f[2],
        chainsTerm: model.weights[3] * f[3],
        growthTerm,
        catOffset,
      },
      implied_value_usd: implied,
      est_airdrop_usd: estAirdrop,
      airdrop_share_pct: airdropPct,
      verdict,
      costs,
      farm_steps: farmSteps(p, peer, implied, verdict, costs),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  const live = snap.protocols
    .filter((p) => p.gecko_id !== null || p.symbol !== null)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const setAside = snap.protocols
    .filter((p) => p.gecko_id === null && p.symbol === null && !isEligible(p))
    .map((p) => ({ slug: p.slug, name: p.name, reason: asideReason(p) as string }))
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const covered = rows.filter((r) => r.watchlist).length;
  return {
    as_of: snap.as_of,
    floor_usd: snap.floor_usd,
    counts: {
      scanned: snap.protocols.length,
      traded: live.length,
      preToken: snap.protocols.length - live.length,
      boardRows: rows.length,
      setAside: setAside.length,
      watchlist: snap.watchlist.length,
      watchlistCovered: covered,
      priorityWatchlist: rows.filter((r) => r.priority_watchlist).length,
      tier1Watchlist: rows.filter((r) => r.tier1_watchlist).length,
    },
    model: {
      trainedOn: train.length,
      weights: model.weights,
      offsets: model.offsets,
      medAge: ctx.medAge,
      medChg: ctx.medChg,
      validation,
    },
    rows,
    live,
    setAside,
  };
}

export function boardIssue(board: Board, snap: Snapshot): string | null {
  const rows = board.rows;
  if (rows.length < 100 || rows.length > 4000) return `row count ${rows.length} outside 100..4000`;
  const known = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (!known.has(r.slug)) return `slug ${r.slug} not in snapshot`;
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) return `rank sequence broken at index ${i}`;
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      return `implied value rises at rank ${rows[i].rank}`;
    }
  }
  for (const slug of snap.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} missing from board`;
  }
  for (const r of rows) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `farm_steps count off for ${r.slug}`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `farm step length ${t.length} for ${r.slug}`;
    }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `implied value invalid for ${r.slug}`;
    }
  }
  if (rows.length > 0 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd)) {
    return 'all implied values are identical';
  }
  return null;
}
