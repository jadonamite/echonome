# Handover — 2026-09-09, ~02:30

Written at the end of a long session. Read the first two sections before touching anything.

---

## 0. STOP — there is concurrent uncommitted work in this tree

`git status` shows two people's changes interleaved and **none of it is committed**. Do not
run `git add -A && git commit`. You would commit someone else's half-finished work.

**Mine (backend / scoring), safe to commit together:**

```
apps/worker/src/calibration/engine.ts        edge scoring
apps/worker/src/calibration/engine.test.ts   its tests
apps/worker/src/db/schema.sql                edge + edge_lower columns
apps/worker/src/seeds/runSeedTraders.ts      wires in 3 new strategies
apps/worker/src/seeds/strategies.ts          NEW — the 3 new strategies
apps/worker/src/provisionSeeds.ts            NEW — funds their wallets
apps/worker/package.json                     new npm scripts
apps/worker/.gitignore                       .seed-wallets.json
apps/web/lib/queries.ts                      leaderboard ranks by edge
apps/web/lib/format.ts                       formatEdge / edgeVerdict
```

**Someone else's (frontend restructure + design pass), leave alone:**

```
apps/web/app/(app)/…                 route group — every page MOVED here
apps/web/app/(app)/layout.tsx        new
apps/web/components/site/            new
apps/web/design/                     new — LANDING.md, IMAGERY.md, references, candidates
apps/web/public/                     new
apps/web/app/layout.tsx              modified
apps/web/app/globals.css             modified
apps/web/tailwind.config.ts          modified
apps/web/lib/somnia.ts               modified
.mcp.json                            new
```

The two stray `.jpeg` files in `apps/web/app/` are now deleted / moved into
`apps/web/design/references/`. That was them tidying up, not a problem.

**Talk to whoever is doing the frontend work before committing anything under `apps/web/`.**

---

## 1. What Echonome is, in three sentences

DreamDEX runs hourly yes/no markets on Somnia — *"will BTC close at or above where it opened
this hour?"* Every trade on such a market states a probability and backs it with money (buy
"Up" at 30c and the market is saying 30%), and an hour later reality settles it. Echonome
watches those trades, scores who is actually good, and lets you copy them — **without ever
being able to touch your funds.**

Read in this order if you are new: `PRD.md` → `TECHNICAL_ARCHITECTURE.md` → `FEEDBACK.md`
(that last one is where every hard-won fact lives, and it will save you a day).

---

## 2. Exactly where I stopped, mid-task

I was doing two things when context ran out. **Neither is finished.**

### 2a. Edge scoring — implemented and tested, NOT yet computed

**Why it exists.** The leaderboard used to rank on a Brier score. That is wrong, and the
reasoning matters:

> A Brier score rewards a price that turns out to be **accurate**. A trader profits when a
> price turns out to be **wrong in their favour**. Buy "Up" at 30c and watch it happen: you
> made 70c, and Brier marks you down hard for "saying 30% about something that occurred".
> **Ranking on Brier ranks against the traders most worth copying.**

The replacement is **edge** = mean of `(outcome − price paid)`. In a binary market that is not
a heuristic — it is exactly expected profit per unit staked. Ranking uses `edgeLower`, the
conservative end of a 95% interval, so nobody climbs on a lucky run.

**Status:** `edgeScore()` is written, documented and covered by 8 tests (86 pass total).
Columns `calibration_score.edge` and `.edge_lower` exist and are migrated.

**They are NULL.** The backfill never ran — my `npm run recompute` failed because I invoked it
from the wrong directory. **This is your first task:**

```bash
cd apps/worker && npm run recompute
```

Then confirm:

```bash
psql postgres://mac@localhost:5432/echonome -c "
SELECT t.label, c.sample_count AS calls,
       round(c.edge*100, 2) AS edge_cents,
       round(c.edge_lower*100, 2) AS edge_cents_conservative,
       round(c.brier_score, 4) AS brier
FROM calibration_score c JOIN trader t ON t.id=c.trader_id
ORDER BY c.edge_lower DESC NULLS LAST;"
```

Until that runs, **the leaderboard will show every trader as unranked**, because it now sorts
on `edge_lower DESC NULLS LAST` and every value is null.

### 2b. Leaderboard UI — edit did NOT apply

I tried to rewrite `apps/web/app/page.tsx` to lead with edge instead of Brier. It failed
because **the file had been moved** to `apps/web/app/(app)/leaderboard/page.tsx` by the
concurrent frontend work. Nothing was written; nothing is broken; the change simply is not
there.

