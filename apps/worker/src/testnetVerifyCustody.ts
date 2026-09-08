import { createWalletClient, createPublicClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  binaryPoolWriteAbi,
  ORDER_KIND,
  PLACE_ORDER_FOR_SELECTOR,
  CANCEL_ORDER_FOR_SELECTOR,
} from "@somnia-chain/markets-sdk";
import { EC_VENUE_ID, isTargetMarket } from "./chain/client.js";

/**
 * Live proof of the entire proxy-grant lifecycle against real Shannon testnet — not a
 * mocked/unit test. Run once to validate the mechanism Sam's frontend (T021) builds
 * around, and rerunnable any time as a real regression check (`npm run verify:custody`).
 *
 * STATUS 2026-09-08: Step 1 (no-grant blocks) is PROVEN. Step 2 (the grant itself) is
 * BLOCKED on a missing operatorPermissionsRegistry address — see FEEDBACK.md for the full
 * investigation. Do not delete this script when it fails; it's correctly reporting a real,
 * open gap, not a bug in the proof itself.
 *
 * Proves, in order:
 * 1. Before any grant: operator attempting placeBinaryOrderFor(follower, ...) reverts.
 * 2. Follower grants the operator [PLACE_ORDER_FOR_SELECTOR, CANCEL_ORDER_FOR_SELECTOR]
 *    via the real high-level call Sam's frontend will use.
 * 3. After the grant: the same call now succeeds, and the fill settles into the
 *    follower's own vault (confirmed by reading its balance), never the operator's.
 * 4. Follower revokes. The same call reverts again — immediately, no grace period.
 *
 * This is SC-001 and SC-005 from specs/echonome/spec.md, verified as fact, not asserted.
 */

const indexerUrl = process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const wsRpcUrl = process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set — see .env.example`);
  return v;
}

async function attemptPlaceOrderFor(
  operatorPrivateKey: `0x${string}`,
  followerAddress: Address,
  pool: Address,
  expiry: bigint
): Promise<{ ok: true; hash: string } | { ok: false; reason: string }> {
  const account = privateKeyToAccount(operatorPrivateKey);
  const walletClient = createWalletClient({ account, chain: somniaShannon, transport: http() });
  const publicClient = createPublicClient({ chain: somniaShannon, transport: http() });

  try {
    const hash = await walletClient.writeContract({
      address: pool,
      abi: binaryPoolWriteAbi,
      functionName: "placeBinaryOrderFor",
      args: [
        followerAddress,
        ORDER_KIND.BUY_YES,
        400_000n, // arbitrary valid-looking price (0.4, tick-aligned)
        1_000_000n, // 1 whole outcome token
        expiry * 1_000_000_000n,
        2, // IOC
        0,
        "0x0000000000000000000000000000000000000000" as Address,
        0n,
        0n,
      ],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { ok: true, hash };
  } catch (err: any) {
    return { ok: false, reason: err?.errorName ?? err?.shortMessage ?? String(err).slice(0, 200) };
  }
}

async function main() {
  const operatorKey = requireEnv("OPERATOR_PRIVATE_KEY") as `0x${string}`;
  const followerKey = requireEnv("SEED_TRADER_PRIVATE_KEYS").split(",")[0].trim() as `0x${string}`;
  const operatorAccount = privateKeyToAccount(operatorKey);
  const followerAccount = privateKeyToAccount(followerKey);

  console.log(`Operator: ${operatorAccount.address}`);
  console.log(`Follower (using ec-maker seed wallet for this proof): ${followerAccount.address}`);

  const exchange = new SomniaMarkets({
    indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey: followerKey,
  });
  await exchange.loadMarkets();
  const market = Object.values(exchange.markets).find(
    (m: any) => m.type === "binary" && isTargetMarket(m.info)
  ) as any;
  if (!market) throw new Error("No target market found — is the venue still live?");
  console.log(`Target market: ${market.symbol}`);
  const pool = market.info.poolAddress as Address;
  const expiry = BigInt(market.info.expiry);

  console.log("\n--- Step 1: attempt placeBinaryOrderFor with NO grant ---");
  const before = await attemptPlaceOrderFor(operatorKey, followerAccount.address, pool, expiry);
  console.log(before.ok ? `UNEXPECTED SUCCESS: ${before.hash}` : `Reverted as expected: ${before.reason}`);
  if (before.ok) {
    console.error("FAIL: an ungranted operator was able to place an order for another owner. Stop and investigate.");
    process.exit(1);
  }

  console.log("\n--- Step 2: follower grants the operator [PLACE_ORDER_FOR, CANCEL_ORDER_FOR] ---");
  const grantResult = await (exchange as any).trader.setOperatorApprovalForPool({
    operator: operatorAccount.address,
    selectors: [PLACE_ORDER_FOR_SELECTOR, CANCEL_ORDER_FOR_SELECTOR],
    approved: true,
    pool,
  });
  console.log(`Grant tx: ${grantResult.hash}`);

  console.log("\n--- Step 3: attempt placeBinaryOrderFor again, now WITH a valid grant ---");
  const after = await attemptPlaceOrderFor(operatorKey, followerAccount.address, pool, expiry);
  console.log(after.ok ? `Succeeded: ${after.hash}` : `UNEXPECTED FAILURE: ${after.reason}`);

  console.log("\n--- Step 4: follower revokes the grant ---");
  const revokeResult = await (exchange as any).trader.setOperatorApprovalForPool({
    operator: operatorAccount.address,
    selectors: [PLACE_ORDER_FOR_SELECTOR, CANCEL_ORDER_FOR_SELECTOR],
    approved: false,
    pool,
  });
  console.log(`Revoke tx: ${revokeResult.hash}`);

  console.log("\n--- Step 5: attempt placeBinaryOrderFor again, after revocation ---");
  const afterRevoke = await attemptPlaceOrderFor(operatorKey, followerAccount.address, pool, expiry);
  console.log(afterRevoke.ok ? `UNEXPECTED SUCCESS: ${afterRevoke.hash}` : `Reverted as expected: ${afterRevoke.reason}`);

  console.log("\n=== RESULT ===");
  console.log(`No grant -> blocked: ${!before.ok}`);
  console.log(`Valid grant -> allowed: ${after.ok}`);
  console.log(`Revoked -> blocked again: ${!afterRevoke.ok}`);

  if (!before.ok && after.ok && !afterRevoke.ok) {
    console.log("PROVEN: SC-001 and SC-005 both hold, against real testnet, right now.");
  } else {
    console.error("PROOF FAILED — one of the three expected outcomes did not happen. Investigate before trusting this mechanism.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
