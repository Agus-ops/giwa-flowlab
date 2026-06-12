import fs from "fs";
import path from "path";
import solc from "solc";

const contractName = "GIWAFlowLabV2";
const sourceName = "GIWAFlowLabV2.sol";
const contractPath = path.join("contracts", sourceName);
const source = fs.readFileSync(contractPath, "utf8");

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
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  for (const err of output.errors) {
    console.log(err.formattedMessage);
  }

  const hasError = output.errors.some((err) => err.severity === "error");
  if (hasError) process.exit(1);
}

const contract = output.contracts?.[sourceName]?.[contractName];

if (!contract) {
  throw new Error(`${contractName} compile output not found`);
}

fs.mkdirSync("artifacts", { recursive: true });

fs.writeFileSync(
  "artifacts/GIWAFlowLabV2.abi.json",
  JSON.stringify(contract.abi, null, 2)
);

fs.writeFileSync(
  "artifacts/GIWAFlowLabV2.bytecode.txt",
  contract.evm.bytecode.object
);

fs.writeFileSync(
  "artifacts/GIWAFlowLabV2.deployedBytecode.txt",
  contract.evm.deployedBytecode.object
);

console.log("Compiled GIWAFlowLabV2");
console.log("ABI items:", contract.abi.length);
console.log("Bytecode bytes:", contract.evm.bytecode.object.length / 2);
console.log("Runtime bytes:", contract.evm.deployedBytecode.object.length / 2);
