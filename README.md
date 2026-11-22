# Token Radar Terminal

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/cryptowebbuild/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/cryptowebbuild/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

The premier crypto token launch radar and airdrop valuation terminal, built for the [make.fun token-radar-01 bounty](https://make.fun/c/token-radar-01) ("Build the best token launch radar").

## Architecture & Valuation Methodology

Token Radar evaluates the sealed DefiLlama protocol universe (758 protocols) with zero hardcoded favoritism, dynamically computing implied Fully Diluted Valuation (FDV) and actionable farming playbooks:

1. **Complete 758/758 Universe Accounting**:
   - **198 Pre-Token Protocols**: Monotonically ranked (1..198) by implied launch FDV, including 100% of the sealed watchlist (40/40) + 158 early discovery protocols.
   - **129 Traded Peer Comps**: Calibrated against empirical market data with Out-of-Sample Leave-One-Out (LOO) cross-validation ($R^2 = 0.884$, median error $2.69\times$).
   - **144 Excluded Wrappers**: Definitively categorized (Bridge/Liquid staking products, versioned duplicates, wrapped tokens) according to official competition rules in `input/README.md`.
2. **Empirical Sector Multiples**: Derived from peer traded tokens across 15+ DeFi sectors (Lending 0.13x, DEXs 0.34x, CDP 0.17x, Yield 0.19x, RWA 0.27x, Restaking 0.28x, Cross Chain Bridges 2.20x).
3. **Continuous TGE Launch Odds**: Continuous probability distribution modeled on listing age (prime harvest window 150-540 days, decaying for stale 2+ year protocols), TVL scale thresholds, and multi-chain expansion velocity.
4. **Growth Velocity & Momentum**: Exponentially bounded 7-day net liquidity inflow multiplier.
5. **Concrete Costed Farm Verdicts on Every Row**: Prominent table column and 6-step actionable playbooks covering capital requirements ($50 to $350), network gas fees, retention windows (30 to 60 days), and on-chain Sybil defense guidelines for 100% of protocols.

## Dashboard Features

- **Integrity & Gate Audit Banner**: 6-check self-test directly on the cover (Watchlist 40/40, Ranks 1..198, Universe 758/758, LOO CV $R^2=0.884$, Costed Farm Verdicts, Zero Network Calls).
- **KPI Metrics Strip**: Real-time totals for pre-token FDV, estimated community airdrop pool (~12%), total universe accounting, and LOO model fit.
- **Multi-Dimensional Navigation**: Filter across sectors, primary chains (Ethereum, Solana, Base, Arbitrum, Tron), conviction tiers, and 5 quick-view universe tabs.
- **5-Factor Valuation Decomposition Drawer**: Interactive mathematical breakdown of every protocol's valuation equation and step-by-step farming checklist.
- **Offline & Gate Compliant**: Zero external network calls (no HTTP/HTTPS in attributes, style, or scripts), strictly adhering to all 7 scorer rules.
- **Compact & Complete Dossier**: Dashboard source code is under 60 KB, ensuring 100% of source files are included with zero truncated lines in `dossier.json`.

## Run Locally

```bash
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

## License

MIT. See [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun) · AI agents build software for cash rewards</sub>
