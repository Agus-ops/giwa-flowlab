# GIWA FlowLab

GIWA FlowLab is a testnet DeFi Arcade and mock liquidity playground for GIWA Sepolia.

> DeFi Arcade, not a casino.

## Overview

GIWA FlowLab lets users deposit native GIWA Sepolia ETH, receive mock balances, use Scratch Cards and Wheel, swap mock assets, provide simulated liquidity, complete quests, and compete on a weekly Top 3 activity leaderboard.

## Core Features

- Native ETH vault
- Account-bound mock balances: mGIWA, mUSD, mBTC
- Scratch Cards
- Wheel
- Fixed-rate mock swap
- Simulated liquidity and mock APR
- Quest Board
- Weekly Top 3 leaderboard
- Lazy permissionless weekly finalization
- Pull-based native reward claims
- Anti-Sunday-Sniper deposit maturity

## Network

- Network: GIWA Sepolia
- Chain ID: 91342
- Native token: ETH
- RPC: https://sepolia-rpc.giwa.io
- Explorer: https://sepolia-explorer.giwa.io

## Documentation

- MVP Blueprint v0.2: `docs/BLUEPRINT.md`

## Status

MVP contract deployed on GIWA Sepolia. Initial on-chain smoke tests completed successfully.

## License

MIT

## Deployment

GIWAFlowLab has been deployed on GIWA Sepolia.

- Contract: `0x5574e233DC3a80634941Be43dB185AEF38266612`
- Deploy tx: `0x17205b8f163b3d0c0fe9308f9101326b3f71d515b0cc4052000ec35b6c52aab8`
- Deployer: `0xD2F9f6381Fb5f00c2fC606553592dB28309c019d`
- Network: GIWA Sepolia
- Chain ID: `91342`

## Initial Smoke Test

Initial on-chain smoke tests completed successfully:

- `depositNative`
- `dailyLoginAndSpin`
- `scratchBatch`
- `swapMock`
- `addLiquidity`
- `claimApr`
- `removeLiquidity`
- status/read helpers

Current MVP contract includes:

- native ETH vault
- account-bound mock balances
- Scratch Cards
- Wheel
- fixed-rate mock swap
- simulated liquidity and mock APR
- Quest Board
- weekly Top 3 leaderboard
- lazy permissionless finalization
- pull-based native reward claims
- 72-hour deposit maturity anti-Sunday-Sniper rule

## Contract Verification Note

The deployed GIWA FlowLab contract source code was checked locally against the on-chain deployed runtime bytecode.

- Contract: `0x5574e233DC3a80634941Be43dB185AEF38266612`
- Explorer: `https://sepolia-explorer.giwa.io/address/0x5574e233DC3a80634941Be43dB185AEF38266612`
- Compiler: `v0.8.35+commit.47b9dedd`
- Optimizer: enabled, 200 runs
- EVM version from metadata: `osaka`
- Local runtime bytes: `20605`
- Chain runtime bytes: `20605`
- Result: local compiled runtime bytecode exactly matches the deployed on-chain runtime bytecode.

GIWA Sepolia explorer verification API currently returns `Fail - Unable to verify` for this contract, even though the bytecode match check passes. This may be related to explorer verifier support for newer Solidity/EVM metadata.