`apps/web/lib/queries.ts` and `apps/web/lib/format.ts` ARE updated — the data layer already
returns `edge` and `edgeLower`, and `formatEdge()` / `edgeVerdict()` exist and are ready. Only
the page component still displays Brier as the headline.

**What that page needs (in its new location):**

- Headline stat becomes `formatEdge(entry.edge)` with `edgeVerdict(entry.edge, entry.edgeLower)`
  as the subtitle, where it currently uses `formatBrier` / `brierVerdict`.
- Keep Brier as a *secondary* stat labelled something like "accuracy, not profit" — it is still
  a useful signal about whether someone is a forecaster or an edge-hunter, it is just not the
  ranking.
- The page intro still says "Ranked by calibration". It should say ranked by edge and explain
  edge in one sentence: *how much better a trader did than the prices they paid, in cents per
  dollar staked.*

---

## 3. What is running right now

Three long-lived processes, all started with `nohup` from `apps/worker`, logging to
`/private/tmp/claude-501/-Users-mac/eeee168c-30df-4cfc-b44c-6441d376e0d8/scratchpad/`:

| Process | Command | Log |
|---|---|---|
| Worker | `npx tsx --env-file=.env src/index.ts` | `worker.log` |
| Seed traders | `npx tsx --env-file=.env src/seeds/runSeedTraders.ts` | `seeds.log` |
| Web (maybe) | `npx next dev -p 3100` from `apps/web` | `web.log` |

**Node buffers stdout to a file**, so these logs lag badly and can look empty while the process
is fine. Trust the database and `npm run health` over the logs. Restart pattern:

```bash
cd apps/worker
pkill -f "src/index.ts"; sleep 2
nohup npx tsx --env-file=.env src/index.ts > /tmp/worker.log 2>&1 &
```

---

## 4. Five seed traders now, and why the field matters

Two originals plus three I added this session so the leaderboard has something to distinguish.
All five are registered in the `trader` table and being watched.

| Bot | What it does | Why it is in the field |
|---|---|---|
| `ec-maker` | Rests two-sided quotes around the mid | Original. Provides liquidity so the others can trade |
| `ec-oracle-follow` | Momentum taker | Original. Directional, so its trades encode a real view |
| **`ec-coinflip`** | **Picks a side at random** | **The CONTROL.** Expected edge exactly zero. If the ranking ever puts it high, the ranking is broken. This is the cheapest possible proof the metric has teeth |
| `ec-longshot` | Always buys the cheap side | Probes the classic long-shot bias |
| `ec-favourite` | Always buys the expensive side | Mirror of the above. If one shows +edge and the other −edge by a similar margin, that is a real market bias rather than either bot being clever |

Their wallets are in `apps/worker/.seed-wallets.json` (gitignored, testnet keys only), created
and funded by `npm run seeds:provision` — idempotent, safe to re-run.

**They have only been running for minutes.** They need hours of settled markets before their
edge numbers mean anything. The `MIN_CALIBRATION_SAMPLE` threshold is 20 resolved calls.

**The single most valuable thing you can do next** is let all five run for several hours, then
look at where `ec-coinflip` lands. If it sits near zero edge and below the others, the metric
works and you have a genuinely strong demo. If it ranks well, something is wrong and you need
to know that before you pitch it.

---

## 5. The custody story — done, proven, and the best thing in the build

Copy-trading needs something that can spend your money. Echonome's answer is that the follower
deploys a contract **they own** which holds their collateral, and Echonome gets a key that can
only place and cancel orders inside limits they set.

```
EchoAccountFactory   0xcee09039dc8020e01a12387eaa37b6a257b793d7   (Shannon testnet)
Operator / executor  0x7Dd9493e5aaEb32d70c7d213EDDB0571F86b7143
Demo follower        0xA5695daF0955691e55FFa1Fbd13A454b71e295f0   (key: apps/worker/.demo-follower.key)
Their account        0xFf24Fc48844986Be455C3CDdc9E30841ad0A29A5
```

**Proven on chain, not asserted:**

```bash
npm run verify:custody -w @echonome/contracts   # 24/24 adversarial assertions
```

Every assertion tries something the executor must not be able to do — withdraw, raise its own
caps, extend its own expiry, act after pause/expiry/revocation — and passes only when the chain
refuses it **with the expected named error**. "It reverted" is satisfied by a typo; the error
name is not.

**Real echoes have happened.** 27 orders placed through the demo follower's account, balance
moved 500 → 494.98 tUSDC of real (test) collateral, with the contract tracking the spend against
its own budget. `npm run demo:follower` stands the whole thing up from a fresh wallet.

