import Link from "next/link";

/** Footer for the app screens: the network, where the data comes from, and the legal pages. */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">BNB Smart Chain · mainnet data</p>
          <p className="max-w-xl text-xs leading-relaxed text-ink-3">
            Prices and volumes from the Binance Web3 market API. Pool depth from PancakeSwap quoter contracts. Not investment advice.
          </p>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {[
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/cookies", label: "Cookies" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
