/**
 * Client for the public Binance Web3 market endpoints that cover tokenized stocks.
 * None of these need an API key.
 */

const RWA = "https://www.binance.com/bapi/defi";
const WEB3 = "https://web3.binance.com/bapi/defi";
const HEADERS = { "Accept-Encoding": "identity", "User-Agent": "binance-web3/1.1 (Skill)" };

export const BSC = "56";

/** Provider codes used by the token list endpoint. */
export const PROVIDER = { ondo: 1, xstocks: 2, bstocks: 3 } as const;
export type Provider = keyof typeof PROVIDER;

export class BinanceError extends Error {
  constructor(message: string, readonly url: string, readonly status?: number) {
    super(message);
  }
}

interface Envelope<T> {
  code: string;
  message: string | null;
  success: boolean;
  data: T;
}

export interface FetchOptions {
  retries?: number;
  timeoutMs?: number;
  next?: { revalidate?: number | false };
}

async function getJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal, ...(opts.next ? { next: opts.next } : {}) } as RequestInit);
      if (!res.ok) throw new BinanceError(`HTTP ${res.status}`, url, res.status);
      const body = (await res.json()) as Envelope<T>;
      if (!body.success || body.code !== "000000") {
        throw new BinanceError(`API code ${body.code}: ${body.message ?? "no message"}`, url);
      }
      return body.data;
    } catch (err) {
      lastErr = err;
      // Client errors other than rate limiting will not improve on retry.
      if (err instanceof BinanceError && err.status && err.status < 500 && err.status !== 429) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const qs = (p: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

export interface StockToken {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier: string;
}

export function listStockTokens(provider: Provider, opts?: FetchOptions): Promise<StockToken[]> {
  return getJson<StockToken[]>(`${RWA}/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?${qs({ type: PROVIDER[provider] })}`, opts);
}

export interface MarketStatus {
  marketStatus: string | null;
  openState: boolean;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: number | null;
  nextCloseTime: number | null;
}

export function marketStatus(opts?: FetchOptions): Promise<MarketStatus> {
  return getJson<MarketStatus>(`${RWA}/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`, opts);
}

export interface RwaDynamic {
  symbol: string;
  ticker: string;
  tokenInfo: { price: string; sharesMultiplier: string; priceChangePct24h: string | null };
  stockInfo: { price: string | null; priceHigh52w: string | null; priceLow52w: string | null };
  statusInfo: MarketStatus;
}

export function rwaDynamic(contractAddress: string, opts?: FetchOptions): Promise<RwaDynamic> {
  return getJson<RwaDynamic>(`${RWA}/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?${qs({ chainId: BSC, contractAddress })}`, opts);
}

/** On-chain trading data for any token, including buy and sell notional over recent windows. */
export interface TokenDynamic {
  price: string;
  volume5mBuy?: string; volume5mSell?: string;
  volume1hBuy?: string; volume1hSell?: string;
  volume4hBuy?: string; volume4hSell?: string;
  volume24hBuy?: string; volume24hSell?: string;
  holders?: string;
}

export function tokenDynamic(contractAddress: string, opts?: FetchOptions): Promise<TokenDynamic> {
  return getJson<TokenDynamic>(`${WEB3}/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai?${qs({ chainId: BSC, contractAddress })}`, opts);
}

/** One hourly candle: open time, open, high, low, close, volume in USD. */
export type Candle = [number, number, number, number, number, number];

export async function klines(
  contractAddress: string,
  p: { interval?: string; limit?: number; endTime?: number } = {},
  opts?: FetchOptions,
): Promise<Candle[]> {
  const data = await getJson<{ klineInfos: (string | number)[][] }>(
    `${RWA}/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai?${qs({ chainId: BSC, contractAddress, interval: p.interval ?? "1h", limit: p.limit ?? 300, endTime: p.endTime })}`,
    opts,
  );
  return (data?.klineInfos ?? []).map((r) => [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])]);
}

/** Pages backwards until `sinceMs`, returning candles sorted by open time. */
export async function klineHistory(contractAddress: string, sinceMs: number, opts?: FetchOptions): Promise<Candle[]> {
  const rows = new Map<number, Candle>();
  let end: number | undefined;
  for (let page = 0; page < 40; page++) {
    const batch = await klines(contractAddress, { endTime: end }, opts);
    if (batch.length === 0) break;
    for (const c of batch) rows.set(c[0], c);
    const first = Math.min(...batch.map((c) => c[0]));
    if (first <= sinceMs) break;
    end = first - 1;
  }
  return [...rows.values()].filter((c) => c[0] >= sinceMs).sort((a, b) => a[0] - b[0]);
}