Rebuild/redeploy contracts with `npm run build -w @echonome/contracts` and
`npm run deploy -w @echonome/contracts`. Toolchain is npm `solc` + viem — **no Foundry, and do
not add it.**

---

## 6. Immediate next steps, in order

1. **`cd apps/worker && npm run recompute`** — populates edge. Without this the leaderboard is
   empty. (5 seconds)
2. **Update the leaderboard page** at its new path `apps/web/app/(app)/leaderboard/page.tsx` to
   lead with edge — see §2b. Coordinate with whoever is restructuring the frontend.
3. **Commit the backend work** (the file list in §0), separately from the frontend work.
4. **Let the five bots run for several hours**, then check where `ec-coinflip` ranks. This is
   the experiment that validates or kills the metric.
5. **Watch one echo settle end to end.** 27 echoes are `pending`. When their market resolves,
   the settlement poller should flip them to `settled` with an outcome and they should appear on
   `/me` in plain language. That last link has been built but never *observed* working.
6. Then: exposure caps in the copy UI (Phase 4), organic trader discovery (Phase 5), submission
   packaging (Phase 10). `TODO.md` is current and honest about what is and isn't done.

---

## 7. Things that will bite you (all learned the hard way)

Every one of these cost real time. `FEEDBACK.md` has the full accounts.

- **`loadMarkets()` returns a CACHE.** You must call `loadMarkets(true)`. A bare call is a no-op
  after the first one. This silently froze the market list and cost an hour of lost data, and
  the "fix" for it looked like it worked only because deploying it meant restarting the process.
- **Markets roll over every hour** and the SDK's registry *accumulates* dead ones. Always filter
  with `isTradeableTargetMarket()` (checks status AND expiry), never `isTargetMarket()` alone.
  A bot quoted into a two-hours-dead market 314 times because of this.
- **The pool reverts, it never rounds.** Prices must be multiples of 1000 raw units
  (`InvalidPrice`); quantities must be multiples of the lot size AND above a minimum
  (`InvalidQuantity`). Both bit us on first contact.
- **An IOC order must actually cross.** Pricing at "last price" is not enough — it must reach
  the best ask (or the complement of the best bid for a NO buy), or you get
  `ImmediateOrCancelNoFill` and pay gas for nothing.
- **Out-of-gas looks exactly like a logic revert.** Compare `gasUsed` against your limit; if
  they are equal it was gas. Use `estimateGas` rather than guessing — the factory deploy needed
  22.6M.
- **RPC confirmations time out on transactions that still land.** Always check on-chain state
  before retrying, or you will do the same thing twice.
- **One operator key = nonce collisions** when several echoes are in flight. The mirror engine
  serialises sends through a promise chain; keep that if you refactor.
- **`0.7 / 0.1` is `6.999…` in floating point.** Bucket boundaries need an epsilon. This
  silently pushed every boundary case one band down.
- **Every failure in this project has been silent.** Not a crash — a healthy process writing
  nothing. That is why `npm run health` exists and why it alerts on *absence* rather than
  errors. It has already caught two real regressions. Trust it.

---

## 8. Commands worth knowing

```bash
# from apps/worker
npm test                    # 86 tests
npm run health              # liveness; exits 0 ok / 1 warn / 2 critical
npm run health -- --facts   # ...and show the evidence behind the verdict
npm run recompute           # rescore every trader (run after any scoring change)
npm run migrate             # apply schema.sql
npm run seeds:provision     # create/fund wallets for the extra strategies
npm run demo:follower       # stand up a funded follower + copy link end to end
npm run verify:operator-gate  # proves the venue's operator registry ignores binary pools
npm run verify:custody -w @echonome/contracts   # 24 adversarial custody assertions
```

Database: `postgres://mac@localhost:5432/echonome`. Worker env: `apps/worker/.env`.

---

## 9. Honest status

**Works, proven on live testnet:** bots trade, trades are recorded, markets settle, scores
compute, reliability breakdown is genuinely informative, a follower's account was deployed and
funded, 27 real orders were placed into it, and the custody guarantee is proven adversarially
on chain.

**Not done:** edge is implemented but not yet computed or displayed (§2). Echo settlement has
never been *observed* completing. Testnet only, fake money, no external users, no security audit
of the contract, no legal review.

**The strongest thing to lead a pitch with:** we found that this venue does not let any third
party place orders on a user's behalf — undocumented, and every other team hit it too — proved
it on chain, and shipped a contract that routes around it while making the custody guarantee
*stronger* than the approach it replaced. That is in `FEEDBACK.md` with the reproduction, and
it is also the most valuable thing we can hand back to DreamDEX.
