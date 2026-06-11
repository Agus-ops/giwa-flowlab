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

const mGIWA = 0;
const mUSD = 1;
const amountIn = 100n;

const before = await contract.getMockBalances(wallet.address);
console.log("Before mGIWA:", before.mGIWA.toString());
console.log("Before mUSD:", before.mUSD.toString());

const quote = await contract.quoteMockSwap(mGIWA, mUSD, amountIn);
console.log("Quote amountOut:", quote.amountOut.toString());
console.log("Quote burnFee:", quote.burnFee.toString());

console.log("Running swapMock(mGIWA -> mUSD, 100)...");
const tx = await contract.swapMock(mGIWA, mUSD, amountIn);
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const after = await contract.getMockBalances(wallet.address);
const daily = await contract.getUserDailyCounter(wallet.address);
const top3 = await contract.getCurrentTop3();

console.log("After mGIWA:", after.mGIWA.toString());
console.log("After mUSD:", after.mUSD.toString());
console.log("Swap point done:", daily.swapPointDone);

console.log("Rank1:", top3.rank1.user, "points:", top3.rank1.points.toString());
console.log("Rank2:", top3.rank2.user, "points:", top3.rank2.points.toString());
console.log("Rank3:", top3.rank3.user, "points:", top3.rank3.points.toString());
