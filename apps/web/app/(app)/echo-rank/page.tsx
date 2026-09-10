import Link from "next/link";
import { MIN_CALIBRATION_SAMPLE } from "@echonome/shared";
import { getLeaderboard, getRecentTraces, type LeaderboardEntry } from "@/lib/queries";
import { DecisionTrace, DecisionTraceLegend } from "@/components/decision-trace";
import { LiveRefresh } from "@/components/live-refresh";
import {
  edgeVerdict,
  formatBrier,
  formatEdge,
  shortAddress,
  timeAgo,
} from "@/lib/format";

// Live data — never cached. The Echo Rank's whole claim is that it reflects what
// these wallets are doing right now on chain.
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [entries, traces] = await Promise.all([getLeaderboard(), getRecentTraces()]);
  const ranked = entries.filter((e) => !e.warmingUp);
  const warming = entries.filter((e) => e.warmingUp);

  return (
    <div className="space-y-10">
      <LiveRefresh />

      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ranked by edge</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
          How much better a trader did than the prices they paid, in cents per dollar
          staked. Sorting uses the conservative end of a 95% confidence interval, so
          traders climb by accumulating evidence rather than a lucky run.
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-3">
          Accuracy is shown too, as a Brier score, but it is deliberately not the ranking —
          a price is accurate when it matches reality, and a trader profits when it does
          not. Sorting on accuracy sorts against the people most worth copying.
        </p>
      </section>

      {entries.length === 0 ? (
        <EmptyLeaderboard />
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
                Ranked
              </h2>
              <DecisionTraceLegend />
            </div>

            {ranked.length === 0 ? (
              <p className="border border-rule bg-surface px-5 py-6 text-sm text-ink-2">
                Nobody has cleared {MIN_CALIBRATION_SAMPLE} resolved calls yet. Everyone
                currently trading is listed below — they are ranked the moment they have
                enough history to be judged fairly.
              </p>
            ) : (
              <ol className="divide-y divide-rule border border-rule">
                {ranked.map((entry, i) => (
                  <TraderRow
                    key={entry.id}
                    entry={entry}
                    rank={i + 1}
                    ticks={traces.get(entry.id) ?? []}
                  />
                ))}
              </ol>
            )}
          </section>

          {warming.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-medium uppercase tracking-wider text-ink-3">
                Warming up
              </h2>
              <p className="max-w-2xl text-sm text-ink-2">
                Trading now, but with fewer than {MIN_CALIBRATION_SAMPLE} resolved calls.
                Their score exists; it just isn&apos;t yet worth trusting. Shown so you can
                watch them arrive, not hidden until they look good.
              </p>
              <ol className="divide-y divide-rule border border-rule">
                {warming.map((entry) => (
                  <TraderRow
                    key={entry.id}
                    entry={entry}
                    rank={null}
                    ticks={traces.get(entry.id) ?? []}
                  />
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TraderRow({
  entry,
  rank,
  ticks,
}: {
  entry: LeaderboardEntry;
  rank: number | null;
  ticks: { side: "up" | "down"; settledOutcome: "up" | "down" | null; wasRight: boolean | null }[];
}) {
  return (
    <li className="bg-surface transition-colors hover:bg-surface-raised">
      <Link href={`/traders/${entry.id}`} className="block px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <span className="w-6 font-mono text-sm text-ink-3 tnum">
                {rank === null ? "—" : rank}
              </span>
              <span className="truncate font-medium text-ink">{entry.label}</span>
              {entry.isSeed && (
                <span className="border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
                  Seed
                </span>
              )}
            </div>
            <p className="pl-9 font-mono text-xs text-ink-3 tnum">
              {shortAddress(entry.address)}
              {entry.lastDecisionAt ? ` · last call ${timeAgo(entry.lastDecisionAt)}` : ""}
            </p>
          </div>

          {/* Wraps rather than shrinks: a fourth stat (Brier, since edge became the headline)
              pushed this off the right edge at 375px and clipped it silently. */}
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3 sm:gap-x-8">
            <Stat
              label="Edge"
              value={formatEdge(entry.edge)}
              hint={edgeVerdict(entry.edge, entry.edgeLower)}
              prominent
            />
            <Stat
              label="Resolved"
              value={String(entry.resolvedCount)}
              hint={entry.warmingUp ? `${MIN_CALIBRATION_SAMPLE - entry.sampleCount} to go` : "calls scored"}
            />
            <Stat
              label="Right"
              value={entry.hitRate === null ? "—" : `${Math.round(entry.hitRate * 100)}%`}
              hint="of resolved calls"
            />
            <Stat
              label="Brier"
              value={formatBrier(entry.brierScore)}
              hint="accuracy, not profit"
            />
          </div>
        </div>

        <div className="mt-3 pl-9">
          <DecisionTrace ticks={ticks} height={18} />
        </div>
      </Link>
    </li>
  );
}

/**
 * `prominent` marks the stat the ranking actually uses. Edge decides the order, so it reads
 * larger than the ones beside it — a row where every number looks equally important hides
 * which one the list is sorted by.
 */
function Stat({
  label,
  value,
  hint,
  prominent = false,
}: {
  label: string;
  value: string;
  hint: string;
  prominent?: boolean;
}) {
  return (
    <div className="space-y-0.5 text-right">
      <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
      <p
        className={
          prominent
            ? "font-mono text-lg font-medium text-ink tnum"
            : "font-mono text-base text-ink-2 tnum"
        }
      >
        {value}
      </p>
      <p className="max-w-[13ch] text-[11px] leading-tight text-ink-3">{hint}</p>
    </div>
  );
}

/**
 * A real empty state, not a skeleton. If this renders, the worker isn't writing — which
 * is a fact worth stating plainly rather than disguising as loading.
 */
function EmptyLeaderboard() {
  return (
    <div className="border border-rule bg-surface px-6 py-10">
      <h2 className="text-base font-medium text-ink">No traders indexed yet</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
        Nothing has been recorded against this database. The worker
        (<span className="font-mono text-xs">apps/worker</span>) is what discovers traders
        and records their calls — if it isn&apos;t running, or isn&apos;t pointed at this
        database, the Echo Rank is empty rather than stale.
      </p>
    </div>
  );
}
