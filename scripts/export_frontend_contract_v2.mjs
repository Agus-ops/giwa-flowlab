import fs from "fs";
import solc from "solc";

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment_v2.json", "utf8"));
const sourceName = "GIWAFlowLabV2.sol";
const contractName = "GIWAFlowLabV2";
const source = fs.readFileSync("contracts/GIWAFlowLabV2.sol", "utf8");

const input = {
  language: "Solidity",
  sources: {
    [sourceName]: {
      content: source
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    evmVersion: "osaka",
    outputSelection: {
      "*": {
        "*": ["abi"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error(err.formattedMessage);
    }
  }
}

const abi = output.contracts?.[sourceName]?.[contractName]?.abi;

if (!Array.isArray(abi)) {
  throw new Error("ABI not found from solc output");
}

const out = `export const CONTRACT_ADDRESS = "${deployment.address}";
export const CONTRACT_VERSION = "V2";

export const GIWA_SEPOLIA = {
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: {
    name: "GIWA Sepolia ETH",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia-rpc.giwa.io"],
    },
    public: {
      http: ["https://sepolia-rpc.giwa.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "GIWA Sepolia Explorer",
      url: "https://sepolia-explorer.giwa.io",
    },
  },
};

export const MOCK_ASSETS = [
  { id: 0, symbol: "mGIWA", label: "mGIWA", decimals: 18 },
  { id: 1, symbol: "mUSD", label: "mUSD", decimals: 18 },
  { id: 2, symbol: "mBTC", label: "mBTC", decimals: 8 },
];

export const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)};
`;

fs.writeFileSync("src/contract.js", out);

console.log("Exported V2 ABI from fresh solc compile");
console.log(`Address: ${deployment.address}`);
console.log(`ABI items: ${abi.length}`);
