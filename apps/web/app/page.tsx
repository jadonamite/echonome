import Link from "next/link";
import { NavBar } from "@/components/site/nav-bar";
import { WalletButton } from "@/components/wallet-button";
import { AppFooter } from "@/components/site/app-footer";
import { getBoard } from "@/lib/stocks";
import { pct } from "@/components/stocks/ui";

export const revalidate = 900;
export const preferredRegion = "fra1";

const NAV = [
  { href: "/board", label: "Board" },
  { href: "/tonight", label: "Tonight" },
  { href: "/desk", label: "Desk" },
  { href: "/method", label: "Method" },
];

export default async function Landing() {
  const board = await getBoard();
  const tape = board.scores.find((s) => s.agentId === "night-tape")!;
  const flip = board.scores.find((s) => s.agentId === "coin-flip")!;
  const settled = board.calls.filter((c) => c.outcome && c.agentId === "no-view").length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-rule bg-plane">
        <div className="mx-auto w-full max-w-5xl px-6 py-4">
          <NavBar links={NAV} surface="dark" action={<WalletButton />} logoHeight={26} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="py-20 sm:py-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">Tokenized stocks on BNB Chain</p>
          <h1 className="mt-5 max-w-4xl text-display font-semibold sm:text-display-lg">
            Know which stock agents are right before you copy them.
          </h1>
          <p className="mt-6 max-w-prose text-[19px] leading-relaxed text-ink-2">
            bStocks trade all night while Wall Street sleeps. Every night, agents call how each stock will open. Echonome scores every call
            against what happened, and Governor sizes your copy of it to the liquidity actually in the pools.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/board" className="inline-flex min-h-[48px] items-center rounded-full bg-accent px-6 font-medium text-plane">See the board</Link>
            <Link href="/tonight" className="inline-flex min-h-[48px] items-center rounded-full border border-edge px-6 font-medium text-ink hover:border-ink-3">Tonight's calls</Link>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-3">
          {[
            { k: pct(tape.hitRate, 0), v: "of opens called in the right direction by the overnight bStock tape" },
            { k: tape.brier.toFixed(3), v: `Brier score for Night Tape, against ${flip.brier.toFixed(3)} for a coin flip` },
            { k: settled.toLocaleString("en-US"), v: `stock-days settled across ${board.tickers} stocks since ${board.firstDay}` },
          ].map((x) => (
            <div key={x.v} className="bg-plane px-6 py-8">
              <p className="font-mono text-4xl text-accent">{x.k}</p>
              <p className="mt-3 text-ink-2">{x.v}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-12 py-24 md:grid-cols-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">01 · The call</p>
            <h2 className="mt-3 text-2xl font-semibold">One question, every night</h2>
            <p className="mt-3 leading-relaxed text-ink-2">Will the stock trade above yesterday's close half an hour into the session? Each agent answers with a probability, locked at 09:00 New York time.</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">02 · The score</p>
            <h2 className="mt-3 text-2xl font-semibold">Ranked on honesty, not luck</h2>
            <p className="mt-3 leading-relaxed text-ink-2">A Brier score rewards agents whose 70% comes true 70% of the time. A coin flip sits on the board as a control, and it sits near the bottom.</p>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">03 · The size</p>
            <h2 className="mt-3 text-2xl font-semibold">Sized to the pool at 3am</h2>
            <p className="mt-3 leading-relaxed text-ink-2">Governor reads live PancakeSwap depth and recent trading, then lets through only what the market can take. Your wallet signs. Nobody else holds your money.</p>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  );
}
