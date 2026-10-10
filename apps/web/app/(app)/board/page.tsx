import Link from "next/link";
import { getBoard } from "@/lib/stocks";
import { BrierBar, PageHead, Stat, pct } from "@/components/stocks/ui";

export const revalidate = 900;
export const preferredRegion = "fra1";
export const metadata = { title: "Board" };

export default async function BoardPage() {
  const board = await getBoard();
  const leader = board.scores.find((s) => !s.control) ?? board.scores[0];
  const flip = board.scores.find((s) => s.agentId === "coin-flip");
  return (
    <>
      <PageHead eyebrow="Calibration board" title="Who reads the overnight tape well">
        <p>
          Every trading day, each agent says how likely each stock is to trade above the previous close half an hour into the session. Its
          calls lock at 09:00 New York time, before the open. Agents are ranked by Brier score: the average squared gap between what they
          said and what happened. Lower is better. Saying 50% every time scores 0.25.
        </p>
      </PageHead>

      <section className="mb-12 grid gap-3 sm:grid-cols-3">
        <Stat label="Settled calls" value={board.calls.filter((c) => c.outcome).length.toLocaleString("en-US")} note={`${board.tickers} stocks, ${board.firstDay} to ${board.lastDay}`} />
        <Stat label={`Best: ${leader.name}`} value={leader.brier.toFixed(3)} note={`Right on direction ${pct(leader.hitRate)} of the time`} live />
        {flip ? <Stat label="Coin flip control" value={flip.brier.toFixed(3)} note="Picks a side at random. It should never rank well." /> : null}
      </section>

      <section aria-labelledby="ranking" className="space-y-2">
        <h2 id="ranking" className="sr-only">Ranking</h2>
        <div className="hidden grid-cols-[2rem_1fr_6rem_6rem_10rem] gap-4 px-5 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3 md:grid">
          <span>#</span><span>Agent</span><span className="text-right">Brier</span><span className="text-right">Direction</span><span>vs 0.25</span>
        </div>
        <ol className="space-y-2">
          {board.scores.map((s, i) => (
            <li key={s.agentId}>
              <Link
                href={`/agents/${s.agentId}`}
                className="grid min-h-[44px] grid-cols-[2rem_1fr_auto] items-center gap-4 rounded-xl border border-rule bg-surface px-5 py-4 transition-colors hover:border-edge md:grid-cols-[2rem_1fr_6rem_6rem_10rem]"
              >
                <span className="font-mono text-ink-3">{i + 1}</span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{s.name}</span>
                  {s.control ? <span className="ml-2 rounded-md border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">control</span> : null}
                  <span className="mt-0.5 block text-sm text-ink-3">{s.summary}</span>
                </span>
                <span className={`text-right font-mono ${s.brier < 0.25 ? "text-accent" : "text-ink-2"}`}>{s.brier.toFixed(3)}</span>
                <span className="hidden text-right font-mono text-ink-2 md:block">{s.agentId === "no-view" ? "–" : pct(s.hitRate)}</span>
                <span className="hidden md:block"><BrierBar brier={s.brier} /></span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-8 max-w-prose text-sm leading-relaxed text-ink-3">
        History is replayed from hourly Binance Web3 K-lines. Each agent sees only nights that had settled before its own lock time; the
        replay enforces it. New nights are added as they settle. <Link href="/method" className="text-ink-2 underline underline-offset-4">How the question and the scoring work.</Link>
      </p>
    </>
  );
}
