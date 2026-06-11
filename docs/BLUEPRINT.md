# GIWA FlowLab - MVP Blueprint v0.2

## 1. Project Identity

GIWA FlowLab is a testnet DeFi Arcade and mock liquidity playground for GIWA Sepolia.

Tagline: DeFi Arcade, not a casino.

The dApp gives GIWA Sepolia users a place to deposit native ETH, receive mock balances, play arcade actions, use simulated DeFi features, and compete on a weekly activity leaderboard.

---

## 2. Core Principle

GIWA FlowLab has two separate economies:

1. Native GIWA Sepolia ETH
2. Mock Lab Balances

Native ETH is real testnet native asset. It is used for vault deposits, withdrawals, protocol fees, weekly rewards, treasury, sponsor reserve, and emergency reserve.

Mock Lab Balances are internal account-bound balances:

- mGIWA
- mUSD
- mBTC

Mock balances are used for arcade, swap, liquidity, mock APR, quests, and weekly points.

Mock balances cannot be redeemed for native ETH.

Native user principal must never be used to pay arcade rewards, liquidity APR, quest rewards, or mock rewards.

---

## 3. Native ETH Buckets

The contract must track native ETH using explicit accounting buckets.

Main buckets:

- totalUserDeposits
- weeklyFeePool
- sponsorWeeklyReserve
- treasuryPool
- emergencyReserve
- pendingNativeRewards

Required invariant:

contractBalance must always be greater than or equal to:

totalUserDeposits
+ weeklyFeePool
+ sponsorWeeklyReserve
+ treasuryPool
+ emergencyReserve
+ pendingNativeRewards

Owner withdrawals must only use treasury or reserve buckets.

Owner must never withdraw user principal.

---

## 4. Vault and Deposit Fee

Users deposit native GIWA Sepolia ETH into the vault.

Recommended fee:

- Deposit fee: 1%
- Withdraw fee: 0%

Example:

User deposits 0.001 ETH.

- Fee: 0.00001 ETH
- Net withdrawable balance: 0.00099 ETH
- Mock reward: 1,000 mGIWA

Fee split:

- 70% to weeklyFeePool
- 20% to treasuryPool
- 10% to emergencyReserve

Mock reward is based on gross deposit.

Withdrawable native balance is based on net deposit after fee.

---

## 5. Mock Conversion

Recommended conversion:

1 ETH = 1,000,000 mGIWA

Examples:

- 0.0001 ETH = 100 mGIWA
- 0.001 ETH = 1,000 mGIWA
- 0.005 ETH = 5,000 mGIWA
- 0.01 ETH = 10,000 mGIWA

Deposit reward is minted from gross deposit amount.

Native withdrawable balance is calculated from net deposit after fee.

To prevent deposit-withdraw farming, the contract should track:

- lifetimeNativeDeposited
- depositRewardMinted
- nativeDeposits

Users should not be able to mint unlimited mGIWA by repeatedly depositing and withdrawing.

---

## 6. Owner Bootstrap Funding

Owner may fund reserve buckets manually.

Suggested bootstrap target:

- 3 ETH to emergencyReserve
- 3 ETH to sponsorWeeklyReserve

Sponsor reserve should not be distributed all at once.

Use controlled weekly drip.

Recommended early settings:

- Max sponsor drip per week: 0.03 ETH
- Early hard weekly cap: 0.05 ETH

Sponsor reserve is used only to support weekly native rewards when organic fees are low.

Emergency reserve is used only for abnormal cases or manual safety support.

Emergency reserve should not automatically pay weekly rewards.

---

## 7. Mock Lab Balances

Mock assets:

- mGIWA
- mUSD
- mBTC

These are internal account-bound balances.

They are not ERC20 tokens in MVP.

Users cannot freely transfer mock balances between wallets.

Mock balances cannot be redeemed for native ETH.

User-facing labels should use:

- Lab Balance
- In-App Balance
- Mock Balance

This avoids confusion because users cannot import these balances into MetaMask.

Mock balances are used for:

- arcade actions
- fixed-rate mock swap
- simulated liquidity
- mock APR rewards
- quests
- weekly points activity

---

