import "dotenv/config";
import fs from "fs";
import solc from "solc";
import { ethers } from "ethers";

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
        "*": ["evm.deployedBytecode", "metadata"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const err of output.errors) {
    console.log(err.formattedMessage);
  }
}

const localRuntime =
  "0x" + output.contracts["GIWAFlowLab.sol"]["GIWAFlowLab"].evm.deployedBytecode.object;

const provider = new ethers.JsonRpcProvider(process.env.GIWA_RPC_URL);
const chainRuntime = await provider.getCode(deployment.address);

console.log("Contract:", deployment.address);
console.log("Local runtime bytes:", (localRuntime.length - 2) / 2);
console.log("Chain runtime bytes:", (chainRuntime.length - 2) / 2);
console.log("Exact match:", localRuntime.toLowerCase() === chainRuntime.toLowerCase());

if (localRuntime.toLowerCase() !== chainRuntime.toLowerCase()) {
  let i = 2;
  while (
    i < localRuntime.length &&
    i < chainRuntime.length &&
    localRuntime[i].toLowerCase() === chainRuntime[i].toLowerCase()
  ) {
    i++;
  }

  console.log("First diff hex index:", i);
  console.log("Local around:", localRuntime.slice(Math.max(0, i - 40), i + 80));
  console.log("Chain around:", chainRuntime.slice(Math.max(0, i - 40), i + 80));
}
