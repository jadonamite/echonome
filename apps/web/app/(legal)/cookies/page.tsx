import type { Metadata } from "next";
import Link from "next/link";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The complete list of what Echonome stores in your browser, which is short.",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Policy</h1>
      <LastUpdated date="9 September 2026" />
      <LegalNotice />

      <p>
        Most cookie policies describe trackers the site does not run, copied from a template.
        This one lists what Echonome actually puts in your browser, and the list is short
        enough to read in full.
      </p>

      <h2>Everything we store, in full</h2>
      <ul>
        <li>
          <code>echonome.consent.v1</code> — records which of the two buttons you pressed on
          the banner. Stored in localStorage rather than a cookie, so that recording your
          refusal does not itself require setting a cookie. Stays until you clear your site
          data.
        </li>
        <li>
          <strong>Wallet connection state.</strong> Your wallet extension and the connection
          library keep a small record in localStorage of which wallet you last connected, so
          you are not asked to pick again on every page. It holds no keys and no balances.
        </li>
      </ul>
      <p>
        That is the whole list. There are no advertising cookies, no analytics cookies, no
        social embeds, no pixels, and no third-party scripts that could set any of those
        without us noticing.
      </p>

      <h2>Choosing</h2>
      <p>
        The banner offers <strong>Essential only</strong> and <strong>Accept all</strong> as
        two buttons of equal weight, because a choice where refusing is harder than agreeing is
        not a choice. Today the two options store the same thing, since we run nothing
        non-essential. If that ever changes, the difference will be described here before the
        change ships.
      </p>

      <h2>Changing your mind</h2>
      <p>
        Clear this site&apos;s data in your browser and the banner returns on your next visit.
        Blocking storage entirely also works: the site treats an unreadable store as though you
        had not been asked yet, and everything except remembering your wallet still functions.
      </p>

      <h2>Related</h2>
      <p>
        What we keep on our own servers, rather than in your browser, is in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}
