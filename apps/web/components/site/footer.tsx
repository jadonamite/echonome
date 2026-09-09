import Link from "next/link";
import { ECHO_ACCOUNT_FACTORY, EXPLORER_URL, NETWORK_NAME } from "@/lib/somnia";
import { EchoMark } from "./echo-mark";
import { FooterConsent } from "./footer-consent";
import { MailingList } from "./mailing-list";

/**
 * The footer from `design/references/web3-wgmi.jpeg`.
 *
 * Its structure is unusual and worth following exactly: one large rounded container sitting on
 * the dark ground, holding three columns of small uppercase letterspaced type. Copyright and
 * legal links on the left, a mailing list with an inline arrow button in the middle, and the
 * cookie policy on the right with Accept and Find out more as two pills.
 *
 * That last column is the reason this footer is built the way it is. The reference puts cookie
 * consent in the footer as ordinary furniture rather than as an overlay that ambushes the
 * reader, and it happens to be the more honest pattern as well as the one in the brief.
 */
const COLUMN_HEADING = "font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3";
const SMALL_LINK =
  "font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2 transition-colors hover:text-ink";

export function SiteFooter() {
  return (
    <footer className="px-6 pb-10 sm:px-10">
      <div className="mx-auto w-full max-w-7xl rounded-[28px] border border-rule bg-surface px-6 py-10 sm:px-10 sm:py-12">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Left: identity and the legal links. */}
          <div>
            <div className="flex items-center gap-2.5 text-ink">
              <EchoMark size={22} />
              <span className="text-sm font-semibold tracking-tight">Echonome</span>
            </div>
            <p className={`${COLUMN_HEADING} mt-5`}>&copy;{new Date().getFullYear()} Echonome</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/terms" className={SMALL_LINK}>
                T&amp;Cs
              </Link>
              <Link href="/privacy" className={SMALL_LINK}>
                Privacy
              </Link>
              <a
                href={`${EXPLORER_URL}/address/${ECHO_ACCOUNT_FACTORY}`}
                target="_blank"
                rel="noreferrer"
                className={SMALL_LINK}
              >
                View contract
              </a>
            </div>
          </div>

          {/* Middle: the mailing list, an input pill with an arrow button inside it. */}
          <div>
            <p className={COLUMN_HEADING}>Mailing list</p>
            <MailingList />
            <p className="mt-3 max-w-[22rem] text-[11px] leading-relaxed text-ink-3">
              One message when the first real echo settles on chain. Nothing else, and no list
              is shared with anyone.
            </p>
          </div>

          {/* Right: cookie policy, with the choice made here rather than over the page. */}
          <div>
            <p className={COLUMN_HEADING}>Cookies policy</p>
            <FooterConsent />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-rule pt-6 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
            {NETWORK_NAME}. Testnet only, no audit, no legal review.
          </p>
          <p className="font-mono text-[10px] tracking-wide text-ink-3">
            Factory{" "}
            <a
              href={`${EXPLORER_URL}/address/${ECHO_ACCOUNT_FACTORY}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-4 hover:underline"
            >
              {ECHO_ACCOUNT_FACTORY}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
