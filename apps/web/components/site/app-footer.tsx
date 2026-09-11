import Link from "next/link";
import { ECHO_ACCOUNT_FACTORY, EXPLORER_URL, NETWORK_NAME } from "@/lib/somnia";

/**
 * The footer for the app screens, as opposed to the landing page's.
 *
 * They were the same component, and it was the wrong shape in here. The landing footer is a
 * marketing surface: a bordered card carrying the wordmark, a mailing-list form, a cookies
 * column and the section links. On `/echo-rank` or `/me` that is a second page stapled beneath
 * the first, and it puts a sign-up form under a screen someone is using to check whether they
 * can still stop us trading for them.
 *
 * What an app footer owes its reader is narrower: which chain this is, that it is testnet with
 * no audit, the contract they can verify, and the legal pages. One line where there is room,
 * stacked where there is not.
 *
 * Deliberately no mailing list, no wordmark, no marketing links — the nav already carries
 * everything navigational, and repeating it here would only add height to a working page.
 */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            {NETWORK_NAME} · verified contracts on Somnia Shannon
          </p>
          {/* Same wrap treatment as the landing footer, and for the same reason: 42 unbroken
              characters have nothing to wrap at, and a truncated address cannot be checked. */}
          <p className="min-w-0 font-mono text-[10px] tracking-wide text-ink-3">
            Factory{" "}
            <a
              href={`${EXPLORER_URL}/address/${ECHO_ACCOUNT_FACTORY}`}
              target="_blank"
              rel="noreferrer"
              className="break-all text-accent underline-offset-4 hover:underline"
            >
              {ECHO_ACCOUNT_FACTORY}
            </a>
          </p>
        </div>

        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {[
            { href: "/settings", label: "Settings" },
            { href: "/terms", label: "Terms" },
            { href: "/privacy", label: "Privacy" },
            { href: "/cookies", label: "Cookies" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              // 32px of hit area rather than the 15px this 10px type gives on its own.
              className="inline-flex min-h-[32px] items-center whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2 transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
