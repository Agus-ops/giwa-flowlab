import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const rpcUrl = process.env.GIWA_RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

if (!rpcUrl) throw new Error("Missing GIWA_RPC_URL in .env");
if (!privateKey) throw new Error("Missing PRIVATE_KEY in .env");

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(deployment.address, abi, wallet);

const amount = ethers.parseEther("0.0001");

console.log("Depositing:", ethers.formatEther(amount), "ETH");
console.log("Wallet:", wallet.address);
console.log("Contract:", deployment.address);

const tx = await contract.depositNative({ value: amount });
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const nativeAccount = await contract.getNativeAccount(wallet.address);
const mockBalances = await contract.getMockBalances(wallet.address);
const roundInfo = await contract.getRoundInfo();

console.log("Deposit balance:", ethers.formatEther(nativeAccount.depositBalance), "ETH");
console.log("Lifetime deposited:", ethers.formatEther(nativeAccount.lifetimeDeposited), "ETH");
console.log("Deposit reward minted:", nativeAccount.depositRewardMinted.toString(), "mGIWA");
console.log("Eligible since:", nativeAccount.eligibleSince.toString());
console.log("Pending native reward:", ethers.formatEther(nativeAccount.pendingReward), "ETH");

console.log("mGIWA:", mockBalances.mGIWA.toString());
console.log("mUSD:", mockBalances.mUSD.toString());
console.log("mBTC:", mockBalances.mBTC.toString());

console.log("Current round:", roundInfo.roundId.toString());
