import Link from "next/link";
import {
  getCalibrationHighlight,
  getLeaderboard,
  getRecentTraces,
  getSiteStats,
  type SiteStats,
} from "@/lib/queries";
import { ReliabilityDiagram } from "@/components/reliability-diagram";
import { LandingNav } from "@/components/site/landing-nav";
import { RedirectWhenConnected } from "@/components/site/landing-connect";
import { TraderTilesScatter } from "@/components/site/trader-tiles";
import { TopTraders } from "@/components/site/top-traders";
import { SiteFooter } from "@/components/site/footer";
import { CannotFolder } from "@/components/site/cannot-folder";
import { LimitsStackedCards } from "@/components/site/limits-stacked-cards";
import { formatBrier } from "@/lib/format";
import { traderName } from "@/lib/trader-names";

/**
 * The landing page, built to `design/references/web3-wgmi.jpeg`.
 *
 * The reference is in two acts. It opens on an off-white ground carrying a dotted grid, with a
 * centred headline framed by scattered squircle tiles, then cuts hard to black about two fifths
 * down and stays there through the card row and the footer. That structure is the design, so
 * it is followed here rather than borrowed from.
 *
 * Two rules survive from the first attempt, because they were the parts worth keeping. No
 * number is written into the copy: everything is queried at request time, so the page cannot
 * drift from the product. And no claim appears that is not checkable somewhere else, so each
 * one names the script, contract or page that proves it.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Echonome · Copy the traders who are right when they say they are",
  description:
    "Copy-trading for DreamDEX Event Contracts on Somnia. Traders ranked on the edge they take over the prices they pay, not on P&L. Your collateral stays in a contract only you can withdraw from.",
  openGraph: {
    title: "Echonome · Copy the traders who are right when they say they are",
    description:
      "Copy-trading for DreamDEX Event Contracts on Somnia. Traders ranked on the edge they take over the prices they pay, not on P&L. Your collateral stays in a contract only you can withdraw from.",
    url: "https://echonome.namite.xyz",
    siteName: "Echonome",
  },
  twitter: {
    card: "summary_large_image",
    title: "Echonome · Copy the traders who are right when they say they are",
    description:
      "Copy-trading for DreamDEX Event Contracts on Somnia. Traders ranked on the edge they take over the prices they pay, not on P&L. Your collateral stays in a contract only you can withdraw from.",
  },
};

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [stats, highlight, traders, traces] = await Promise.all([
    getSiteStats(),
    getCalibrationHighlight(),
    getLeaderboard(),
    getRecentTraces(),
  ]);

  return (
    <>
      {/* A connected wallet belongs in the app, not on the pitch. Renders nothing. */}
      <RedirectWhenConnected />

      {/* ── Act one, light ─────────────────────────────────────────────────────────── */}
      <div className="act-light dotgrid dotgrid-light">
        <LandingNav />
        <Hero traders={traders} traces={traces} />
      </div>

      {/* ── Act two, dark ──────────────────────────────────────────────────────────── */}
      <div className="dotgrid dotgrid-dark bg-plane">
        <TopTraders traders={traders} />
        <ProofStrip stats={stats} />
        <SocialFeed />
        <Calibration highlight={highlight} />
        <Custody />
        <Controls />
        <HowItWorks />
        <SiteFooter />
      </div>
    </>
  );
}

/* ── Act one ──────────────────────────────────────────────────────────────────────── */

