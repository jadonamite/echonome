import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { binaryPoolWriteAbi, contractErrorsAbi } from "@somnia-chain/markets-sdk";
import { createReadOnlyExchange, isTradeableTargetMarket } from "./src/chain/client.js";
import { privateKeyToAccount } from "viem/accounts";

const REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A" as Address;
const SPOT_PLACE = "0x80054449" as const;   // placeOrderFor      — documented, spot
const SPOT_CANCEL = "0xe37b444b" as const;  // cancelOrderFor     — documented, spot
const SPOT_REDUCE = "0x364c2587" as const;  // reduceOrderFor     — documented, spot
const BIN_PLACE = "0x5d97c566" as const;    // placeBinaryOrderFor — undocumented, derived

const abi = parseAbi([
  "function setOperatorApprovalGlobal(address operator, bytes4[] selectors, bool approved)",
  "function setOperatorApprovalForPool(address pool, address operator, bytes4[] selectors, bool approved)",
  "function isGloballyApproved(address owner, address operator, bytes4 selector) view returns (bool)",
  "function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)",
]);

const pub = createPublicClient({ chain: somniaShannon, transport: http() });
const ex = createReadOnlyExchange();
await ex.loadMarkets(true);
const bin: any = (Object.values(ex.markets) as any[]).find(
  (m) => m.type === "binary" && isTradeableTargetMarket(m.info)
);
const pool = bin.info.poolAddress as Address;
const ownerAcct = privateKeyToAccount(process.env.SEED_TRADER_PRIVATE_KEYS!.split(",")[0] as `0x${string}`);
const operator = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as `0x${string}`).address;
const wallet = createWalletClient({ account: ownerAcct, chain: somniaShannon, transport: http() });

const ALL = [SPOT_PLACE, SPOT_CANCEL, SPOT_REDUCE, BIN_PLACE];

async function tryPlace(label: string) {
  try {
    await pub.simulateContract({
      account: operator, address: pool,
      abi: [...binaryPoolWriteAbi, ...(contractErrorsAbi as any)],
      functionName: "placeBinaryOrderFor",
      args: [ownerAcct.address, 0, 500000n, 1000000n, BigInt(bin.info.expiry) * 1_000_000_000n, 2, 0,
             "0x0000000000000000000000000000000000000000", 0n, 0n],
    });
    console.log(`  ${label}: *** AUTHORISED ***`);
    return true;
  } catch (e: any) {
    console.log(`  ${label}: ${e.cause?.data?.errorName ?? e.cause?.cause?.data?.errorName ?? "(undecoded)"}`);
    return false;
  }
}

console.log(`pool ${pool} (${bin.info.asset} ${bin.info.interval})\nowner ${ownerAcct.address}\noperator ${operator}\n`);
console.log("Granting ALL FOUR selectors — the three documented spot ones plus the binary one —");
console.log("both per-pool on this binary pool and globally.\n");

for (const [fn, args] of [
  ["setOperatorApprovalForPool", [pool, operator, ALL, true]],
  ["setOperatorApprovalGlobal", [operator, ALL, true]],
] as const) {
  const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: fn as any, args: args as any, gas: 5_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`  ${fn}: ${r.status}`);
}

console.log("\nRegistry read-back:");
for (const sel of ALL) {
  const g = await pub.readContract({ address: REGISTRY, abi, functionName: "isGloballyApproved", args: [ownerAcct.address, operator, sel] });
  const p = await pub.readContract({ address: REGISTRY, abi, functionName: "isApprovedForPool", args: [pool, ownerAcct.address, operator, sel] });
  console.log(`  ${sel}  global=${g}  perPool=${p}`);
}

console.log("\nWith every documented selector granted, can the operator place a binary order?");
await tryPlace("placeBinaryOrderFor");

console.log("\nRevoking, leaving no residue…");
for (const [fn, args] of [
  ["setOperatorApprovalForPool", [pool, operator, ALL, false]],
  ["setOperatorApprovalGlobal", [operator, ALL, false]],
] as const) {
  const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: fn as any, args: args as any, gas: 5_000_000n });
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  console.log(`  ${fn} revoke: ${r.status}`);
}
process.exit(0);
