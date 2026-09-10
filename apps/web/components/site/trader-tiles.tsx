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

/**
 * Sizes are `vw` with a floor, and the floor is the compromise.
 *
 * The reference's proportions are the `vw` figures — 8.2% of the canvas for the smallest tile
 * up to 19.5% for the largest — and holding those exactly would put the smallest at 31px on a
 * 375px screen, which is smaller than the avatar inside it. The floors keep every tile large
 * enough to read while staying as close to the reference's relative sizes as legibility
 * allows, so a phone shows the same composition rather than a different layout.
 */
const PLACEMENTS: Placement[] = [
  { top: "4%", left: "2%", size: "clamp(62px, 8.2vw, 124px)", tone: "ink", rotate: "-4deg" },
  { top: "26%", left: "-1%", size: "clamp(76px, 13vw, 196px)", tone: "ink", rotate: "3deg" },
  { top: "70%", left: "3%", size: "clamp(80px, 15vw, 224px)", tone: "bone", rotate: "-2deg" },
  { top: "8%", right: "1%", size: "clamp(68px, 10vw, 152px)", tone: "indigo", rotate: "5deg" },
  { top: "58%", right: "-2%", size: "clamp(92px, 19.5vw, 292px)", tone: "chartreuse", rotate: "-3deg" },
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
      className={`flex h-full w-full flex-col justify-between overflow-hidden rounded-tile p-2.5 lg:p-4 ${t.className}`}
    >
      {/*
        The name and the figure are `lg` only, and that is what makes the scatter survive a
        phone. Below `lg` a tile is between 62 and 92 pixels across: a name would be two
        truncated characters and the figure would crowd out the curve. The face and the line
        are the two things that still say something at that size — who, and how they are doing.
      */}
      <div className="flex min-w-0 items-start gap-2.5">
        <TraderAvatar address={entry.address} name={traderName(entry.label)} size={26} />
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.14em] opacity-65">
            {entry.isSeed ? "Seed" : "Trader"}
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight sm:text-sm">
            {traderName(entry.label)}
          </p>
        </div>
      </div>

      <div className="mt-2 lg:mt-3">
        {!compact && (
          <p className="mb-2 hidden font-mono text-[11px] tabular-nums opacity-80 lg:block">
            {edgeLabel(entry)}
          </p>
        )}
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
