import { notFound } from "next/navigation";
import { getDesk, TICKERS } from "@/lib/stocks";
import { PageHead, Stat, usd } from "@/components/stocks/ui";
import { GovernorPanel } from "@/components/stocks/governor-panel";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  return { title: `${(await params).ticker.toUpperCase()} desk` };
}

export default async function DeskPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  if (!TICKERS.includes(ticker)) notFound();
  const desk = await getDesk(ticker, 1_000);
  if (!desk) notFound();
  const pools = [...new Set(desk.quotes.map((q) => q.pool))].sort();
  const sizes = [...new Set(desk.quotes.map((q) => q.usd))].sort((a, b) => a - b);
  const best = Math.min(...desk.quotes.filter((q) => q.usd === sizes[0]).map((q) => q.price));

  return (
    <>
      <PageHead eyebrow={`${desk.symbol} · BNB Chain`} title={`${ticker} desk`}>
        <p>
          US market {desk.marketOpen === false ? `closed${desk.marketReason ? ` (${desk.marketReason})` : ""}` : desk.marketOpen ? "open" : "status unknown"}.{" "}
          {desk.tokenTradable === false ? `${desk.symbol} is paused by its issuer right now.` : `${desk.symbol} keeps trading on PancakeSwap either way.`} Everything below
          was read from the chain and the Binance Web3 API seconds ago.
        </p>
      </PageHead>

      <section className="mb-10 grid gap-3 sm:grid-cols-4">
        <Stat label="Token price" value={usd(desk.tokenPrice, 2)} note={`Multiplier ${desk.multiplier.toFixed(4)}`} live />
        <Stat label="Traded, 1h" value={usd(desk.flow.usd1h)} live />
        <Stat label="Traded, 4h" value={usd(desk.flow.usd4h)} live />
        <Stat label="Traded, 24h" value={usd(desk.flow.usd24h)} live />
      </section>

      <GovernorPanel
        ticker={ticker}
        token={desk.address as `0x${string}`}
        initial={{ requestUsd: 1_000, decision: desk.decision }}
        params={desk.params}
      />

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold">What each pool would charge</h2>
        <p className="max-w-prose text-ink-2">
          Extra cost over the best $10 price, in basis points, for buying with USDT. Quoted live from PancakeSwap's quoter contracts. A pool
          missing from a row could not fill that size.
        </p>
        {desk.quotes.length === 0 ? (
          <p className="rounded-xl border border-rule bg-surface px-5 py-4 text-ink-2">No pool returned a quote. Governor allows nothing until one does.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-rule">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                <tr><th className="px-4 py-3 text-left">Size</th>{pools.map((p) => <th key={p} className="px-4 py-3 text-right">{p.replace("PancakeSwap ", "")}</th>)}</tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s} className="border-t border-rule">
                    <td className="px-4 py-3 font-mono text-ink">{usd(s)}</td>
                    {pools.map((p) => {
                      const q = desk.quotes.find((x) => x.usd === s && x.pool === p);
                      const bps = q ? (q.price / best - 1) * 1e4 : null;
                      return (
                        <td key={p} className={`px-4 py-3 text-right font-mono ${bps == null ? "text-ink-3" : bps <= desk.params.maxImpactBps ? "text-ink-2" : bps < 200 ? "text-warning" : "text-critical"}`}>
                          {bps == null ? "–" : bps < 1 ? "<1" : bps > 9999 ? ">9999" : Math.round(bps)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
