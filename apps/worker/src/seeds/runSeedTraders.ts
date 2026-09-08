import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { privateKeyToAccount } from "viem/accounts";
import { EC_VENUE_ID, isTradeableTargetMarket } from "../chain/client.js";
import { runEcMakerTick } from "./ecMaker.js";
import { runEcOracleFollowTick } from "./ecOracleFollow.js";

const indexerUrl = process.env.SHANNON_INDEXER_URL ?? "https://dev.smk.somnia.host/v1/graphql";
const wsRpcUrl = process.env.SHANNON_WS_URL ?? "wss://api.infra.testnet.somnia.network/ws";
const TICK_MS = 15_000;

function seedKeys(): [`0x${string}`, `0x${string}`] {
  const raw = process.env.SEED_TRADER_PRIVATE_KEYS;
  if (!raw) throw new Error("SEED_TRADER_PRIVATE_KEYS is not set — see .env.example");
  const [maker, oracleFollow] = raw.split(",").map((s) => s.trim());
  if (!maker || !oracleFollow) {
    throw new Error("SEED_TRADER_PRIVATE_KEYS needs exactly two keys: ec-maker,ec-oracle-follow");
  }
  return [maker as `0x${string}`, oracleFollow as `0x${string}`];
}

function buildExchange(privateKey: `0x${string}`) {
  return new SomniaMarkets({
    indexerUrl,
    chain: somniaShannon,
    wsRpcUrl,
    addresses: SOMNIA_TESTNET_ADDRESSES,
    privateKey,
  });
}

/**
 * The markets these strategies should be quoting on THIS tick.
 *
 * Two bugs lived in the three lines this replaces, and they compounded:
 *
 *  1. `loadMarkets()` without `reload` early-returns the SDK's cached registry — it is a
 *     no-op after the first call, documented as such on the method. So this function looked
 *     like a per-tick refresh and was actually pinned to whatever was live when the process
 *     booted. Restarting the worker "fixed" the rollover for exactly one window, which is
 *     what made it look fixed.
 *  2. It filtered on identity only, so expired windows stayed in the list forever.
 *
 * Either one alone loses data at the cadence boundary; together they had the seed fleet
 * quoting into a two-hour-dead market and never once seeing the live one.
 */
async function targetMarketSymbols(exchange: SomniaMarkets): Promise<string[]> {
  await exchange.loadMarkets(true);
  const nowSec = Math.floor(Date.now() / 1000);
  return Object.values(exchange.markets)
    .filter((m: any) => m.type === "binary" && isTradeableTargetMarket(m.info, nowSec))
    .map((m: any) => m.symbol);
}

async function main() {
  const [makerKey, oracleFollowKey] = seedKeys();

  const makerExchange = buildExchange(makerKey);
  const oracleFollowExchange = buildExchange(oracleFollowKey);

  console.log(`[seeds] ec-maker wallet: ${privateKeyToAccount(makerKey).address}`);
  console.log(`[seeds] ec-oracle-follow wallet: ${privateKeyToAccount(oracleFollowKey).address}`);
  console.log(`[seeds] target venue: ${EC_VENUE_ID}`);

  const makerAddress = privateKeyToAccount(makerKey).address;

  const tick = async () => {
    try {
      const makerSymbols = await targetMarketSymbols(makerExchange);
      await runEcMakerTick(makerExchange, makerSymbols, makerAddress);
    } catch (err) {
      console.error("[seeds] ec-maker tick failed", err);
    }

    try {
      const oracleFollowSymbols = await targetMarketSymbols(oracleFollowExchange);
      await runEcOracleFollowTick(oracleFollowExchange, oracleFollowSymbols);
    } catch (err) {
      console.error("[seeds] ec-oracle-follow tick failed", err);
    }
  };

  await tick();
  setInterval(() => {
    tick().catch((err) => console.error("[seeds] tick failed", err));
  }, TICK_MS);
}

main().catch((err) => {
  console.error("[seeds] fatal", err);
  process.exit(1);
});
