import Image from "next/image";
import Link from "next/link";
import { getCalibrationHighlight, getSiteStats, type SiteStats } from "@/lib/queries";
import { ReliabilityDiagram } from "@/components/reliability-diagram";
import { LandingNav } from "@/components/site/landing-nav";
import { SiteFooter } from "@/components/site/footer";
import { formatBrier } from "@/lib/format";

/**
 * The landing page.
 *
 * Two rules held throughout. Every number on this page is queried live rather than written
 * into the copy, so the page cannot drift from the product the way a marketing page usually
 * does. And no claim appears here that is not checkable somewhere else — each one names the
 * script, the contract or the page that proves it.
 *
 * Visual direction is in `design/LANDING.md`: an anechoic chamber, a room built to kill every
 * echo so that a signal can be measured with nothing else attached to it.
 */
export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [stats, highlight] = await Promise.all([
    getSiteStats(),
    getCalibrationHighlight(),
  ]);

  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <ProofStrip stats={stats} />
        <Calibration highlight={highlight} />
        <Custody />
        <Controls />
        <HowItWorks />
        <SeedTraders />
        <Risk />
      </main>
      <SiteFooter />
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden">
      <Image
        src="/images/hero-anechoic.jpg"
        alt="A wall of acoustic foam wedges in an anechoic chamber, receding into darkness"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/*
        Two scrims rather than one. A single flat overlay would mute the photograph
        everywhere, including the upper right where nothing is set over it and the image is
        the only thing worth looking at. This darkens the lower left, where the type sits,
        and leaves the rest of the frame alone.
      */}
      <div className="absolute inset-0 bg-gradient-to-t from-plane via-plane/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-plane/85 via-plane/25 to-transparent" />

      <div className="relative mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">
          Every trade is a sound. Every copy is its echo.
        </p>

        <h1 className="mt-6 max-w-4xl text-display-sm font-semibold sm:text-display lg:text-display-lg">
          Copy the traders who are right when they say they are.
        </h1>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-prose text-base leading-relaxed text-ink-2 sm:text-lg">
            Echonome ranks DreamDEX Event Contract traders by calibration instead of profit.
            Follow one, and your own on-chain account places the same trade at the size you
            set. We hold a key that can place an order and cancel an order. It cannot
            withdraw, and there is a script in the repository that proves it against the live
            chain.
          </p>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/leaderboard"
              className="rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-plane transition-opacity hover:opacity-90"
            >
              See the leaderboard
            </Link>
            <a
              href="#custody"
              className="rounded-full border border-edge px-6 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-white/5"
            >
              How custody works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

/**
 * Four figures, queried at request time, with the thing each one counts named beneath it.
 * Unrounded and unfiltered on purpose: a leaderboard arguing that it reports an uncurated
 * record cannot present a flattering subset of its own totals.
 */
