/**
 * Builds the hourly history snapshot the web app replays.
 *
 *   tsx src/snapshot.ts <out.json> [days] [TICKER,...]
 *   tsx src/snapshot.ts <out.json> --from-dir <dir>   (raw kline files saved earlier)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { klineHistory, listStockTokens, type Candle, type StockToken } from "./binance.js";
import type { PairHistory, Snapshot } from "./history.js";

export const DEFAULT_TICKERS = ["NVDA", "TSLA", "AAPL", "QQQ", "SPY", "MSFT", "AMZN", "META", "GOOGL", "COIN", "MSTR", "CRCL", "AMD", "PLTR", "MU"];

const round = (x: number) => Math.round(x * 1e6) / 1e6;

export function toPair(ticker: string, b: StockToken, o: StockToken, bRows: Candle[], oRows: Candle[]): PairHistory {
  const bm = Number(b.multiplier), om = Number(o.multiplier);
  const bMap = new Map(bRows.map((r) => [r[0], r]));
  const oMap = new Map(oRows.map((r) => [r[0], r]));
  const t = [...new Set([...bMap.keys(), ...oMap.keys()])].sort((x, y) => x - y);
  return {
    ticker,
    bstock: { symbol: b.symbol, address: b.contractAddress, multiplier: bm },
    ondoToken: { symbol: o.symbol, address: o.contractAddress, multiplier: om },
    t,
    ondo: t.map((x) => (oMap.has(x) ? round(oMap.get(x)![1] / om) : null)),
    b: t.map((x) => (bMap.has(x) ? round(bMap.get(x)![1] / bm) : null)),
    bVol: t.map((x) => (bMap.has(x) ? Math.round(bMap.get(x)![5]) : null)),
  };
}

async function main() {
  const [out, ...rest] = process.argv.slice(2);
  if (!out) throw new Error("usage: snapshot.ts <out.json> [days] [TICKERS] | --from-dir <dir>");
  const pairs: PairHistory[] = [];
  if (rest[0] === "--from-dir") {
    const dir = rest[1];
    const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
    // Token lists saved next to the kline folder supply contract addresses.
    const addr = new Map<string, string>();
    for (const n of [1, 3]) {
      try {
        for (const x of JSON.parse(readFileSync(join(dir, "..", `list${n}.json`), "utf8")).data) if (x.chainId === "56") addr.set(x.symbol, x.contractAddress);
      } catch {}
    }
    for (const f of readdirSync(dir).filter((x) => x.endsWith("B.json"))) {
      const ticker = f.slice(0, -6);
      const of = `${ticker}on.json`;
      if (!readdirSync(dir).includes(of)) continue;
      const b = load(f), o = load(of);
      const tok = (j: any): StockToken => ({ chainId: "56", contractAddress: addr.get(j.symbol) ?? "", symbol: j.symbol, ticker, type: j.type, multiplier: String(j.multiplier) });
      const rows = (j: any): Candle[] => j.rows.map((r: any[]) => [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])]);
      pairs.push(toPair(ticker, tok(b), tok(o), rows(b), rows(o)));
    }
  } else {
    const days = Number(rest[0] ?? 90);
    const want = (rest[1] ?? DEFAULT_TICKERS.join(",")).split(",");
    const since = Date.now() - days * 86400e3;
    const [bs, os] = await Promise.all([listStockTokens("bstocks"), listStockTokens("ondo")]);
    for (const ticker of want) {
      const b = bs.find((x) => x.chainId === "56" && x.ticker === ticker);
      const o = os.find((x) => x.chainId === "56" && x.ticker === ticker);
      if (!b || !o) continue;
      const [bRows, oRows] = await Promise.all([klineHistory(b.contractAddress, since), klineHistory(o.contractAddress, since)]);
      pairs.push(toPair(ticker, b, o, bRows, oRows));
      console.log(ticker, bRows.length, oRows.length);
    }
  }
  const snap: Snapshot = { generatedAt: Date.now(), source: "Binance Web3 token K-line API, 1h candles, BSC", pairs };
  writeFileSync(out, JSON.stringify(snap));
  console.log(`wrote ${pairs.length} pairs to ${out}`);
}

if (process.argv[1]?.endsWith("snapshot.ts")) main().catch((e) => { console.error(e); process.exit(1); });
