import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { privateKeyToAccount } from "viem/accounts";
import { EC_VENUE_ID, isTradeableTargetMarket } from "../chain/client.js";
import { runEcMakerTick } from "./ecMaker.js";
import { runEcOracleFollowTick } from "./ecOracleFollow.js";
import { runCoinflipTick, runFavouriteTick, runLongshotTick } from "./strategies.js";
import { EXTRA_STRATEGIES, seedWallets } from "../provisionSeeds.js";
import { createLogger } from "../logger.js";
import { beat } from "../health/heartbeat.js";

const log = createLogger("seeds");

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
  // No try/catch here on purpose. If the venue can't be reached, the caller must NOT trade:
  // placing orders against an unconfirmed market set is exactly how the maker spent two hours
  // quoting into an expired window. Letting this throw makes the tick skip, which is the safe
  // failure direction for anything that writes. The watcher takes the opposite choice for
  // reads, and says why in its own comment.
  await exchange.loadMarkets(true);
  const nowSec = Math.floor(Date.now() / 1000);
  return Object.values(exchange.markets)
    .filter((m: any) => m.type === "binary" && isTradeableTargetMarket(m.info, nowSec))
    .map((m: any) => m.symbol);
}

export async function startSeedTraders() {
  const [makerKey, oracleFollowKey] = seedKeys();

  const makerExchange = buildExchange(makerKey);
  const oracleFollowExchange = buildExchange(oracleFollowKey);

  log.info("starting", {
    maker: privateKeyToAccount(makerKey).address,
    oracleFollow: privateKeyToAccount(oracleFollowKey).address,
    venue: EC_VENUE_ID,
  });

  const makerAddress = privateKeyToAccount(makerKey).address;

  // The extra strategies, each on its own wallet so their records are separable on chain.
  // Missing wallets are skipped rather than fatal: the two original strategies are the core
  // demo, and `npm run seeds:provision` is what adds the rest.
  const wallets = seedWallets();
  const runners: Record<string, (ex: SomniaMarkets, symbols: string[]) => Promise<void>> = {
    "ec-coinflip": runCoinflipTick,
    "ec-longshot": runLongshotTick,
    "ec-favourite": runFavouriteTick,
  };
  const extraStrategies: [string, (symbols: string[]) => Promise<void>][] = [];
  for (const name of EXTRA_STRATEGIES) {
    const key = wallets[name];
    if (!key) {
      log.warn("strategy has no wallet, not running it", { strategy: name });
      continue;
    }
    const ex = buildExchange(key);
    // Each strategy trades from its own wallet, so it needs its own SomniaMarkets instance —
    // and the SDK's market registry is per-instance state, not global. Passing the maker's
    // symbol list to an instance that has never loaded markets throws `unknown symbol … call
    // loadMarkets() first` on every tick, which is contained by the try/catch below and so
    // costs nothing visible except three bots that never place a single order.
    //
    // The symbol list still comes from one place (the maker's), because the whole point of
    // running these side by side is that they face the same markets. This load only teaches
    // this instance what those symbols mean.
    extraStrategies.push([
      name,
      async (symbols) => {
        await ex.loadMarkets(true);
        await runners[name](ex, symbols);
      },
    ]);
    log.info("strategy ready", { strategy: name, wallet: privateKeyToAccount(key).address });
  }

  const tick = async () => {
    let symbols: string[] = [];

    try {
      symbols = await targetMarketSymbols(makerExchange);
      // The market set is logged every tick, by name. Had this line existed, the two hours
      // spent quoting into `ETH-0-08SEP26-2200` after it expired would have been obvious at
      // a glance instead of requiring a database query to notice. A bot's target set is the
      // single most useful thing it can tell you about itself.
      log.info("tick", { targets: symbols });
      if (symbols.length === 0) {
        log.warn("no tradeable target market this tick — between cadence windows, or the venue moved", {});
      }
      await runEcMakerTick(makerExchange, symbols, makerAddress);
    } catch (err) {
      // An indexer blip lands here and the tick is skipped — deliberately. Not trading for
      // 15 seconds costs nothing; trading against a stale market set has already cost hours.
      log.warn("ec-maker tick skipped", { reason: String(err).slice(0, 200) });
    }

    try {
      const oracleFollowSymbols = await targetMarketSymbols(oracleFollowExchange);
      await runEcOracleFollowTick(oracleFollowExchange, oracleFollowSymbols);
    } catch (err) {
      log.warn("ec-oracle-follow tick skipped", { reason: String(err).slice(0, 200) });
    }

    // The wider field. Each runs independently and its failure is contained: one strategy
    // erroring must never silence the others, because the entire value of running several is
    // that they can be compared against each other over the same markets.
    for (const [name, run] of extraStrategies) {
      try {
        await run(symbols);
      } catch (err) {
        log.warn(`${name} tick skipped`, { reason: String(err).slice(0, 200) });
      }
    }

    await beat("seeds", { targets: symbols });
  };

  await tick();
  setInterval(() => {
    tick().catch((err) => log.error("tick failed", { err: String(err).slice(0, 300) }));
  }, TICK_MS);
}

if (process.argv[1]?.includes("runSeedTraders")) {
  startSeedTraders().catch((err) => {
    log.error("fatal", { err: String(err) });
    process.exit(1);
  });
}
