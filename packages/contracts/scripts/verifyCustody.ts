/**
 * Proves, against live Shannon, that Echonome's executor cannot take a follower's money.
 *
 *   npm run verify:custody -w @echonome/contracts
 *
 * This is the claim the entire product rests on, so it is tested adversarially: every
 * assertion below is an attempt to do something the executor must not be able to do, and the
 * test passes only when the chain refuses it WITH THE EXPECTED ERROR. "It reverted" is a much
 * weaker statement than "it reverted with NotOwner" — the first is satisfied by a typo.
 *
 * The owner sends real transactions. The executor's attempts are `eth_call` simulations with
 * `from` set to the executor: access control is enforced identically either way, the executor
 * needs no gas, and no failed transaction litters the chain. The one thing simulation cannot
 * prove is that a permitted order actually fills, which is a separate concern and not what
 * this script is about.
 */
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { artifact, publicClient, wallet, send, mustRevert, mustSucceed, report, GAS, type Result } from "./lib.js";

const FACTORY = (process.env.ECHO_ACCOUNT_FACTORY ??
  "0xcee09039dc8020e01a12387eaa37b6a257b793d7") as Address;

/** Any address will do — it never sends a transaction, only appears as `from` in eth_call. */
const EXECUTOR = "0x000000000000000000000000000000000000bEEF" as Address;
const STRANGER = "0x000000000000000000000000000000000000dEaD" as Address;

const ownerKey = process.env.OPERATOR_PRIVATE_KEY;
if (!ownerKey) throw new Error("OPERATOR_PRIVATE_KEY is not set");
const { account: owner, client } = wallet(ownerKey);

const accountAbi = artifact("EchoAccount").abi;
const factoryAbi = artifact("EchoAccountFactory").abi;

// ── Find a real live pool and its collateral token, so the tests use real arguments ──────
const exchange = new SomniaMarkets({
  indexerUrl: process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql",
  chain: somniaShannon,
  wsRpcUrl: process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
});
await exchange.loadMarkets(true);
const market = (Object.values(exchange.markets) as any[]).find((m) => m.type === "binary");
const POOL = market.info.poolAddress as Address;
const COLLATERAL = market.info.collateral as Address;
const EXPIRY_NS = BigInt(market.info.expiry) * 1_000_000_000n;

console.log(`factory:    ${FACTORY}`);
console.log(`owner:      ${owner.address}`);
console.log(`executor:   ${EXECUTOR}  (simulated caller — never funded, never signs)`);
console.log(`pool:       ${POOL}`);
console.log(`collateral: ${COLLATERAL}\n`);

// ── Deploy (or reuse) this owner's account ───────────────────────────────────────────────
const predicted = (await publicClient.readContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: "accountFor",
  args: [owner.address],
})) as Address;

const existing = await publicClient.getCode({ address: predicted });
if (!existing || existing === "0x") {
  console.log("deploying account…");
  const hash = await client.writeContract({ address: FACTORY, abi: factoryAbi, functionName: "deploy", gas: GAS * 6n });
  if (!(await send(hash, "deploy"))) throw new Error("account deployment failed");
}
const ACCOUNT = predicted;
console.log(`account:    ${ACCOUNT} ${existing && existing !== "0x" ? "(already deployed)" : "(freshly deployed)"}\n`);

const results: Result[] = [];
const asExecutor = (functionName: string, args: unknown[]) => () =>
  publicClient.simulateContract({ account: EXECUTOR, address: ACCOUNT, abi: accountAbi, functionName, args });
const asOwner = (functionName: string, args: unknown[]) => () =>
  publicClient.simulateContract({ account: owner.address, address: ACCOUNT, abi: accountAbi, functionName, args });
const ownerTx = async (functionName: string, args: unknown[], label: string) => {
  const hash = await client.writeContract({ address: ACCOUNT, abi: accountAbi, functionName, args, gas: GAS });
  if (!(await send(hash, label))) throw new Error(`${label} failed`);
};

// The address CREATE2 promised is the address that exists. If this is ever false, a follower
// could be told to fund an address their account does not live at.
results.push({
  name: "factory's predicted address is the address deployed",
  passed: (await publicClient.getCode({ address: ACCOUNT }))?.startsWith("0x60") ?? false,
  detail: ACCOUNT,
});

