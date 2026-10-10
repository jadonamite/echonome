import type { Metadata } from "next";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";
import { CONSENT_KEY } from "@/components/site/consent";

export const metadata: Metadata = { title: "Cookies", description: "The complete list of what Echonome stores in your browser." };

export default function CookiesPage() {
  return (
    <>
      <h1>Cookies</h1>
      <LastUpdated date="10 October 2026" />
      <LegalNotice />

      <h2>Everything we store, in full</h2>
      <ul>
        <li>
          <code>{CONSENT_KEY}</code> in local storage: your answer to the cookie bar, so it is not asked again. Kept until you clear site data.
        </li>
        <li>
          Your wallet extension may store its own connection state for this site. That belongs to the wallet, not to Echonome, and follows
          the wallet's policy.
        </li>
      </ul>

      <h2>What we do not store</h2>
      <p>No analytics cookies, no advertising cookies, no third-party trackers. Choosing "essential only" changes nothing today, because there is nothing optional to switch off.</p>
    </>
  );
}
