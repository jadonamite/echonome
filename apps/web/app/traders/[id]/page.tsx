import Link from "next/link";
import { notFound } from "next/navigation";
import { MIN_CALIBRATION_SAMPLE } from "@echonome/shared";
import { getTraderDecisions, getTraderSummary } from "@/lib/queries";
import { DecisionTrace, DecisionTraceLegend } from "@/components/decision-trace";
import { CopyButton } from "./copy-button";
import {
  brierVerdict,
  formatBrier,
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
      <div>
        <Link href="/" className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2">
          ← Leaderboard
        </Link>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{trader.label}</h1>
            {trader.isSeed && (
              <span className="border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
                Seed
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-ink-3 tnum">{trader.address}</p>
          <p className="text-sm text-ink-2">
            {trader.activeFollowers === 0
              ? "No one is copying this trader yet."
              : `${trader.activeFollowers} ${trader.activeFollowers === 1 ? "wallet is" : "wallets are"} copying this trader.`}
          </p>
        </div>

        <CopyButton traderId={trader.id} traderLabel={trader.label} />
      </section>

      <section className="grid gap-px border border-rule bg-rule sm:grid-cols-4">
        <Panel label="Brier score" value={formatBrier(trader.brierScore)} hint={brierVerdict(trader.brierScore)} />
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
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-surface">
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <Td className="whitespace-nowrap text-ink-3">{timeAgo(d.createdAt)}</Td>
                    <Td className="font-mono text-ink-2 tnum">{shortMarket(d.marketId)}</Td>
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

function Panel({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-2xl text-ink tnum">{value}</p>
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
