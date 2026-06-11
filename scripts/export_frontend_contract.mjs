import fs from "fs";
import solc from "solc";

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const source = fs.readFileSync("contracts/GIWAFlowLab.sol", "utf8");

const input = {
  language: "Solidity",
  sources: {
    "GIWAFlowLab.sol": {
      content: source
    }
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
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

const abi = output.contracts?.["GIWAFlowLab.sol"]?.GIWAFlowLab?.abi;

if (!Array.isArray(abi)) {
  throw new Error("ABI not found from solc output");
}

const out = `export const CONTRACT_ADDRESS = "${deployment.address}";

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

export const CONTRACT_ABI = ${JSON.stringify(abi, null, 2)};
`;

fs.writeFileSync("src/contract.js", out);

console.log("Exported ABI from fresh solc compile");
console.log(`Address: ${deployment.address}`);
console.log(`ABI items: ${abi.length}`);
