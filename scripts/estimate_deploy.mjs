import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const rpcUrl = process.env.GIWA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("Missing GIWA_RPC_URL in .env");
if (!privateKey) throw new Error("Missing PRIVATE_KEY in .env");

const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));
const bytecode = fs.readFileSync("artifacts/GIWAFlowLab.bytecode.txt", "utf8");

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

const factory = new ethers.ContractFactory(abi, "0x" + bytecode, wallet);
const deployTx = await factory.getDeployTransaction();

const gas = await provider.estimateGas({
  from: wallet.address,
  data: deployTx.data
});

const feeData = await provider.getFeeData();
const balance = await provider.getBalance(wallet.address);

const gasPrice = feeData.gasPrice ?? 0n;
const estimatedCost = gas * gasPrice;

console.log("GIWA FlowLab Deploy Estimate");
console.log("----------------------------");
console.log("Wallet:", wallet.address);
console.log("Balance:", ethers.formatEther(balance), "ETH");
console.log("Gas estimate:", gas.toString());
console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
console.log("Estimated cost:", ethers.formatEther(estimatedCost), "ETH");

if (estimatedCost > balance) {
  throw new Error("Insufficient balance for deploy");
}

console.log("PASS: deploy estimate OK");
