# Landing page — draft

Written against the house rules agreed 2026-09-09: no emojis anywhere, real imagery instead
of icon grids, legal pages ship with the build, and all copy passes
`~/.claude/skills/content-writer/scripts/scan.sh`.

Reference images live in `apps/web/design/references/`. What each one contributes:

- `treepod-hero.png` — full-bleed photographic hero, glass pill navigation, oversized
  geometric-grotesque headline, pill CTA with a corner arrow. This is the hero grammar.
- `vk-bento-stats.jpeg` — bento grid of saturated cards on black, giant numerals, small dark
  pill labels sitting on top of the number. This is the grammar for the controls section.
- `web3-wgmi.jpeg` — light-to-dark section flip, and a footer that carries the cookie notice
  and terms links as a normal part of the page rather than an afterthought.

---

## 1. Visual direction

**The anechoic chamber.**

An anechoic chamber is a room built to kill every echo. The walls are covered in dark foam
wedges, arranged in a deep geometric grid, and the room is used for one purpose: to measure a
signal with none of the noise that normally travels with it. It is a real place, it
photographs beautifully, it is architectural rather than decorative, and it is exactly what
this product does to a trading record.

That gives the site a source of real imagery with no icons in it: wedge walls, the geometry
of a repeating grid receding into dark, oscilloscope traces, sonar returns, ripple
interference on water. All photographable or renderable, all on-metaphor, none of them a
line-art glyph in a rounded square.

**Ground.** Near-black with warmth in it, not the flat `#000` of every crypto landing page.
`#0A0A0B` base, `#121214` for raised surfaces.

**Type.** A wide geometric grotesque for display, at genuinely large sizes, tight tracking,
tight leading, the way the Treepod reference sets its headline. General Sans or Cabinet
Grotesk from Fontshare are the closest free equivalents. Body text in Switzer or Inter at a
comfortable 17px with generous measure. Numbers get a tabular figure set, because this is a
site full of scores that must line up in columns.

**Accent.** One signal colour only. A sonar green, roughly `#8BF0B0`, used for live data and
nothing else, so that "this number is real and moving" becomes a visual rule rather than a
sentence we have to write. Warnings use a warm amber. There is no third accent.

**Motion.** Restrained. The one place it earns its keep is the hero, where a slow ripple or
waveform response tied to scroll makes the echo idea physical without a single icon.

---

## 2. Page structure

### Hero

Full-bleed anechoic chamber photograph, dark, with the headline set over the lower left in
the Treepod arrangement. Glass pill nav floating at the top. Primary CTA bottom right as a
white pill with a corner arrow.

**Eyebrow:** Every trade is a sound. Every copy is its echo.

**Headline:** Copy the traders who are right when they say they are.

**Subhead:** Echonome ranks DreamDEX Event Contract traders by calibration instead of profit.
Follow one, and your own on-chain account places the same trade at the size you set. We hold
a key that can place an order and cancel an order. It cannot withdraw. There is a script in
the repository that proves it against the live chain.

**Primary CTA:** See the leaderboard
**Secondary:** Read how custody works

### Live proof strip

A thin band directly under the fold. Four figures, queried live, in the accent colour, with
the query behind each one named in small text beneath. If a number is small, it shows small.
A leaderboard that has recorded three hundred decisions and says so is more persuasive than
one claiming ten thousand.

Traders ranked. Decisions recorded on chain. Markets settled. Echoes placed.

### Why calibration and not profit

The argument section, and the strongest thing on the page.

**Heading:** A trader who is right 60 percent of the time is worth more than one who got
lucky last week.

**Body:** Profit and loss rewards whoever was recently lucky. Calibration asks a harder
question. When this trader says a market is 70 percent likely to go up, does it go up 70
percent of the time? That is checkable, it needs a sample rather than a story, and no amount
of conviction moves it.

Then the section does something no competitor's landing page does. It shows one of our own
seed traders failing.

**Sub-heading:** Here is one of ours, being wrong.

**Body:** ec-maker scores 0.30 on a Brier score, which reads like a coin flip and tells you
nothing. Split by confidence band, it says something you can act on. When ec-maker calls a
market at 30 percent, it is right 63 percent of the time. When it calls one at 70 percent, it
is right none of the time. Its confident calls are worth inverting. We show you this because
the single number that hid it is the number every other leaderboard puts on the front page.

**Illustration:** the real reliability diagram from
`apps/web/components/reliability-diagram.tsx`, rendered live from the database, marks sized
by sample count. Not a picture of a chart. The chart.

### Your money never moves

**Heading:** We hold a key that cannot spend.

**Body:** Before you copy anyone you deploy a small contract called an EchoAccount. You own
it. You fund it. You are the only address that can take money out of it.

