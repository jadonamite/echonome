import type { Metadata } from "next";
import Link from "next/link";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Echonome stores, what it does not, and what a public chain makes permanent.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <LastUpdated date="9 September 2026" />
      <LegalNotice />

      <p>
        Short version: we store your wallet address, the copy links you create, and ordinary
        server logs. We do not ask for your name or your email, we do not run advertising or
        analytics trackers, and we do not sell anything to anyone.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your wallet address.</strong> Needed to know which EchoAccount is yours and
          which copies belong to you.
        </li>
        <li>
          <strong>Your EchoAccount address</strong> and the limits you set on it, so the mirror
          engine can skip an order that would revert rather than burn gas discovering it.
        </li>
        <li>
          <strong>Your copy links.</strong> Which traders you follow, at what size fraction, and
          whether each one is active, paused or revoked.
        </li>
        <li>
          <strong>Echoes.</strong> Every order placed for you, its result, and the reason when
          one fails.
        </li>
        <li>
          <strong>Server logs.</strong> IP address, user agent and request path, kept because a
          service handling orders needs to be debuggable. These roll off after 30 days.
        </li>
      </ul>

      <h2>What we do not store</h2>
      <p>
        No name, no email address, no phone number, unless you volunteer one by contacting us.
        No private keys, ever: your wallet signs, or nothing happens. No advertising
        identifiers, no third-party analytics, no session recording, no cross-site tracking. We
        have no data to sell and no arrangement to sell it under.
      </p>

      <h2>What is already public</h2>
      <p>
        Trades, settlements, account deployments and calibration inputs live on a public
        blockchain. We read that record, we do not create it, and neither we nor you can delete
        it. Anyone can compute the same scores from the same data, which is the point. If you
        want an address not to be publicly linked to your activity, that decision belongs to
        the moment before you use it, not after.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Our database is not shared with anyone. We use a hosting provider and a public RPC
        endpoint, both of which see requests in the ordinary course of serving them. We do not
        pass your data to advertisers, data brokers or partners, because there are none.
      </p>

      <h2>What you can ask for</h2>
      <p>
        Ask us and we will tell you everything our database holds against your address, and
        delete the parts that are ours to delete: your copy links, your grant records, your
        echo history. What lives on chain stays on chain, and nobody can change that. Requests
        go through the repository linked in the footer.
      </p>

      <h2>Cookies</h2>
      <p>
        Covered separately in the <Link href="/cookies">Cookie Policy</Link>, because there is
        almost nothing to cover and it is worth saying so precisely.
      </p>

      <h2>Changes</h2>
      <p>
        If this changes materially we will change the date at the top and say what changed
        rather than quietly reissuing the page.
      </p>
    </>
  );
}
