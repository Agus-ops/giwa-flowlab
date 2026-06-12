# GIWA FlowLab

**GIWA FlowLab** is a live GIWA Sepolia builder demo: a DeFi Arcade, not a casino.

It combines a native testnet vault, account-bound mock assets, daily arcade loops, decimal-aware mock swaps, simulated liquidity, APR tracking, and a weekly leaderboard reward flow.

## Live Links

- Live app: https://agus-ops.github.io/giwa-flowlab/
- Repository: https://github.com/Agus-ops/giwa-flowlab
- GIWA Sepolia RPC: https://sepolia-rpc.giwa.io
- GIWA Sepolia Explorer: https://sepolia-explorer.giwa.io

## Active Deployment

### GIWA FlowLab V2

V2 is the active contract used by the current frontend.

- Network: GIWA Sepolia
- Chain ID: `91342`
- Contract: `GIWAFlowLabV2`
- Address: `0x735E91dA8687eb583D252c33da4396f4b287a949`
- Deploy tx: `0xc3d43a35ad37823290a162e95dc2e4ec3ce69dd7bad400143cad43ffbc0be2a0`
- Deployer: `0xD2F9f6381Fb5f00c2fC606553592dB28309c019d`
- Deployment metadata: `artifacts/deployment_v2.json`

## Version History

### V1 — Archived MVP

V1 was the first deployed MVP and remains part of the project history.

- Contract: `GIWAFlowLab`
- Address: `0x5574e233DC3a80634941Be43dB185AEF38266612`
- Deploy tx: `0x17205b8f163b3d0c0fe9308f9101326b3f71d515b0cc4052000ec35b6c52aab8`
- Status: archived initial builder footprint
- Notes: V1 used whole-unit mock accounting, which made very small mBTC outputs round down to `0`.

### V2 — Active Decimal-Aware Engine

V2 improves the mock asset accounting model so the UI and contract can represent small decimal values cleanly.

Mock asset decimals:

| Asset | Decimals | Notes |
|---|---:|---|
| mGIWA | 18 | Account-bound mock asset |
| mUSD | 18 | Account-bound mock stable asset |
| mBTC | 8 | Account-bound mock BTC-like asset |

Fixed-rate model:

| Pair | Rate |
|---|---|
| 1 mGIWA | 1 mUSD |
| 1 mBTC | 100,000 mUSD |
| Swap fee | 1% mock burn fee |

Examples:

| Input | Output after 1% fee |
|---|---|
| 100 mGIWA → mBTC | 0.00099 mBTC |
| 13 mGIWA → mBTC | 0.0001287 mBTC |
| 0.0001 mBTC → mGIWA | 9.9 mGIWA |
| 0.000001 mBTC → mUSD | 0.099 mUSD |

## Core Modules

### Native Vault

Users can deposit GIWA Sepolia native ETH into the vault. Deposits are real native testnet funds held by the contract.

Deposit fee split:

| Share | Destination |
|---:|---|
| 70% | Weekly fee pool |
| 20% | Treasury pool |
| 10% | Emergency reserve |

Vault rules:

- Minimum active deposit for native reward eligibility: `0.0005 ETH`
- Required maturity window: `72 hours` before round end
- Deposit reward minting: `1 ETH = 1,000,000 mGIWA`
- V2 mGIWA rewards are stored using 18 decimals

### Arcade

Arcade actions are mock-only and account-bound.

Features:

- Daily Login
- Free daily wheel spin
- Extra wheel spin
- Scratch cards
- Weekly activity points

Arcade costs and rewards use V2 mGIWA decimals:

- Daily login reward: `25 mGIWA`
- Extra spin cost: `25 mGIWA`
- Scratch cost: `50 mGIWA` per card

### Swap

The V2 swap engine supports decimal-aware mock swaps between:

- mGIWA
- mUSD
- mBTC

Quotes are read live from the contract through `quoteMockSwap`.

The frontend supports decimal inputs such as:

```text
13 mGIWA
0.0001 mBTC
0.000001 mBTC
```

### Simulated Liquidity

Users can create simulated LP positions using account-bound mock assets.

Supported pairs:

| Pair | APR |
|---|---:|
| mGIWA / mUSD | 24% |
| mGIWA / mBTC | 36% |
| mUSD / mBTC | 18% |

Liquidity notes:

- Minimum LP value: `100 mUSD-equivalent`
- LP position IDs come from on-chain `getUserPositions`
- APR is claimable as mock mGIWA
- Positions can be removed from the UI using their on-chain position ID

### Weekly Leaderboard

The leaderboard tracks weekly points from multiple activity categories:

- Deposit
- Daily login
- Arcade
- Swap
- Liquidity
- APR claim
- Quests

Top 3 wallets can receive native rewards from the weekly pool after finalization, subject to eligibility rules.

## Frontend

The frontend is built with:

- Vite
- React
- RainbowKit
- Wagmi
- Viem
- TanStack Query
- GitHub Pages

Current frontend contract config is generated into:

```text
src/contract.js
```

V2 export script:

```bash
node scripts/export_frontend_contract_v2.mjs
```

## Scripts

Compile V1:

```bash
node scripts/compile.mjs
```

Deploy V1:

```bash
node scripts/deploy.mjs
```

Export V1 frontend contract config:

```bash
node scripts/export_frontend_contract.mjs
```

Compile V2:

```bash
node scripts/compile_v2.mjs
```

Deploy V2:

```bash
node scripts/deploy_v2.mjs
```

Export V2 frontend contract config:

```bash
node scripts/export_frontend_contract_v2.mjs
```

Build frontend:

```bash
npm run build
```

## Verification Notes

The project keeps reproducible source, scripts, and deployment metadata in the public repository.

Current verification status:

- V1 runtime bytecode exact-match proof was documented previously.
- V2 source and deployment metadata are included in this repository.
- Explorer verifier support may be unreliable for this deployment flow, so the repository is kept as the primary reproducibility record.

Compiler settings used for V2:

| Setting | Value |
|---|---|
| Compiler | solc `0.8.35` |
| Optimizer | enabled |
| Runs | `200` |
| EVM version | `osaka` |

## Security and Scope

GIWA FlowLab is a testnet builder demo.

- Mock assets are account-bound internal balances.
- Mock assets are not ERC20 tokens.
- Arcade rewards are not real-money rewards.
- The app is designed for GIWA Sepolia activity, UX demonstration, and builder footprint.
- Do not deposit mainnet assets.
- Do not treat mock balances as real assets.

## Project Status

Current status:

- V2 contract deployed
- Frontend switched to V2
- Decimal-aware mBTC swaps working
- Vault, Arcade, Swap, Liquidity, Leaderboard, and Docs pages polished
- GitHub Pages live

## Bootstrap Funding

GIWA FlowLab V2 has been bootstrapped with owner-funded native reserves for early testnet operations.

| Bucket | Amount | Purpose |
|---|---:|---|
| Emergency Reserve | 3 ETH | Safety buffer isolated from weekly reward spending |
| Sponsor Weekly Reserve | 3 ETH | Weekly leaderboard subsidy released through sponsor drip |
| Sponsor Drip Cap | 0.03 ETH / week | Prevents the sponsor reserve from being drained in one round |

Funding transactions:

- Emergency Reserve: `0xe7254db1dba331039ba9f230f54c2cbbbf0c612b67b59de92344af621755b5e8`
- Sponsor Weekly Reserve: `0x11934002d4279eefa50d8fe52c9adcb2df10cd4568cacc13a06d2580f25b4792`

