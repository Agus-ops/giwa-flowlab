import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther, parseUnits } from "viem";
import { CONTRACT_ABI, CONTRACT_ADDRESS, CONTRACT_VERSION, GIWA_SEPOLIA, MOCK_ASSETS } from "./contract.js";

const ASSETS = MOCK_ASSETS;

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

function shortenHashText(text) {
  return String(text).replace(/0x[a-fA-F0-9]{64}/g, (hash) => {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  });
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

function getAsset(assetOrId) {
  if (assetOrId && typeof assetOrId === "object") return assetOrId;
  return ASSETS.find((x) => x.id === Number(assetOrId)) || ASSETS[0];
}

function sanitizeAmountInput(value) {
  return String(value ?? "").trim().replaceAll(",", "");
}

function parseMockAmount(value, assetOrId) {
  const asset = getAsset(assetOrId);
  const v = sanitizeAmountInput(value);

  if (!/^\d+(\.\d+)?$/.test(v)) {
    throw new Error("Use a valid decimal amount.");
  }

  return parseUnits(v, asset.decimals);
}

function formatMockAmount(value, assetOrId, options = {}) {
  try {
    const asset = getAsset(assetOrId);
    const decimals = BigInt(asset.decimals);
    const maxDecimals = options.maxDecimals ?? (asset.id === 2 ? 8 : 6);
    const group = options.group ?? true;

    let raw = BigInt(value || 0);
    const sign = raw < 0n ? "-" : "";
    if (raw < 0n) raw = -raw;

    const unit = 10n ** decimals;
    const whole = raw / unit;
    const fractionRaw = raw % unit;

    const wholeText = group ? whole.toLocaleString("en-US") : whole.toString();
    let fraction = fractionRaw.toString().padStart(Number(decimals), "0");

    if (maxDecimals >= 0) {
      fraction = fraction.slice(0, maxDecimals);
    }

    fraction = fraction.replace(/0+$/, "");

    return `${sign}${wholeText}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return "0";
  }
}

function formatMockInput(value, assetOrId) {
  const asset = getAsset(assetOrId);
  return formatMockAmount(value, asset, {
    group: false,
    maxDecimals: asset.decimals,
  });
}

function formatSignedMockAmount(value, assetOrId) {
  const raw = BigInt(value || 0);
  if (raw > 0n) return `+${formatMockAmount(raw, assetOrId)}`;
  if (raw < 0n) return `-${formatMockAmount(-raw, assetOrId)}`;
  return "0";
}

function formatWholeUnits(value) {
  try {
    return BigInt(value || 0).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

const LIQUIDITY_PAIR_DEFAULTS = {
  0: ["50", "50"],
  1: ["50", "0.0005"],
  2: ["50", "0.0005"],
};

function getPairAssetIds(pairId) {
  const id = Number(pairId);
  if (id === 0) return [0, 1];
  if (id === 1) return [0, 2];
  if (id === 2) return [1, 2];
  return [0, 1];
}

const MUSD_UNIT_RAW = 10n ** 18n;
const MBTC_UNIT_RAW = 10n ** 8n;
const MBTC_PRICE_MUSD_RAW = 100000n;
const MIN_LP_VALUE_MUSD_RAW = 100n * MUSD_UNIT_RAW;

function toMockMUSDValue(assetOrId, amount) {
  const asset = getAsset(assetOrId);
  const raw = BigInt(amount || 0n);

  if (asset.id === 0 || asset.id === 1) return raw;
  if (asset.id === 2) {
    return (raw * MBTC_PRICE_MUSD_RAW * MUSD_UNIT_RAW) / MBTC_UNIT_RAW;
  }

  return 0n;
}

function getPairLabel(pairType) {
  return PAIRS.find((x) => x.id === Number(pairType))?.label || "Unknown pair";
}

function getPairAprLabel(pairType) {
  const id = Number(pairType);
  if (id === 0) return "24% APR";
  if (id === 1) return "36% APR";
  if (id === 2) return "18% APR";
  return "APR";
}

function normalizeLpPosition(raw) {
  if (!raw) return null;

  return {
    owner: raw.owner ?? raw[0],
    amountA: BigInt(raw.amountA ?? raw[1] ?? 0n),
    amountB: BigInt(raw.amountB ?? raw[2] ?? 0n),
    valueMUSD: BigInt(raw.valueMUSD ?? raw[3] ?? 0n),
    lastClaimAt: BigInt(raw.lastClaimAt ?? raw[4] ?? 0n),
    pairType: Number(raw.pairType ?? raw[5] ?? 0),
    active: Boolean(raw.active ?? raw[6]),
  };
}

function getRateHint(fromId, toId) {
  const from = Number(fromId);
  const to = Number(toId);

  if ((from === 0 || from === 1) && to === 2) {
    return "100,000 mUSD-equivalent = 1 mBTC";
  }

  if (from === 2 && (to === 0 || to === 1)) {
    return "1 mBTC = 100,000 mUSD-equivalent";
  }

  if ((from === 0 && to === 1) || (from === 1 && to === 0)) {
    return "1 mGIWA = 1 mUSD";
  }

  return "Fixed-rate mock swap";
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


function formatDuration(value) {
  try {
    const seconds = Number(value || 0);
    if (!seconds) return "-";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  } catch {
    return "-";
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




function formatRoundStatus(value) {
  return value ? "Yes" : "No";
}

function parseRoundInfo(data) {
  if (!data) return null;

  return {
    roundId: BigInt(data.roundId ?? data[0] ?? 0n),
    startTime: BigInt(data.startTime ?? data[1] ?? 0n),
    endTime: BigInt(data.endTime ?? data[2] ?? 0n),
    finalized: Boolean(data.finalized ?? data[3]),
    canFinalize: Boolean(data.canFinalize ?? data[4]),
  };
}

function parseNativeRewardEth(value) {
  try {
    const n = Number(formatEther(BigInt(value || 0n)));
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`;
  } catch {
    return "0 ETH";
  }
}

function parseDailyCounter(value) {
  const v = clean(value);
  if (!v) return null;

  return {
    dayBucket: v.dayBucket ?? v.dayId ?? v[0] ?? "-",
    scratchScore: v.scratchScore ?? v.scratchPoints ?? v[1] ?? "0",
    wheelScore: v.wheelScore ?? v.wheelPoints ?? v[2] ?? "0",
    dailyDone: v.dailyLoginDone ?? v.loginDone ?? v[3] ?? false,
    freeSpinDone: v.freeSpinDone ?? v.wheelDone ?? v[4] ?? false,
  };
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
  const [scratchRewardText, setScratchRewardText] = useState("");
  const [scratchDetailText, setScratchDetailText] = useState("");
  const [scratchBeforeMgiwa, setScratchBeforeMgiwa] = useState("0");
  const [scratchSubmittedCount, setScratchSubmittedCount] = useState("1");
  const [scratchTxHash, setScratchTxHash] = useState();

  const [wheelRewardText, setWheelRewardText] = useState("");
  const [wheelDetailText, setWheelDetailText] = useState("");
  const [wheelBeforeMgiwa, setWheelBeforeMgiwa] = useState("0");
  const [wheelSubmittedMode, setWheelSubmittedMode] = useState("");
  const [wheelTxHash, setWheelTxHash] = useState();
  const [swapFrom, setSwapFrom] = useState("0");
  const [swapTo, setSwapTo] = useState("1");
  const [swapAmount, setSwapAmount] = useState("10");
  const [pairId, setPairId] = useState("0");
  const [liqA, setLiqA] = useState("50");
  const [liqB, setLiqB] = useState("50");
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

  const emergencyReserve = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "emergencyReserve",
    chainId: GIWA_SEPOLIA.id,
    query: { refetchInterval: 12_000 },
  });

  const sponsorWeeklyReserve = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "sponsorWeeklyReserve",
    chainId: GIWA_SEPOLIA.id,
    query: { refetchInterval: 12_000 },
  });

  const weeklyFeePool = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "weeklyFeePool",
    chainId: GIWA_SEPOLIA.id,
    query: { refetchInterval: 12_000 },
  });

  const treasuryPool = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "treasuryPool",
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

  const positionIds = useMemo(
    () => Array.isArray(positions.data) ? positions.data.map((id) => BigInt(id.toString())) : [],
    [positions.data]
  );

  const lpPositionReads = useReadContracts({
    contracts: positionIds.flatMap((id) => [
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "lpPositions",
        args: [id],
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "pendingApr",
        args: [id],
      },
    ]),
    query: {
      enabled: positionIds.length > 0,
      refetchInterval: 12_000,
    },
  });

  const pendingReward = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "pendingNativeReward",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const minNativeDeposit = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "MIN_NATIVE_DEPOSIT_FOR_REWARD",
    query: { refetchInterval: 60_000 },
  });

  const depositMaturity = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "DEPOSIT_MATURITY",
    query: { refetchInterval: 60_000 },
  });

  const nativeEligible = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "isNativeRewardEligible",
    args:
      address && currentRound.data !== undefined
        ? [currentRound.data, address]
        : undefined,
    query: {
      enabled: Boolean(address) && currentRound.data !== undefined,
      refetchInterval: 12_000,
    },
  });

  const dailyCounter = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getUserDailyCounter",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 12_000 },
  });

  const scratchCost = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "SCRATCH_COST",
    query: { refetchInterval: 60_000 },
  });

  const extraWheelCost = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "EXTRA_WHEEL_COST",
    query: { refetchInterval: 60_000 },
  });

  useEffect(() => {
    const confirmed = receipt.isSuccess || receipt.status === "success";
    if (!confirmed || !lastHash) return;

    let cancelled = false;

    async function refetchFreshState() {
      if (cancelled) return;

      await Promise.allSettled([
        mockBalances.refetch?.(),
        nativeAccount.refetch?.(),
        dailyCounter.refetch?.(),
        positions.refetch?.(),
        pendingReward.refetch?.(),
        top3.refetch?.(),
        roundInfo.refetch?.(),
        contractBalance.refetch?.(),
        emergencyReserve.refetch?.(),
        sponsorWeeklyReserve.refetch?.(),
        weeklyFeePool.refetch?.(),
        treasuryPool.refetch?.(),
      ]);
    }

    refetchFreshState();

    const timers = [
      setTimeout(refetchFreshState, 1200),
      setTimeout(refetchFreshState, 3500),
      setTimeout(refetchFreshState, 7000),
    ];

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [receipt.isSuccess, receipt.status, lastHash]);

  const isDailyCompleted = useMemo(
    () => dailyCompleted(dailyCounter.data),
    [dailyCounter.data]
  );

  const nativeSummary = useMemo(
    () => parseNativeAccount(nativeAccount.data),
    [nativeAccount.data]
  );

  const dailySummary = useMemo(
    () => parseDailyCounter(dailyCounter.data),
    [dailyCounter.data]
  );

  const roundSummary = useMemo(
    () => parseRoundInfo(roundInfo.data),
    [roundInfo.data]
  );

  const fromAsset = ASSETS.find((x) => x.id === Number(swapFrom));
  const toAsset = ASSETS.find((x) => x.id === Number(swapTo));

  const quoteAmount = useMemo(() => {
    try {
      return parseMockAmount(swapAmount, fromAsset);
    } catch {
      return null;
    }
  }, [swapAmount, swapFrom]);

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
  const quoteOut = swapQuote.data?.[0];
  const quoteFee = swapQuote.data?.[1];
  const quoteOutIsZero =
    quoteOut !== undefined && BigInt(quoteOut || 0) === 0n;
  const mBtcOutputTooSmall =
    quoteOutIsZero && Number(swapTo) === 2 && Number(swapFrom) !== 2;
  const swapInputBalance = mockBalances.data?.[Number(swapFrom)] ?? 0n;
  const swapInputBalanceIsZero = BigInt(swapInputBalance || 0n) === 0n;
  const invalidSwapAmount =
    quoteAmount === null || BigInt(quoteAmount || 0n) <= 0n;
  const zeroSettlementOutput =
    !invalidSwapAmount &&
    quoteOut !== undefined &&
    BigInt(quoteOut || 0n) === 0n;
  const insufficientSwapBalance =
    quoteAmount !== null && BigInt(swapInputBalance || 0n) < quoteAmount;
  const quoteCanPreview = quoteAmount !== null && swapFrom !== swapTo;
  const quoteErrorText =
    swapQuote.error?.shortMessage ||
    swapQuote.error?.message ||
    "";

  const [liqTokenAId, liqTokenBId] = getPairAssetIds(pairId);
  const liqAssetA = ASSETS.find((x) => x.id === liqTokenAId);
  const liqAssetB = ASSETS.find((x) => x.id === liqTokenBId);

  const liqAmountA = useMemo(() => {
    try {
      return parseMockAmount(liqA, liqAssetA);
    } catch {
      return null;
    }
  }, [liqA, pairId]);

  const liqAmountB = useMemo(() => {
    try {
      return parseMockAmount(liqB, liqAssetB);
    } catch {
      return null;
    }
  }, [liqB, pairId]);

  const liqValueMUSD =
    liqAmountA !== null && liqAmountB !== null
      ? toMockMUSDValue(liqAssetA, liqAmountA) + toMockMUSDValue(liqAssetB, liqAmountB)
      : 0n;

  const liqBalanceA = mockBalances.data?.[liqTokenAId] ?? 0n;
  const liqBalanceB = mockBalances.data?.[liqTokenBId] ?? 0n;
  const invalidLiqAmount =
    liqAmountA === null ||
    liqAmountB === null ||
    liqAmountA <= 0n ||
    liqAmountB <= 0n;
  const liqBelowMinimum = !invalidLiqAmount && liqValueMUSD < MIN_LP_VALUE_MUSD_RAW;
  const insufficientLiqBalance =
    !invalidLiqAmount &&
    (BigInt(liqBalanceA || 0n) < liqAmountA || BigInt(liqBalanceB || 0n) < liqAmountB);
  const lpRows = useMemo(() => {
    return positionIds.map((id, index) => {
      const position = normalizeLpPosition(lpPositionReads.data?.[index * 2]?.result);
      const pending = BigInt(lpPositionReads.data?.[index * 2 + 1]?.result ?? 0n);

      return {
        id,
        position,
        pending,
      };
    });
  }, [positionIds, lpPositionReads.data]);

  const activeLpRows = lpRows.filter((row) => row.position?.active);
  const totalPendingLpApr = lpRows.reduce((sum, row) => sum + BigInt(row.pending || 0n), 0n);


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
      return hash;
    } catch (err) {
      setTxLog(friendlyWriteError(err, label));
      return null;
    }
  }

  const disabled = !isConnected || wrongChain || isPending || receipt.isLoading;

  useEffect(() => {
    if (!receipt.isSuccess || !scratchTxHash || lastHash !== scratchTxHash) return;

    let cancelled = false;

    async function revealScratchReward() {
      setScratchReveal(true);
      setScratchRewardText("Settling reward...");

      await new Promise((resolve) => setTimeout(resolve, 700));

      try {
        const refreshed = await mockBalances.refetch?.();
        const after = refreshed?.data?.[0] ?? mockBalances.data?.[0] ?? 0n;
        const before = BigInt(scratchBeforeMgiwa || "0");
        const delta = BigInt(after || 0) - before;
        const count = BigInt(scratchSubmittedCount || "1");
        const costPerCard = BigInt(scratchCost.data || 0n);
        const totalCost = count * costPerCard;
        const grossPrize = delta + totalCost;

        if (!cancelled) {
          const resultText =
            delta > 0n
              ? `Profit: ${formatSignedMockAmount(delta, ASSETS[0])} mGIWA`
              : delta < 0n
                ? `Loss: ${formatSignedMockAmount(delta, ASSETS[0])} mGIWA`
                : "Break even";

          setScratchRewardText(`Prize: +${formatMockAmount(grossPrize > 0n ? grossPrize : 0n, ASSETS[0])} mGIWA`);
          setScratchDetailText(`Cost: -${formatMockAmount(totalCost, ASSETS[0])} mGIWA · ${resultText}`);
        }
      } catch {
        if (!cancelled) {
          setScratchRewardText("Reward confirmed");
        }
      }
    }

    revealScratchReward();

    return () => {
      cancelled = true;
    };
  }, [receipt.isSuccess, scratchTxHash, lastHash]);

  useEffect(() => {
    if (!receipt.isSuccess || !wheelTxHash || lastHash !== wheelTxHash) return;

    let cancelled = false;

    async function revealWheelReward() {
      setWheelSpin(true);
      setWheelRewardText("Settling spin reward...");
      setWheelDetailText("");

      await new Promise((resolve) => setTimeout(resolve, 700));

      try {
        const refreshed = await mockBalances.refetch?.();
        const after = refreshed?.data?.[0] ?? mockBalances.data?.[0] ?? 0n;
        const before = BigInt(wheelBeforeMgiwa || "0");
        const delta = BigInt(after || 0) - before;
        const totalCost = wheelSubmittedMode === "extra" ? BigInt(extraWheelCost.data || 0n) : 0n;
        const grossPrize = delta + totalCost;

        if (!cancelled) {
          const resultText =
            delta > 0n
              ? `Profit: ${formatSignedMockAmount(delta, ASSETS[0])} mGIWA`
              : delta < 0n
                ? `Loss: ${formatSignedMockAmount(delta, ASSETS[0])} mGIWA`
                : "Break even";

          setWheelRewardText(`Prize: +${formatMockAmount(grossPrize > 0n ? grossPrize : 0n, ASSETS[0])} mGIWA`);
          setWheelDetailText(`Cost: -${formatMockAmount(totalCost, ASSETS[0])} mGIWA · ${resultText}`);
          setTimeout(() => setWheelSpin(false), 900);
        }
      } catch {
        if (!cancelled) {
          setWheelRewardText("Spin confirmed");
          setTimeout(() => setWheelSpin(false), 900);
        }
      }
    }

    revealWheelReward();

    return () => {
      cancelled = true;
    };
  }, [receipt.isSuccess, wheelTxHash, lastHash]);



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
                <h1>Native vault deposits, mock assets, swaps, arcade actions, simulated LP, and protocol reserves.</h1>
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

                <Card title="Protocol Reserves">
                  <div className="info-list protocol-reserves">
                    <div>
                      <span>Emergency Reserve</span>
                      <strong>{emergencyReserve.data ? `${Number(formatEther(emergencyReserve.data)).toLocaleString(undefined, { maximumFractionDigits: 8 })} ETH` : "0 ETH"}</strong>
                    </div>
                    <div>
                      <span>Sponsor Weekly Reserve</span>
                      <strong>{sponsorWeeklyReserve.data ? `${Number(formatEther(sponsorWeeklyReserve.data)).toLocaleString(undefined, { maximumFractionDigits: 8 })} ETH` : "0 ETH"}</strong>
                    </div>
                    <div>
                      <span>Weekly Fee Pool</span>
                      <strong>{weeklyFeePool.data ? `${Number(formatEther(weeklyFeePool.data)).toLocaleString(undefined, { maximumFractionDigits: 8 })} ETH` : "0 ETH"}</strong>
                    </div>
                    <div>
                      <span>Treasury Pool</span>
                      <strong>{treasuryPool.data ? `${Number(formatEther(treasuryPool.data)).toLocaleString(undefined, { maximumFractionDigits: 8 })} ETH` : "0 ETH"}</strong>
                    </div>
                    <div>
                      <span>Total Contract Balance</span>
                      <strong>{contractBalance.data ? `${Number(formatEther(contractBalance.data.value)).toLocaleString(undefined, { maximumFractionDigits: 8 })} ETH` : "0 ETH"}</strong>
                    </div>
                  </div>
                </Card>
              <Card title="Current Round">
                <div className="big-number">{currentRound.data?.toString() || "-"}</div>
              </Card>
              <Card title="Connected Wallet">
                <div className="big-number small">{short(address)}</div>
              </Card>
            </section>

            <section className="grid three balance-grid">
              <Card title="mGIWA">
                <div className="big-number">{formatMockAmount(mockBalances.data?.[0] ?? 0n, ASSETS[0])}</div>
              </Card>
              <Card title="mUSD">
                <div className="big-number">{formatMockAmount(mockBalances.data?.[1] ?? 0n, ASSETS[1])}</div>
              </Card>
              <Card title="mBTC">
                <div className="big-number">{formatMockAmount(mockBalances.data?.[2] ?? 0n, ASSETS[2])}</div>
              </Card>
            </section>

            <section className="grid three home-proof-grid">
              <Card title="V2 Engine">
                <div className="home-mini-kicker">{CONTRACT_VERSION || "V2"} Active</div>
                <p className="hint">
                  Decimal-aware mock accounting: mGIWA and mUSD use 18 decimals, while mBTC uses 8 decimals.
                </p>
              </Card>

              <Card title="Live Modules">
                <div className="module-pill-list">
                  <button type="button" onClick={() => setPage("vault")}>Vault</button>
                  <button type="button" onClick={() => setPage("arcade")}>Arcade</button>
                  <button type="button" onClick={() => setPage("swap")}>Swap</button>
                  <button type="button" onClick={() => setPage("liquidity")}>Liquidity</button>
                </div>
              </Card>

              <Card title="Builder Proof">
                <div className="info-list compact">
                  <div><span>Network</span><strong>GIWA Sepolia</strong></div>
                  <div><span>Contract</span><strong>{short(CONTRACT_ADDRESS)}</strong></div>
                  <div><span>Status</span><strong>Live demo</strong></div>
                </div>
              </Card>
            </section>

            <section className="home-flow-strip">
              <div>
                <span>1</span>
                <strong>Deposit native ETH</strong>
                <small>Mint account-bound mGIWA</small>
              </div>
              <div>
                <span>2</span>
                <strong>Play arcade loops</strong>
                <small>Daily, wheel, scratch cards</small>
              </div>
              <div>
                <span>3</span>
                <strong>Swap mock assets</strong>
                <small>mGIWA, mUSD, mBTC</small>
              </div>
              <div>
                <span>4</span>
                <strong>Add simulated LP</strong>
                <small>Track APR and positions</small>
              </div>
            </section>
          </>
        )}

        {page === "vault" && (
          <>
            <section className="vault-hero">
              <div>
                <p className="eyebrow">Native Vault</p>
                <h2>Deposit GIWA Sepolia ETH, mint mock mGIWA, and build weekly reward eligibility.</h2>
                <p>
                  Vault deposits are real native testnet deposits. Rewards and arcade balances are mock, account-bound contract state for builder activity.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className={nativeEligible.data ? "status-pill success" : "status-pill warning"}>
                  {nativeEligible.data ? "Native reward eligible" : "Not eligible yet"}
                </span>
                <strong>{pendingReward.data ? formatEther(pendingReward.data) : "0"} ETH</strong>
                <small>Pending weekly native reward</small>
              </div>
            </section>

            <section className="grid two vault-layout">
              <Card title="Deposit / Withdraw">
                <div className="vault-action-card">
                  <div>
                    <span>Minimum for reward eligibility</span>
                    <strong>{formatWeiText(minNativeDeposit.data)}</strong>
                  </div>
                  <div>
                    <span>Required maturity</span>
                    <strong>{formatDuration(depositMaturity.data)} before round end</strong>
                  </div>
                </div>

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
                  Deposit fee is split into weekly rewards, treasury, and emergency reserve. Withdrawing may reduce native reward eligibility.
                </p>
              </Card>

              <Card title="Your Vault Account">
                {nativeSummary ? (
                  <div className="account-summary account-summary-v2">
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
                      <strong>{formatMockAmount(nativeSummary.depositRewardMinted, ASSETS[0]) + " mGIWA"}</strong>
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
                      <span>Pending weekly reward</span>
                      <strong>{pendingReward.data ? formatEther(pendingReward.data) : "0"} ETH</strong>
                    </div>
                  </div>
                ) : (
                  <p className="hint">Connect wallet to view your vault account.</p>
                )}
              </Card>
            </section>

            <section className="grid three vault-info-grid">
              <Card title="Eligibility Rules">
                <div className="mini-rule-list">
                  <div>
                    <strong>Minimum active deposit</strong>
                    <span>{formatWeiText(minNativeDeposit.data)}</span>
                  </div>
                  <div>
                    <strong>Required maturity</strong>
                    <span>{formatDuration(depositMaturity.data)} before round end</span>
                  </div>
                  <div>
                    <strong>Activity requirement</strong>
                    <span>At least 2 activity categories</span>
                  </div>
                </div>
              </Card>

              <Card title="Native Fee Split">
                <div className="fee-bars">
                  <div><span style={{ width: "70%" }}></span><strong>70% Weekly pool</strong></div>
                  <div><span style={{ width: "20%" }}></span><strong>20% Treasury</strong></div>
                  <div><span style={{ width: "10%" }}></span><strong>10% Emergency</strong></div>
                </div>
              </Card>

              <Card title="Mock Minting">
                <div className="mini-rule-list">
                  <div>
                    <strong>Mint rate</strong>
                    <span>1 ETH = 1,000,000 mGIWA</span>
                  </div>
                  <div>
                    <strong>Balance type</strong>
                    <span>Account-bound mock state</span>
                  </div>
                  <div>
                    <strong>Transferable?</strong>
                    <span>No ERC20 transfers in MVP</span>
                  </div>
                </div>
              </Card>
            </section>
          </>
        )}

        {page === "arcade" && (
          <>
            <section className="vault-hero arcade-hero">
              <div>
                <p className="eyebrow">Arcade Engine</p>
                <h2>Daily wheel, scratch cards, and mock-only reward loops.</h2>
                <p>
                  Arcade actions generate weekly points and account-bound mGIWA rewards without pretending to be a real-money casino.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className={isDailyCompleted ? "status-pill success" : "status-pill warning"}>
                  {isDailyCompleted ? "Daily completed" : "Daily available"}
                </span>
                <strong>{formatMockAmount(mockBalances.data?.[0] ?? 0n, ASSETS[0])} mGIWA</strong>
                <small>Current arcade balance</small>
              </div>
            </section>

            <section className="grid three arcade-stats">
              <Card title="Arcade Balance">
                <div className="big-number">{formatMockAmount(mockBalances.data?.[0] ?? 0n, ASSETS[0])}</div>
                <p className="hint">mGIWA available for wheel, scratch, swap, and LP actions.</p>
              </Card>
              <Card title="Extra Spin Cost">
                <div className="big-number small">{formatMockAmount(extraWheelCost.data ?? 0n, ASSETS[0])}</div>
                <p className="hint">mGIWA cost for an extra wheel spin.</p>
              </Card>
              <Card title="Scratch Cost">
                <div className="big-number small">{formatMockAmount(scratchCost.data ?? 0n, ASSETS[0])}</div>
                <p className="hint">mGIWA cost per scratch card.</p>
              </Card>
            </section>

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

              <div className="spin-cost-grid">
                <div>
                  <span>Daily login + spin</span>
                  <strong>Free</strong>
                </div>
                <div>
                  <span>Extra spin cost</span>
                  <strong>{formatMockAmount(extraWheelCost.data ?? 0n, ASSETS[0]) + " mGIWA"}</strong>
                </div>
              </div>

              {wheelRewardText && (
                <div className="spin-result-card">
                  <strong>{wheelRewardText}</strong>
                  <span>{wheelDetailText || "Spin reward confirmed"}</span>
                </div>
              )}

              <ActionButton
                disabled={disabled || isDailyCompleted}
                onClick={async () => {
                  if (isDailyCompleted) {
                    setTxLog("Daily Login + Spin is already completed today.");
                    return;
                  }

                  setWheelRewardText("Waiting for confirmation...");
                  setWheelDetailText("");
                  setWheelBeforeMgiwa((mockBalances.data?.[0] ?? 0n).toString());
                  setWheelSubmittedMode("daily");

                  const hash = await runWrite("Daily Login + Spin", "dailyLoginAndSpin");

                  if (hash) {
                    setWheelTxHash(hash);
                  } else {
                    setWheelRewardText("");
                    setWheelDetailText("");
                  }
                }}
              >
                {isDailyCompleted ? "Completed Today" : "Daily Login + Spin"}
              </ActionButton>
              <ActionButton
                disabled={disabled}
                onClick={async () => {
                  setWheelRewardText("Waiting for confirmation...");
                  setWheelDetailText("");
                  setWheelBeforeMgiwa((mockBalances.data?.[0] ?? 0n).toString());
                  setWheelSubmittedMode("extra");

                  const hash = await runWrite("Spin Wheel", "spinWheel");

                  if (hash) {
                    setWheelTxHash(hash);
                  } else {
                    setWheelRewardText("");
                    setWheelDetailText("");
                  }
                }}
              >
                Extra Spin Wheel
              </ActionButton>
              <p className="hint">
                Daily and arcade actions generate weekly points and mock-only rewards.
              </p>

              <div className="daily-summary">
                <div>
                  <span>Daily bucket</span>
                  <strong>{dailySummary?.dayBucket?.toString?.() || "-"}</strong>
                </div>
                <div>
                  <span>Scratch score today</span>
                  <strong>{dailySummary?.scratchScore?.toString?.() || "0"}</strong>
                </div>
                <div>
                  <span>Wheel score today</span>
                  <strong>{dailySummary?.wheelScore?.toString?.() || "0"}</strong>
                </div>
                <div>
                  <span>Daily login</span>
                  <strong>{dailySummary?.dailyDone ? "Completed" : "Available"}</strong>
                </div>
                <div>
                  <span>Free spin</span>
                  <strong>{dailySummary?.freeSpinDone ? "Used" : "Available"}</strong>
                </div>
              </div>
            </Card>

            <Card title="Scratch Cards">
              <div className={`scratch-visual scratch-card-v2 ${scratchReveal ? "revealed scratching" : "idle"}`}>
                <div className="scratch-coin">G</div>

                <div className="scratch-card-top">
                  <span>{scratchReveal ? "Batch Reward" : "Scratch Card"}</span>
                  <em>{scratchReveal ? `Batch x${scratchSubmittedCount}` : "GIWA FlowLab"}</em>
                </div>

                <div className="scratch-card-body">
                  <strong>
                    {scratchReveal
                      ? (scratchRewardText || "Reward confirmed")
                      : "Scratch to reveal"}
                  </strong>
                  <small>
                    {scratchReveal
                      ? (scratchDetailText || `Scratch batch x${scratchSubmittedCount}`)
                      : "Reveal your batch reward after transaction confirmation"}
                  </small>
                </div>

                {!scratchReveal && (
                  <div className="scratch-card-footer">
                    <span>Mock reward</span>
                    <span>mGIWA prize</span>
                  </div>
                )}
              </div>

              <label>Scratch count</label>
              <input value={scratchCount} onChange={(e) => setScratchCount(e.target.value)} />
              <ActionButton
                disabled={disabled}
                onClick={async () => {
                  setScratchReveal(false);
                  setScratchRewardText("Waiting for confirmation...");
                  setScratchDetailText("");
                  setScratchBeforeMgiwa((mockBalances.data?.[0] ?? 0n).toString());
                  setScratchSubmittedCount(scratchCount);

                  const hash = await runWrite("Scratch Batch", "scratchBatch", [Number(scratchCount)]);

                  if (hash) {
                    setScratchTxHash(hash);
                  } else {
                    setScratchRewardText("");
                    setScratchDetailText("");
                    setScratchReveal(false);
                  }
                }}
              >
                Scratch Batch
              </ActionButton>
            </Card>
          </section>
          </>
        )}

        {page === "swap" && (
          <>
            <section className="vault-hero swap-hero">
              <div>
                <p className="eyebrow">V2 Swap Engine</p>
                <h2>Decimal-aware mock swaps for mGIWA, mUSD, and mBTC.</h2>
                <p>
                  Swap quotes are calculated live from the V2 contract. mGIWA and mUSD use 18 decimals, while mBTC uses 8 decimals.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className="status-pill success">Live V2 quote</span>
                <strong>
                  {quoteOut !== undefined ? `${formatMockAmount(quoteOut, toAsset)} ${toAsset?.label}` : "Ready"}
                </strong>
                <small>{fromAsset?.label} → {toAsset?.label}</small>
              </div>
            </section>

            <section className="grid three swap-stats">
              <Card title="Selected Route">
                <div className="big-number small">{fromAsset?.label} → {toAsset?.label}</div>
                <p className="hint">{getRateHint(swapFrom, swapTo)}</p>
              </Card>
              <Card title="You Pay">
                <div className="big-number small">
                  {quoteAmount !== null ? formatMockAmount(quoteAmount, fromAsset) : "0"}
                </div>
                <p className="hint">{fromAsset?.label} input amount</p>
              </Card>
              <Card title="You Receive">
                <div className="big-number small">
                  {quoteOut !== undefined ? formatMockAmount(quoteOut, toAsset) : "0"}
                </div>
                <p className="hint">{toAsset?.label} output after 1% burn fee</p>
              </Card>
            </section>

            <section className="grid two">
            <Card title="Mock Swap">
              <div className="mock-balance-panel">
                <div className="mock-balance-head">
                  <span>Your V2 Mock Balances</span>
                  <small>Account-bound demo balances</small>
                </div>

                <div className="mock-balance-grid">
                  {ASSETS.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      className={`mock-balance-chip ${swapFrom === String(asset.id) ? "active" : ""}`}
                      onClick={() => {
                        const next = String(asset.id);
                        setSwapFrom(next);

                        if (next === swapTo) {
                          const alt = ASSETS.find((token) => String(token.id) !== next);
                          if (alt) setSwapTo(String(alt.id));
                        }
                      }}
                    >
                      <span>{asset.label}</span>
                      <strong>{formatMockAmount(mockBalances.data?.[asset.id] ?? 0n, asset)}</strong>
                      <small>{asset.id === 2 ? "8 decimals" : "18 decimals"}</small>
                    </button>
                  ))}
                </div>
              </div>

              <label>From</label>
              <div className="token-picker">
                {ASSETS.map((x) => (
                  <button
                    type="button"
                    key={x.id}
                    className={swapFrom === String(x.id) ? "selected" : ""}
                    onClick={() => {
                      const next = String(x.id);
                      setSwapFrom(next);

                      if (next === swapTo) {
                        const alt = ASSETS.find((token) => String(token.id) !== next);
                        if (alt) setSwapTo(String(alt.id));
                      }
                    }}
                  >
                    <span>{x.label}</span>
                    <small>Bal {formatMockAmount(mockBalances.data?.[x.id] ?? 0n, x)}</small>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="mini-swap-button"
                onClick={() => {
                  setSwapFrom(swapTo);
                  setSwapTo(swapFrom);
                }}
              >
                Flip pair ↕
              </button>

              <div className={`selected-balance-card ${swapInputBalanceIsZero ? "empty" : ""}`}>
                <span>Selected balance</span>
                <strong>{formatMockAmount(swapInputBalance, fromAsset)} {fromAsset?.label}</strong>
                <small>
                  {swapInputBalanceIsZero
                    ? `No ${fromAsset?.label} available. Earn or swap into ${fromAsset?.label} first.`
                    : `Available to swap from your GIWA FlowLab mock balance.`}
                </small>
              </div>

              <label>To</label>
              <div className="token-picker">
                {ASSETS.map((x) => (
                  <button
                    type="button"
                    key={x.id}
                    className={swapTo === String(x.id) ? "selected" : ""}
                    onClick={() => {
                      const next = String(x.id);
                      setSwapTo(next);

                      if (next === swapFrom) {
                        const alt = ASSETS.find((token) => String(token.id) !== next);
                        if (alt) setSwapFrom(String(alt.id));
                      }
                    }}
                  >
                    <span>{x.label}</span>
                    <small>Bal {formatMockAmount(mockBalances.data?.[x.id] ?? 0n, x)}</small>
                  </button>
                ))}
              </div>

              <label>Amount ({fromAsset?.label})</label>
              <input value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)} />

              <div className="swap-balance-line">
                <span>Available: {formatMockAmount(swapInputBalance, fromAsset)} {fromAsset?.label}</span>
                <button
                  type="button"
                  onClick={() => setSwapAmount(formatMockInput(swapInputBalance, fromAsset))}
                >
                  Max
                </button>
              </div>

              {invalidSwapAmount && (
                <p className="swap-warning">Enter an amount greater than 0.</p>
              )}

              {!invalidSwapAmount && insufficientSwapBalance && (
                <p className="swap-warning">Amount exceeds available {fromAsset?.label} balance.</p>
              )}

              <ActionButton
                disabled={disabled || swapFrom === swapTo || invalidSwapAmount || insufficientSwapBalance || zeroSettlementOutput}
                onClick={() => runWrite("Mock Swap", "swapMock", [Number(swapFrom), Number(swapTo), quoteAmount ?? 0n])}
              >
                Swap Mock
              </ActionButton>
            </Card>

            <Card title="Quote">
              {swapQuote.data ? (
                <div className="quote-box">
                  <div>
                    <span>You pay</span>
                    <strong>{formatMockAmount(quoteAmount, fromAsset)} {fromAsset?.label}</strong>
                  </div>
                  <div>
                    <span>You receive</span>
                    <strong>{formatMockAmount(quoteOut, toAsset)} {toAsset?.label}</strong>
                  </div>
                  <div>
                    <span>Mock burn fee</span>
                    <strong>{formatMockAmount(quoteFee, fromAsset)} {fromAsset?.label}</strong>
                  </div>
                  <div>
                    <span>Rate</span>
                    <strong>{getRateHint(swapFrom, swapTo)}</strong>
                  </div>

                  {mBtcOutputTooSmall && (
                    <div className="quote-warning">
                      <strong>Amount too small for mBTC</strong>
                      <span>
                        This amount is below the minimum decimal settlement for mBTC. Try a slightly larger input.
                      </span>
                    </div>
                  )}

                  <p className="hint">
                    Quote is calculated live from the V2 contract. mGIWA and mUSD use 18 decimals; mBTC uses 8 decimals.
                  </p>
                </div>
              ) : quoteCanPreview ? (
                <div className="quote-box">
                  <p className="hint">
                    {swapQuote.isFetching
                      ? "Fetching V2 quote from contract..."
                      : quoteErrorText
                        ? `Quote unavailable: ${shortenHashText(quoteErrorText)}`
                        : "Waiting for V2 quote..."}
                  </p>
                  {insufficientSwapBalance && (
                    <p className="hint">
                      Preview can still load, but swap execution needs enough {fromAsset?.label} balance.
                    </p>
                  )}
                </div>
              ) : (
                <p className="hint">Enter a valid decimal amount to preview the V2 swap output.</p>
              )}
            </Card>
          </section>
          </>
        )}

        {page === "liquidity" && (
          <>
            <section className="vault-hero liquidity-hero">
              <div>
                <p className="eyebrow">Simulated Liquidity</p>
                <h2>Add mock LP, track APR, and manage on-chain position IDs.</h2>
                <p>
                  Liquidity is simulated with account-bound mock assets. Each LP position is stored on-chain and earns mock mGIWA APR.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className="status-pill success">LP dashboard</span>
                <strong>{formatMockAmount(totalPendingLpApr, ASSETS[0])} mGIWA</strong>
                <small>Total pending APR across active positions</small>
              </div>
            </section>

            <section className="grid three">
              <Card title="Active Positions">
                <div className="big-number">{activeLpRows.length}</div>
              </Card>
              <Card title="Pending APR">
                <div className="big-number">{formatMockAmount(totalPendingLpApr, ASSETS[0])}</div>
                <p className="hint">mGIWA claimable from LP positions</p>
              </Card>
              <Card title="Pair Rates">
                <div className="pair-rate-list">
                  {PAIRS.map((pair) => (
                    <div key={pair.id}>
                      <span>{pair.label}</span>
                      <strong>{getPairAprLabel(pair.id)}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <section className="grid two">
              <Card title="Add Simulated Liquidity">
                <label>Pair</label>
                <div className="pair-choice-grid">
                  {PAIRS.map((x) => (
                    <button
                      type="button"
                      key={x.id}
                      className={`pair-choice ${Number(pairId) === x.id ? "active" : ""}`}
                      onClick={() => {
                        setPairId(String(x.id));
                        const defaults = LIQUIDITY_PAIR_DEFAULTS[x.id] || LIQUIDITY_PAIR_DEFAULTS[0];
                        setLiqA(defaults[0]);
                        setLiqB(defaults[1]);
                      }}
                    >
                      <span>{x.label}</span>
                      <strong>{getPairAprLabel(x.id)}</strong>
                    </button>
                  ))}
                </div>

                <label>Amount A ({liqAssetA?.label})</label>
                <input value={liqA} onChange={(e) => setLiqA(e.target.value)} />

                <label>Amount B ({liqAssetB?.label})</label>
                <input value={liqB} onChange={(e) => setLiqB(e.target.value)} />

                <div className="lp-preview">
                  <div>
                    <span>Total LP value</span>
                    <strong>{formatMockAmount(liqValueMUSD, ASSETS[1])} mUSD</strong>
                  </div>
                  <div>
                    <span>Minimum required</span>
                    <strong>100 mUSD</strong>
                  </div>
                </div>

                {liqBelowMinimum && (
                  <p className="swap-warning">
                    LP value is too small. Add at least 100 mUSD-equivalent total, for example 50 mGIWA + 50 mUSD.
                  </p>
                )}

                {!liqBelowMinimum && insufficientLiqBalance && (
                  <p className="swap-warning">
                    Insufficient balance for {liqAssetA?.label} / {liqAssetB?.label}.
                  </p>
                )}

                <ActionButton
                  disabled={disabled || invalidLiqAmount || liqBelowMinimum || insufficientLiqBalance}
                  onClick={() => runWrite("Add Liquidity", "addLiquidity", [Number(pairId), liqAmountA ?? 0n, liqAmountB ?? 0n])}
                >
                  Add Liquidity
                </ActionButton>

                <p className="hint">
                  New positions appear from the contract after the transaction confirms.
                </p>
              </Card>

              <Card title="Your LP Positions">
                {lpRows.length > 0 ? (
                  <div className="position-list">
                    {lpRows.map((row) => {
                      const position = row.position;
                      const [assetAId, assetBId] = getPairAssetIds(position?.pairType ?? 0);
                      const assetA = ASSETS.find((x) => x.id === assetAId);
                      const assetB = ASSETS.find((x) => x.id === assetBId);

                      return (
                        <div className={`position-card ${position?.active ? "" : "inactive"}`} key={row.id.toString()}>
                          <div className="position-head">
                            <div>
                              <span>Position ID</span>
                              <strong>#{row.id.toString()}</strong>
                            </div>
                            <span className={position?.active ? "status-pill success" : "status-pill warning"}>
                              {position?.active ? "Active" : "Closed"}
                            </span>
                          </div>

                          <div className="position-metrics">
                            <div>
                              <span>Pair</span>
                              <strong>{getPairLabel(position?.pairType ?? 0)}</strong>
                            </div>
                            <div>
                              <span>APR</span>
                              <strong>{getPairAprLabel(position?.pairType ?? 0)}</strong>
                            </div>
                            <div>
                              <span>LP value</span>
                              <strong>{formatMockAmount(position?.valueMUSD ?? 0n, ASSETS[1])} mUSD</strong>
                            </div>
                            <div>
                              <span>Pending APR</span>
                              <strong>{formatMockAmount(row.pending, ASSETS[0])} mGIWA</strong>
                            </div>
                            <div>
                              <span>{assetA?.label}</span>
                              <strong>{formatMockAmount(position?.amountA ?? 0n, assetA)}</strong>
                            </div>
                            <div>
                              <span>{assetB?.label}</span>
                              <strong>{formatMockAmount(position?.amountB ?? 0n, assetB)}</strong>
                            </div>
                          </div>

                          <div className="button-row">
                            <ActionButton
                              disabled={disabled || !position?.active || row.pending <= 0n}
                              onClick={() => runWrite("Claim APR", "claimApr", [row.id])}
                            >
                              Claim APR
                            </ActionButton>
                            <ActionButton
                              disabled={disabled || !position?.active}
                              onClick={() => runWrite("Remove Liquidity", "removeLiquidity", [row.id])}
                            >
                              Remove
                            </ActionButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="hint">No LP positions found for this wallet yet.</p>
                )}
              </Card>
            </section>
          </>
        )}

        {page === "leaderboard" && (
          <>
            <section className="vault-hero leaderboard-hero">
              <div>
                <p className="eyebrow">Weekly Leaderboard</p>
                <h2>Top wallets compete through vault, arcade, swap, and liquidity activity.</h2>
                <p>
                  Weekly ranking is stored on-chain. Native rewards are claimable by eligible winners after the round is finalized.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className={roundSummary?.finalized ? "status-pill success" : "status-pill warning"}>
                  {roundSummary?.finalized ? "Round finalized" : "Round active"}
                </span>
                <strong>#{roundSummary?.roundId?.toString?.() || "1"}</strong>
                <small>Current weekly round</small>
              </div>
            </section>

            <section className="grid three leaderboard-stats">
              <Card title="Can Finalize">
                <div className="big-number small">{formatRoundStatus(canFinalize.data)}</div>
                <p className="hint">Finalization opens after the round end time.</p>
              </Card>
              <Card title="Your Pending Reward">
                <div className="big-number small">{parseNativeRewardEth(pendingReward.data)}</div>
                <p className="hint">Native reward available after finalization.</p>
              </Card>
              <Card title="Round Ends">
                <div className="big-number tiny">{formatTimestamp(roundSummary?.endTime)}</div>
                <p className="hint">Displayed from your browser locale.</p>
              </Card>
            </section>

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
                        <small>{parseNativeRewardEth(row.activeDeposit)}</small>
                      </div>
                      <strong>{formatWholeUnits(row.points)} pts</strong>
                    </div>
                  ))}
                </div>

                <div className="leaderboard-actions">
                  <ActionButton
                    disabled={disabled || !canFinalize.data}
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
                </div>
              </Card>

              <Card title="Round Details">
                <div className="info-list round-info-list">
                  <div>
                    <span>Round ID</span>
                    <strong>#{roundSummary?.roundId?.toString?.() || "-"}</strong>
                  </div>
                  <div>
                    <span>Start time</span>
                    <strong>{formatTimestamp(roundSummary?.startTime)}</strong>
                  </div>
                  <div>
                    <span>End time</span>
                    <strong>{formatTimestamp(roundSummary?.endTime)}</strong>
                  </div>
                  <div>
                    <span>Finalized</span>
                    <strong>{formatRoundStatus(roundSummary?.finalized)}</strong>
                  </div>
                  <div>
                    <span>Can finalize</span>
                    <strong>{formatRoundStatus(canFinalize.data)}</strong>
                  </div>
                </div>
              </Card>
            </section>
          </>
        )}

        {page === "docs" && (
          <>
            <section className="vault-hero docs-hero">
              <div>
                <p className="eyebrow">Builder Documentation</p>
                <h2>GIWA FlowLab is a live V2 testnet dApp with on-chain vault, arcade, swap, LP, and leaderboard flows.</h2>
                <p>
                  This page collects the public proof links, active contract details, decimal model, and verification notes for the demo.
                </p>
              </div>

              <div className="vault-status-panel">
                <span className="status-pill success">{CONTRACT_VERSION || "V2"} active</span>
                <strong>{short(CONTRACT_ADDRESS)}</strong>
                <small>Current frontend contract</small>
              </div>
            </section>

            <section className="grid three docs-stats">
              <Card title="Active Contract">
                <div className="big-number tiny">{short(CONTRACT_ADDRESS)}</div>
                <p className="hint">Frontend is connected to GIWA FlowLab V2.</p>
              </Card>

              <Card title="Mock Decimals">
                <div className="info-list compact">
                  <div><span>mGIWA</span><strong>18</strong></div>
                  <div><span>mUSD</span><strong>18</strong></div>
                  <div><span>mBTC</span><strong>8</strong></div>
                </div>
              </Card>

              <Card title="Price Model">
                <div className="info-list compact">
                  <div><span>mGIWA</span><strong>1 mUSD</strong></div>
                  <div><span>mBTC</span><strong>100,000 mUSD</strong></div>
                  <div><span>Swap fee</span><strong>1%</strong></div>
                </div>
              </Card>
            </section>

            <section className="grid two">
              <Card title="Project Links">
                <div className="link-stack">
                  <a href="https://github.com/Agus-ops/giwa-flowlab" target="_blank" rel="noreferrer">
                    GitHub Repository →
                  </a>
                  <a href={`https://sepolia-explorer.giwa.io/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
                    Active V2 Contract →
                  </a>
                  <a href="https://sepolia-explorer.giwa.io/address/0x5574e233DC3a80634941Be43dB185AEF38266612" target="_blank" rel="noreferrer">
                    Archived V1 Contract →
                  </a>
                  <a href="https://sepolia-rpc.giwa.io" target="_blank" rel="noreferrer">
                    GIWA Sepolia RPC →
                  </a>
                </div>
              </Card>

              <Card title="Verification Status">
                <span className="status-pill success">Explorer verified</span>

                <p className="hint">
                  GIWA FlowLab V2 is verified on GIWA Sepolia explorer using exact Standard JSON input. Source, scripts, deployment metadata, and reproducible compile steps are kept in the public repository.
                </p>

                <div className="info-list">
                  <div><span>Compiler</span><strong>solc 0.8.35</strong></div>
                  <div><span>EVM target</span><strong>osaka</strong></div>
                  <div><span>Optimizer</span><strong>200 runs</strong></div>
                  <div><span>Frontend</span><strong>GitHub Pages</strong></div>
                </div>
              </Card>
            </section>

            <section className="grid two docs-bottom-grid">
              <Card title="Version History">
                <div className="version-timeline">
                  <div>
                    <span>V1</span>
                    <strong>Initial MVP contract</strong>
                    <small>Whole-unit mock accounting. Kept as archived builder footprint.</small>
                  </div>
                  <div>
                    <span>V2</span>
                    <strong>Active decimal-aware engine</strong>
                    <small>mGIWA/mUSD 18 decimals, mBTC 8 decimals, live decimal quote and swap.</small>
                  </div>
                </div>
              </Card>

              <Card title="What This Demo Proves">
                <div className="info-list">
                  <div><span>Vault</span><strong>Native deposit + mock minting</strong></div>
                  <div><span>Arcade</span><strong>Daily, wheel, scratch actions</strong></div>
                  <div><span>Swap</span><strong>Decimal-aware fixed-rate mock swap</strong></div>
                  <div><span>Liquidity</span><strong>On-chain LP positions + APR</strong></div>
                  <div><span>Leaderboard</span><strong>Weekly points and reward flow</strong></div>
                </div>
              </Card>
            </section>
          </>
        )}

      </main>

      <footer>
        <span>GIWA FlowLab</span>
        <span>Testnet builder demo on GIWA Sepolia</span>
      </footer>
    </div>
  );
}
