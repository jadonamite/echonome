/**
 * Stands up one real follower, end to end, so the mirror engine has something to echo into.
 *
 *   npm run demo:follower
 *
 * Creates a genuinely INDEPENDENT follower rather than reusing an existing wallet: a fresh
 * key, seeded with gas from the operator and with its own collateral from the SDK faucet. That
 * independence is the point — if the follower were the operator, or one of our seed traders,
 * the resulting "the operator cannot touch their funds" demonstration would be worth nothing.
 *
 * Idempotent: re-running it reuses the wallet and account it already made, and only performs
 * the steps still outstanding.
 */
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createReadOnlyExchange, isTradeableTargetMarket } from "./chain/client.js";
import { echoAccountAbi, echoAccountFactoryAbi, echoAccountFactoryAddress } from "./chain/echoAccount.js";
import { query, queryOne, end } from "./db/client.js";

const KEY_FILE = new URL("../.demo-follower.key", import.meta.url).pathname;
const GAS = 5_000_000n;
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const pub = createPublicClient({ chain: somniaShannon, transport: http() });

async function confirm(hash: `0x${string}`, label: string) {
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`  ${label}: ${receipt.status}`);
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
}

// ── 1. The follower's own wallet ─────────────────────────────────────────────────────────
if (!existsSync(KEY_FILE)) {
  writeFileSync(KEY_FILE, generatePrivateKey(), { mode: 0o600 });
  console.log("generated a new follower wallet");
}
const followerKey = readFileSync(KEY_FILE, "utf8").trim() as `0x${string}`;
const follower = privateKeyToAccount(followerKey);
const followerWallet = createWalletClient({ account: follower, chain: somniaShannon, transport: http() });

const operator = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as `0x${string}`);
const operatorWallet = createWalletClient({ account: operator, chain: somniaShannon, transport: http() });

console.log(`follower: ${follower.address}`);
console.log(`operator: ${operator.address} (the executor — can trigger, cannot withdraw)\n`);

// ── 2. Gas ───────────────────────────────────────────────────────────────────────────────
const gasBalance = await pub.getBalance({ address: follower.address });
if (gasBalance < 2n * 10n ** 18n) {
  console.log("funding follower with gas from the operator…");
  await confirm(
    await operatorWallet.sendTransaction({ to: follower.address, value: 8n * 10n ** 18n }),
    "gas transfer"
  );
}

// ── 3. Collateral, minted by the follower to themselves ──────────────────────────────────
const exchange = createReadOnlyExchange();
await exchange.loadMarkets(true);
const markets = (Object.values(exchange.markets) as any[]).filter(
  (m) => m.type === "binary" && isTradeableTargetMarket(m.info)
);
if (markets.length === 0) throw new Error("no live target market right now — try again inside a trading window");
const COLLATERAL = markets[0].info.collateral as Address;

let followerUsdc = (await pub.readContract({ address: COLLATERAL, abi: erc20, functionName: "balanceOf", args: [follower.address] })) as bigint;
if (followerUsdc < 100_000_000n) {
  console.log("minting test collateral to the follower…");
  const followerExchange = new SomniaMarkets({
    indexerUrl: process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql",
    chain: somniaShannon,
    wsRpcUrl: process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws",
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: followerKey,
  });
  await followerExchange.trader.faucet().catch((e: unknown) => console.log(`  faucet: ${String(e).slice(0, 80)}`));
  followerUsdc = (await pub.readContract({ address: COLLATERAL, abi: erc20, functionName: "balanceOf", args: [follower.address] })) as bigint;
}
console.log(`follower collateral: ${formatUnits(followerUsdc, 6)} tUSDC\n`);

