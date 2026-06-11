import "dotenv/config";
import fs from "fs";
import { ethers } from "ethers";

const rpcUrl = process.env.GIWA_RPC_URL;
if (!rpcUrl) throw new Error("Missing GIWA_RPC_URL in .env");

const deployment = JSON.parse(fs.readFileSync("artifacts/deployment.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("artifacts/GIWAFlowLab.abi.json", "utf8"));

const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(deployment.address, abi, provider);

const code = await provider.getCode(deployment.address);
const owner = await contract.owner();
const roundId = await contract.currentRoundId();
const roundInfo = await contract.getRoundInfo();
const accounted = await contract.accountedNativeBalance();
const balance = await provider.getBalance(deployment.address);

console.log("GIWA FlowLab Post Deploy Check");
console.log("------------------------------");
console.log("Address:", deployment.address);
console.log("Code bytes:", (code.length - 2) / 2);
console.log("Owner:", owner);
console.log("Current round:", roundId.toString());
console.log("Round start:", roundInfo.startTime.toString());
console.log("Round end:", roundInfo.endTime.toString());
console.log("Round finalized:", roundInfo.finalized);
console.log("Can finalize:", roundInfo.canFinalize);
console.log("Contract balance:", ethers.formatEther(balance), "ETH");
console.log("Accounted balance:", ethers.formatEther(accounted), "ETH");

if (code === "0x") throw new Error("No contract code found");
if (owner.toLowerCase() !== deployment.deployer.toLowerCase()) {
  throw new Error("Owner mismatch");
}

console.log("PASS: post-deploy check OK");
