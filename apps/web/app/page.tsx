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
import { TraderTilesRow, TraderTilesScatter } from "@/components/site/trader-tiles";
import { TopTraders } from "@/components/site/top-traders";
import { SiteFooter } from "@/components/site/footer";
import { formatBrier } from "@/lib/format";

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
      {/* ── Act one, light ─────────────────────────────────────────────────────────── */}
      <div className="act-light dotgrid dotgrid-light">
        <LandingNav />
        <Hero traders={traders} traces={traces} />
      </div>

      {/* ── Act two, dark ──────────────────────────────────────────────────────────── */}
      <div className="dotgrid dotgrid-dark bg-plane">
        <TopTraders traders={traders} />
        <ProofStrip stats={stats} />
        <Calibration highlight={highlight} />
        <Custody />
        <Controls />
        <HowItWorks />
        <SeedTraders />
        <Risk />
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
      className="relative mx-auto w-full max-w-7xl px-6 pb-24 pt-10 sm:px-10 sm:pb-32 lg:min-h-[38rem] lg:pb-40 lg:pt-16"
    >
      <TraderTilesScatter traders={traders} traces={traces} />

      {/* The reference centres its type in a narrow column and lets the tiles hold the
          outer thirds of the canvas. The max-width here is what keeps the headline from
          running underneath them. */}
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h1 className="mx-auto text-[clamp(2.25rem,6.2vw,4.5rem)] font-bold leading-[0.98] tracking-[-0.035em] text-ink">
          Copy the traders who are right when they say they are
        </h1>

        <p className="mx-auto mt-7 max-w-[21rem] text-[13px] leading-[1.65] text-ink-3">
          Ranked by calibration, never by profit. Follow one and your own on-chain account
          places the trade, at the size you set. We hold a key that cannot withdraw, and a
          script in the repository proves it against the live chain.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/leaderboard"
            className="rounded-full bg-tile-ink px-7 py-3.5 text-sm font-medium text-white transition-opacity hover:opacity-85"
          >
            See the leaderboard
          </Link>
          <a
            href="#custody"
            className="rounded-full border border-edge px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white"
          >
            How custody works
          </a>
        </div>
      </div>

      {/* Below lg only. Deliberately after the call to action: the headline is what the page
          is about, and a phone should open on it rather than on a strip of tiles. */}
      <TraderTilesRow traders={traders} traces={traces} />
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

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 max-w-3xl text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.03] tracking-[-0.03em]">
      {children}
    </h2>
  );
}

