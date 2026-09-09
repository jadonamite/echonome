import { createPublicClient, http, parseAbi } from "viem";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { createLogger } from "../logger.js";

const log = createLogger("series");

/**
 * The venue's rolling series: a permanent on-chain name for an asset at a cadence.
 *
 * This is the discovery that let a follower approve copying ONCE instead of re-approving every
 * hour. DreamDEX's market factory keeps a registered table — series 3 is "BTC, 3600 seconds",
 * series 4 is "ETH, 3600 seconds", and so on — and each entry points at whichever market is
 * that series' current window. The pointer moves on its own when the window rolls.
 *
 * A follower's EchoAccount approves a series id. Every future market in that series is then
 * authorised automatically, and nothing else is: an attacker cannot make the venue's own
 * factory point series 3 at a market they control.
 *
 * The table is read from chain rather than hardcoded, because a hardcoded "3 means BTC hourly"
 * that quietly stopped being true would authorise the WRONG asset while looking correct — the
 * exact shape of failure this project keeps being bitten by.
 */

const creatorAbi = parseAbi([
  "function seriesById(uint32 seriesId) view returns (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow)",
  "function referenceQidBySeries(uint32 seriesId) view returns (uint256 qid)",
  "function venueId() view returns (bytes32)",
]);

export interface SeriesEntry {
  seriesId: number;
  asset: string;
  intervalSec: number;
}

/** The venue contracts a follower's account is asked to trust. */
export function venueContracts() {
  return {
    module: (process.env.EC_VENUE_MODULE ?? SOMNIA_TESTNET_ADDRESSES.binaryModule) as `0x${string}`,
    creator: (process.env.EC_VENUE_CREATOR ??
      "0x94D963B6670AB96E78C8d0C46ca35D196d606EFE") as `0x${string}`,
  };
}

/** How many series ids to probe. The venue had 9 registered when this was written. */
const MAX_SERIES_ID = 32;

let cache: SeriesEntry[] | null = null;

/**
 * Every series the venue's factory has registered.
 *
 * Cached for the life of the process: registering a series is an admin action on the venue's
 * side, not something that happens on a cadence, and re-reading 32 slots per order would be
 * paying a lot of RPC for a table that changes roughly never. Call `loadSeries(true)` if you
 * genuinely need to see a newly registered one.
 */
export async function loadSeries(reload = false): Promise<SeriesEntry[]> {
  if (cache && !reload) return cache;

  const pub = createPublicClient({ chain: somniaShannon, transport: http() });
  const { creator } = venueContracts();
  const found: SeriesEntry[] = [];

  for (let seriesId = 0; seriesId < MAX_SERIES_ID; seriesId++) {
    try {
      const row = (await pub.readContract({
        address: creator,
        abi: creatorAbi,
        functionName: "seriesById",
        args: [seriesId],
      })) as readonly [string, string, bigint, bigint, bigint];
      const asset = row[1];
      const intervalSec = Number(row[3]);
      // An unregistered slot decodes to an empty asset string rather than reverting.
      if (asset && intervalSec > 0) found.push({ seriesId, asset, intervalSec });
    } catch {
      // A slot past the end of the table reverts. Not an error — it is how the table ends.
      break;
    }
  }

  cache = found;
  log.info("venue series table", { creator, count: found.length, series: found });
  return found;
}

/** Seconds in the cadence labels the indexer uses. */
const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/**
 * The series id for an asset at a cadence, or null if the venue has no such series.
 *
 * Null is a refusal to guess, and the caller must treat it as "do not trade this". Passing a
 * wrong series id to the account does not place a wrong order — the account checks the market
 * against the series and reverts `MarketNotInSeries` — but it does burn gas discovering that,
 * and it would report a confusing reason.
 */
export async function seriesIdFor(asset: string, interval: string): Promise<number | null> {
  const intervalSec = INTERVAL_SECONDS[interval];
  if (!intervalSec) return null;
  const table = await loadSeries();
  const hit = table.find((s) => s.asset === asset && s.intervalSec === intervalSec);
  return hit ? hit.seriesId : null;
}
