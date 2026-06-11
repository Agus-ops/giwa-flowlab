import "dotenv/config";
import { ethers } from "ethers";

const rpcUrl = process.env.GIWA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) {
  throw new Error("Missing GIWA_RPC_URL in .env");
}

if (!privateKey) {
  throw new Error("Missing PRIVATE_KEY in .env");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const network = await provider.getNetwork();
const balance = await provider.getBalance(wallet.address);
const blockNumber = await provider.getBlockNumber();

console.log("GIWA FlowLab Deploy Preflight");
console.log("-----------------------------");
console.log("RPC:", rpcUrl);
console.log("Chain ID:", network.chainId.toString());
console.log("Block:", blockNumber);
console.log("Wallet:", wallet.address);
console.log("Balance:", ethers.formatEther(balance), "ETH");

if (network.chainId !== 91342n) {
  throw new Error(`Wrong chainId: expected 91342, got ${network.chainId}`);
}

if (balance === 0n) {
  throw new Error("Wallet has zero ETH on GIWA Sepolia");
}

console.log("PASS: preflight OK");
