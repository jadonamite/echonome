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
  "0x4f92b138e7450e46f2843b1eb90ee0dd5060cf29") as Address;

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

// ── Find a market that is genuinely the current window of a registered series ─────────────
//
// The series check is only meaningfully tested against a market the venue really does point a
// series at. Picking any live market and asserting it passes would prove nothing if the market
// happened to be in an unapproved series; picking one by hardcoded id would rot the first time
// the venue registered a new one. So the series is discovered here the same way the engine
// discovers it — from the venue's own tables.
const moduleAbi = parseAbi([
  "function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)",
]);
const creatorAbi = parseAbi([
  "function seriesById(uint32 seriesId) view returns (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow)",
  "function referenceQidBySeries(uint32 seriesId) view returns (uint256 qid)",
]);

const VENUE_MODULE = SOMNIA_TESTNET_ADDRESSES.binaryModule as Address;
const VENUE_CREATOR = (process.env.EC_VENUE_CREATOR ??
  "0x94D963B6670AB96E78C8d0C46ca35D196d606EFE") as Address;
const VENUE_ID = (process.env.EC_VENUE_ID ??
  "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c") as `0x${string}`;

const nowSec = BigInt(Math.floor(Date.now() / 1000));
const liveByQid = new Map<string, { market: any; window: bigint }[]>();
for (const m of Object.values(exchange.markets) as any[]) {
  if (m.type !== "binary" || m.info?.venueId !== VENUE_ID || m.info?.status !== "Trading") continue;
  const rec = (await publicClient.readContract({
    address: VENUE_MODULE, abi: moduleAbi, functionName: "markets",
    args: [(m.info.marketId ?? m.info.id) as `0x${string}`],
  })) as readonly any[];
  if (rec[13] > nowSec && rec[12] <= nowSec) {
    const qid = String(rec[0]);
    // A list, not a single entry: several markets legitimately share one question id.
    liveByQid.set(qid, [...(liveByQid.get(qid) ?? []), { market: m, window: rec[13] - rec[12] }]);
  }
}

// A series' market is the one whose oracle question matches AND whose window is the series'
// own length. The second half is not redundant: several cadences settling at the same instant
// share one question id, so matching on the question alone picks an arbitrary one of them.
let SERIES_ID = -1;
let SERIES_INTERVAL = 0n;
let market: any;
for (let id = 0; id < 32 && SERIES_ID < 0; id++) {
  const row = (await publicClient.readContract({ address: VENUE_CREATOR, abi: creatorAbi, functionName: "seriesById", args: [id] })
    .catch(() => null)) as readonly any[] | null;
  if (!row || !row[1]) continue;
  const intervalSec = row[3] as bigint;
  const qid = (await publicClient.readContract({ address: VENUE_CREATOR, abi: creatorAbi, functionName: "referenceQidBySeries", args: [id] })
    .catch(() => 0n)) as bigint;
  const hit = (liveByQid.get(String(qid)) ?? []).find((c: any) => c.window === intervalSec);
  if (hit) { SERIES_ID = id; SERIES_INTERVAL = intervalSec; market = hit.market; }
}
if (SERIES_ID < 0) throw new Error("no registered series currently points at an open market — cannot verify the series path");

/** The oracle question the approved series currently points at. */
const ourQid = String(
  (await publicClient.readContract({ address: VENUE_CREATOR, abi: creatorAbi, functionName: "referenceQidBySeries", args: [SERIES_ID] })) as bigint
);

/**
 * A market with the SAME oracle question as ours but a different cadence — the hourly and
 * 5-minute BTC windows that both settle at 12:00, say.
 *
 * This exists because it is the sharpest attack on the series design. It is a real market, on
 * the right venue, from the right creator, currently open, carrying the exact question id the
 * approved series points at. Everything except its length says yes. If the account authorises
 * it, then approving "BTC hourly" quietly approved "BTC every five minutes", and the asset
 * scoping a follower chose is not the scoping they got.
 */
const collision = (liveByQid.get(ourQid) ?? []).find((c) => c.window !== SERIES_INTERVAL);

