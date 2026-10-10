import Link from "next/link";
import { AGENTS, DEFAULT_PARAMS } from "@echonome/stocks";
import { PageHead } from "@/components/stocks/ui";

export const metadata = { title: "Method" };

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-12 text-xl font-semibold">{children}</h2>;
}

export default function MethodPage() {
  const p = DEFAULT_PARAMS;
  return (
    <article className="max-w-prose text-[17px] leading-relaxed text-ink-2">
      <PageHead eyebrow="Method" title="One question, asked every night" />

      <p>
        bStocks are tokenized US shares on BNB Chain. They trade around the clock, while the stocks they track trade six and a half hours
        a day. So every night and every weekend, the bStock price moves on its own. Is that move information about the next open, or noise?
        An agent that trades overnight is betting on one answer. Echonome makes the bet explicit and keeps score.
      </p>

      <H>The question</H>
      <p>
        For each stock and each US trading day: will the stock trade above the previous close at 10:00 New York time, half an hour after
        the open? The previous close is the Ondo per-share price at 16:00 on the prior trading day. Ondo's on-chain price follows the real
        share price through an oracle and does not trade on BNB Chain pools, so it is the reference. The settlement price is the same Ondo
        price at 10:00. Calls lock at 09:00.
      </p>
      <p className="mt-4">
        Token prices are divided by each token's share multiplier before any comparison. The multiplier grows as dividends are reinvested and
        jumps on splits, so skipping it would be wrong by up to 10x.
      </p>

      <H>The scoring</H>
      <p>
        Each call is a probability that the stock opens up. The Brier score is the mean of (probability minus outcome) squared, where the
        outcome is 1 for up and 0 for down. It rewards being right and being honest about how sure you are: the only way to score well on
        average is to state your real belief. Saying 50% every time scores exactly 0.25. Lower is better.
      </p>
      <p className="mt-4">
        Two controls sit on the board. No View says 50% every time. Coin Flip picks a side at random at 65%. If either ever ranks near the
        top, the scoring is measuring noise.
      </p>

      <H>The agents</H>
      <ul className="space-y-3">
        {AGENTS.map((a) => (
          <li key={a.id}><Link href={`/agents/${a.id}`} className="font-medium text-ink hover:text-accent">{a.name}.</Link> {a.method}</li>
        ))}
      </ul>

      <H>Replay without hindsight</H>
      <p>
        History comes from hourly Binance Web3 K-lines for each bStock and its Ondo twin. The replay walks nights in lock order and gives
        each agent only nights that settled before its lock. Night Tape refits its one parameter on that settled set each night. A test in
        the repository fails if any agent can see a night that settles after its own lock.
      </p>

      <H>Governor: how much, right now</H>
      <p>
        Knowing whom to trust says nothing about size. A good call executed into a thin pool at 3am is still a bad trade. Governor sizes
        every copied trade from two live measurements, borrowed from BBR congestion control, which paces a network sender at the measured
        bottleneck bandwidth instead of sending until packets drop.
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>Bandwidth: the notional the token's pools actually traded in the busiest of the last hours, from the Binance Web3 token API. A trade may take {Math.round(p.participation * 100)}% of it, scaled by a probe cycle that briefly asks for 25% more, then 25% less, then cruises.</li>
        <li>Cost floor: the best price for a $10 buy across PancakeSwap pools, from the on-chain quoter. A trade is capped where its price climbs more than {p.maxImpactBps} basis points above that floor.</li>
        <li>Hard limits: ${p.floor.maxPerTradeUsd.toLocaleString("en-US")} per trade and ${p.floor.maxDailyUsd.toLocaleString("en-US")} per day. They hold whatever the model says.</li>
      </ul>
      <p className="mt-4">The smallest of these wins, and the desk shows which one it was.</p>

      <H>What this is not</H>
      <p>
        Not investment advice, and not a promise that past calibration continues. bStocks are available only in permitted jurisdictions;
        check yours before trading. Trades on the desk are sent from your own wallet to PancakeSwap. Echonome never holds funds.
      </p>
    </article>
  );
}
