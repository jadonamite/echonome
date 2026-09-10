import Link from "next/link";
import type { LeaderboardEntry, TraceTick } from "@/lib/queries";

/**
 * The five squircles scattered around the hero headline.
 *
 * In `design/references/web3-wgmi.jpeg` these hold 3D character art. Here they hold live
 * traders, which is a deliberate substitution and the only place this page departs from the
 * reference: the art in the original is the product, and in ours the product is the record.
 * A tile is a real wallet with its real recent calls, and clicking one opens that trader.
 *
 * Placement is measured off the reference rather than invented. Its five tiles sit at roughly
 * 8%, 13%, 15%, 10% and 20% of the canvas width, asymmetrically, two left and two right with
 * the largest low on the right, framing the centred type without touching it. Those ratios are
 * reproduced below against the hero box.
 *
 * Absolute positioning only from `lg`. Below that the tiles become a scrolling row under the
 * call to action, because five floating squares around a headline on a phone is a headline
 * nobody can read.
 */

type Tone = "ink" | "bone" | "indigo" | "chartreuse";

interface Placement {
  /** Percentages of the hero box, taken from the reference. */
  top: string;
  left?: string;
  right?: string;
  /** Edge length. Clamped so the tiles keep their relative sizes as the viewport moves. */
  size: string;
  tone: Tone;
  rotate: string;
}

const PLACEMENTS: Placement[] = [
  { top: "6%", left: "19%", size: "clamp(96px, 8.2vw, 124px)", tone: "ink", rotate: "-4deg" },
  { top: "30%", left: "3.5%", size: "clamp(132px, 13vw, 196px)", tone: "ink", rotate: "3deg" },
  { top: "66%", left: "15%", size: "clamp(140px, 15vw, 224px)", tone: "bone", rotate: "-2deg" },
  { top: "11%", right: "6%", size: "clamp(110px, 10vw, 152px)", tone: "indigo", rotate: "5deg" },
  { top: "50%", right: "1.5%", size: "clamp(168px, 19.5vw, 292px)", tone: "chartreuse", rotate: "-3deg" },
];

/**
 * Tone carries its own foreground. The trace inside a tile cannot use the app's --good and
 * --critical, because those are tuned for one dark surface and this component renders on four
 * different grounds including chartreuse. Right and wrong are drawn instead as opaque and
 * ghosted foreground, which survives every ground and keeps colour from being the only
 * channel: each tick still carries its own title.
 */
const TONES: Record<Tone, { className: string; fg: string; muted: string }> = {
  ink: { className: "bg-tile-ink text-white", fg: "#ffffff", muted: "rgba(255,255,255,0.3)" },
  bone: { className: "bg-tile-bone text-tile-ink", fg: "#0a0a0a", muted: "rgba(10,10,10,0.24)" },
  indigo: { className: "bg-tile-gradient text-white", fg: "#ffffff", muted: "rgba(255,255,255,0.34)" },
  chartreuse: { className: "bg-tile-chartreuse text-tile-ink", fg: "#0a0a0a", muted: "rgba(10,10,10,0.26)" },
};

function TileTrace({ ticks, fg, muted }: { ticks: TraceTick[]; fg: string; muted: string }) {
  const shown = ticks.slice(-28);
  if (shown.length === 0) return null;

  const w = 3;
  const gap = 2;
  const width = shown.length * (w + gap) - gap;

  return (
    <svg
      viewBox={`0 0 ${width} 16`}
      width="100%"
      height="16"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${shown.length} recent calls, oldest to newest`}
      className="block"
    >
      {shown.map((tick, i) => {
        const right = tick.wasRight === true;
        const open = tick.wasRight === null;
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={open ? 6 : right ? 0 : 8}
            width={w}
            height={open ? 4 : 8}
            rx={1}
            fill={right ? fg : muted}
          >
            <title>{open ? "Still open" : right ? "Right" : "Wrong"}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function edgeLabel(entry: LeaderboardEntry): string {
  if (entry.edge === null) return "Warming up";
  const cents = entry.edge * 100;
  return `${cents >= 0 ? "+" : ""}${cents.toFixed(1)}c per $1`;
}

function Tile({
  entry,
  ticks,
  tone,
  compact,
}: {
  entry: LeaderboardEntry;
  ticks: TraceTick[];
  tone: Tone;
  compact: boolean;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={`/traders/${entry.id}`}
      className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-tile p-4 ${t.className}`}
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] opacity-65">
          {entry.isSeed ? "Seed" : "Trader"}
        </p>
        <p className="mt-1 truncate text-[13px] font-semibold leading-tight sm:text-sm">
          {entry.label.replace(/\s*\(seed\)$/i, "")}
        </p>
      </div>

      <div className="mt-3">
        {!compact && (
          <p className="mb-2 font-mono text-[11px] tabular-nums opacity-80">{edgeLabel(entry)}</p>
        )}
        <TileTrace ticks={ticks} fg={t.fg} muted={t.muted} />
      </div>
    </Link>
  );
}