## 8. Arcade MVP

MVP arcade includes only two games:

- Scratch Cards
- Wheel

Arcade rewards are mock-only.

Arcade rewards must never use native ETH.

Arcade randomness only affects mock reward results.

Leaderboard points must be deterministic.

This means users always receive fixed points for valid actions, while random results only change mock reward outcomes.

This avoids native reward manipulation from randomness.

---

## 9. Scratch Cards

Scratch Cards are mock-only arcade actions.

Recommended settings:

- Cost: 50 mGIWA
- Points: 8 points per valid scratch
- Daily point cap: 5 scratches per day
- Reward: mock-only

Recommended function:

scratchBatch(uint8 count)

Batch limit:

count must be less than or equal to 10.

Scratch actions after the daily point cap can still run, but they should not add leaderboard points.

Scratch rewards may include:

- mGIWA
- mUSD
- tiny mBTC dust
- bonus mock reward
- empty or low reward

Scratch randomness must not affect native rewards.

---

## 10. Wheel

Wheel is a mock-only arcade action.

Recommended settings:

- Free spin: 1 per daily login
- Extra spin cost: 25 mGIWA
- Points: 5 points per valid spin
- Daily point cap: 3 spins per day
- Reward: mock-only

Recommended function:

dailyLoginAndSpin()

This combines daily login and one free wheel spin in a single transaction.

Extra wheel spins may be available after daily login.

Wheel rewards may include:

- mGIWA
- mUSD
- tiny mBTC dust
- bonus mock reward
- empty or low reward

Wheel randomness must not affect leaderboard points.

Leaderboard points must remain deterministic.

---

## 11. Fixed-Rate Mock Swap

MVP uses fixed-rate swap.

It does not use AMM x*y=k math.

Recommended mock prices:

- 1 mGIWA = 1 mUSD
- 1 mBTC = 100,000 mUSD

Swap fee:

- 1% mock burn fee

Example:

User swaps 100 mGIWA.

- User receives 99 mUSD
- 1 mGIWA is burned as mock fee

No native ETH fee is charged for mock swaps.

The swap module gives mock assets utility without risking native ETH.

Fixed-rate swap is preferred for MVP because mGIWA is minted from deposits, daily login, arcade rewards, and quests.

Using real AMM math could cause mock price depeg and bad UX.

---

## 12. Simulated Liquidity

Supported pairs:

- mGIWA / mUSD
- mGIWA / mBTC
- mUSD / mBTC

Liquidity is simulated.

It is not a real AMM.

Users add mock balances and receive a liquidity position.

Liquidity positions may be represented as:

- internal position mapping
- optional receipt NFT in later version

For MVP, the UI should call it:

Your Liquidity Position

Do not make NFT a main feature.

Show liquidity positions inside Portfolio.

Liquidity APR is mock-only and paid in mGIWA.

Recommended APR:

- mGIWA / mUSD = 24% Mock APR
- mGIWA / mBTC = 36% Mock APR
- mUSD / mBTC = 18% Mock APR

Native ETH must never be used for liquidity APR.

---

## 13. Liquidity Safety Rules

Liquidity must have strict caps.

Recommended rules:

- Minimum LP position value: 100 mUSD
- Max LP value per wallet per pool: 5,000 mUSD
- Max active positions per wallet: 5

Weekly emission caps:

- mGIWA/mUSD = 10,000 mGIWA per week
- mGIWA/mBTC = 15,000 mGIWA per week
- mUSD/mBTC = 8,000 mGIWA per week

Before changing any liquidity position, the contract must settle pending APR first.

Required flow:

1. calculate pending APR
2. credit pending mGIWA reward
3. update position value
4. update timestamp

This prevents lost rewards and incorrect reward accounting during top-up or remove actions.

Remove liquidity gives 0 leaderboard points.

Add liquidity points must be capped weekly.

This prevents add-remove-add farming.

---

## 14. Quest Board

Quest Board guides user behavior across the dApp.

Quest rewards are mock-only plus capped leaderboard points.

Quest rewards must never use native ETH.

Quest Board should help users try:

- deposit
- daily login
- scratch card
- wheel
- swap
- liquidity
- APR claim

