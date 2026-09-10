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
 * Scattered at every width. An earlier version dropped to a list below `lg` on the grounds that
 * five floating squares around a headline on a phone is a headline nobody can read; the answer
 * was to shrink the squares and thin their contents rather than to change the layout, so a
 * phone now shows the same composition the desktop does.
 */

type Tone = "ink" | "bone" | "indigo" | "chartreuse";

/**
 * Only the tone lives here now. Position, size and rotation moved to `.hero-tile-N` in
 * globals.css, because they differ per breakpoint and inline styles cannot carry a media
 * query. The order of this array is the order of those classes.
 */
interface Placement {
  tone: Tone;
}

const PLACEMENTS: Placement[] = [
  { tone: "ink" },
  { tone: "ink" },
  { tone: "bone" },
  { tone: "indigo" },
  { tone: "chartreuse" },
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
}: {
  entry: LeaderboardEntry;
  ticks: TraceTick[];
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={`/traders/${entry.id}`}
      className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-tile p-2.5 md:p-3 lg:p-4 ${t.className}`}
    >
      {/*
        The name and the figure appear from `md`, where a tile is at least 104px and has room
        for them. Below that it is between 62 and 92 pixels across: a name would be two
        truncated characters and the figure would crowd out the curve, so the face and the line
        carry it — who, and how they are doing.
      */}
      <div className="flex min-w-0 items-start gap-2.5">
        <TraderAvatar address={entry.address} name={traderName(entry.label)} size={26} />
        <div className="hidden min-w-0 md:block">
          <p className="truncate text-[9px] font-medium uppercase tracking-[0.14em] opacity-65 lg:text-[11px]">
            {entry.isSeed ? "Seed" : "Trader"}
          </p>
          <p className="mt-0.5 truncate text-[12px] font-semibold leading-tight lg:text-sm">
            {traderName(entry.label)}
          </p>
        </div>
      </div>

      <div className="mt-2 lg:mt-3">
                  <p className="mb-1.5 hidden font-mono text-[10px] tabular-nums opacity-80 md:block lg:mb-2 lg:text-[11px]">
            {edgeLabel(entry)}
          </p>
        <EdgeSpark ticks={ticks} fg={t.fg} muted={t.muted} height={22} />
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
      {/* Scattered at every width, exactly as the reference places them. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden={false}>
        {tiles.map((entry, i) => {
          const place = PLACEMENTS[i];
          return (
            // `rounded-tile` here casts the shadow, not the card. The radius lives on the
            // <Link> inside, so without it this wrapper is a square box throwing a
            // square-cornered shadow behind a rounded tile — its corners read as a hard
            // underlay poking out past the curve, most obviously against the dotted ground.
            // `.hero-tile` carries the radius so the SHADOW is rounded too. The radius on the
            // <Link> alone leaves this wrapper square, and a square-cornered shadow behind a
            // rounded tile reads as a hard underlay poking past the curve.
            <div key={entry.id} className={`hero-tile hero-tile-${i + 1}`}>
              <Tile entry={entry} ticks={traces.get(entry.id) ?? []} tone={place.tone} />
            </div>
          );
        })}
      </div>

    </>
  );
}
