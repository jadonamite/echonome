# Echonome

> *Every trade is a sound. Every copy is its echo.*

**Copy-trading for DreamDEX Event Contracts, ranked by edge instead of profit — where the
thing that trades for you provably cannot take your money.**

Built for the Event Contracts Hackathon (Somnia × DreamDEX). Running live on Somnia Shannon
testnet.

---

## Live deployments

| Component | Host / Network | URL / Address |
| --- | --- | --- |
| **Web frontend** | Vercel (Next.js 15) | [echonome-mu.vercel.app](https://echonome-mu.vercel.app) |
| **Worker & seed fleet** | Render (Node 22) | [echonome-worker.onrender.com](https://echonome-worker.onrender.com) (`/healthz`) |
| **Database** | Neon serverless Postgres | connection pooling enabled |
| **Keep-alive** | UptimeRobot | pings `/healthz` every 10 min |
| **Network** | Somnia Shannon testnet | chain id `50312` |
| **EchoAccountFactory** | Shannon testnet | [`0xcee09039dc8020e01a12387eaa37b6a257b793d7`](https://shannon-explorer.somnia.network/address/0xcee09039dc8020e01a12387eaa37b6a257b793d7) |

---

## The problem

DreamDEX runs hourly yes/no markets on Somnia — *"will BTC close at or above where it opened
this hour?"* Every trade on such a market states a probability and backs it with money: buy
"Up" at 30c and the market is saying 30%. An hour later, reality settles it.

Most people would rather copy a good trader than become one. eToro proved that in 2010. But
copy-trading asks you to trust two things at once, and they shouldn't travel together:

1. **That the leaderboard is honest** — that nobody quietly hides the traders who blew up.
2. **That the broker won't take your money** — because you hand your funds over.

Echonome unbundles them. Rankings are computed from a public ledger nobody can curate after
a bad week. And your collateral sits in a contract **you** deploy and **you** own, where
Echonome holds a key that can place and cancel orders and nothing else.

## What we found, and why it matters

We set out to use DreamDEX's `OperatorPermissionsRegistry` — the documented way to let a
third party act for you. Its address is absent from the SDK's address book, so the first
theory was that we simply hadn't found it.

We found it (`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`, read off a live spot pool and
confirmed against DreamDEX's Operators page) — and finding it **disproved the approach**:

> **Event Contract pools do not consult the operator registry at all.** With both a global
> and a per-pool grant recorded live for the correct `placeBinaryOrderFor` selector
> (`0x5d97c566`), the call still reverts `OnlyApprovedContracts` — and it reverts identically
> when the owner calls it for themselves.

Reproduce it yourself, read-only, no keys needed:

```bash
npm run verify:operator-gate -w @echonome/worker
```

So the direction of the call has to invert. Rather than *Echonome placing an order for you*,
**you get a contract that places its own orders**, and Echonome may pull its trigger under
conditions you set. That constraint made the custody guarantee stronger than the design it
replaced: it is enforced by a contract you can read, not by a registry whose semantics we had
to discover by experiment.

Full account, with every dead end, in [`FEEDBACK.md`](FEEDBACK.md).

---

## Key ideas

### 1. Ranked by edge — not by profit, and not by accuracy

The leaderboard sorts on **edge**: the mean of `(outcome − price paid)`, which in a binary
market is exactly expected profit per unit staked.

It is deliberately **not** ranked on the Brier score, and the reason matters:

> A Brier score rewards a price that turns out to be **accurate**. A trader profits when a
> price turns out to be **wrong in their favour**. Buy "Up" at 30c and watch it happen: you
> made 70c, and Brier marks you down hard for "saying 30% about something that occurred."
> **Ranking on accuracy ranks against the traders most worth copying.**

Ranking uses `edgeLower`, the conservative end of a 95% interval, so a good run alone does
not climb the board. Nobody is ranked below 20 resolved calls — they show as *warming up*,
visible rather than hidden.

Accuracy is still shown, as a Brier score, because it says something different: a trader can
be well calibrated and unprofitable, or badly calibrated and very profitable. Trader profiles
carry a full **reliability breakdown** — for every confidence level a trader traded at, how
often they were actually right — with marks sized by sample count, so a two-call band never
looks as authoritative as a two-hundred-call one.

### 2. Non-custodial by construction (`EchoAccount.sol`)

```
  your wallet                  EchoAccount (you own it)              BinaryPool
  ───────────                  ────────────────────────              ──────────
  deposit collateral  ──────▶  holds tUSDC + outcome tokens
  set caps / expiry   ──────▶  allowedSeries, maxOrderCollateral,
                               totalCollateralCap, executorExpiry
  withdrawToken       ◀──────  onlyOwner — always, unconditionally

  Echonome's engine   ──────▶  placeOrder()  ─ onlyExecutor ─────▶  placeBinaryOrder
                               reverts unless: not paused, within
                               expiry, series allowed, inside both
                               collateral caps
```

Each follower deploys their own account through a CREATE2 factory, so the address is known
before it costs anything to deploy.

**What the executor can do:** `placeOrder` and `cancelOrder`, and only while every one of
your conditions holds.

**What it provably cannot do:** move a single token out. `withdrawToken` and `withdrawNative`
are `onlyOwner` — not by policy, but by the absence of any code path reaching them from the
executor. It cannot raise its own caps, extend its own expiry, allow itself a new series, or
unpause itself.

**Your kill switches, in increasing severity:** `setPaused(true)` stops new orders
immediately; letting `executorExpiry` lapse does the same on a timer with no action needed;
`revokeExecutor()` is permanent. All three are `onlyOwner` and none need our cooperation or
our uptime.

One caveat stated plainly: Event Contract pool addresses are re-bound to a new market when a
cadence window rolls, so a pool allowlist is a coarse filter — the caps and the expiry carry
the real security weight. That is why authorisation is by rolling *series*.

### 3. A seed fleet with a control

Five strategies quote the hourly BTC and ETH markets continuously:

| Bot | What it does | Why it's in the field |
| --- | --- | --- |
| `ec-maker` | Two-sided quotes around the mid | Provides the liquidity the others trade against |
| `ec-oracle-follow` | Directional momentum taker | Its trades encode a real view |
| **`ec-coinflip`** | **Picks a side at random** | **The control.** Expected edge exactly zero. If the ranking ever puts it near the top, the ranking is broken |
| `ec-longshot` | Always buys the cheap side | Probes long-shot bias |
| `ec-favourite` | Always buys the expensive side | Mirror of the above — if the two are symmetric, that is a market bias rather than skill |

---

## Architecture

```
                          +---------------------------------------+
                          |         Somnia Shannon Testnet        |
                          |            (chain id 50312)           |
                          +-------------------+-------------------+
                                              |
                 fills & settlements          | orders & cancellations
                                              v
+-----------------------------+     +-----------------------------+
|    Next.js 15 web app       |     |  Unified worker & seeds     |
|          (Vercel)           |     |          (Render)           |
|                             |     |                             |
| • Live leaderboard          |     | • Fill watcher (10s poll)   |
| • Reliability diagrams      |     | • Settlement poller (15s)   |
| • On-chain account panel    |     | • Health monitor (60s)      |
| • Copy configuration        |     | • 5x seed strategy fleet    |
| • Plain-English echo log    |     | • HTTP health server        |
+--------------+--------------+     +--------------+--------------+
               |                                   |
               | reads (pooled URL)                | heartbeats, decisions,
               |                                   | echoes (direct URL)
               v                                   v
       +-------------------------------------------------------+
       |               Neon serverless Postgres                |
       |   trader · decision · copy_link · echo                |
       |   calibration_score · proxy_grant · worker_heartbeat  |
       +-------------------------------------------------------+
```

The worker writes; the web app reads the same database. Only two things ever need your
wallet — deploying your EchoAccount and funding it — and both happen in the browser. No
private key ever reaches the backend, which is the point.

---

## Verify the claims

Every claim above is backed by something runnable against live testnet. Nothing is mocked.

Two of these need nothing but the repo and an internet connection. The rest need a funded
Shannon testnet key in `apps/worker/.env`, because they deploy or trade.

| Claim | Command | Needs | What it proves |
| --- | --- | --- | --- |
| Operator grants don't work on this venue | `npm run verify:operator-gate -w @echonome/worker` | nothing | Reads both pool types live and shows the binary pool doesn't implement the gate at all — then shows `placeBinaryOrderFor` reverting *even for the owner acting on their own behalf*, which is what makes it unfixable by any grant |
| The maths is right | `npm test -w @echonome/worker` | nothing | 86 tests — edge and Brier against known inputs, plus a regression test for every live bug we hit |
| The executor cannot touch your funds | `npm run verify:custody -w @echonome/contracts` | funded key | 24 adversarial assertions, each passing **only** on the expected *named* revert. "It reverted" is satisfied by a typo; the error name is not |
| The whole loop works | `npm run demo:follower -w @echonome/worker` | funded key | Stands up a funded follower account and a copy link from a fresh wallet |
| The system is actually working | `npm run health -w @echonome/worker -- --facts` | database | Exits 0/1/2 for an uptime probe, and `--facts` shows the evidence behind the verdict |

That last one alerts on **absence**, not errors — every defect this project has had presented
as a healthy process writing nothing, never as a crash. It caught a real regression within
minutes of being written.

---

## Repository layout

```
apps/web/           Next.js 15 App Router — leaderboard, trader profiles, connect,
                    copy configuration, my echoes. Tailwind, wagmi/viem, SVG charts.
apps/worker/        Long-running TypeScript process: fill watcher, settlement poller,
                    health monitor, HTTP health server, and the seed fleet.
packages/contracts/ EchoAccount.sol + factory, adversarial custody suite.
                    npm solc + viem — no Foundry, and please don't add it.
packages/shared/    Domain types both sides import.
```

## Run it locally

**Prerequisites:** Node 20.6+ (for `--import tsx`), npm 10+, and a Postgres database — local
or a Neon connection string.

```bash
git clone https://github.com/jadonamite/echonome.git
cd echonome
npm install
```

Create `apps/worker/.env`. The authoritative template is
[`apps/worker/.env.example`](apps/worker/.env.example):

```env
DATABASE_URL="postgres://…"                 # the DIRECT (unpooled) URL
SHANNON_INDEXER_URL="https://dev.smk.somnia.host/v1/graphql"
SHANNON_WS_URL="wss://api.infra.testnet.somnia.network/ws"
EC_VENUE_ID="0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c"
ECHO_ACCOUNT_FACTORY="0xcee09039dc8020e01a12387eaa37b6a257b793d7"
OPERATOR_PRIVATE_KEY=""                     # optional — without it the worker reads but cannot trade
SEED_TRADER_PRIVATE_KEYS=""                 # optional — comma-separated, one per strategy
RUN_SEEDS="false"                           # "true" runs the seed fleet in the same process
```

And `apps/web/.env.local` — see [`apps/web/.env.example`](apps/web/.env.example) for the full
set of `NEXT_PUBLIC_*` values. Use the **pooled** database URL here; the worker uses the
direct one.

```bash
npm run migrate -w @echonome/worker   # apply the schema
npm run web:dev                       # the app, on :3000
npm run worker:dev                    # watcher, mirror engine, settlement poller
```

Private keys belong only in `apps/worker/.env`, which is gitignored. They must never be set
on the Vercel project — the web app has no use for them, and anything that can run a build
can read them.

---

## Honest status

**Working, proven on live testnet:** the seed fleet trades, trades are recorded, markets
settle, edge and reliability compute, a follower's account was deployed and funded, real
orders were placed into it, and the custody guarantee is proven adversarially on chain.

**Not done:** testnet only, with test money. No security audit of the contract. No legal
review — copy-trading is a regulated activity in many jurisdictions. No external users.
Exposure caps, organic trader discovery, notifications and reorg handling are designed but
unbuilt.

[`TODO.md`](TODO.md) is kept honest about what is and isn't finished.

## Documents

| File | What's in it |
| --- | --- |
| [`PRD.md`](PRD.md) | What this is and the loop it runs on |
| [`TECHNICAL_ARCHITECTURE.md`](TECHNICAL_ARCHITECTURE.md) | How it's built, and the corrected on-chain flow |
| [`FEEDBACK.md`](FEEDBACK.md) | Every SDK and documentation trap we hit, with reproductions |
| [`TODO.md`](TODO.md) | The complete build, phase by phase |
| [`ROADMAP.md`](ROADMAP.md) | The narrative version of the same scope |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Hosting record and cutover |
