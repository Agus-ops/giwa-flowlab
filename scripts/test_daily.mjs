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

console.log("Running dailyLoginAndSpin...");
const tx = await contract.dailyLoginAndSpin();
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const mockBalances = await contract.getMockBalances(wallet.address);
const daily = await contract.getUserDailyCounter(wallet.address);
const top3 = await contract.getCurrentTop3();
const roundInfo = await contract.getRoundInfo();

console.log("mGIWA:", mockBalances.mGIWA.toString());
console.log("mUSD:", mockBalances.mUSD.toString());
console.log("mBTC:", mockBalances.mBTC.toString());

console.log("Daily day:", daily.day.toString());
console.log("Scratch count:", daily.scratchCount.toString());
console.log("Wheel count:", daily.wheelCount.toString());
console.log("Daily login done:", daily.dailyLoginDone);
console.log("Swap point done:", daily.swapPointDone);

console.log("Round:", roundInfo.roundId.toString());
console.log("Rank1:", top3.rank1.user, "points:", top3.rank1.points.toString());
console.log("Rank2:", top3.rank2.user, "points:", top3.rank2.points.toString());
console.log("Rank3:", top3.rank3.user, "points:", top3.rank3.points.toString());