function Calibration({
  highlight,
}: {
  highlight: Awaited<ReturnType<typeof getCalibrationHighlight>>;
}) {
  return (
    <Band id="calibration">
      <Eyebrow>Why calibration</Eyebrow>
      <Heading>
        A trader who is right 60 percent of the time is worth more than one who got lucky last
        week.
      </Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Profit and loss rewards whoever was recently lucky. Calibration asks a harder
          question. When this trader says a market is 70 percent likely to go up, does it go up
          70 percent of the time? That needs a sample rather than a story, it is checkable by
          anyone reading the same public record we read, and no amount of conviction moves it.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Ranking is by edge, the mean of outcome minus price paid, which in a binary market is
          exactly expected profit per unit staked. Nobody appears ranked until twenty of their
          decisions have resolved. Below that they are shown warming up, with the count visible,
          rather than hidden until the number flatters them.
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
            <span className="font-mono text-ink">{highlight.label}</span> scores{" "}
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
            leaderboard puts on its front page.
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

/**
 * Every line in CANNOT is an assertion in `packages/contracts/scripts/verifyCustody.ts`, which
 * runs against Somnia Shannon and fails loudly if any one of them stops being true. Nothing
 * goes in this list that the script does not test.
 */
const CANNOT = [
  "Withdraw your collateral",
  "Withdraw your outcome tokens",
  "Raise the caps you set",
  "Extend its own expiry",
  "Add a market you did not allow",
  "Act after you pause the account",
  "Act after the expiry date passes",
  "Act after you revoke the key",
];

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

      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CANNOT.map((item) => (
          <li key={item} className="rounded-2xl border border-rule bg-surface px-5 py-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Cannot</p>
            <p className="mt-3 text-base leading-snug text-ink">{item}</p>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-3">
        <code className="rounded-lg bg-surface px-3 py-2 font-mono text-ink-2">
          npm run verify:custody -w @echonome/contracts
        </code>
        <span>Read-only. Runs against Shannon. Takes about a minute.</span>
      </div>
    </Band>
  );
}

const CONTROLS = [
  {
    name: "Per-order cap",
    body: "The most a single echo can ever commit, whatever the trader you follow decides to do.",
  },
  {
    name: "Lifetime budget",
    body: "The most the account will commit in total, across every echo it ever places.",
  },
  {
    name: "Expiry",
    body: "The date our key stops working. It runs out on its own, whether or not you remember to revoke it.",
  },
  {
    name: "Pause",
    body: "One switch. Effective on the next block, and it needs nothing from us to take hold.",
  },
  {
    name: "Market allowlist",
    body: "Echoes only reach the pools you have permitted. Everything else reverts.",
  },
  {
    name: "Revoke",
    body: "Removes our key entirely. Your funds do not move, because they were never ours to move.",
  },
];

function Controls() {
  return (
    <Band id="controls">
      <Eyebrow>Your limits</Eyebrow>
      <Heading>The controls are the product.</Heading>

      <p className="mt-8 max-w-prose text-base leading-relaxed text-ink-2">
        These are not settings buried behind an advanced tab. They are the terms you set before
        anything is copied, they are enforced by the contract rather than by our server, and a
        trade that would break one of them fails on chain instead of asking us nicely.
      </p>

      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONTROLS.map((control) => (
          <div key={control.name} className="rounded-2xl border border-rule bg-surface px-6 py-8">
            <h3 className="text-xl font-semibold tracking-tight">{control.name}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{control.body}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

const STEPS = [
  {
    title: "Deploy your account",
    body: "We show you its address before you pay to create it. The address is computed from your own wallet rather than assigned by us, so a second deploy can never quietly produce a second account.",
  },
  {
    title: "Fund it and set your limits",
    body: "Move test USDC into the account and state your per-order cap, your lifetime budget and the date our key expires. This is the screen where you decide how much you are willing to lose.",
  },
  {
    title: "Pick a trader",
    body: "Choose from the leaderboard and set the fraction of their size you want to take. A trader below twenty resolved decisions is shown warming up, not ranked.",
  },
  {
    title: "Watch the echoes settle",
    body: "Every outcome reads as a sentence, including the ones that failed, with the reason attached. Nothing happening is the one result a copy-trading product must never leave unexplained.",
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

function SeedTraders() {
  return (
    <Band>
      <Eyebrow>Disclosure</Eyebrow>
      <Heading>Some of the traders on this board are ours.</Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          The board launched with strategies we run ourselves. A calibration score needs
          resolved decisions before it means anything, and an empty leaderboard has none, so we
          supplied the first ones rather than waiting or faking them.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          They are labelled as ours everywhere they appear. They trade real markets with real
          money at risk, they are scored by exactly the same maths as everyone else, and some of
          them are performing badly. You can read the whole record.
        </p>
      </div>
    </Band>
  );
}

function Risk() {
  return (
    <Band id="risk">
      <Eyebrow tone="warn">Risk</Eyebrow>
      <Heading>What can go wrong, before you decide.</Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Event Contracts are binary. A position resolves at its full value or at nothing, with
          no partial outcome in between. Copying a trader means taking that risk on their
          judgment rather than your own, and a score measures decisions that have already
          resolved. It carries no obligation toward the next one.
        </p>
        <p className="max-w-prose text-base leading-relaxed text-ink-2">
          Echonome runs on Somnia Shannon testnet. The custody model is proven on chain and the
          contract is in the open, but neither the contracts nor this site have had a security
          audit or a legal review. We will keep saying so on this page until they have.
        </p>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/leaderboard"
          className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-plane transition-opacity hover:opacity-90"
        >
          See the leaderboard
        </Link>
        <Link
          href="/terms"
          className="rounded-full border border-edge px-7 py-3.5 text-sm font-medium transition-colors hover:bg-surface"
        >
          Read the terms
        </Link>
      </div>
    </Band>
  );
}
