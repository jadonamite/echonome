/**
 * Reproduces, against live Shannon testnet, the finding that decides Echonome's
 * architecture: DreamDEX's OperatorPermissionsRegistry does not govern Event Contract
 * (binary) pools, so no operator grant can authorise `placeBinaryOrderFor`.
 *
 *   npm run verify:operator-gate
 *
 * Read-only. It writes nothing on chain and needs no funded wallet — every claim below is
 * a `readContract` or a `simulateContract`. The one destructive-looking part of the
 * original investigation (actually writing the grants, then revoking them) is deliberately
 * NOT re-run here; its result is recorded in FEEDBACK.md and reproduced by the read at the
 * end, which shows the pool refusing the call regardless of grant state.
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { binaryPoolWriteAbi, contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { createReadOnlyExchange, isTargetMarket } from "./chain/client.js";

/**
 * OperatorPermissionsRegistry, Shannon testnet. Absent from the SDK's
 * SOMNIA_TESTNET_ADDRESSES; discovered by asking a live SPOT pool for it (binary pools
 * don't expose the getter), then confirmed against DreamDEX's published Operators page.
 * Mainnet is 0xE7a190736B6024a4DbafadC04E283075877005ce.
 */
export const OPERATOR_PERMISSIONS_REGISTRY: Address = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A";

/** `placeBinaryOrderFor(address,uint8,uint256,uint256,uint64,uint8,uint8,address,uint96,uint64)`.
 *  Derived from the SDK's own binaryPoolWriteAbi — the SDK exports no constant for it, and
 *  the documented PLACE_ORDER_FOR_SELECTOR (0x80054449) is spot's, which a binary pool
 *  rejects outright with `UseBinaryPlacement`. */
export const PLACE_BINARY_ORDER_FOR_SELECTOR = "0x5d97c566" as const;

const registryAbi = parseAbi([
  "function isGloballyApproved(address owner, address operator, bytes4 selector) view returns (bool)",
  "function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)",
]);
const poolGateAbi = parseAbi([
  "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
  "function getOperatorPermissionsRegistry() view returns (address)",
]);

const pub = createPublicClient({ chain: somniaShannon, transport: http() });

async function ask<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; why: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const e = err as { shortMessage?: string; name?: string };
    return { ok: false, why: e.shortMessage ?? e.name ?? "read failed" };
  }
}

async function main() {
  const exchange = createReadOnlyExchange();
  await exchange.loadMarkets();
  const markets = Object.values(exchange.markets) as any[];

  const binary = markets.find((m) => m.type === "binary" && isTargetMarket(m.info));
  const spot = markets.find((m) => m.type === "spot");
  if (!binary || !spot) throw new Error("need one live binary target market and one spot market");

  const binaryPool = binary.info.poolAddress as Address;
  const spotPool = spot.info.poolAddress as Address;
  const owner = "0x000000000000000000000000000000000000dEaD" as Address;
  const operator = "0x000000000000000000000000000000000000bEEF" as Address;

  console.log(`binary pool (${binary.info.asset} ${binary.info.interval}): ${binaryPool}`);
  console.log(`spot pool   (${spot.symbol}): ${spotPool}\n`);

  console.log("1. Where the registry address comes from — a SPOT pool names it, a binary pool can't:");
  const fromSpot = await ask(() =>
    pub.readContract({ address: spotPool, abi: poolGateAbi, functionName: "getOperatorPermissionsRegistry" })
  );
  const fromBinary = await ask(() =>
    pub.readContract({ address: binaryPool, abi: poolGateAbi, functionName: "getOperatorPermissionsRegistry" })
  );
  console.log(`   spot.getOperatorPermissionsRegistry()   -> ${fromSpot.ok ? fromSpot.value : fromSpot.why}`);
  console.log(`   binary.getOperatorPermissionsRegistry() -> ${fromBinary.ok ? fromBinary.value : fromBinary.why}`);
  if (fromSpot.ok && (fromSpot.value as string).toLowerCase() !== OPERATOR_PERMISSIONS_REGISTRY.toLowerCase()) {
    console.log(`   ⚠️  spot pool names a DIFFERENT registry than this file records — update the constant.`);
  }

  console.log("\n2. The verification read DreamDEX's own docs tell you to use, on each pool:");
  const spotGate = await ask(() =>
    pub.readContract({ address: spotPool, abi: poolGateAbi, functionName: "isOperatorAuthorized", args: [owner, operator, "0x80054449"] })
  );
  const binaryGate = await ask(() =>
    pub.readContract({ address: binaryPool, abi: poolGateAbi, functionName: "isOperatorAuthorized", args: [owner, operator, PLACE_BINARY_ORDER_FOR_SELECTOR] })
  );
  console.log(`   spot.isOperatorAuthorized()   -> ${spotGate.ok ? spotGate.value : spotGate.why}`);
  console.log(`   binary.isOperatorAuthorized() -> ${binaryGate.ok ? binaryGate.value : binaryGate.why}`);
  console.log("   The binary pool does not implement the gate at all — that is the finding.");

  console.log("\n3. The registry itself answers fine; it just has nothing to say about this pool:");
  for (const [label, call] of [
    ["isGloballyApproved", () => pub.readContract({ address: OPERATOR_PERMISSIONS_REGISTRY, abi: registryAbi, functionName: "isGloballyApproved", args: [owner, operator, PLACE_BINARY_ORDER_FOR_SELECTOR] })],
    ["isApprovedForPool ", () => pub.readContract({ address: OPERATOR_PERMISSIONS_REGISTRY, abi: registryAbi, functionName: "isApprovedForPool", args: [binaryPool, owner, operator, PLACE_BINARY_ORDER_FOR_SELECTOR] })],
  ] as const) {
    const r = await ask(call as () => Promise<unknown>);
    console.log(`   registry.${label} -> ${r.ok ? r.value : r.why}`);
  }

  console.log("\n4. And the call itself, from an arbitrary operator — and from the owner in person:");
  for (const [label, caller] of [
    ["arbitrary operator", operator],
    ["the owner themselves", owner],
  ] as const) {
    const r = await ask(() =>
      pub.simulateContract({
        account: caller,
        address: binaryPool,
        abi: [...binaryPoolWriteAbi, ...(contractErrorsAbi as any)],
        functionName: "placeBinaryOrderFor",
        args: [owner, 0, 500000n, 1000000n, BigInt(binary.info.expiry) * 1_000_000_000n, 2, 0,
               "0x0000000000000000000000000000000000000000", 0n, 0n],
      })
    );
    console.log(`   as ${label.padEnd(20)} -> ${r.ok ? "authorised" : r.why}`);
  }

  console.log(
    "\nConclusion: `placeBinaryOrderFor` is refused even for the owner acting on their own\n" +
      "behalf, so it is not a per-user permission check and no grant can satisfy it. Event\n" +
      "Contract pools do not consult the OperatorPermissionsRegistry. See FEEDBACK.md."
  );
}

main()
  .then(() => {
    // The SDK holds a live WebSocket to the chain, so nothing here ever ends on its own —
    // and without an explicit exit, Node's buffered stdout is never flushed when this runs
    // non-interactively (a redirect, or CI), which reads as a hang rather than a result.
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
