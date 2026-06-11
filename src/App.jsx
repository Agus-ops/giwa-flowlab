import { useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import { CONTRACT_ABI, CONTRACT_ADDRESS, GIWA_SEPOLIA } from "./contract.js";

const ASSETS = [
  { id: 0, label: "mGIWA" },
  { id: 1, label: "mUSD" },
  { id: 2, label: "mBTC" },
];

const PAIRS = [
  { id: 0, label: "mGIWA / mUSD" },
  { id: 1, label: "mGIWA / mBTC" },
  { id: 2, label: "mUSD / mBTC" },
];

function clean(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/^\d+$/.test(key))
        .map(([key, val]) => [key, clean(val)])
    );
  }
  return value;
}

function asText(value) {
  if (value === undefined) return "Loading...";
  try {
    return JSON.stringify(clean(value), null, 2);
  } catch {
    return String(value);
  }
}

function toWhole(value) {
  const v = String(value).trim();
  if (!/^\d+$/.test(v)) throw new Error("Use a whole number amount.");
  return BigInt(v);
}

function short(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isZeroAddress(addr) {
  return !addr || /^0x0{40}$/i.test(addr);
}

function formatWeiText(value) {
  try {
    return `${formatEther(BigInt(value || 0))} ETH`;
  } catch {
    return "0 ETH";
  }
}

function formatMock(value, symbol = "") {
  try {
    return `${BigInt(value || 0).toString()}${symbol ? ` ${symbol}` : ""}`;
  } catch {
    return `0${symbol ? ` ${symbol}` : ""}`;
  }
}

function formatTimestamp(value) {
  try {
    const n = Number(value || 0);
    if (!n) return "Not eligible yet";
    return new Date(n * 1000).toLocaleString();
  } catch {
    return "Not eligible yet";
  }
}

function parseNativeAccount(value) {
  const v = clean(value);
  if (!v) return null;

  return {
    activeDeposit: v.activeDeposit ?? v[0] ?? "0",
    lifetimeDeposited: v.lifetimeDeposited ?? v[1] ?? "0",
    depositRewardMinted: v.depositRewardMinted ?? v[2] ?? "0",
    eligibleSince: v.eligibleSince ?? v[3] ?? "0",
    pendingWithdrawal: v.pendingWithdrawal ?? v[4] ?? "0",
  };
}

function dailyCompleted(value) {
  const v = clean(value);
  if (!v) return false;

  if (typeof v.dailyLoginDone === "boolean") return v.dailyLoginDone;
  if (typeof v.loginDone === "boolean") return v.loginDone;
  if (typeof v.done === "boolean") return v.done;

  if (Array.isArray(v)) {
    const bools = v.filter((x) => typeof x === "boolean");
    if (bools.length) return bools[0];
  }

  return false;
}

function friendlyWriteError(err, label) {
  const msg = String(err?.shortMessage || err?.message || err || "");

  if (/user rejected|rejected request/i.test(msg)) {
    return `${label} cancelled by wallet.`;
  }

  if (/daily|already|done|claimed|completed/i.test(msg)) {
    return `${label} is already completed for this period.`;
  }

  if (/insufficient funds|exceeds balance/i.test(msg)) {
    return `Not enough balance for ${label}.`;
  }

  if (/network|fetch|timeout/i.test(msg)) {
    return `Wallet or RPC network error while submitting ${label}. Please refresh and try again.`;
  }

  return `${label} failed: ${msg}`;
}

function Card({ title, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function ActionButton({ children, onClick, disabled }) {
  return (
    <button className="action-btn" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export default function App({ ConnectButton }) {
  const [page, setPage] = useState("home");
  const [depositAmount, setDepositAmount] = useState("0.0001");
  const [withdrawAmount, setWithdrawAmount] = useState("0.00001");
  const [scratchCount, setScratchCount] = useState("1");
  const [swapFrom, setSwapFrom] = useState("0");
  const [swapTo, setSwapTo] = useState("1");
  const [swapAmount, setSwapAmount] = useState("10");
  const [pairId, setPairId] = useState("0");
  const [liqA, setLiqA] = useState("10");
  const [liqB, setLiqB] = useState("10");
  const [positionId, setPositionId] = useState("1");
  const [txLog, setTxLog] = useState("");
  const [wheelSpin, setWheelSpin] = useState(false);
  const [scratchReveal, setScratchReveal] = useState(false);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const [lastHash, setLastHash] = useState();

  const wrongChain = isConnected && chainId !== GIWA_SEPOLIA.id;

  const receipt = useWaitForTransactionReceipt({
    hash: lastHash,
  });

  const contractBalance = useBalance({
    address: CONTRACT_ADDRESS,
    chainId: GIWA_SEPOLIA.id,
    query: { refetchInterval: 12_000 },
  });

  const currentRound = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "currentRoundId",
    query: { refetchInterval: 12_000 },
  });

  const top3 = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getCurrentTop3",
    query: { refetchInterval: 12_000 },
  });

  const roundInfo = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getRoundInfo",
    query: { refetchInterval: 12_000 },
  });

  const canFinalize = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "canFinalizeWeekly",
    query: { refetchInterval: 12_000 },
  });

  const mockBalances = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getMockBalances",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const nativeAccount = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getNativeAccount",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const positions = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const pendingReward = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "pendingNativeReward",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const dailyCounter = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getUserDailyCounter",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const isDailyCompleted = useMemo(
    () => dailyCompleted(dailyCounter.data),
    [dailyCounter.data]
  );

  const nativeSummary = useMemo(
    () => parseNativeAccount(nativeAccount.data),
    [nativeAccount.data]
  );

  const quoteAmount = useMemo(() => {
    try {
      return toWhole(swapAmount);
    } catch {
      return null;
    }
  }, [swapAmount]);

  const swapQuote = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "quoteMockSwap",
    args:
      quoteAmount !== null && swapFrom !== swapTo
        ? [Number(swapFrom), Number(swapTo), quoteAmount]
        : undefined,
    query: {
      enabled: quoteAmount !== null && swapFrom !== swapTo,
      refetchInterval: 8_000,
    },
  });

  const leaderboardRows = useMemo(() => {
    const data = clean(top3.data || []);
    if (!Array.isArray(data)) return [];

    return data.map((row, index) => ({
      rank: index + 1,
      user: row.user,
      points: row.points || "0",
      activeDeposit: row.activeDeposit || "0",
      reachedAt: row.reachedAt || "0",
    }));
  }, [top3.data]);

  async function runWrite(label, functionName, args = [], value) {
    try {
      setTxLog(`Submitting ${label}...`);
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName,
        args,
        value,
        chainId: GIWA_SEPOLIA.id,
      });
      setLastHash(hash);
      setTxLog(`${label} submitted: ${hash}`);
    } catch (err) {
      setTxLog(friendlyWriteError(err, label));
    }
  }

  const disabled = !isConnected || wrongChain || isPending || receipt.isLoading;

  const nav = [
    ["home", "Home"],
    ["vault", "Vault"],
    ["arcade", "Arcade"],
    ["swap", "Swap"],
    ["liquidity", "Liquidity"],
    ["leaderboard", "Leaderboard"],
    ["docs", "Docs"],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("home")}>
          <span className="brand-mark">G</span>
          <span>
            <strong>GIWA FlowLab</strong>
            <small>DeFi Arcade, not a casino</small>
          </span>
        </button>

        <div className="wallet-box">
          <ConnectButton />
        </div>
      </header>

      <nav className="nav">
        {nav.map(([id, label]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {wrongChain && (
        <div className="network-warning">
          <strong>Wrong network.</strong> Switch to GIWA Sepolia to use the app.
          <button onClick={() => switchChain({ chainId: GIWA_SEPOLIA.id })}>
            Switch Network
          </button>
        </div>
      )}

      <main>
        {page === "home" && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">GIWA Sepolia Builder Demo</p>
                <h1>Native vault deposits, mock assets, quests, arcade actions, simulated LP, and weekly rewards.</h1>
                <p>
                  GIWA FlowLab is a public testnet dApp designed to show real on-chain interaction depth without pretending to be a real-money casino or production DeFi protocol.
                </p>
                <div className="hero-actions">
                  <button onClick={() => setPage("vault")}>Open Vault</button>
                  <button className="secondary" onClick={() => setPage("arcade")}>Daily Login</button>
                </div>
              </div>
              <div className="hero-panel">
                <span>Contract</span>
                <code>{CONTRACT_ADDRESS}</code>
                <a
                  href={`https://sepolia-explorer.giwa.io/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on GIWA Explorer →
                </a>
              </div>
            </section>

            <section className="grid three">
              <Card title="Contract Native Balance">
                <div className="big-number">
                  {contractBalance.data ? formatEther(contractBalance.data.value) : "0"} ETH
                </div>
              </Card>
              <Card title="Current Round">
                <div className="big-number">{currentRound.data?.toString() || "-"}</div>
              </Card>
              <Card title="Connected Wallet">
                <div className="big-number small">{short(address)}</div>
              </Card>
            </section>

            <section className="grid three">
              <Card title="mGIWA">
                <div className="big-number">{mockBalances.data?.[0]?.toString() || "0"}</div>
              </Card>
              <Card title="mUSD">
                <div className="big-number">{mockBalances.data?.[1]?.toString() || "0"}</div>
              </Card>
              <Card title="mBTC">
                <div className="big-number">{mockBalances.data?.[2]?.toString() || "0"}</div>
              </Card>
            </section>
          </>
        )}

        {page === "vault" && (
          <section className="grid two">
            <Card title="Native Vault">
              <label>Deposit amount ETH</label>
              <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              <ActionButton
                disabled={disabled}
                onClick={() => runWrite("Deposit Native", "depositNative", [], parseEther(depositAmount))}
              >
                Deposit Native
              </ActionButton>

              <label>Withdraw amount ETH</label>
              <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
              <ActionButton
                disabled={disabled}
                onClick={() => runWrite("Withdraw Native", "withdrawNative", [parseEther(withdrawAmount)])}
              >
                Withdraw Native
              </ActionButton>

              <p className="hint">
                Deposits mint mock mGIWA and feed the weekly reward pool with the configured fee split.
              </p>
            </Card>

            <Card title="Native Account">
              {nativeSummary ? (
                <div className="account-summary">
                  <div>
                    <span>Active deposit</span>
                    <strong>{formatWeiText(nativeSummary.activeDeposit)}</strong>
                  </div>
                  <div>
                    <span>Lifetime deposited</span>
                    <strong>{formatWeiText(nativeSummary.lifetimeDeposited)}</strong>
                  </div>
                  <div>
                    <span>Deposit reward minted</span>
                    <strong>{formatMock(nativeSummary.depositRewardMinted, "mGIWA")}</strong>
                  </div>
                  <div>
                    <span>Eligibility timer</span>
                    <strong>{formatTimestamp(nativeSummary.eligibleSince)}</strong>
                  </div>
                  <div>
                    <span>Pending withdrawal</span>
                    <strong>{formatWeiText(nativeSummary.pendingWithdrawal)}</strong>
                  </div>
                  <div>
                    <span>Pending native reward</span>
                    <strong>{pendingReward.data ? formatEther(pendingReward.data) : "0"} ETH</strong>
                  </div>
                </div>
              ) : (
                <p className="hint">Connect wallet to view your vault account.</p>
              )}
            </Card>
          </section>
        )}

        {page === "arcade" && (
          <section className="grid two">
            <Card title="Daily + Wheel">
              <div className={`wheel-visual ${wheelSpin ? "spinning" : ""}`}>
                <div className="wheel-center">G</div>
                <span className="wheel-pin">▼</span>
              </div>

              {isDailyCompleted ? (
                <div className="done-banner">
                  <strong>Daily completed today</strong>
                  <span>Come back tomorrow for the next login + spin.</span>
                </div>
              ) : (
                <p className="hint">Daily login is available for this wallet.</p>
              )}

              <ActionButton
                disabled={disabled || isDailyCompleted}
                onClick={async () => {
                  if (isDailyCompleted) {
                    setTxLog("Daily Login + Spin is already completed today.");
                    return;
                  }

                  setWheelSpin(true);
                  await runWrite("Daily Login + Spin", "dailyLoginAndSpin");
                  setTimeout(() => setWheelSpin(false), 1200);
                }}
              >
                {isDailyCompleted ? "Completed Today" : "Daily Login + Spin"}
              </ActionButton>
              <ActionButton
                disabled={disabled}
                onClick={async () => {
                  setWheelSpin(true);
                  await runWrite("Spin Wheel", "spinWheel");
                  setTimeout(() => setWheelSpin(false), 1200);
                }}
              >
                Extra Spin Wheel
              </ActionButton>
              <p className="hint">
                Daily and arcade actions generate weekly points and mock-only rewards.
              </p>

              <details className="mini-details">
                <summary>Daily counter</summary>
                <pre>{asText(dailyCounter.data)}</pre>
              </details>
            </Card>

            <Card title="Scratch Cards">
              <div className={`scratch-visual ${scratchReveal ? "revealed" : ""}`}>
                <span>{scratchReveal ? "Reward revealed" : "Scratch Card"}</span>
                <strong>{scratchReveal ? "+ points / mock rewards" : "████ ████ ████"}</strong>
              </div>

              <label>Scratch count</label>
              <input value={scratchCount} onChange={(e) => setScratchCount(e.target.value)} />
              <ActionButton
                disabled={disabled}
                onClick={async () => {
                  setScratchReveal(true);
                  await runWrite("Scratch Batch", "scratchBatch", [Number(scratchCount)]);
                  setTimeout(() => setScratchReveal(false), 1600);
                }}
              >
                Scratch Batch
              </ActionButton>
            </Card>
          </section>
        )}

        {page === "swap" && (
          <section className="grid two">
            <Card title="Mock Swap">
              <label>From</label>
              <select value={swapFrom} onChange={(e) => setSwapFrom(e.target.value)}>
                {ASSETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>

              <label>To</label>
              <select value={swapTo} onChange={(e) => setSwapTo(e.target.value)}>
                {ASSETS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>

              <label>Amount, whole mock units</label>
              <input value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)} />

              <ActionButton
                disabled={disabled || swapFrom === swapTo}
                onClick={() => runWrite("Mock Swap", "swapMock", [Number(swapFrom), Number(swapTo), toWhole(swapAmount)])}
              >
                Swap Mock
              </ActionButton>
            </Card>

            <Card title="Quote">
              {swapQuote.data ? (
                <div className="quote-box">
                  <div>
                    <span>You receive</span>
                    <strong>{swapQuote.data[0]?.toString()} {ASSETS.find((x) => x.id === Number(swapTo))?.label}</strong>
                  </div>
                  <div>
                    <span>Mock burn fee</span>
                    <strong>{swapQuote.data[1]?.toString()} {ASSETS.find((x) => x.id === Number(swapFrom))?.label}</strong>
                  </div>
                  <p className="hint">
                    Quote format from contract: amount out and mock burn fee.
                  </p>
                </div>
              ) : (
                <p className="hint">Enter a valid mock amount to preview the swap output.</p>
              )}
            </Card>
          </section>
        )}

        {page === "liquidity" && (
          <section className="grid two">
            <Card title="Simulated Liquidity">
              <label>Pair</label>
              <select value={pairId} onChange={(e) => setPairId(e.target.value)}>
                {PAIRS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>

              <label>Amount A</label>
              <input value={liqA} onChange={(e) => setLiqA(e.target.value)} />

              <label>Amount B</label>
              <input value={liqB} onChange={(e) => setLiqB(e.target.value)} />

              <ActionButton
                disabled={disabled}
                onClick={() => runWrite("Add Liquidity", "addLiquidity", [Number(pairId), toWhole(liqA), toWhole(liqB)])}
              >
                Add Liquidity
              </ActionButton>

              <label>Position ID</label>
              <input value={positionId} onChange={(e) => setPositionId(e.target.value)} />

              <div className="button-row">
                <ActionButton disabled={disabled} onClick={() => runWrite("Claim APR", "claimApr", [toWhole(positionId)])}>
                  Claim APR
                </ActionButton>
                <ActionButton disabled={disabled} onClick={() => runWrite("Remove Liquidity", "removeLiquidity", [toWhole(positionId)])}>
                  Remove
                </ActionButton>
              </div>
            </Card>

            <Card title="Your Positions">
              <pre>{asText(positions.data)}</pre>
            </Card>
          </section>
        )}

        {page === "leaderboard" && (
          <section className="grid two">
            <Card title="Weekly Top 3">
              <div className="leaderboard-list">
                {leaderboardRows.map((row) => (
                  <div className="leaderboard-row" key={row.rank}>
                    <span className="rank">#{row.rank}</span>
                    <div>
                      {isZeroAddress(row.user) ? (
                        <strong>Empty slot</strong>
                      ) : (
                        <a
                          href={`https://sepolia-explorer.giwa.io/address/${row.user}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {short(row.user)}
                        </a>
                      )}
                      <small>{formatWeiText(row.activeDeposit)}</small>
                    </div>
                    <strong>{row.points} pts</strong>
                  </div>
                ))}
              </div>
              <p>Can finalize: {String(canFinalize.data || false)}</p>
              <ActionButton
                disabled={!isConnected || wrongChain || isPending || receipt.isLoading}
                onClick={() => runWrite("Finalize Weekly", "finalizeWeekly")}
              >
                Finalize Weekly
              </ActionButton>
              <ActionButton
                disabled={disabled}
                onClick={() => runWrite("Claim Weekly Reward", "claimWeeklyReward")}
              >
                Claim Weekly Reward
              </ActionButton>
            </Card>

            <Card title="Round Info">
              <pre>{asText(roundInfo.data)}</pre>
            </Card>
          </section>
        )}

        {page === "docs" && (
          <section className="grid two">
            <Card title="Project Links">
              <div className="link-stack">
                <a href="https://github.com/Agus-ops/giwa-flowlab" target="_blank" rel="noreferrer">
                  GitHub Repository →
                </a>
                <a href={`https://sepolia-explorer.giwa.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                  GIWA Explorer Contract →
                </a>
                <a href="https://sepolia-rpc.giwa.io" target="_blank" rel="noreferrer">
                  GIWA Sepolia RPC →
                </a>
              </div>
            </Card>

            <Card title="Verification Status">
              <div className="status-pill warning">Explorer verifier pending</div>
              <p>
                The GIWA Sepolia explorer API currently fails to publish the source verification, but the deployed runtime bytecode has been checked locally against the contract source.
              </p>
              <div className="proof-list">
                <div>
                  <span>Runtime bytecode</span>
                  <strong>Exact match</strong>
                </div>
                <div>
                  <span>Compiler</span>
                  <strong>solc 0.8.35</strong>
                </div>
                <div>
                  <span>EVM target</span>
                  <strong>osaka</strong>
                </div>
              </div>
              <p className="hint">
                Reproducible verification evidence is available in the GitHub repository.
              </p>
            </Card>
          </section>
        )}

        <section className="tx-box">
          <strong>Transaction status</strong>
          <p>{txLog || "No transaction submitted yet."}</p>
          {lastHash && (
            <a
              href={`https://sepolia-explorer.giwa.io/tx/${lastHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View latest tx →
            </a>
          )}
          {receipt.isLoading && <p>Waiting for confirmation...</p>}
          {receipt.isSuccess && <p className="success">Confirmed.</p>}
        </section>
      </main>

      <footer>
        <span>GIWA FlowLab</span>
        <span>Testnet builder demo on GIWA Sepolia</span>
      </footer>
    </div>
  );
}
