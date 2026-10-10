import type { Metadata } from "next";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";

export const metadata: Metadata = { title: "Privacy", description: "What Echonome learns about you, which is very little." };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <LastUpdated date="10 October 2026" />
      <LegalNotice />

      <h2>No accounts</h2>
      <p>There is no sign-up, no email collection and no profile. Echonome does not run analytics, session recording or advertising trackers.</p>

      <h2>Your wallet</h2>
      <p>
        If you connect a wallet, its address stays in your browser. Echonome's servers never receive it. Transactions you sign are public on
        BNB Chain, like every transaction there.
      </p>

      <h2>Server logs</h2>
      <p>
        The hosting provider, Vercel, records standard request logs, including IP address and user agent, for security and debugging, and
        keeps them under its own retention policy. When you ask the desk for a size, the server receives the stock ticker and the dollar
        amount, and nothing that identifies you.
      </p>

      <h2>Fonts</h2>
      <p>All fonts are served from this site. Loading a page makes no request to a font provider.</p>

      <h2>Contact</h2>
      <p>Questions about this policy can be raised as an issue on the project's public repository.</p>
    </>
  );
}
