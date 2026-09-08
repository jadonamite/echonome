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
const binaries = all.filter(m => m.type === "binary");

const byVenue = {};
for (const m of binaries) {
  const v = m.info.venueId;
  byVenue[v] = byVenue[v] ?? { count: 0, intervals: {}, assets: new Set() };
  byVenue[v].count++;
  byVenue[v].intervals[m.info.interval] = (byVenue[v].intervals[m.info.interval] ?? 0) + 1;
  byVenue[v].assets.add(m.info.asset);
}
for (const [v, d] of Object.entries(byVenue)) {
  console.log(v, "count=", d.count, "intervals=", d.intervals, "assets=", [...d.assets]);
}

// status breakdown
const byStatus = {};
for (const m of binaries) byStatus[m.info.status] = (byStatus[m.info.status] ?? 0) + 1;
console.log("status breakdown:", byStatus);

// interval breakdown overall + sample expiry/tradingStart deltas
const byInterval = {};
for (const m of binaries) byInterval[m.info.interval] = (byInterval[m.info.interval] ?? 0) + 1;
console.log("interval breakdown overall:", byInterval);

const now = Math.floor(Date.now() / 1000);
console.log("now:", now, new Date(now * 1000).toISOString());
for (const m of binaries.slice(0, 5)) {
  console.log(m.symbol, "status=", m.info.status, "start=", m.info.tradingStart, "expiry=", m.info.expiry, "window(s)=", m.info.expiry - m.info.tradingStart, "expiresIn(s)=", m.info.expiry - now);
}

process.exit(0);
