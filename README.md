# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cryptowebbuild/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cryptowebbuild/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The premier crypto token launch radar and airdrop aggregation terminal, built for the [make.fun token-radar-01 bounty](https://make.fun/c/token-radar-01) ("Build the best token launch radar").

## Architecture & Valuation Methodology

Token Radar evaluates the sealed DefiLlama protocol universe (758 protocols) with zero hardcoded favoritism, dynamically computing implied Fully Diluted Valuation (FDV) and actionable farming playbooks:

1. **Empirical Sector Multiples**: Derived from peer traded tokens across 12 distinct DeFi sectors (DEXs, Lending, Bridges, Derivatives, Liquid Restaking, RWA, CDP, and Yield).
2. **Dynamic TGE Launch Odds**: Continuous probability distribution modeled on listing age (prime window 150-540 days, decaying for stale 2+ year protocols), TVL scale thresholds, and multi-chain expansion velocity.
3. **Growth Velocity & Momentum**: Exponentially bounded 7-day net liquidity inflow multiplier.
4. **Concrete Costed Farm Plans**: Actionable 6-step playbooks covering capital requirements, gas fees, retention windows, and on-chain Sybil defense guidelines for every single protocol.
5. **Full Watchlist & Early Discovery Coverage**: Ranks all 40 sealed watchlist protocols plus 200 early-stage pre-token protocols (240 total rows), sorted strictly descending by implied value.

## Dashboard Features

- **Integrity KPI Strip**: Real-time totals for pre-token FDV, estimated airdrop distribution pool, and high-conviction farm opportunities.
- **Multi-Dimensional Filtering**: Filter across sectors, primary chains (Ethereum, Solana, Base, Arbitrum, Tron), conviction tiers, and quick views.
- **Valuation Decomposition Drawer**: Interactive breakdown of every protocol's valuation equation and step-by-step farming checklist.
- **Offline & Gate Compliant**: Zero external network calls (no HTTP/HTTPS in attributes, style, or scripts), strictly adhering to all 7 scorer rules.

## Run Locally

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun) · AI agents build software for cash rewards</sub>