Quests should auto-complete inside normal action functions when possible.

Example:

swap()
- performs mock swap
- adds swap points if under cap
- marks swap activity category
- completes First Swap quest if not completed

This avoids extra gas from manual quest claiming.

---

## 15. Quest List

One-time quests:

- First Deposit
- First Daily Login
- First Scratch Card
- First Wheel Spin
- First Swap
- First Liquidity Position
- First APR Claim

Weekly quests:

- Daily Login 3 times
- Play 5 Scratch Cards
- Spin Wheel 3 times
- Make 3 Swaps
- Add Liquidity once
- Claim APR once

Quest rewards may include:

- mGIWA
- mUSD
- tiny mBTC dust
- capped weekly points
- badge or UI status

Quest rewards are mock-only.

No quest should directly pay native ETH.

---

## 16. Weekly Leaderboard

Weekly native rewards use activity leaderboard.

The system does not use lottery for native rewards.

Top 3 split:

- Rank 1: 50%
- Rank 2: 30%
- Rank 3: 20%

Native reward source:

- weeklyFeePool
- capped sponsor drip

Native reward must never come from user principal.

Rewards are credited as pending native rewards.

Users claim manually.

Use pull payment instead of automatic transfer during finalization.

This avoids failed payout problems and improves safety.

---

## 17. Weekly Points

Recommended scoring:

- Daily Login: 10 points per day
- Scratch Card: 8 points per card, max 5 counted per day
- Wheel Spin: 5 points per spin, max 3 counted per day
- Swap: 10 points per day max
- Add Liquidity: 25 points per week max
- Claim APR: 10 points per week max
- Active Deposit: 20 points per week
- Quest Bonus: 50 points per week max

Extra actions may still run after caps.

However, extra actions should not increase leaderboard points after caps.

Leaderboard points must be deterministic.

Randomness from Scratch or Wheel must not change leaderboard points.

---

## 18. Native Prize Eligibility

To qualify for weekly native Top 3 rewards, a user must meet all requirements:

- active native deposit >= 0.0005 ETH
- deposit maturity >= 72 hours before round end
- at least 2 activity categories during the round

Activity categories:

- deposit
- daily
- arcade
- swap
- liquidity
- apr
- quest

This prevents simple Sybil farming and Sunday Sniper attacks.

Sunday Sniper means a user deposits near the end of the week, performs quick actions, wins native reward, then withdraws immediately.

Users who are not eligible can still use the dApp.

They can still:

- deposit
- swap
- play arcade
- add liquidity
- claim mock APR
- earn mock rewards
- earn weekly points

But they cannot receive native Top 3 payout until their deposit is mature.

---

## 19. Deposit Maturity Tracking

Use eligibleSince to track when a user first becomes eligible by deposit size.

Recommended variable:

eligibleSince[user]

Logic:

If nativeDeposits[user] crosses >= 0.0005 ETH:
- eligibleSince[user] = current timestamp

If user tops up while already above threshold:
- eligibleSince remains unchanged

If user withdraws and balance drops below 0.0005 ETH:
- eligibleSince[user] = 0

If user later crosses threshold again:
- eligibleSince[user] = new timestamp

Deposit maturity only affects native reward eligibility.

It does not block normal dApp usage.

Users can play immediately, but native rewards require commitment.

---

## 20. Tie-Breaker

If multiple users have the same weekly points, use this tie-breaker order:

1. Higher weekly points
2. Earlier timestamp reaching the score
3. Larger active native deposit
4. Deterministic hash fallback

Earlier timestamp means the user who reached the final score first ranks higher.

Larger active native deposit is only used if points and timestamp are tied.

Deterministic hash fallback is only used as the final fallback.

One wallet can only receive one native prize slot per round.

Tie-breaker must be deterministic and verifiable on-chain.

---

## 21. Weekly Finalization

No always-on Termux or backend should be required.

Use lazy permissionless finalization.

Flow:

1. Weekly round ends
2. Anyone can call finalizeWeekly()
3. Contract checks timestamp guard
4. Top 3 winners are read from stored leaderboard
5. Native rewards are credited as pending rewards
6. New round starts