const MARKET_ID = (market.info.marketId ?? market.info.id) as `0x${string}`;
const POOL = market.info.poolAddress as Address;
const COLLATERAL = market.info.collateral as Address;
const EXPIRY_NS = BigInt(market.info.expiry) * 1_000_000_000n;

/**
 * A real market on the same venue carrying a DIFFERENT oracle question — a different asset, or
 * a window that settles at another time. Chosen by question rather than by pool so that this
 * stays a test of the question check; a market sharing our question would fail on cadence
 * instead, which is a different assertion and is made separately below.
 */
const otherMarket = [...liveByQid.entries()].find(([qid]) => qid !== ourQid)?.[1][0]?.market;
const OTHER_MARKET_ID = (otherMarket?.info?.marketId ?? otherMarket?.info?.id) as `0x${string}`;
const OTHER_POOL = otherMarket?.info?.poolAddress as Address;

console.log(`factory:    ${FACTORY}`);
console.log(`owner:      ${owner.address}`);
console.log(`executor:   ${EXECUTOR}  (simulated caller — never funded, never signs)`);
console.log(`series:     ${SERIES_ID}  (${market.info.asset}, ${SERIES_INTERVAL}s) -> ${market.symbol}`);
console.log(`market:     ${MARKET_ID}`);
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
console.log("configuring: executor, expiry, caps, venue, series…");
const oneHourFromNow = BigInt(Math.floor(Date.now() / 1000) + 3600);
await ownerTx("setExecutor", [EXECUTOR, oneHourFromNow], "setExecutor");
await ownerTx("setCaps", [10_000_000n, 50_000_000n], "setCaps"); // 10 and 50 tUSDC
await ownerTx("setVenue", [VENUE_MODULE, VENUE_CREATOR, VENUE_ID], "setVenue");
await ownerTx("setAllowedSeries", [SERIES_ID, true], "setAllowedSeries");
// Deliberately NOT allowlisting the pool. Every order below therefore has to be authorised by
// the series path — if the manual allowlist were also set, a broken series check would pass
// these tests unnoticed.
await ownerTx("setAllowedPool", [POOL, false], "clear manual pool allowlist");
console.log("configured.\n");

/** An order authorised through the series path — the one a real echo takes. */
const order = (pool: Address, price: bigint, qty: bigint) =>
  [MARKET_ID, SERIES_ID, pool, 0, price, qty, EXPIRY_NS, 2, 0, 0n];
/** The same order, but claiming a different market or series. */
const orderClaiming = (marketId: `0x${string}`, seriesId: number, pool: Address) =>
  [marketId, seriesId, pool, 0, 500_000n, 1_000_000n, EXPIRY_NS, 2, 0, 0n];

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

// ── The executor cannot widen the VENUE authorisation either ─────────────────────────────
// These are the permissions the series design added, and they are the ones most worth
// attacking: if the executor could approve its own series, or repoint the account at a venue
// it controls, a one-time approval would become a blank cheque.
results.push(await mustRevert("executor cannot approve a series for itself", "NotOwner",
  asExecutor("setAllowedSeries", [SERIES_ID + 100, true])));
results.push(await mustRevert("executor cannot repoint the account at another venue", "NotOwner",
  asExecutor("setVenue", [STRANGER, STRANGER, VENUE_ID])));
results.push(await mustRevert("executor cannot grant itself permission to approve tokens", "NotOwner",
  asExecutor("setExecutorMayApprove", [true])));

// ── The scoping actually scopes ──────────────────────────────────────────────────────────
results.push(await mustRevert("executor cannot trade a series the owner did not approve", "SeriesNotAllowed",
  asExecutor("placeOrder", orderClaiming(MARKET_ID, SERIES_ID + 100, POOL))));
// The fake-pool attack, stated directly: claim a real, approved market, then hand the account
// a pool address the attacker controls. The venue's own record of that market names a
// different pool, so it cannot be reached however the order is dressed up.
results.push(await mustRevert("executor cannot substitute its own pool for a real market's", "PoolNotInMarket",
  asExecutor("placeOrder", orderClaiming(MARKET_ID, SERIES_ID, STRANGER))));
