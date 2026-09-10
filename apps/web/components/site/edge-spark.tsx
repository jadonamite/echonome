import type { TraceTick } from "@/lib/queries";

/**
 * Cumulative edge over a trader's recent settled calls, as a line.
 *
 * Each settled call contributes `(outcome − price paid)`: buy Up at 40c and be right and you
 * are 60c ahead on that unit; be wrong and you are 40c down. Summed in order, that is running
 * profit per unit staked — the same quantity the Echo Rank sorts on, drawn rather than
 * summarised.
 *
 * This replaces a strip of red and green ticks. The ticks said whether each call landed but
 * not what it was worth: twenty wins at 95c and one loss at 5c is a strip that looks superb
 * and a line that slopes down, and the line is the one telling the truth about the money.
 *
 * Unsettled calls are skipped rather than drawn flat. A pending call has no outcome yet, so it
 * contributes nothing — and a flat segment would read as a call that broke even, which is a
 * different claim.
 *
 * Rendered as a server component from data the page already has, so it costs no extra query
 * and no client JavaScript. It moves when the page refreshes, which is every 60 seconds on
 * the pages that carry a LiveRefresh.
 */
export function EdgeSpark({
  ticks,
  fg,
  muted,
  height = 34,
}: {
  ticks: TraceTick[];
  /** Ink for the line. Tiles render on four different grounds, so the caller decides. */
  fg: string;
  /** The zero line, and the fill under the curve. */
  muted: string;
  height?: number;
}) {
  const settled = ticks.filter((t) => t.wasRight !== null);

  // One point is a dot, not a line. Below two settled calls there is no shape to draw and a
  // straight segment would imply a trend that a single call cannot support.
  if (settled.length < 2) return null;

  let running = 0;
  const series = settled.map((t) => {
    running += (t.wasRight ? 1 : 0) - t.pricePaid;
    return running;
  });

  const W = 100;
  const H = height;
  const lo = Math.min(0, ...series);
  const hi = Math.max(0, ...series);
  // A flat series would divide by zero; a floor also stops a trader whose edge has barely
  // moved from being drawn as a dramatic mountain range against their own tiny range.
  const span = Math.max(hi - lo, 0.5);

  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * H;

  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const zeroY = y(0);
  const final = series[series.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Cumulative edge over ${settled.length} settled calls, ending ${
        final >= 0 ? "up" : "down"
      } ${Math.abs(final * 100).toFixed(0)} cents per dollar staked`}
      className="block overflow-visible"
    >
      {/* Break-even. Without it a line that only ever falls still looks like a climb, because
          the eye reads the bottom of the box as zero. */}
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke={muted} strokeWidth="1" strokeDasharray="2 3" />

      <path d={area} fill={fg} opacity="0.12" />
      <path
        d={line}
        fill="none"
        stroke={fg}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Where they stand now. */}
      <circle cx={W} cy={y(final)} r="2.5" fill={fg} />
    </svg>
  );
}
