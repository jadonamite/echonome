/** Probes on-chain execution cost for a bStock across PancakeSwap pools, using the quoter contracts. */

import { createPublicClient, http, parseAbi, parseUnits, formatUnits, type Address, type PublicClient } from "viem";
import { bsc } from "viem/chains";
import type { DepthPoint } from "./governor.js";

export const USDT: Address = "0x55d398326f99059fF775485246999027B3197955";
export const PCS_V3_QUOTER: Address = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";
export const PCS_V3_ROUTER: Address = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
export const PCS_V2_ROUTER: Address = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
export const V3_FEES = [100, 500, 2500, 10000] as const;
export const PROBE_SIZES_USD = [10, 100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000];

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const v2Abi = parseAbi(["function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)"]);

export function bscClient(rpcUrl = process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com"): PublicClient {
  return createPublicClient({ chain: bsc, transport: http(rpcUrl, { timeout: 10_000, retryCount: 2 }) }) as PublicClient;
}

export interface PoolQuote {
  pool: string;
  fee: number | null;
  usd: number;
  tokensOut: number;
  price: number;
}

/** Quotes buying `token` with USDT at each probe size in every pool. Pools that revert are skipped. */
export async function probeDepth(token: Address, client = bscClient(), sizes = PROBE_SIZES_USD): Promise<PoolQuote[]> {
  const jobs: Promise<PoolQuote | null>[] = [];
  for (const usd of sizes) {
    const amountIn = parseUnits(String(usd), 18);
    for (const fee of V3_FEES) {
      jobs.push(
        client
          .simulateContract({ address: PCS_V3_QUOTER, abi: quoterAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn: USDT, tokenOut: token, amountIn, fee, sqrtPriceLimitX96: 0n }] })
          .then(({ result }) => {
            const out = Number(formatUnits(result[0], 18));
            return out > 0 ? { pool: `PancakeSwap v3 ${fee / 10_000}%`, fee, usd, tokensOut: out, price: usd / out } : null;
          })
          .catch(() => null),
      );
    }
    jobs.push(
      client
        .readContract({ address: PCS_V2_ROUTER, abi: v2Abi, functionName: "getAmountsOut", args: [amountIn, [USDT, token]] })
        .then((a) => {
          const out = Number(formatUnits(a[1], 18));
          return out > 0 ? { pool: "PancakeSwap v2", fee: null, usd, tokensOut: out, price: usd / out } : null;
        })
        .catch(() => null),
    );
  }
  return (await Promise.all(jobs)).filter((q): q is PoolQuote => q !== null);
}

/** Best price at each size across pools: the curve Governor reads. */
export function bestCurve(quotes: PoolQuote[]): DepthPoint[] {
  const bySize = new Map<number, PoolQuote>();
  for (const q of quotes) {
    const cur = bySize.get(q.usd);
    if (!cur || q.price < cur.price) bySize.set(q.usd, q);
  }
  return [...bySize.values()].sort((a, b) => a.usd - b.usd).map((q) => ({ usd: q.usd, price: q.price, pool: q.pool }));
}