Echonome gets a second key on that contract, and it does two things: place an order, cancel
an order. It cannot withdraw. It cannot raise the limits you set. It cannot extend its own
expiry. It cannot add a market you have not allowed. It stops working the second you pause
the account, and it expires on a date you choose whether you remember to revoke it or not.

None of that is a promise. Every sentence in the paragraph above is an assertion in
`packages/contracts/scripts/verifyCustody.ts`, which runs against Somnia Shannon and fails
loudly if any one of them stops being true.

**CTA:** Read the contract, or run the proof yourself.

**Illustration:** a rendered two-key mechanism, physical and real rather than diagrammatic.
An escutcheon with two keyways, one of which turns and one of which does not.

### The controls are the product

The bento section, built on the `vk-bento-stats` grammar. Six cards, saturated colour on
black, the number huge, a dark pill label sitting over it. Each card is a limit the follower
sets, not a feature we are proud of.

1. Per-order cap. The most a single echo can ever commit.
2. Lifetime budget. The most the account will ever commit in total.
3. Expiry. The date our key stops working, set by you.
4. Pause. One switch, effective on the next block.
5. Market allowlist. Echoes only into pools you have permitted.
6. Revoke. Removes our key entirely. Your funds do not move, because they were never ours.

### How it works

Four steps, each illustrated with a real screenshot of the actual product rather than a
numbered circle.

1. Deploy your account. We show you its address before you pay for it, because the address is
   computed rather than assigned.
2. Fund it with test USDC and set your limits.
3. Pick a trader. Set the fraction of their size you want.
4. Watch the echoes settle. Every outcome reads as a sentence, including the failures, with
   the reason attached.

### About the seed traders

**Heading:** Two of the traders on this board are ours.

**Body:** The board launched with two strategies we run ourselves, ec-maker and
ec-oracle-follow, because a calibration score needs resolved decisions before it means
anything and an empty leaderboard has none. They are labelled as ours everywhere they appear,
they trade real markets with real money at risk, and they are scored by exactly the same
maths as everyone else. One of them is currently performing badly, which you can read in full
on its profile.

### Risk

Not a modal. A section, set in the same type as everything else.

**Body:** Event Contracts are binary. A position either resolves at its full value or at
nothing, and there is no partial outcome in between. Copying a trader means taking that risk
on their judgment rather than your own, and a calibration score is a measurement of the past
that carries no obligation toward the future. Echonome is running on Somnia Shannon testnet.
Nothing here has had a legal or security review yet, and we will say so on this page until it
has.

### Footer

Three columns and a bottom bar, following the `web3-wgmi` reference where the cookie notice
lives in the footer rather than ambushing the reader.

- Product: Leaderboard, How it works, Custody proof, Repository
- Company: About, Contact
- Legal: Terms and Conditions, Privacy Policy, Cookie Policy

Bottom bar carries the copyright, the network the site is pointed at, and the current
contract addresses, because a user should be able to verify what they are about to deploy
without leaving the page.

---

## 3. Legal pages

Three routes, footer-linked from every page, each with a visible last-updated date and each
written in the same voice as the rest of the site.

**`/terms`** — what Echonome does and does not do on a user's behalf. That we place and
cancel orders through a key with no withdrawal rights. That the user owns their account
contract and is solely able to move funds out of it. That calibration scores are measurements
of past decisions, not predictions or advice. That seed traders are operated by us and
labelled as such. Eligibility, prohibited use, termination, and the fact that the user can
revoke at any moment without asking us.

**`/privacy`** — what we actually store, which is short and worth saying precisely: wallet
addresses, on-chain activity that is already public, copy links, and standard server logs. No
email unless the user gives one. No selling, no ad networks. What a user can ask us to
delete, and what lives on a public chain and therefore cannot be deleted by anyone.

**`/cookies`** — the categories in use, what each one does, and how to refuse the
non-essential ones. If the site ends up needing only a session cookie and a consent record,
the page says exactly that rather than reproducing a generic template describing trackers we
do not run.

**Consent banner** — bottom-anchored, not a full-screen interstitial. Accept and Manage as
equal-weight buttons, following the WGMI reference's Accept plus Find out more pairing.
Refusing is one click, the same as accepting. The choice is recorded and respected.

Every one of these ships unreviewed by a lawyer, and the pages will say so. Getting them
written is our job. Getting them approved is a separate task that belongs to Jadon.

---

## 4. Build notes

- Reference images moved out of `apps/web/app/`. That directory is the Next.js App Router, so
  files sitting in it are route segments, and a 2.6 MB PNG does not belong there.
- The landing page replaces the current `apps/web/app/page.tsx`, which is the leaderboard.
  The leaderboard moves to `/leaderboard`.
- Live figures come from the existing queries in `apps/web/lib/queries.ts`. Nothing on this
  page is a placeholder number.
- Sections that depend on the follower account flow, meaning How it works and the controls
  bento, need the `/connect` rebuild to exist before their screenshots are real. Write the
  copy now, take the screenshots after.
