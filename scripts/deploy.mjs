import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const rpcUrl = process.env.GIWA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) {
  throw new Error("Missing GIWA_RPC_URL in .env");
}

if (!privateKey) {
  throw new Error("Missing PRIVATE_KEY in .env");
}

const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));
const bytecode = fs.readFileSync("artifacts/GIWAFlowLab.bytecode.txt", "utf8");

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

console.log("Deployer:", wallet.address);

const balance = await provider.getBalance(wallet.address);
console.log("Balance:", ethers.formatEther(balance), "ETH");

const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);

console.log("Deploying GIWAFlowLab...");
const contract = await factory.deploy();

console.log("Tx:", contract.deploymentTransaction().hash);

await contract.waitForDeployment();

const address = await contract.getAddress();
console.log("GIWAFlowLab deployed:", address);

fs.writeFileSync(
  "artifacts/deployment.json",
  JSON.stringify(
    {
      network: "GIWA Sepolia",
      chainId: 91342,
      contract: "GIWAFlowLab",
      address,
      deployer: wallet.address,
      txHash: contract.deploymentTransaction().hash,
      deployedAt: new Date().toISOString()
    },
    null,
    2
  )
);

console.log("Saved artifacts/deployment.json");
