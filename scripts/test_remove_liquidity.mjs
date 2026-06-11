import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));

const provider = new ethers.JsonRpcProvider(process.env.GIWA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.address, abi, wallet);

const positions = await contract.getUserPositions(wallet.address);
const positionId = positions[positions.length - 1];

console.log("Position ID:", positionId.toString());

const before = await contract.getMockBalances(wallet.address);
const topBefore = await contract.getCurrentTop3();

console.log("Before mGIWA:", before.mGIWA.toString());
console.log("Before mUSD:", before.mUSD.toString());
console.log("Points before:", topBefore.rank1.points.toString());

console.log("Running removeLiquidity...");
const tx = await contract.removeLiquidity(positionId);
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const after = await contract.getMockBalances(wallet.address);
const topAfter = await contract.getCurrentTop3();
const pendingAfter = await contract.pendingApr(positionId);

console.log("After mGIWA:", after.mGIWA.toString());
console.log("After mUSD:", after.mUSD.toString());
console.log("Pending APR after:", pendingAfter.toString());
console.log("Points after:", topAfter.rank1.points.toString());