// ── 4. Their EchoAccount ─────────────────────────────────────────────────────────────────
const factory = echoAccountFactoryAddress();
const ACCOUNT = (await pub.readContract({ address: factory, abi: echoAccountFactoryAbi, functionName: "accountFor", args: [follower.address] })) as Address;
const deployed = await pub.getCode({ address: ACCOUNT });
if (!deployed || deployed === "0x") {
  console.log(`deploying the follower's account at its predicted address ${ACCOUNT}…`);
  await confirm(
    await followerWallet.writeContract({ address: factory, abi: echoAccountFactoryAbi, functionName: "deploy", gas: 30_000_000n }),
    "deploy"
  );
} else {
  console.log(`account already deployed: ${ACCOUNT}`);
}

// ── 5. Fund and configure it — every one of these is signed by the FOLLOWER ──────────────
const accountUsdc = (await pub.readContract({ address: COLLATERAL, abi: erc20, functionName: "balanceOf", args: [ACCOUNT] })) as bigint;
if (accountUsdc < 50_000_000n && followerUsdc > 100_000_000n) {
  console.log("moving collateral into the account…");
  await confirm(
    await followerWallet.writeContract({ address: COLLATERAL, abi: erc20, functionName: "transfer", args: [ACCOUNT, 500_000_000n], gas: GAS }),
    "fund account"
  );
}

const expiry = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
console.log("configuring the account (executor, expiry, caps, pool allowlist, approvals)…");
await confirm(await followerWallet.writeContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "setExecutor", args: [operator.address, expiry], gas: GAS }), "setExecutor");
await confirm(await followerWallet.writeContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "setCaps", args: [50_000_000n, 300_000_000n], gas: GAS }), "setCaps");

for (const m of markets) {
  const pool = m.info.poolAddress as Address;
  const already = (await pub.readContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "allowedPool", args: [pool] })) as boolean;
  if (!already) {
    await confirm(await followerWallet.writeContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "setAllowedPool", args: [pool, true], gas: GAS }), `allow ${m.info.asset} pool`);
  }
  // The pool PULLS collateral at fill time, so the account must approve it. Without this the
  // order reaches matching and dies at ERC20InsufficientAllowance — which is exactly what the
  // custody verification observed, and is the last thing standing between a valid order and a
  // filled one.
  await confirm(await followerWallet.writeContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "approveToken", args: [COLLATERAL, pool, 2n ** 200n], gas: GAS }), `approve ${m.info.asset} pool`);
}

// ── 6. The database rows that make the engine act on it ──────────────────────────────────
const leader = await queryOne<{ id: string; label: string }>(
  `SELECT id, label FROM trader WHERE is_seed = true ORDER BY (SELECT count(*) FROM decision d WHERE d.trader_id = trader.id) DESC LIMIT 1`
);
if (!leader) throw new Error("no seed trader to follow");

const grant = await queryOne<{ id: string }>(
  `INSERT INTO proxy_grant (follower_address, operator_address, scope, account_address)
   VALUES ($1, $2, 'echo_account', $3)
   RETURNING id`,
  [follower.address, operator.address, ACCOUNT]
);
await queryOne(
  `INSERT INTO copy_link (proxy_grant_id, trader_id, size_fraction, active)
   VALUES ($1, $2, 0.25, true)
   ON CONFLICT DO NOTHING`,
  [grant!.id, leader.id]
);

const status = (await pub.readContract({ address: ACCOUNT, abi: echoAccountAbi, functionName: "executorStatus" })) as readonly [boolean, boolean, boolean, bigint, bigint];
const finalUsdc = (await pub.readContract({ address: COLLATERAL, abi: erc20, functionName: "balanceOf", args: [ACCOUNT] })) as bigint;

console.log(`\n─────────────────────────────────────────────`);
console.log(`follower wallet   ${follower.address}`);
console.log(`their account     ${ACCOUNT}`);
console.log(`account holds     ${formatUnits(finalUsdc, 6)} tUSDC`);
console.log(`executor active   ${status[0]}   budget left ${formatUnits(status[4], 6)}`);
console.log(`copying           ${leader.label} at 25% of their size`);
console.log(`\nThe next fill by ${leader.label} on an allowlisted pool should echo into that account.`);
await end();
process.exit(0);
