import Link from "next/link";
import type { LeaderboardEntry, TraceTick } from "@/lib/queries";
import { traderName } from "@/lib/trader-names";
import { EdgeSpark } from "./edge-spark";
import { TraderAvatar } from "./trader-avatar";

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
 * Tone carries its own foreground. A tile's line cannot use the app's --good and --critical,
 * because those are tuned for one dark surface and this component renders on four different
 * grounds including chartreuse. Each tone names the ink its own contents draw in.
 */
const TONES: Record<Tone, { className: string; fg: string; muted: string }> = {
  ink: { className: "bg-tile-ink text-white", fg: "#ffffff", muted: "rgba(255,255,255,0.3)" },
  bone: { className: "bg-tile-bone text-tile-ink", fg: "#0a0a0a", muted: "rgba(10,10,10,0.24)" },
  indigo: { className: "bg-tile-gradient text-white", fg: "#ffffff", muted: "rgba(255,255,255,0.34)" },
  chartreuse: {
    className: "bg-tile-chartreuse text-tile-ink",
    fg: "#0a0a0a",
    muted: "rgba(10,10,10,0.26)",
  },
};

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
      <div className="flex min-w-0 items-start gap-2.5">
        <TraderAvatar address={entry.address} name={traderName(entry.label)} size={30} />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] opacity-65">
            {entry.isSeed ? "Seed" : "Trader"}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight sm:text-sm">
            {traderName(entry.label)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        {!compact && (
          <p className="mb-2 font-mono text-[11px] tabular-nums opacity-80">{edgeLabel(entry)}</p>
        )}
        <EdgeSpark ticks={ticks} fg={t.fg} muted={t.muted} />
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
 * Below lg: cards that fit the screen instead of a strip that runs off it.
 *
 * This was a horizontal scroller of fixed 176px squares. Two problems, both visible on a phone.
 * The row was clipped mid-card at the right edge, which reads as broken layout rather than as
 * something you can push. And a square that small has to stack a label, a figure and a chart
 * vertically, so the chart got about thirty pixels of height and became a squiggle.
 *
 * Wide rows instead, one per line, laid out horizontally: mark and name on the left, the figure
 * beside it, the curve taking the rest of the width. The same information in the space it
 * actually wants — a line needs width far more than it needs height. Nothing is clipped and
 * nothing scrolls sideways.
 *
 * From `sm` to `lg` — tablets — two across, because at that width one row per trader leaves
 * half the line empty.
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
    <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:hidden">
      {tiles.map((entry, i) => (
        <WideTile
          key={entry.id}
          entry={entry}
          ticks={traces.get(entry.id) ?? []}
          tone={PLACEMENTS[i].tone}
        />
      ))}
    </div>
  );
}

/**
 * The horizontal form of a tile.
 *
 * `min-w-0` on the middle column and `truncate` on the name are what stop a long name pushing
 * the curve off the card — without it the grid column takes the name's intrinsic width and the
 * chart is squeezed to nothing. The curve gets a fixed share of the row rather than whatever is
 * left over, so every card's chart is the same size regardless of how long its trader's name is.
 */
function WideTile({
  entry,
  ticks,
  tone,
}: {
  entry: LeaderboardEntry;
  ticks: TraceTick[];
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={`/traders/${entry.id}`}
      className={`flex items-center gap-3 overflow-hidden rounded-3xl p-4 ${t.className}`}
      style={{ boxShadow: "0 14px 30px -18px rgba(0,0,0,0.35)" }}
    >
      <TraderAvatar address={entry.address} name={traderName(entry.label)} size={40} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{traderName(entry.label)}</p>
        <p className="mt-1 font-mono text-[11px] tabular-nums opacity-80">{edgeLabel(entry)}</p>
      </div>

      {/* Fixed width, so the chart is the same size on every card. */}
      <div className="w-[86px] shrink-0 sm:w-[72px]">
        <EdgeSpark ticks={ticks} fg={t.fg} muted={t.muted} height={30} />
      </div>
    </Link>
  );
}