results.push(
  await mustRevert("a second deploy() by the same owner is refused", "AlreadyDeployed", () =>
    publicClient.simulateContract({ account: owner.address, address: FACTORY, abi: factoryAbi, functionName: "deploy" })
  )
);

// ── Configure the account the way a real follower would ──────────────────────────────────
console.log("configuring: executor, expiry, caps, allowed pool…");
const oneHourFromNow = BigInt(Math.floor(Date.now() / 1000) + 3600);
await ownerTx("setExecutor", [EXECUTOR, oneHourFromNow], "setExecutor");
await ownerTx("setCaps", [10_000_000n, 50_000_000n], "setCaps"); // 10 and 50 tUSDC
await ownerTx("setAllowedPool", [POOL, true], "setAllowedPool");
console.log("configured.\n");

const order = (pool: Address, price: bigint, qty: bigint) => [pool, 0, price, qty, EXPIRY_NS, 2, 0, 0n];

// ── THE CENTRAL CLAIM: the executor cannot move funds, in any state, by any route ─────────
results.push(await mustRevert("executor cannot withdraw ERC-20", "NotOwner",
  asExecutor("withdrawToken", [COLLATERAL, EXECUTOR, 1n])));
results.push(await mustRevert("executor cannot withdraw native", "NotOwner",
  asExecutor("withdrawNative", [EXECUTOR, 1n])));
results.push(await mustRevert("executor cannot approve a token to itself", "NotOwner",
  asExecutor("approveToken", [COLLATERAL, EXECUTOR, 2n ** 255n])));
results.push(await mustRevert("executor cannot make an arbitrary call", "NotOwner",
  asExecutor("ownerCall", [COLLATERAL, 0n, "0x"])));

// ── The executor cannot widen its own authority ──────────────────────────────────────────
results.push(await mustRevert("executor cannot raise its own caps", "NotOwner",
  asExecutor("setCaps", [2n ** 200n, 2n ** 200n])));
results.push(await mustRevert("executor cannot extend its own expiry", "NotOwner",
  asExecutor("setExecutor", [EXECUTOR, 2n ** 63n])));
results.push(await mustRevert("executor cannot allowlist a new pool", "NotOwner",
  asExecutor("setAllowedPool", [STRANGER, true])));
results.push(await mustRevert("executor cannot unpause itself", "NotOwner",
  asExecutor("setPaused", [false])));
results.push(await mustRevert("executor cannot reset the spent budget", "NotOwner",
  asExecutor("resetCommitted", [])));

// ── A stranger has no authority at all ───────────────────────────────────────────────────
results.push(await mustRevert("a stranger cannot place an order", "NotExecutor", () =>
  publicClient.simulateContract({ account: STRANGER, address: ACCOUNT, abi: accountAbi, functionName: "placeOrder", args: order(POOL, 500_000n, 1_000_000n) })));
results.push(await mustRevert("a stranger cannot withdraw", "NotOwner", () =>
  publicClient.simulateContract({ account: STRANGER, address: ACCOUNT, abi: accountAbi, functionName: "withdrawToken", args: [COLLATERAL, STRANGER, 1n] })));

// ── The scoping actually scopes ──────────────────────────────────────────────────────────
results.push(await mustRevert("executor cannot trade a pool that isn't allowlisted", "PoolNotAllowed",
  asExecutor("placeOrder", order(STRANGER, 500_000n, 1_000_000n))));
results.push(await mustRevert("executor cannot exceed the per-order cap", "OrderTooLarge",
  asExecutor("placeOrder", order(POOL, 900_000n, 100_000_000n))));
// The lifetime budget needs its own configuration to test in isolation: with a 10 tUSDC
// per-order cap and a 50 tUSDC budget, no single order can breach the budget without
// breaching the per-order cap first, so the wrong guard fires and the assertion proves
// nothing. Narrowing the budget below the per-order cap isolates it. (The first version of
// this test made exactly that mistake and reported OrderTooLarge as a budget failure.)
console.log("narrowing the budget below the per-order cap to isolate it…");
await ownerTx("setCaps", [10_000_000n, 5_000_000n], "narrow budget");
results.push(await mustRevert("executor cannot exceed the lifetime budget", "BudgetExhausted",
  asExecutor("placeOrder", order(POOL, 800_000n, 10_000_000n)))); // 8 tUSDC: under the per-order cap, over the 5 budget
