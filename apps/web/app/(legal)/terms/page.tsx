import type { Metadata } from "next";
import Link from "next/link";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "What Echonome does and does not do on your behalf, and what you keep control of at every point.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms and Conditions</h1>
      <LastUpdated date="9 September 2026" />
      <LegalNotice />

      <p>
        These terms cover your use of Echonome. Read them before you deploy an account or copy
        a trader, because they describe exactly what we can and cannot do with what is yours.
      </p>

      <h2>What Echonome is</h2>
      <p>
        Echonome ranks traders on DreamDEX Event Contracts by calibration and, if you ask it
        to, places matching orders through a contract you own. It is not a broker, it is not a
        fund, and it does not take custody of anything. We do not give financial advice, and
        nothing on this site is a recommendation to trade.
      </p>

      <h2>Your account, and what we can do with it</h2>
      <p>
        Copying requires you to deploy an EchoAccount, a contract whose owner is your wallet
        address. You fund it, and you are the only address able to withdraw from it. Echonome
        holds a separate executor key on that contract, limited by the contract itself to two
        actions: placing an order and cancelling an order.
      </p>
      <p>The executor key cannot:</p>
      <ul>
        <li>Withdraw your collateral or your outcome tokens.</li>
        <li>Raise the per-order cap or lifetime budget you set.</li>
        <li>Extend its own expiry date.</li>
        <li>Add a market you have not allowed.</li>
        <li>Act after you pause the account, after your expiry date, or after you revoke it.</li>
      </ul>
      <p>
        These limits are enforced by the contract, not by our servers or by our good
        intentions, and they are tested against the live chain by a script published with the
        source. If we ever want the executor to do something outside that list, the only route
        is a new contract that you choose to deploy.
      </p>

      <h2>What you are responsible for</h2>
      <p>
        Your wallet and its keys. Your limits. The trader you choose to copy, and the size you
        choose to copy them at. Whether trading Event Contracts is lawful and appropriate for
        you where you live. You can pause or revoke at any time without notifying us, and we
        cannot stop you.
      </p>

      <h2>Calibration scores</h2>
      <p>
        A calibration score measures decisions that have already resolved, computed from public
        on-chain records. It is a measurement of the past. It is not a prediction, not a
        guarantee, and not advice. A trader ranked highly today can be wrong tomorrow, and a
        score computed over a small sample can move sharply. Nobody appears ranked below twenty
        resolved decisions, and the sample count is shown next to every score.
      </p>

      <h2>Traders we operate</h2>
      <p>
        Some traders on the Echo Rank are strategies we run ourselves. They are labelled as
        such wherever they appear, they trade with real funds at real risk, and they are scored
        by the same calculation as every other trader with no adjustment in their favour. We do
        not remove a trader of ours from the board for performing badly.
      </p>

      <h2>Availability and failure</h2>
      <p>
        Echonome runs on a testnet, depends on a chain and an indexer we do not operate, and
        can miss trades. When an echo fails you will see it recorded as failed with the reason
        attached rather than silently absent. We do not promise that any particular trade will
        be mirrored, or mirrored at any particular price or time.
      </p>

      <h2>Risk</h2>
      <p>
        Event Contracts are binary instruments. A position resolves at its full value or at
        nothing. Copying another trader means accepting that outcome on their judgment. You can
        lose everything you put into your account. Neither the contracts nor this site have had
        a security audit or a legal review.
      </p>

      <h2>Ending it</h2>
      <p>
        You end this relationship by revoking the executor key, which needs nothing from us.
        Your funds stay where they are, because they were never ours. We may stop operating the
        service at any time; if we do, your account and its contents remain entirely under your
        control.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change materially we will change the date at the top and say what
        changed. Questions go to the repository linked in the footer, or see the{" "}
        <Link href="/privacy">Privacy Policy</Link> for how to reach us about your data.
      </p>
    </>
  );
}
