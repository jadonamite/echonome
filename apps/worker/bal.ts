import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createReadOnlyExchange, isTargetMarket } from "./src/chain/client.js";
import { privateKeyToAccount } from "viem/accounts";

const pub = createPublicClient({ chain: somniaShannon, transport: http() });
const ex = createReadOnlyExchange();
await ex.loadMarkets();
const bin: any = (Object.values(ex.markets) as any[]).find(m => m.type === "binary" && isTargetMarket(m.info));
const collateral = bin.info.collateral as Address;
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
]);
const dec = await pub.readContract({ address: collateral, abi: erc20, functionName: "decimals" });
console.log("collateral (tUSDC):", collateral, "decimals:", dec);
console.log("live pool:", bin.info.poolAddress, `(${bin.info.asset})`);

const keys = process.env.SEED_TRADER_PRIVATE_KEYS!.split(",");
const names = ["ec-maker", "ec-oracle-follow"];
for (let i = 0; i < keys.length; i++) {
  const a = privateKeyToAccount(keys[i].trim() as `0x${string}`).address;
  const [usdc, stt, allow] = await Promise.all([
    pub.readContract({ address: collateral, abi: erc20, functionName: "balanceOf", args: [a] }),
    pub.getBalance({ address: a }),
    pub.readContract({ address: collateral, abi: erc20, functionName: "allowance", args: [a, bin.info.poolAddress as Address] }),
  ]);
  console.log(`${names[i].padEnd(17)} ${a}`);
  console.log(`   tUSDC: ${formatUnits(usdc as bigint, dec as number)}   STT: ${formatUnits(stt, 18)}   allowance->pool: ${formatUnits(allow as bigint, dec as number)}`);
}
const op = privateKeyToAccount(process.env.OPERATOR_PRIVATE_KEY as `0x${string}`).address;
console.log(`operator          ${op}\n   STT: ${formatUnits(await pub.getBalance({ address: op }), 18)}`);
process.exit(0);
