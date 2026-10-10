import Link from "next/link";
import { getTonight } from "@/lib/stocks";
import { PageHead, Eyebrow, pct, signedPct, usd } from "@/components/stocks/ui";

export const revalidate = 300;
export const preferredRegion = "fra1";
export const metadata = { title: "Tonight" };

const fmtTime = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(ms);

export default async function TonightPage() {
  const t = await getTonight();
  const shown = ["night-tape", "depth-aware", "yesterday-again", "coin-flip"];
  return (
    <>
      <PageHead eyebrow={`Calls for ${t.target.day}`} title={t.target.locked ? "Calls are locked for this open" : "Tonight's calls, still moving"}>
        <p>
          The question for each stock: will it trade above the {t.prevDay} close at 10:00 New York time on {t.target.day}? Calls lock at{" "}
          {fmtTime(t.target.lockAt)} and settle at {fmtTime(t.target.settleAt)}. Until the lock, they follow the live bStock price.
        </p>
      </PageHead>

      {t.status ? (
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          US market {t.status.openState ? "open" : "closed"}
          {t.status.reasonMsg ? ` · ${t.status.reasonMsg}` : ""}
          {t.status.nextOpenTime ? ` · next session ${fmtTime(t.status.nextOpenTime)}` : ""}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-rule">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
            <tr>
              <th className="px-4 py-3 text-left">Stock</th>
              <th className="px-4 py-3 text-right">Close</th>
              <th className="px-4 py-3 text-right">bStock now</th>
              <th className="px-4 py-3 text-right">Tape</th>
              {shown.map((id) => (
                <th key={id} className="px-4 py-3 text-right">{t.rows[0]?.calls.find((c) => c.agentId === id)?.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.ticker} className="border-t border-rule">
                <td className="px-4 py-3">
                  <Link href={`/desk/${r.ticker}`} className="inline-flex min-h-[28px] items-center font-medium text-ink hover:text-accent">{r.ticker}</Link>
                  <span className="ml-2 font-mono text-xs text-ink-3">{r.symbol}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-ink-2">{usd(r.refClose, 2)}</td>
                <td className="px-4 py-3 text-right font-mono text-accent">{usd(r.live, 2)}</td>
                <td className={`px-4 py-3 text-right font-mono ${r.tape == null ? "text-ink-3" : r.tape > 0 ? "text-good" : "text-critical"}`}>{signedPct(r.tape)}</td>
                {shown.map((id) => {
                  const p = r.calls.find((c) => c.agentId === id)?.p;
                  return <td key={id} className="px-4 py-3 text-right font-mono text-ink-2">{p == null ? "–" : `up ${pct(p, 0)}`}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 max-w-prose space-y-2 text-sm leading-relaxed text-ink-3">
        <Eyebrow>Reading this</Eyebrow>
        <p>
          Close is the Ondo per-share reference at 16:00 New York time. bStock now is the live on-chain price per share. Tape is the gap
          between them: what overnight traders on BNB Chain think has happened since the close.
        </p>
      </div>
    </>
  );
}