function Hero({
  traders,
  traces,
}: {
  traders: Awaited<ReturnType<typeof getLeaderboard>>;
  traces: Awaited<ReturnType<typeof getRecentTraces>>;
}) {
  return (
    <section
      // A minimum height at every width, not just lg. The tiles are absolutely positioned, so
      // they take no space of their own: without this the hero collapses to the height of its
      // text on a phone and the tiles at 58% and 70% land on whatever follows.
      // `overflow-hidden` rather than pulling the tiles inside the edge. Two of them bleed
      // past the hero on purpose — it is what stops the composition reading as a centred
      // box — but a bleed that is allowed to extend the document scrolls the whole page
      // sideways on a phone. Clipping keeps the bleed and drops the 10px of overflow it
      // was causing at 375px.
      className="relative mx-auto min-h-[38rem] w-full max-w-7xl overflow-hidden px-6 pb-24 pt-10 sm:min-h-[36rem] sm:px-10 sm:pb-32 lg:min-h-[38rem] lg:overflow-visible lg:pb-40 lg:pt-16"
    >
      <TraderTilesScatter traders={traders} traces={traces} />

      {/* The reference centres its type in a narrow column and lets the tiles hold the
          outer thirds of the canvas. The max-width here is what keeps the headline from
          running underneath them. */}
      <div className="relative z-10 mx-auto max-w-[17rem] text-center sm:max-w-md lg:max-w-2xl">
        <h1 className="mx-auto text-[clamp(1.6rem,6.2vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.035em] text-ink lg:leading-[0.98]">
          Copy pure edge on prediction markets
        </h1>

        <p className="mx-auto mt-7 max-w-[24rem] text-[13px] leading-[1.65] text-ink-3">
          Copy-trading for DreamDEX Event Contracts. Traders are ranked on edge: how far they
          beat the prices they paid, across hundreds of settled calls. Your collateral sits in
          a contract only you can withdraw from.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/echo-rank"
            className="rounded-full bg-tile-ink px-7 py-3.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
          >
            See the Echo Rank
          </Link>
          <Link
            href="/feed"
            className="rounded-full border border-edge px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white"
          >
            Live trade feed
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Act two ──────────────────────────────────────────────────────────────────────── */

function ProofStrip({ stats }: { stats: SiteStats | null }) {
  // No database reachable. Say that, rather than rendering four zeros. Zeros would claim no
  // trader has ever recorded a decision, which is a statement about the product rather than
  // about the connection, and it would be false.
  if (stats === null) {
    return (
      <Band>
        <p className="text-sm text-ink-3">
          Live figures are unavailable right now. This deployment has no database attached to
          it, so the counts that normally sit here have been left out rather than guessed at.
        </p>
      </Band>
    );
  }

  const items = [
    { value: stats.traders, label: "traders indexed" },
    { value: stats.decisions.toLocaleString("en"), label: "decisions recorded on chain" },
    { value: stats.markets, label: "markets covered" },
    { value: stats.echoesSettled, label: "echoes settled on chain" },
  ];

  return (
    <Band>
      <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <p className="font-mono text-4xl text-accent tabular-nums sm:text-5xl">{item.value}</p>
            <p className="mt-2 text-sm text-ink-3">{item.label}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

/**
 * One section shell for the dark act.
 *
 * The first version of this page gave every section its own `border-t`, which produced a stack
 * of ruled bands the reference does not have anywhere. The dotted ground and the spacing do
 * that job instead, and the rules are gone.
 */
function Band({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
        tone === "warn" ? "text-warning" : "text-ink-3"
      }`}
    >
      {children}
    </p>
  );
}

function Heading({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  return (
    <h2
      className={`mt-5 max-w-3xl text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.03] tracking-[-0.03em] ${
        centered ? "mx-auto text-center" : ""
      }`}
    >
      {children}
    </h2>
  );
}

function SocialFeed() {
  return (
    <Band id="feed">
      <Eyebrow>Live execution network</Eyebrow>
      <Heading>Trade discovery meets instant on-chain execution.</Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Every trade placed by the traders at the top of the Echo Rank broadcasts across the
          network the millisecond it fills on Somnia. Inspect positions in real time, analyze the leader's
          probability curve, and mirror orders before the window closes.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Collective intelligence meets automated execution. Gauge market sentiment with
          on-chain bullish and bearish voting, engage in threaded thesis debate, and track
          sub-second fills on live testnet contracts.
        </p>
      </div>

      <div className="mt-12 rounded-[22px] border border-rule bg-surface p-7 sm:p-10">
        <div className="flex flex-col justify-between gap-4 border-b border-rule pb-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-accent">Protocol execution</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">High-frequency prediction flow</h3>
          </div>
          <Link
            href="/feed"
            className="inline-flex items-center justify-center rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-plane transition-opacity hover:opacity-90"
          >
            Open the live feed
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-rule/60 bg-surface-raised p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent">Fill stream</p>
            <p className="mt-2 text-base font-medium text-ink">Sub-second indexing</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              Direct ingestion from Somnia Event Contracts, mapped to each trader's verified edge curve.
            </p>
          </div>
          <div className="rounded-xl border border-rule/60 bg-surface-raised p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent">Consensus</p>
            <p className="mt-2 text-base font-medium text-ink">Directional sentiment</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              Gauge community conviction on active markets before cadence windows settle.
            </p>
          </div>
          <div className="rounded-xl border border-rule/60 bg-surface-raised p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-accent">Autonomous mirrors</p>
            <p className="mt-2 text-base font-medium text-ink">Deterministic lot sizing</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              Follower orders scale to your allocation and execute directly on chain with verifiable receipts.
            </p>
          </div>
        </div>
      </div>
    </Band>
  );
}

function Calibration({
  highlight,
}: {
  highlight: Awaited<ReturnType<typeof getCalibrationHighlight>>;
}) {
  return (
    <Band id="calibration">
      <Eyebrow>The alpha metric</Eyebrow>
      <Heading>PnL leaderboards are broken. We engineered the fix.</Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Conventional copy-trading platforms reward gamblers on short-term lucky streaks that
          inevitably blow up. Echonome ranks by statistical edge: the mathematical difference
          between market prices and real-world outcomes. A forecaster only climbs if their
          probability assessments systematically beat closing prices across verified sample sizes.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          The leaderboard sorts on the conservative lower bound of a 95 percent confidence
          interval. Temporary variance is discounted; true mathematical edge dominates.
          Traders below twenty resolved decisions are categorized as warming up.
        </p>
      </div>

      {highlight && <HighlightPanel highlight={highlight} />}
    </Band>
  );
}

/**
 * Where a Brier score sits relative to a coin flip, in words.
 *
 * 0.25 is what calling every market 50/50 scores, and lower is better. This exists because the
 * sentence it replaces read "sits near a coin flip" as fixed copy, which was true of the trader
 * on screen the day it was written and became false the moment the highlight selected a trader
 * scoring 0.54. That is not near a coin flip, it is twice as bad as one. The same class of
 * mistake as the selection bug below: a conclusion written into the copy rather than derived
 * from the number next to it.
 */
function brierSentence(brier: number | null): string {
  if (brier === null) return "It has no score yet";
  if (brier <= 0.2) return "That is meaningfully better than calling every market a coin flip";
  if (brier <= 0.3) return "That is close to what calling every market a coin flip would score";
  return "That is worse than calling every market a coin flip";
}

/**
 * One of our own seed traders, on the front page.
 *
 * Every sentence is generated from live buckets, including the verdict. It was written the
 * other way round first, asserting the trader was wrong and quoting numbers to match, and the
 * live data promptly selected a well-calibrated trader and rendered the claim as a lie.
 */
function HighlightPanel({
  highlight,
}: {
  highlight: NonNullable<Awaited<ReturnType<typeof getCalibrationHighlight>>>;
}) {
  const { worst } = highlight;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const overconfident = worst.deviation < 0;

  return (
    <div className="mt-14 overflow-hidden rounded-[22px] border border-rule bg-surface">
      <div className="grid gap-10 p-7 lg:grid-cols-[1.1fr_1fr] lg:p-12">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What a single score hides.
          </h3>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-2">
            <span className="text-ink">{traderName(highlight.label)}</span> scores{" "}
            <span className="font-mono tabular-nums text-ink">{formatBrier(highlight.brier)}</span>{" "}
            across{" "}
            <span className="font-mono tabular-nums text-ink">
              {highlight.sampleCount.toLocaleString("en")}
            </span>{" "}
            resolved calls. {brierSentence(highlight.brier)}, and on its own it tells you almost
            nothing about how to use this trader.
          </p>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-2">
            Split by confidence band, one figure stands out. On the calls it rated{" "}
            <span className="font-mono tabular-nums text-ink">{pct(worst.claimed)}</span>, it was
            right <span className="font-mono tabular-nums text-ink">{pct(worst.observed)}</span>{" "}
            of the time. There are{" "}
            <span className="font-mono tabular-nums text-ink">{worst.sampleCount}</span> of them,
            so that is not a rounding artefact.{" "}
            {overconfident
              ? "Confidence in that band is worth reading upside down."
              : "It is markedly more right in that band than it claims to be."}
          </p>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-2">
            We show you this because the single number that hid it is the number every other
            ranking puts on its front page.
          </p>

          <Link
            href={`/traders/${highlight.id}`}
            className="mt-8 inline-block rounded-full border border-edge px-5 py-2.5 text-sm font-medium transition-colors hover:bg-surface-raised"
          >
            Read the full record
          </Link>
        </div>

        <div className="min-w-0">
          <ReliabilityDiagram buckets={highlight.buckets} />
        </div>
      </div>
    </div>
  );
}

function Custody() {
  return (
    <Band id="custody">
      <Eyebrow>Custody</Eyebrow>
      <Heading>We hold a key that cannot spend.</Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Before you copy anyone, you deploy a small contract called an EchoAccount. You own it,
          you fund it, and you are the only address that can take anything out of it. We never
          hold your money, so there is no moment where you have to trust that we will give it
          back.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Echonome gets a second key on that contract, and it does two things: place an order,
          and cancel an order. None of what follows is a promise we are asking you to take on
          faith. Every line is an assertion in a script that runs against the live chain and
          fails loudly the moment it stops being true.
        </p>
      </div>

      <CannotFolder />
    </Band>
  );
}

function Controls() {
  return (
    <Band id="controls">
      <div className="text-center max-w-3xl mx-auto">
        <Eyebrow>Your limits</Eyebrow>
        <Heading centered>The controls are the product.</Heading>

        <p className="mt-6 max-w-prose mx-auto text-base leading-relaxed text-ink-2">
          These are not settings buried behind an advanced tab. They are the terms you set before
          anything is copied, they are enforced by the contract rather than by our server, and a
          trade that would break one of them fails on chain instead of asking us nicely.
        </p>
      </div>

      <div className="mt-12 flex justify-center w-full">
        <LimitsStackedCards />
      </div>
    </Band>
  );
}

const STEPS = [
  {
    title: "Deploy your account",
    body: "We display your exact contract address before you pay to create it. Computed via CREATE2 from your wallet, a retried transaction cannot accidentally spawn a second account.",
  },
  {
    title: "Fund and set limits",
    body: "Deposit testnet collateral and specify your per-order cap, lifetime budget, and key expiry date. Your constraints are enforced by the contract, not by our servers.",
  },
  {
    title: "Select a leader",
    body: "Browse the Echo Rank or discover active traders on the live feed. Choose your copy size fraction. Traders under twenty resolved calls remain labelled as warming up.",
  },
  {
    title: "Track echoes in real time",
    body: "Orders execute automatically into the approved series. Every outcome displays as a sentence with transaction receipts and explicit failure reasons if a trade is declined.",
  },
];

function HowItWorks() {
  return (
    <Band id="how">
      <Eyebrow>How it works</Eyebrow>
      <Heading>Two signatures, then nothing further is asked of you.</Heading>

      <ol className="mt-12 grid gap-10 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-edge pt-6">
            <p className="font-mono text-[11px] tabular-nums tracking-[0.2em] text-accent">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </Band>
  );
}

