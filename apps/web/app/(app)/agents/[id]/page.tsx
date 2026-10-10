import { notFound } from "next/navigation";
import Link from "next/link";
import { AGENTS, scoreAgent } from "@echonome/stocks";
import { getBoard, agentById } from "@/lib/stocks";
import { ReliabilityDiagram } from "@/components/reliability-diagram";
import { PageHead, Stat, pct } from "@/components/stocks/ui";

export const revalidate = 900;
export const preferredRegion = "fra1";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const a = agentById((await params).id);
  return { title: a?.name ?? "Agent" };
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = agentById((await params).id);
  if (!agent) notFound();
  const board = await getBoard();
  const score = board.scores.find((s) => s.agentId === agent.id)!;
  const rank = board.scores.findIndex((s) => s.agentId === agent.id) + 1;
  const mine = board.calls.filter((c) => c.agentId === agent.id && c.outcome);
  const tickers = [...new Set(mine.map((c) => c.ticker))].sort();
  const perTicker = tickers
    .map((t) => ({ t, ...scoreAgent(agent.id, mine.filter((c) => c.ticker === t)) }))
    .sort((a, b) => a.brier - b.brier);
  const recent = [...mine].sort((a, b) => b.day.localeCompare(a.day) || a.ticker.localeCompare(b.ticker)).slice(0, 24);
  const buckets = score.reliability.filter((b) => b.n > 0).map((b) => ({ bucket: b.lo, observedFrequency: b.freqUp, sampleCount: b.n }));

  return (
    <>
      <p className="mb-6"><Link href="/board" className="inline-flex min-h-[44px] items-center text-sm text-ink-2 hover:text-ink">Back to the board</Link></p>
      <PageHead eyebrow={agent.control ? "Control agent" : "Agent"} title={agent.name}>
        <p>{agent.method}</p>
      </PageHead>

      <section className="mb-12 grid gap-3 sm:grid-cols-3">
        <Stat label="Rank" value={`${rank} of ${board.scores.length}`} />
        <Stat label="Brier" value={score.brier.toFixed(3)} note="0.25 is saying 50% every time" live={score.brier < 0.25} />
        <Stat label="Direction" value={agent.id === "no-view" ? "–" : pct(score.hitRate)} note={`${score.n.toLocaleString("en-US")} settled calls`} />
      </section>

      <section className="mb-12 space-y-4">
        <h2 className="text-xl font-semibold">Does its confidence mean anything</h2>
        <p className="max-w-prose text-ink-2">Each dot groups calls by the probability given for "up". On the diagonal, an agent that says 70% sees "up" 70% of the time.</p>
        <ReliabilityDiagram buckets={buckets} />
      </section>

      <section className="mb-12 space-y-4">
        <h2 className="text-xl font-semibold">By stock</h2>
        <div className="overflow-x-auto rounded-xl border border-rule">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-surface font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
              <tr><th className="px-4 py-3 text-left">Stock</th><th className="px-4 py-3 text-right">Calls</th><th className="px-4 py-3 text-right">Brier</th><th className="px-4 py-3 text-right">Direction</th></tr>
            </thead>
            <tbody>
              {perTicker.map((r) => (
                <tr key={r.t} className="border-t border-rule">
                  <td className="px-4 py-3"><Link href={`/desk/${r.t}`} className="text-ink hover:text-accent">{r.t}</Link></td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{r.n}</td>
                  <td className={`px-4 py-3 text-right font-mono ${r.brier < 0.25 ? "text-accent" : "text-ink-2"}`}>{r.brier.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ink-2">{agent.id === "no-view" ? "–" : pct(r.hitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Latest settled calls</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {recent.map((c) => {
            const right = c.p !== 0.5 && (c.p > 0.5) === (c.outcome === "up");
            return (
              <li key={`${c.ticker}-${c.day}`} className="flex items-center justify-between rounded-lg border border-rule bg-surface px-4 py-3 text-sm">
                <span><span className="font-medium">{c.ticker}</span> <span className="text-ink-3">{c.day}</span></span>
                <span className="font-mono text-ink-2">
                  up {pct(c.p, 0)} · <span className={c.p === 0.5 ? "text-ink-3" : right ? "text-good" : "text-critical"}>opened {c.outcome}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