function ProofStrip({ stats }: { stats: SiteStats | null }) {
  // No database reachable. Say that, rather than rendering four zeros — zeros would claim
  // that no trader has ever recorded a decision, which is a statement about the product
  // rather than about the connection, and it would be false.
  if (stats === null) {
    return (
      <section className="border-y border-rule">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">
          <p className="text-sm text-ink-3">
            Live figures are unavailable right now. This deployment has no database attached
            to it, so the counts that normally sit here have been left out rather than
            guessed at.
          </p>
        </div>
      </section>
    );
  }

  const items = [
    { value: stats.traders, label: "traders indexed" },
    { value: stats.decisions.toLocaleString("en"), label: "decisions recorded on chain" },
    { value: stats.markets, label: "markets covered" },
    { value: stats.echoesSettled, label: "echoes settled on chain" },
  ];

  return (
    <section className="border-y border-rule">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px bg-rule lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="bg-plane px-6 py-8 sm:px-8 sm:py-10">
            <p className="font-mono text-4xl text-accent tnum sm:text-5xl">{item.value}</p>
            <p className="mt-2 text-sm text-ink-3">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

function Calibration({
  highlight,
}: {
  highlight: Awaited<ReturnType<typeof getCalibrationHighlight>>;
}) {
  return (
    <section id="calibration" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">
          Why calibration
        </p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          A trader who is right 60 percent of the time is worth more than one who got lucky
          last week.
        </h2>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            Profit and loss rewards whoever was recently lucky. Calibration asks a harder
            question. When this trader says a market is 70 percent likely to go up, does it go
            up 70 percent of the time? That needs a sample rather than a story, it is checkable
            by anyone with the same public record we read, and no amount of conviction moves
            it.
          </p>
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            The score is a Brier score, where lower is better and{" "}
            <span className="font-mono text-ink tnum">0.2500</span> is exactly what calling
            everything a coin flip would get you. Nobody appears ranked until twenty of their
            decisions have resolved. Below that they are shown as warming up, with the count
            visible, rather than hidden until the number flatters them.
          </p>
        </div>

        {highlight && <HighlightPanel highlight={highlight} />}
      </div>
    </section>
  );
}

/**
 * The section that puts one of our own seed traders on the front page.
 *
 * Every sentence here is generated from the trader's live buckets, including the verdict. It
 * was written the other way round first, asserting that the trader was wrong and then quoting
 * numbers to match, and the live data promptly selected a well-calibrated trader and rendered
 * the claim as a lie. Copy that states a conclusion the query has not reached is a bug on a
 * page whose argument is that we report what the record says.
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
    <div className="mt-16 overflow-hidden rounded-2xl border border-rule bg-surface">
      <div className="grid gap-10 p-8 lg:grid-cols-[1.1fr_1fr] lg:p-12">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What a single score hides.
          </h3>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-2">
            <span className="font-mono text-ink">{highlight.label}</span> scores{" "}
            <span className="font-mono text-ink tnum">{formatBrier(highlight.brier)}</span>{" "}
            across{" "}
            <span className="font-mono text-ink tnum">
              {highlight.sampleCount.toLocaleString("en")}
            </span>{" "}
            resolved calls. On its own that number sits near a coin flip and tells you almost
            nothing about how to use this trader.
          </p>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-2">
            Split by confidence band, one figure stands out. On the calls it rated{" "}
            <span className="font-mono text-ink tnum">{pct(worst.claimed)}</span>, it was right{" "}
            <span className="font-mono text-ink tnum">{pct(worst.observed)}</span> of the time.
            There are{" "}
            <span className="font-mono text-ink tnum">{worst.sampleCount}</span> of them, so
            that is not a rounding artefact.{" "}
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

/* ---------------------------------------------------------------------------------------- */

/**
 * Every line in CANNOT is an assertion in `packages/contracts/scripts/verifyCustody.ts`,
 * which runs against Somnia Shannon and fails loudly if any one of them stops being true.
 * Nothing goes in this list that the script does not test.
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
    <section id="custody" className="scroll-mt-24 border-t border-rule py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Custody</p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          We hold a key that cannot spend.
        </h2>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            Before you copy anyone, you deploy a small contract called an EchoAccount. You own
            it, you fund it, and you are the only address that can take anything out of it. We
            never hold your money, so there is no moment where you have to trust that we will
            give it back.
          </p>
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            Echonome gets a second key on that contract, and it does two things: place an
            order, and cancel an order. None of what follows is a promise we are asking you to
            take on faith. Every line is an assertion in a script that runs against the live
            chain and fails loudly the moment it stops being true.
          </p>
        </div>

        <div className="mt-14">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">
            What our key cannot do
          </p>
          <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            {CANNOT.map((item) => (
              <li key={item} className="bg-surface px-6 py-7">
                <p className="font-mono text-xs uppercase tracking-widest text-accent">
                  Cannot
                </p>
                <p className="mt-3 text-base leading-snug text-ink">{item}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-3">
          <code className="rounded bg-surface px-3 py-2 font-mono text-ink-2">
            npm run verify:custody -w @echonome/contracts
          </code>
          <span>Read-only. Runs against Shannon. Takes about a minute.</span>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

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
    <section id="controls" className="scroll-mt-24 border-t border-rule py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Your limits</p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          The controls are the product.
        </h2>

        <p className="mt-8 max-w-prose text-base leading-relaxed text-ink-2">
          These are not settings buried behind an advanced tab. They are the terms you set
          before anything is copied, they are enforced by the contract rather than by our
          server, and a trade that would break one of them fails on chain instead of asking
          us nicely.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((control) => (
            <div key={control.name} className="bg-surface px-7 py-9">
              <h3 className="text-xl font-semibold tracking-tight">{control.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{control.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

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
    <section id="how" className="scroll-mt-24 border-t border-rule py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">How it works</p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          Two signatures, then nothing further is asked of you.
        </h2>

        <ol className="mt-14 grid gap-10 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-edge pt-6">
              <p className="font-mono text-xs tracking-widest text-accent tnum">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-2">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

function SeedTraders() {
  return (
    <section className="border-t border-rule py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-3">Disclosure</p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          Some of the traders on this board are ours.
        </h2>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            The board launched with two strategies we run ourselves, ec-maker and
            ec-oracle-follow. A calibration score needs resolved decisions before it means
            anything, and an empty leaderboard has none, so we supplied the first ones rather
            than waiting or faking them.
          </p>
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            They are labelled as ours everywhere they appear. They trade real markets with
            real money at risk, they are scored by exactly the same maths as everyone else,
            and one of them is currently performing badly. You can read the whole record.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------- */

function Risk() {
  return (
    <section id="risk" className="scroll-mt-24 border-t border-rule py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-warning">Risk</p>

        <h2 className="mt-6 max-w-3xl text-display-sm font-semibold sm:text-display">
          What can go wrong, before you decide.
        </h2>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            Event Contracts are binary. A position resolves at its full value or at nothing,
            with no partial outcome in between. Copying a trader means taking that risk on
            their judgment rather than your own, and a calibration score measures decisions
            that have already resolved. It carries no obligation toward the next one.
          </p>
          <p className="max-w-prose text-base leading-relaxed text-ink-2">
            Echonome runs on Somnia Shannon testnet. The custody model is proven on chain and
            the contract is in the open, but neither the contracts nor this site have had a
            security audit or a legal review. We will keep saying so on this page until they
            have.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/leaderboard"
            className="rounded-full bg-ink px-6 py-3.5 text-sm font-medium text-plane transition-opacity hover:opacity-90"
          >
            See the leaderboard
          </Link>
          <Link
            href="/terms"
            className="rounded-full border border-edge px-6 py-3.5 text-sm font-medium transition-colors hover:bg-white/5"
          >
            Read the terms
          </Link>
        </div>
      </div>
    </section>
  );
}