await ownerTx("setCaps", [10_000_000n, 50_000_000n], "restore caps");

// ── The executor's guards let a legitimate order through ─────────────────────────────────
// It may still fail INSIDE the pool (this account holds no collateral yet), which is fine and
// is the point: what must not happen is a rejection by one of our own guards.
const legit = await mustRevert("a legitimate order reaches the pool (not blocked by our guards)", "__never__",
  asExecutor("placeOrder", order(POOL, 500_000n, 1_000_000n)));
const blockedByUs = /NotExecutor|AccountPaused|ExecutorExpired|PoolNotAllowed|OrderTooLarge|BudgetExhausted/.test(
  legit.detail
);
// What "reached the pool" looks like in practice. Both observed outcomes are pool-level
// trading conditions from an account that is deployed but not yet funded or approved, and
// either one is proof the order got past every guard in this contract:
//
//   0xd48c4403  ImmediateOrCancelNoFill        — accepted, nothing to cross with
//   0xfb8f41b2  ERC20InsufficientAllowance     — accepted, MATCHED a counterparty, and then
//                                                failed escrowing collateral because a fresh
//                                                account has not approved the pool yet
//
// The second is the deeper proof: the order reached real order matching. A permission failure
// could never get that far. Both are listed because which one you get depends on the live
// book, and a test pinned to one of them would break for a reason that is not a defect.
const POOL_LEVEL_OUTCOMES = ["0xd48c4403", "ImmediateOrCancelNoFill", "0xfb8f41b2", "ERC20InsufficientAllowance"];
const reachedMatching = POOL_LEVEL_OUTCOMES.some((sig) => legit.detail.includes(sig));
results.push({
  name: "a legitimate order passes every guard and reaches real order matching",
  passed: !blockedByUs,
  detail: blockedByUs
    ? `blocked by our own guard: ${legit.detail}`
    : reachedMatching
      ? "the pool accepted it and processed it as a real order — the only thing that stopped it was this account not yet holding or approving collateral"
      : `reached the pool: ${legit.detail}`,
});

// ── Each kill switch, and the owner's authority surviving all of them ────────────────────
console.log("\ntesting kill switches…");
await ownerTx("setPaused", [true], "pause");
results.push(await mustRevert("pause stops the executor immediately", "AccountPaused",
  asExecutor("placeOrder", order(POOL, 500_000n, 1_000_000n))));
results.push(await mustSucceed("owner can still withdraw while paused", asOwner("withdrawToken", [COLLATERAL, owner.address, 0n])));
await ownerTx("setPaused", [false], "unpause");

await ownerTx("setExecutor", [EXECUTOR, 1n], "expire");
results.push(await mustRevert("a lapsed expiry stops the executor with no action needed", "ExecutorExpired",
  asExecutor("placeOrder", order(POOL, 500_000n, 1_000_000n))));
results.push(await mustSucceed("owner can still withdraw after expiry", asOwner("withdrawToken", [COLLATERAL, owner.address, 0n])));

await ownerTx("revokeExecutor", [], "revoke");
results.push(await mustRevert("revocation is permanent", "NotExecutor",
  asExecutor("placeOrder", order(POOL, 500_000n, 1_000_000n))));
results.push(await mustSucceed("owner can still withdraw after revocation", asOwner("withdrawToken", [COLLATERAL, owner.address, 0n])));
// A REAL call, not empty calldata: `ownerCall(token, 0, "0x")` hits the token's non-existent
// fallback and reverts, which says nothing about the escape hatch. balanceOf(account) is a
// call that should genuinely succeed, and proves the owner can still reach any contract —
// which is what makes settlement and future venue changes survivable without an upgrade.
const balanceOfCalldata = encodeFunctionData({
  abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
  args: [ACCOUNT],
});
results.push(await mustSucceed("owner keeps their arbitrary-call escape hatch",
  asOwner("ownerCall", [COLLATERAL, 0n, balanceOfCalldata])));

const failed = report(results);
console.log(
  failed === 0
    ? "\nThe executor cannot move this account's funds, cannot widen its own authority, and\n" +
        "stops on any of three independent kill switches. The owner's control survives all of\n" +
        "them. Proven on Somnia Shannon, not asserted."
    : `\n${failed} assertion(s) FAILED — do not ship this contract.`
);
process.exit(failed === 0 ? 0 : 1);