Major user actions may call internal rollover:

_rolloverIfNeeded()

If the round has ended, the contract finalizes the previous round before processing new activity.

Finalization must not loop through all users.

Top 3 must be maintained in real time when points are updated.

Native rewards should not be pushed automatically.

Use pending reward accounting:

pendingNativeRewards[user] += amount

Winner later calls:

claimWeeklyReward()

This pull-payment design is safer than sending native ETH during finalization.

---

## 22. On-Chain Lite + Off-Chain UI

GIWA FlowLab uses an On-Chain Lite + Off-Chain UI model.

On-chain state:

- vault balances
- native buckets
- mock balances
- arcade costs and rewards
- weekly points
- quest completion
- activity category mask
- leaderboard Top 3
- liquidity positions
- native reward accounting

Off-chain UI:

- animations
- scratch reveal effects
- wheel spin visual
- event indexing
- activity feed
- leaderboard display

Principle:

Animate off-chain.
Account on-chain.

This keeps the dApp gas-efficient while still producing meaningful on-chain activity.

---

## 23. Solidity Architecture Notes

MVP starts with one main contract:

GIWAFlowLab.sol

Use custom errors instead of long revert strings.

Use storage packing where possible:

- uint64 for timestamps
- uint128 for smaller amounts where safe
- uint8 for flags and activity categories
- bool only when needed

Avoid heavy external libraries unless necessary.

Watch EIP-170 bytecode size limit.

If bytecode becomes too large, split modules in V2.

For MVP, one contract is easier to deploy, verify, test, and explain.

---

## 24. Security Rules

Required protections:

- nonReentrant for native ETH transfer functions
- pull payment for native rewards
- pause controls for risky modules
- no owner withdrawal of user principal
- no mock-to-native redemption
- caps on batch actions
- caps on points
- caps on LP value
- caps on sponsor drip
- permissionless finalize with timestamp guard

Pause strategy:

- deposits can be paused
- arcade can be paused
- swap can be paused
- liquidity can be paused
- quests can be paused
- weekly finalization can be paused if needed

User principal withdrawal should remain available unless there is a critical emergency.

---

## 25. UI Layout

Top bar:

- GIWA FlowLab
- Daily Login
- Connect Wallet
- Hamburger Menu

Main menu:

- Home
- Vault
- Swap
- Liquidity
- Portfolio
- Arcade
- Quests
- Leaderboard
- Activity
- Docs

Do not create a separate NFT tab.

If liquidity receipt NFT or internal position exists, show it inside Portfolio.

Use label:

Your Liquidity Positions

The UI should clearly separate:

- Native ETH vault balance
- Mock Lab Balances
- Weekly points
- Pending native rewards
- Liquidity positions

---

## 26. MVP Modules

Main MVP modules:

1. Ownership and admin
2. Native vault
3. Native accounting buckets
4. Mock internal balances
5. Deposit reward minting
6. Fixed-rate mock swap
7. Scratch Cards
8. Wheel
9. Simulated liquidity and mock APR
10. Quest Board
11. Weekly leaderboard
12. Weekly finalization
13. Reward claiming
14. Pause controls

The first Solidity version should focus on data structure first:

- constants
- structs
- mappings
- events
- custom errors
- modifiers
- internal accounting helpers

Feature functions can be added step by step after skeleton is stable.

---

## 27. Final Safety Summary

GIWA FlowLab is safe if these rules are enforced:

- native principal is separated from fees and rewards
- mock balances cannot redeem native ETH
- arcade rewards are mock-only
- liquidity APR is mock-only
- weekly native rewards come only from fee pool and sponsor drip
- leaderboard has caps and eligibility
- mock balances are account-bound
- Top 3 is maintained on-chain without looping all users
- finalization is permissionless and lazy
- rewards use pull payment
- deposit maturity blocks Sunday Snipers

Final principle:

Vault protects native ETH.
Arcade creates daily engagement.
Swap gives mock assets utility.
Liquidity creates DeFi feel.
Quests guide user behavior.
Leaderboard converts healthy activity into capped native rewards.

Tagline:

DeFi Arcade, not a casino.
