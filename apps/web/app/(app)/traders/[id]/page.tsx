import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_CALIBRATION_SAMPLE } from "@echonome/shared";
import { getTraderDecisions, getTraderSummary } from "@/lib/queries";
import { DecisionTrace, DecisionTraceLegend } from "@/components/decision-trace";
import { ReliabilityDiagram } from "@/components/reliability-diagram";
import { LiveRefresh } from "@/components/live-refresh";
import { traderIdentity } from "@/lib/trader-names";
import { CopyButton } from "./copy-button";
import {
  brierVerdict,
  edgeVerdict,
  formatBrier,
  formatEdge,
  formatProbability,
  shortAddress,
  shortMarket,
  sideLabel,
  timeAgo,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TraderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [trader, decisions] = await Promise.all([getTraderSummary(id), getTraderDecisions(id)]);
  if (!trader) notFound();

  // Oldest-to-newest for the trace; the table below reads newest-first, the way a feed does.
  const ticks = [...decisions].reverse().map((d) => ({
    side: d.side,
    settledOutcome: d.settledOutcome,
    wasRight: d.wasRight,
  }));

  return (
    <div className="space-y-10">
      {/* Chain data. Keeps the panels and the reliability plot current without a reload. */}
      <LiveRefresh />

      <div className="flex items-center justify-between">
        <Link href="/echo-rank" className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2">
          ← Echo Rank
        </Link>
        <Link href="/feed" className="text-xs text-accent underline underline-offset-4 hover:text-ink">
          View Live Trade Feed →
        </Link>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {traderIdentity(trader.label).name}
            </h1>
            {trader.isSeed && (
              <span className="border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
                Seed
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-ink-3 tnum">
            {traderIdentity(trader.label).strategy} · {trader.address}
          </p>
          {traderIdentity(trader.label).role && (
            <p className="max-w-xl text-xs text-ink-3">{traderIdentity(trader.label).role}</p>
          )}
          <p className="text-sm text-ink-2">
            {trader.activeFollowers === 0
              ? "No one is copying this trader yet."
              : `${trader.activeFollowers} ${trader.activeFollowers === 1 ? "wallet is" : "wallets are"} copying this trader.`}
          </p>
        </div>

        <CopyButton traderId={trader.id} traderLabel={trader.label} />
      </section>

      <section className="grid gap-px border border-rule bg-rule sm:grid-cols-5">
        <Panel
          label="Edge"
          value={formatEdge(trader.edge)}
          hint={edgeVerdict(trader.edge, trader.edgeLower)}
        />
        <Panel
          label="Brier score"
          value={formatBrier(trader.brierScore)}
          hint={brierVerdict(trader.brierScore)}
          tone="accent"
        />
        <Panel
          label="Resolved calls"
          value={String(trader.resolvedCount)}
          hint={
            trader.warmingUp
              ? `${Math.max(0, MIN_CALIBRATION_SAMPLE - trader.sampleCount)} more before ranked`
              : "enough history to rank"
          }
        />
        <Panel
          label="Called it right"
          value={trader.hitRate === null ? "—" : `${Math.round(trader.hitRate * 100)}%`}
          hint="of resolved calls"
        />
        <Panel
          label="Total calls"
          value={String(trader.decisionCount)}
          hint={trader.lastDecisionAt ? `last ${timeAgo(trader.lastDecisionAt)}` : "none recorded"}
        />
      </section>

      {trader.warmingUp && (
        <p className="border-l-2 border-warning bg-surface px-4 py-3 text-sm text-ink-2">
          <span className="text-warning">Warming up.</span> This trader has {trader.sampleCount}{" "}
          resolved {trader.sampleCount === 1 ? "call" : "calls"}, below the{" "}
          {MIN_CALIBRATION_SAMPLE} needed for a score worth trusting. You can copy them
          anyway — you just shouldn&apos;t read much into the number yet.
        </p>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
            Does their confidence mean anything?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            A single score can call two very different traders the same thing. This is the
            breakdown behind it: for every level of confidence this trader traded at, how often
            they were actually right. Points above the dashed line mean they were righter than
            they claimed; below means they claimed more than they delivered.
          </p>
        </div>

        <ReliabilityDiagram buckets={trader.reliability} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
            Every call, in order
          </h2>
          <DecisionTraceLegend />
        </div>

        <div className="border border-rule bg-surface p-4">
          <DecisionTrace ticks={ticks} height={28} />
        </div>

        {decisions.length === 0 ? (
          <div className="border border-rule bg-surface px-5 py-8">
            <h3 className="text-sm font-medium text-ink">Nothing recorded yet</h3>
            <p className="mt-1.5 max-w-xl text-sm text-ink-2">
              This wallet is indexed but hasn&apos;t filled an order on a tracked market.
              A call appears here the moment one of its trades is detected on chain.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-rule">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">
                Every recorded call by {trader.label}, newest first
              </caption>
              <thead>
                <tr className="border-b border-rule bg-surface-raised text-left">
                  <Th>When</Th>
                  <Th>Market</Th>
                  <Th>Called</Th>
                  <Th align="right">Market price at entry</Th>
                  <Th>Settled</Th>
                  <Th>Result</Th>
                  <Th align="right">Takes</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-surface">
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <Td className="whitespace-nowrap text-ink-3">{timeAgo(d.createdAt)}</Td>
                    <Td className={d.marketLabel ? "text-ink-2" : "font-mono text-ink-2 tnum"}>
                      {d.marketLabel ?? shortMarket(d.marketId)}
                    </Td>
                    <Td className="text-ink">{sideLabel(d.side)}</Td>
                    <Td align="right" className="font-mono text-ink-2 tnum">
                      {formatProbability(d.impliedProbability)}{" "}
                      <span className="text-ink-3">up</span>
                    </Td>
                    <Td className="text-ink-2">
                      {d.settledOutcome ? sideLabel(d.settledOutcome) : "—"}
                    </Td>
                    <Td>
                      {d.wasRight === null ? (
                        <span className="text-ink-3">Still open</span>
                      ) : d.wasRight ? (
                        <span className="text-good">Right</span>
                      ) : (
                        <span className="text-critical">Wrong</span>
                      )}
                    </Td>
                    <Td align="right">
                      <Link
                        href="/feed?filter=discussions"
                        className="font-mono text-xs text-ink-3 hover:text-accent transition"
                      >
                        Takes →
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * `tone="accent"` ties a figure to the chart that explains it.
 *
 * The Brier score is drawn in the same ink as the marks on the reliability diagram below,
 * because they are the same claim at two resolutions: the number is the summary, the plot is
 * the breakdown that shows what the number hid. Sharing a colour is the cheapest way to say
 * "these two are about each other" without a caption saying so.
 */
function Panel({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ink" | "accent";
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className={`mt-1 font-mono text-2xl tnum ${tone === "accent" ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-3">{hint}</p>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-ink-3 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <td className={`px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}