/**
 * Split into two exports on purpose, because the two layouts belong in different places in the
 * hero's markup.
 *
 * The scatter is absolutely positioned and can be rendered anywhere inside the hero. The row
 * is in normal flow, and when both lived in one component rendered above the headline, the row
 * appeared ABOVE it on mobile — so a phone opened the page on a strip of half-cut cards
 * instead of the sentence the page is about. Its own comment always said "under the call to
 * action"; now the markup can actually put it there.
 */
export function TraderTilesScatter({
  traders,
  traces,
}: {
  traders: LeaderboardEntry[];
  traces: Map<string, TraceTick[]>;
}) {
  const tiles = traders.slice(0, PLACEMENTS.length);
  if (tiles.length === 0) return null;

  return (
    <>
      {/* Desktop: scattered, exactly as the reference places them. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden={false}>
        {tiles.map((entry, i) => {
          const place = PLACEMENTS[i];
          return (
            // `rounded-tile` here casts the shadow, not the card. The radius lives on the
            // <Link> inside, so without it this wrapper is a square box throwing a
            // square-cornered shadow behind a rounded tile — its corners read as a hard
            // underlay poking out past the curve, most obviously against the dotted ground.
            <div
              key={entry.id}
              className="pointer-events-auto absolute rounded-tile transition-transform duration-300 hover:!rotate-0"
              style={{
                top: place.top,
                left: place.left,
                right: place.right,
                width: place.size,
                height: place.size,
                transform: `rotate(${place.rotate})`,
                boxShadow: "0 22px 48px -16px rgba(0,0,0,0.32)",
              }}
            >
              <Tile
                entry={entry}
                ticks={traces.get(entry.id) ?? []}
                tone={place.tone}
                compact={i === 0}
              />
            </div>
          );
        })}
      </div>

    </>
  );
}

/**
 * Below lg: a scrolling row, rendered under the call to action.
 *
 * `snap-x snap-mandatory` with `snap-start` on each tile so a swipe settles on a whole card
 * rather than leaving one sliced down the middle — a half-tile at the edge reads as broken
 * layout, where a cleanly-aligned one reads as a gallery you can push. The negative margin
 * with matching padding lets the row bleed to both screen edges while its first and last
 * tiles still align with the page's text column.
 */
export function TraderTilesRow({
  traders,
  traces,
}: {
  traders: LeaderboardEntry[];
  traces: Map<string, TraceTick[]>;
}) {
  const tiles = traders.slice(0, PLACEMENTS.length);
  if (tiles.length === 0) return null;

  return (
    <div className="-mx-6 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 sm:-mx-10 sm:px-10 lg:hidden">
      {tiles.map((entry, i) => (
        <div
          key={entry.id}
          className="h-44 w-44 shrink-0 snap-start rounded-tile"
          style={{ boxShadow: "0 18px 34px -18px rgba(0,0,0,0.3)" }}
        >
          <Tile
            entry={entry}
            ticks={traces.get(entry.id) ?? []}
            tone={PLACEMENTS[i].tone}
            compact={false}
          />
        </div>
      ))}
    </div>
  );
}