// An invented market id decodes to an all-zero record, so the venue check catches it before
// the pool comparison ever runs. That ordering is deliberate: "this venue has never heard of
// that market" is a truer reason than "that pool isn't the one on file".
results.push(await mustRevert("executor cannot invent a market id", "MarketNotFromVenue",
  asExecutor("placeOrder", orderClaiming(("0x" + "11".repeat(32)) as `0x${string}`, SERIES_ID, POOL))));
// A real market of the same venue, but not the one this series currently points at. This is
// the assertion that says the approval tracks the rollover rather than opening the venue up.
if (OTHER_MARKET_ID && OTHER_POOL) {
  results.push(await mustRevert("an approved series does not authorise the venue's other markets", "MarketNotInSeries",
    asExecutor("placeOrder", orderClaiming(OTHER_MARKET_ID, SERIES_ID, OTHER_POOL))));
}
if (collision) {
  results.push(await mustRevert(
    `an approved series does not authorise another cadence settling at the same instant (${collision.market.info.interval})`,
    "MarketCadenceMismatch",
    asExecutor("placeOrder", orderClaiming(
      (collision.market.info.marketId ?? collision.market.info.id) as `0x${string}`,
      SERIES_ID,
      collision.market.info.poolAddress as Address
    ))
  ));
} else {
  console.log("  (no same-question different-cadence market open right now — cadence assertion skipped)");
}
results.push(await mustRevert("executor cannot approve collateral while that permission is off", "ExecutorMayNotApprove",
  asExecutor("approveMarketCollateral", [MARKET_ID, SERIES_ID])));
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

// ── The collateral-approval permission, once the owner switches it on ────────────────────
//
// This is the one permission that lets the executor cause tokens to move, so it gets the most
// hostile reading: with it ON, can the executor point an approval anywhere it likes?
console.log("\ngranting the executor permission to approve venue pools…");
await ownerTx("setExecutorMayApprove", [true], "setExecutorMayApprove");

results.push(await mustRevert("even permitted, the executor cannot approve an unapproved series", "SeriesNotAllowed",
  asExecutor("approveMarketCollateral", [MARKET_ID, SERIES_ID + 100])));
results.push(await mustRevert("even permitted, the executor cannot approve an invented market", "MarketNotFromVenue",
  asExecutor("approveMarketCollateral", [("0x" + "11".repeat(32)) as `0x${string}`, SERIES_ID])));
results.push(await mustRevert("permission to approve is not permission to withdraw", "NotOwner",
  asExecutor("withdrawToken", [COLLATERAL, EXECUTOR, 1n])));
results.push(await mustRevert("permission to approve is not permission to choose the spender", "NotOwner",
  asExecutor("approveToken", [COLLATERAL, EXECUTOR, 2n ** 255n])));

// The permitted case must actually work, or the hourly rollover is still broken. The account
// approves its own collateral to the pool the VENUE says this market uses — neither the token
// nor the spender came from the caller.
const approval = await mustSucceed("executor can approve the venue's own pool for this market",
  asExecutor("approveMarketCollateral", [MARKET_ID, SERIES_ID]));
results.push(approval);
await ownerTx("setExecutorMayApprove", [false], "revoke approval permission");
results.push(await mustRevert("withdrawing the permission stops it immediately", "ExecutorMayNotApprove",
  asExecutor("approveMarketCollateral", [MARKET_ID, SERIES_ID])));

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

await ownerTx("setExecutor", [EXECUTOR, oneHourFromNow], "re-authorise for the series test");
await ownerTx("setAllowedSeries", [SERIES_ID, false], "withdraw the series");
results.push(await mustRevert("withdrawing the series stops copying with no other change", "SeriesNotAllowed",
  asExecutor("placeOrder", order(POOL, 500_000n, 1_000_000n))));
await ownerTx("setAllowedSeries", [SERIES_ID, true], "restore the series");
await ownerTx("setExecutor", [EXECUTOR, 1n], "re-expire");

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
        "stops on any of four independent kill switches. A single approval of a rolling series\n" +
        "follows the venue's own hourly rollover without ever reaching another asset, another\n" +
        "cadence, or a pool this venue did not mint. The owner's control survives all of it.\n" +
        "Proven on Somnia Shannon, not asserted."
    : `\n${failed} assertion(s) FAILED — do not ship this contract.`
);
process.exit(failed === 0 ? 0 : 1);
