import fs from "fs";
import path from "path";
import solc from "solc";

const contractPath = path.join("contracts", "GIWAFlowLab.sol");
const source = fs.readFileSync(contractPath, "utf8");

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

const contract = output.contracts["GIWAFlowLab.sol"]["GIWAFlowLab"];

fs.mkdirSync("artifacts", { recursive: true });

fs.writeFileSync(
  "artifacts/GIWAFlowLab.abi.json",
  JSON.stringify(contract.abi, null, 2)
);

fs.writeFileSync(
  "artifacts/GIWAFlowLab.bytecode.txt",
  contract.evm.bytecode.object
);

console.log("Compiled GIWAFlowLab");
console.log("ABI items:", contract.abi.length);
console.log("Bytecode bytes:", contract.evm.bytecode.object.length / 2);
