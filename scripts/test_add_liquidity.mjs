import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));

const provider = new ethers.JsonRpcProvider(process.env.GIWA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.address, abi, wallet);

const pairMGIWA_MUSD = 0;

const before = await contract.getMockBalances(wallet.address);
console.log("Before mGIWA:", before.mGIWA.toString());
console.log("Before mUSD:", before.mUSD.toString());

console.log("Adding liquidity: 100 mGIWA + 100 mUSD");
const tx = await contract.addLiquidity(pairMGIWA_MUSD, 100, 100);
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const after = await contract.getMockBalances(wallet.address);
const positions = await contract.getUserPositions(wallet.address);
const top3 = await contract.getCurrentTop3();

console.log("After mGIWA:", after.mGIWA.toString());
console.log("After mUSD:", after.mUSD.toString());
console.log("Positions:", positions.map((x) => x.toString()).join(", "));

const lastId = positions[positions.length - 1];
const pending = await contract.pendingApr(lastId);
console.log("Pending APR for last position:", pending.toString());

console.log("Rank1:", top3.rank1.user, "points:", top3.rank1.points.toString());
console.log("Rank2:", top3.rank2.user, "points:", top3.rank2.points.toString());
console.log("Rank3:", top3.rank3.user, "points:", top3.rank3.points.toString());
