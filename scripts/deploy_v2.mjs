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

const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLabV2.abi.json", "utf8"));
const bytecode = fs.readFileSync("artifacts/GIWAFlowLabV2.bytecode.txt", "utf8");

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

console.log("Deployer:", wallet.address);

const balance = await provider.getBalance(wallet.address);
console.log("Balance:", ethers.formatEther(balance), "ETH");

const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);

console.log("Deploying GIWAFlowLabV2...");
const contract = await factory.deploy();

const tx = contract.deploymentTransaction();
console.log("Tx:", tx.hash);

await contract.waitForDeployment();

const address = await contract.getAddress();
console.log("GIWAFlowLabV2 deployed:", address);

fs.writeFileSync(
  "artifacts/deployment_v2.json",
  JSON.stringify(
    {
      network: "GIWA Sepolia",
      chainId: 91342,
      contract: "GIWAFlowLabV2",
      version: "V2",
      address,
      deployer: wallet.address,
      txHash: tx.hash,
      deployedAt: new Date().toISOString(),
      notes: [
        "Decimal-aware mock accounting",
        "mGIWA decimals: 18",
        "mUSD decimals: 18",
        "mBTC decimals: 8",
        "1 mBTC = 100,000 mUSD",
        "1 mGIWA = 1 mUSD"
      ]
    },
    null,
    2
  )
);

console.log("Saved artifacts/deployment_v2.json");
