import type { Side } from "@/lib/queries";

/**
 * A trader's recent calls as a strip of ticks, oldest to newest — right, wrong, or still
 * open. It is a real encoding of real rows, not decoration: the same decisions appear in
 * full in the table on the trader's profile, which is the accessible view of this mark.
 *
 * Colour never carries the meaning alone. Every tick has a `<title>` a screen reader and
 * a hover both reach, and the legend below names each state in words.
 */

const STATE = {
  right: { fill: "var(--good)", label: "Right" },
  wrong: { fill: "var(--critical)", label: "Wrong" },
  open: { fill: "var(--edge)", label: "Still open" },
} as const;

/**
 * Only the fields this component actually draws with.
 *
 * Narrower than TraceTick on purpose: the strip colours each call by whether it landed, and
 * has no use for what was paid. Taking the full type would force every caller building ticks
 * by hand — the Echo Rank row, the profile — to carry a price they never read.
 */
export interface TraceMark {
  side: Side;
  settledOutcome: Side | null;
  wasRight: boolean | null;
}

function stateOf(tick: TraceMark): keyof typeof STATE {
  if (tick.wasRight === null) return "open";
  return tick.wasRight ? "right" : "wrong";
}

export function DecisionTrace({ ticks, height = 22 }: { ticks: TraceMark[]; height?: number }) {
  if (ticks.length === 0) {
    return <p className="text-xs text-ink-3">No calls recorded yet.</p>;
  }

  const tickWidth = 3;
  const gap = 2;
  const width = ticks.length * (tickWidth + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${ticks.length} recent calls, oldest to newest`}
      className="block"
    >
      {ticks.map((tick, i) => {
        const state = STATE[stateOf(tick)];
        return (
          <rect
            key={i}
            x={i * (tickWidth + gap)}
            y={0}
            width={tickWidth}
            height={height}
            rx={1.5}
            fill={state.fill}
          >
            <title>{`${tick.side === "up" ? "Up" : "Down"} — ${state.label}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function DecisionTraceLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-4">
      {(Object.keys(STATE) as (keyof typeof STATE)[]).map((key) => (
        <li key={key} className="flex items-center gap-2 text-xs text-ink-3">
          <span
            aria-hidden
            className="inline-block h-3 w-[3px] rounded-sm"
            style={{ background: STATE[key].fill }}
          />
          {STATE[key].label}
        </li>
      ))}
    </ul>
  );
}
