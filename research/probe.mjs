import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

const exchange = new SomniaMarkets({
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  chain: somniaShannon,
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
});

await exchange.loadMarkets();
const all = Object.values(exchange.markets);
console.log("total markets:", all.length);

const byType = {};
for (const m of all) byType[m.marketType ?? m.type ?? "?"] = (byType[m.marketType ?? m.type ?? "?"] ?? 0) + 1;
console.log("by type:", byType);

const sample = all.slice(0, 3);
console.log("sample market shape:", JSON.stringify(sample, null, 2).slice(0, 3000));

process.exit(0);
