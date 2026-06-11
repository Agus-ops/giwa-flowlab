import fs from "fs";

const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));
const bytecode = fs.readFileSync("artifacts/GIWAFlowLab.bytecode.txt", "utf8");

const bytecodeBytes = bytecode.length / 2;
const eip170Limit = 24576;

const names = new Set(
  abi
    .filter((item) => item.type === "function")
    .map((item) => item.name)
);

const requiredFunctions = [
  "depositNative",
  "withdrawNative",
  "dailyLoginAndSpin",
  "spinWheel",
  "scratchBatch",
  "swapMock",
  "quoteMockSwap",
  "addLiquidity",
  "pendingApr",
  "claimApr",
  "removeLiquidity",
  "finalizeWeekly",
  "canFinalizeWeekly",
  "claimWeeklyReward",
  "getNativeAccount",
  "getMockBalances",
  "getCurrentTop3",
  "getRoundInfo",
  "getUserPositions",
  "isNativeRewardEligible"
];

let ok = true;

console.log("GIWA FlowLab Static Smoke Test");
console.log("--------------------------------");
console.log("ABI items:", abi.length);
console.log("Bytecode bytes:", bytecodeBytes);
console.log("EIP-170 remaining:", eip170Limit - bytecodeBytes);

if (bytecodeBytes >= eip170Limit) {
  console.log("FAIL: bytecode exceeds EIP-170 limit");
  ok = false;
}

for (const fn of requiredFunctions) {
  if (!names.has(fn)) {
    console.log("FAIL: missing function:", fn);
    ok = false;
  }
}

if (ok) {
  console.log("PASS: static smoke test OK");
} else {
  process.exit(1);
}
