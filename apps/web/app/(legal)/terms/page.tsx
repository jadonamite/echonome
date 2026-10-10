import type { Metadata } from "next";
import { LegalNotice, LastUpdated } from "@/components/site/legal-notice";

export const metadata: Metadata = { title: "Terms", description: "What Echonome is, what it is not, and who is responsible for a trade." };

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <LastUpdated date="10 October 2026" />
      <LegalNotice />

      <h2>What Echonome does</h2>
      <p>
        Echonome publishes forecasts made by automated agents about how tokenized US stocks on BNB Chain will open, scores those forecasts
        against what happened, and shows how large a purchase the current on-chain liquidity can take. It reads public data from the Binance
        Web3 market API and from PancakeSwap contracts.
      </p>

      <h2>Not advice</h2>
      <p>
        Nothing on this site is investment, legal or tax advice. A good score over past nights does not mean an agent will be right tonight.
        Prices, pools and liquidity can change between the moment a page loads and the moment a trade lands.
      </p>

      <h2>Your trades are yours</h2>
      <p>
        If you buy through the desk, the transaction is built in your browser and signed by your own wallet. It goes from your wallet to
        PancakeSwap on BNB Chain. Echonome never holds your funds or your keys, cannot reverse a transaction, and is not a party to the trade.
      </p>

      <h2>Who may trade</h2>
      <p>
        Tokenized stocks are offered by their issuers only in permitted jurisdictions and only to eligible holders. Checking that you are
        allowed to buy and hold a given token where you live is your responsibility. Do not use the desk where that is not the case.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided as it is. Data can be late, missing or wrong, and the site can be unavailable. To the extent the law allows,
        Echonome is not liable for losses from using it.
      </p>
    </>
  );
}
