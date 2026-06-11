import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));

const provider = new ethers.JsonRpcProvider(process.env.GIWA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(deployment.address, abi, wallet);

const mGIWA = 0;
const mUSD = 1;

const before = await contract.getMockBalances(wallet.address);
console.log("Before mGIWA:", before.mGIWA.toString());
console.log("Before mUSD:", before.mUSD.toString());

const tx = await contract.swapMock(mGIWA, mUSD, 10);
console.log("Tx:", tx.hash);

const receipt = await tx.wait();
console.log("Status:", receipt.status);
console.log("Gas used:", receipt.gasUsed.toString());

const after = await contract.getMockBalances(wallet.address);
console.log("After mGIWA:", after.mGIWA.toString());
console.log("After mUSD:", after.mUSD.toString());
