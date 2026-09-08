/**
 * Deploys `EchoAccountFactory` to Shannon and prints the address to record.
 *
 *   npm run deploy -w @echonome/contracts
 *
 * One factory serves every follower, so this runs once per chain. The address becomes a public
 * constant the frontend and the worker both read, and which a follower can use to verify that
 * the account they are about to deploy is the code we published.
 */
import { encodeDeployData } from "viem";
import { artifact, publicClient, wallet } from "./lib.js";

/** 10**6 — one whole outcome share on every Event Contracts market observed on this venue
 *  (baseDecimals 6, verified live). Baked into the factory so every account it deploys sizes
 *  its collateral checks identically. */
const ONE_SHARE = 1_000_000n;

/**
 * Gas is ESTIMATED rather than guessed, because the guesses were wrong twice and in the same
 * misleading way: a deployment that runs out of gas reverts with `gasUsed` exactly equal to
 * the limit, which is indistinguishable from a logic revert unless you compare those two
 * numbers. `eth_estimateGas` returned ~34M for this factory — Somnia prices code deposit
 * steeply, and the factory is large because it embeds `EchoAccount`'s entire creation code,
 * which is what makes CREATE2 address prediction possible.
 *
 * Worth recording as a real product cost, not just a deploy detail: at this price per byte, a
 * contract per follower is not free. If it becomes a problem the answer is an EIP-1167 minimal
 * proxy pointing at one shared implementation — far cheaper per account, at the cost of moving
 * `owner` from an immutable into storage and initialising it, which weakens the strongest
 * property this contract has. Not a trade worth making until the cost actually bites.
 */
const GAS_BUFFER_PERCENT = 25n;

const key = process.env.OPERATOR_PRIVATE_KEY;
if (!key) throw new Error("OPERATOR_PRIVATE_KEY is not set — see apps/worker/.env.example");

const { account, client } = wallet(key);
const factory = artifact("EchoAccountFactory");

console.log(`deployer: ${account.address}`);
console.log(`balance:  ${await publicClient.getBalance({ address: account.address })} wei`);

const deployData = encodeDeployData({ abi: factory.abi, bytecode: factory.bytecode, args: [ONE_SHARE] });
const estimated = await publicClient.estimateGas({ account: account.address, data: deployData });
const gas = estimated + (estimated * GAS_BUFFER_PERCENT) / 100n;
console.log(`estimated gas: ${estimated} (sending with ${gas})`);

const hash = await client.deployContract({
  abi: factory.abi,
  bytecode: factory.bytecode,
  args: [ONE_SHARE],
  gas,
});
console.log(`deploy tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
if (receipt.status !== "success" || !receipt.contractAddress) {
  console.error(`deployment failed (status ${receipt.status})`);
  process.exit(1);
}

console.log(`\nEchoAccountFactory: ${receipt.contractAddress}`);
console.log(`gas used: ${receipt.gasUsed}`);
console.log(`\nRecord as ECHO_ACCOUNT_FACTORY in apps/worker/.env and`);
console.log(`NEXT_PUBLIC_ECHO_ACCOUNT_FACTORY in apps/web/.env`);
process.exit(0);
