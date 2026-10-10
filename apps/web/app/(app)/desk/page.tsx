import Link from "next/link";
import { TICKERS, pairFor } from "@/lib/stocks";
import { PageHead } from "@/components/stocks/ui";

export const metadata = { title: "Desk" };

export default function DeskIndex() {
  return (
    <>
      <PageHead eyebrow="Desk" title="Size a trade to the market that is there">
        <p>Pick a stock. Governor reads its pools and recent trading on BNB Chain and tells you how much of a buy the market can take right now.</p>
      </PageHead>
      <ul className="grid gap-2 sm:grid-cols-3">
        {TICKERS.map((t) => (
          <li key={t}>
            <Link href={`/desk/${t}`} className="flex min-h-[56px] items-center justify-between rounded-xl border border-rule bg-surface px-5 py-3 transition-colors hover:border-edge">
              <span className="font-medium">{t}</span>
              <span className="font-mono text-xs text-ink-3">{pairFor(t)?.bstock.symbol}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
