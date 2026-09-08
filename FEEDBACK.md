# Feedback — Challenges & Bugs

Running log of anything that cost real time or nearly caused a wrong build decision — for
this hackathon's optional "feedback report regarding SDK and documentation" deliverable, and
so nobody on this team re-discovers the same thing twice.

Format: **date — what happened — what it cost / what we did about it.**

---

## 2026-09-08 — DoraHacks event page blocks bots (HTTP 405)

Direct fetch to the event page returns 405. It's Nuxt server-rendered, so the full content
(rubric, timeline, prizes) is actually in the raw HTML — a plain `curl` with a normal
User-Agent reads it fine. No proxy or browser session needed once you know that.

## 2026-09-08 — Event Contracts have no REST API

DreamDEX's REST API (`api.dreamdex.io/v0`) is spot-only. Event Contracts have to be read via
`@somnia-chain/markets-sdk` against on-chain state/events — there's no `/v0/trades`-style
endpoint for this market type. Cost: an early assumption (from Somnia's general platform
docs) that REST covered everything had to be corrected before planning.

## 2026-09-08 — SDK function exports are misleading in isolation

Several documented functions (`listPastBinaryMarkets`, `getUserFills`, etc.) appear in the
package's `.d.ts` files but are **not** top-level exports — they only exist as bound
instance methods on `exchange.client` (`new SomniaMarkets(config).client.listPastBinaryMarkets(...)`).
Importing them directly from the package root throws `does not provide an export named ...`.
Cost: ~15 minutes of probing `Object.keys()` on a live client instance to find the real
surface. Fix: always go through `exchange.client.*`, never assume a `.d.ts`-listed function
is importable standalone.

## 2026-09-08 — Real market data confirms the venue/cadence ladder

Docs never state exact trading-window durations. Confirmed empirically by connecting to
Shannon testnet directly: the Event Contracts venue (`0x679795a0...8a28c`) runs 5m/15m/1h/4h/24h
cadences in parallel, two live markets per cadence (one BTC, one ETH). Built the whole
mirror-timing and calibration-sample-size design around this once it was real data instead of
a guess.

## 2026-09-08 — RESOLVED, and it was worse than "undocumented": `winningOutcome` is a NUMBER

The original entry here said the YES/NO → up/down mapping was a reasoned inference needing
day-1 verification against a real resolved market. It has now been verified, and the
verification found a live bug the inference itself had hidden.

**The inference was right.** Index 0 = YES = up, index 1 = NO = down — confirmed against
real finalized markets, and corroborated by the sibling `payoutNumerators`, which pays the
winning index and zeroes the other (`winningOutcome: 1` ↔ `payoutNumerators: ["0",
"10000000"]`). Every question on this venue is phrased affirmatively ("BTC closes at or
above its opening price"), so YES is definitionally Up.

**The type was wrong, and that broke everything downstream.** `winningOutcome` comes back
as a numeric outcome *index*, never the strings `"YES"`/`"NO"` the settlement poller was
comparing against. Nothing errored; every comparison simply returned false, so every
resolved market looked unresolved. Ninety minutes of live trading, 313 real decisions
recorded, and **not one was ever settled — so not a single calibration score was ever
computed.** The product's entire ranking signal was silently dead, and the only symptom was
an empty table.

Cost: the whole thing was invisible until someone queried the database and asked why
`settled_outcome` was null on every row. Lesson, and the reason this file exists: a
polling loop that filters on a value it never validates fails *silently* — no exception, no
log line, no alert. Assert the shape of an external value at least once against real data,
especially when a mismatch degrades to "do nothing" rather than to a crash. Guarded now by
`settlement.test.ts`, including the `Number(null) === 0` trap that would have settled every
open market as an Up win.

## 2026-09-08 — RESOLVED: operator-order call is not on the high-level Trader at all

Original guess (`exchange.trader.createOrder(..., { owner })`) was wrong — the unified
`SomniaMarkets.createOrder`'s `CreateOrderParams` has no `owner` field, full stop. Checked
the actual `Trader` interface in `trade.d.ts`: no `placeOrderFor` method exists there either.

**The real split, confirmed against the SDK's own runtime exports:**
- The **grant** (a follower approving Echonome's operator) IS high-level:
  `Trader.setOperatorApprovalGlobal({ operator, selectors: [PLACE_ORDER_FOR_SELECTOR,
  CANCEL_ORDER_FOR_SELECTOR], approved: true })`.
- **Placing an order for that owner is NOT high-level** — it's a raw contract write,
  `BinaryPool.placeBinaryOrderFor(owner, kind, price, quantity, expireTimestampNs,
  orderType, selfMatchingOption, builder, builderFeeBpsTimes1k, userData)`. The SDK exports
  its ABI as `binaryPoolWriteAbi` and the side enum as `ORDER_KIND` (`BUY_YES: 0, SELL_YES: 1,
  BUY_NO: 2, SELL_NO: 3`) — found by grepping the installed package's exports directly,
  since neither the docs nor the READMEs show a worked example of this specific call.

Cost: ~30 minutes of reading `.d.ts` files and probing `Object.keys()` on live SDK exports
to find a function that exists but isn't documented anywhere as a worked example. Fixed in
`apps/worker/src/mirror/engine.ts`, which now calls it directly via viem.

## 2026-09-08 — Prices must be tick-aligned; the pool reverts, doesn't round

`InvalidPrice(499500, 1000)` on the very first real order attempt. A price computed with
plain float math (mid − spread) doesn't land on the pool's price grid (multiples of 1000 raw
units = 0.001 human precision, matching the market's own `precision.price = 3`). The pool
reverts rather than silently rounding. Fixed by flooring every price to the nearest tick
before submission — see `toTickedPrice` in both seed strategies.

## 2026-09-08 — Seed wallets need collateral (tUSDC), not just gas (STT)

Funding wallets with native STT from the event faucet is necessary but not sufficient —
placing an actual order escrows the ERC-20 collateral token (`tUSDC`), and a wallet with 50
STT and zero tUSDC reverts with `ERC20InsufficientBalance`. The SDK ships its own
`trader.faucet()` (mints ~10,000 test USDC directly, no external faucet needed) — used it to
fund all three wallets. Worth documenting clearly for whoever sets up a wallet next: STT
alone looks like "funded" but isn't enough to actually trade.

## 2026-09-08 — RPC confirmation can time out on a transaction that still lands

The first `trader.faucet()` call threw a `realtime_sendRawTransaction` timeout — looked like
a failure. Checked the wallet's on-chain balance directly and the mint had actually gone
through; only the confirmation round-trip over the WebSocket RPC was slow. Lesson: on a
timeout, verify on-chain state before assuming the transaction failed and retrying blindly
(a retry that assumes failure risks a duplicate action if the original actually succeeded).

## 2026-09-08 — CRITICAL, found on the first real fill: wrong side value crashed the entire watcher

The fill watcher stored the SDK's raw `BinarySide` string (`"BUY_YES"`, lowercased to
`"buy_yes"`) directly into `decision.side`, which only accepts `'up'`/`'down'` — an
uncaught Postgres check-constraint violation on the very first real trade, which propagated
all the way up and killed the entire worker process (not just that one insert). The initial
`await tick()` call also wasn't wrapped in try/catch, so there was nothing between one bad
row and a full crash.

Fixed: a real `mapBinarySideToOutcome()` mapping (`BUY_YES`/`SELL_NO` → `up`,
`BUY_NO`/`SELL_YES` → `down`), and every per-fill insert now runs inside its own try/catch so
one malformed or unexpected fill can never take down the watcher again. This is exactly the
kind of thing Phase 6 (Reliability & Safety Hardening) in `ROADMAP.md` exists for — found
here earlier than planned, which is the point of testing against real data instead of trusting
types alone.

## 2026-09-08 — Maker's own refresh can self-cross (`SelfMatchCancelTaker`)

`ec-maker`'s cancel-and-requote cycle doesn't fully clear its own prior resting order before
posting a new one in every observed case, so the pool's self-match protection sometimes
cancels the new (taker) order instead of letting it rest. Non-fatal — caught, logged,
continues — but the cancel-refresh logic needs to be more reliably synchronous before this
strategy is trusted beyond a demo. Tracked for Phase 6 hardening, not blocking the core loop.

## 2026-09-08 — RESOLVED: the registry address was findable, and finding it proved the whole approach was wrong

This entry replaces an earlier one that recorded the missing
`operatorPermissionsRegistry` address as an open blocker to be asked about in the event
Telegram. Both halves turned out to be answerable without asking anyone.

### The address

**`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`** — OperatorPermissionsRegistry, Shannon
testnet (mainnet is `0xE7a190736B6024a4DbafadC04E283075877005ce`).

It is genuinely absent from `SOMNIA_TESTNET_ADDRESSES`, and the SDK says as much in a
doc comment on `client.getOperatorPermissionsRegistry`: *"no deployment manifest carries
the key yet."* But the same comment describes the way to get it — **ask a pool**. Spot
pools expose `getOperatorPermissionsRegistry()`; binary pools do not, which is why the
earlier attempt (asking our own binary pool) reverted and looked like a dead end.
Loading the market list and calling that getter on any of the three live SPOT pools
returns the address immediately, and all three name the same one. Later confirmed
letter-for-letter against DreamDEX's published Operators page, which tabulates both
networks — so it was documented all along, just not in the SDK and not anywhere the
Event Contracts material points at.

**Method worth keeping:** when an address is missing from an SDK's address book, ask a
deployed contract that must already know it rather than asking a human. The registry is
shared infrastructure; any pool wired to it can name it.

### The part that actually mattered

Having the address did not unblock the grant. It disproved it.

**Proven live on Shannon, not inferred.** With BOTH grants recorded on the registry for
our real operator, on the real live 1h BTC pool, for the exact
`placeBinaryOrderFor` selector —

```
isGloballyApproved: true
isApprovedForPool:  true
placeBinaryOrderFor: reverts OnlyApprovedContracts
```

— the call is still refused. The grants land (`receipt: success`), read back true, and
authorise nothing. Supporting evidence, all from the same session:

- The binary pool does not implement `isOperatorAuthorized(owner,operator,selector)` at
  all — it reverts. The spot pool answers it (`false`). That read is the exact check
  DreamDEX's own docs tell you to use to verify a grant, and a binary pool cannot answer it.
- `placeBinaryOrderFor` reverts `OnlyApprovedContracts` even when the OWNER calls it for
  themselves — so it is not a per-user permission check at all.
- The SDK says so outright, in a source comment in `dist/spot/operatorGrants.js` that
  does not appear in any `.d.ts` and therefore never surfaced in a type-driven search:
  *"SPOT-ONLY: the registry gates SpotPool's operator entry points (placeOrderFor and
  friends). **A BinaryPool escrows through the module and has no operator gate.**"*
- The official contract-function reference documents `SpotPool / OrderBook` only. The
  string "binary" does not appear in it once.

**Also settled: the selector we had was the wrong one anyway.** `PLACE_ORDER_FOR_SELECTOR`
(`0x80054449`) is spot's `placeOrderFor`, and a binary pool rejects that function with
`UseBinaryPlacement`. The binary equivalent is `placeBinaryOrderFor` = **`0x5d97c566`**,
which the SDK exports nowhere and which has to be derived from its own ABI.

### Has anyone else hit this

Yes — every team that tried to build an agent on Event Contracts, and none of them got
through it either:

- **`karagozemin/Circuit`** (`docs/INTEGRATION_SPIKE.md`, 4 Sep) reaches our exact
  conclusion, with the same two selectors and the same `OnlyApprovedContracts` selector
  `0x3fb0ba2e`, and files it as *"Binary Event Contracts do not use the user-managed
  SpotPool operator registry."* Their remaining-work list ends with "obtain dreamDEX
  system-contract approval" — i.e. a human at DreamDEX must allowlist you.
- **`FlemingJohn/dreamdex-desk`** reports the opposite conclusion — that per-pool grants
  buy "one window of delegated trading" before the pool address rotates. **Our live test
  says that is wrong**: we wrote exactly that grant, confirmed it on chain, and the call
  was still refused. Their resolution rule
  (`NOT denied AND (perPool OR (global AND registered))`) is correct and matches the
  published docs; it just describes the SPOT gate, which a binary pool never consults.
  Worth recording because it is the more attractive answer and it does not hold.
- **`Prashant-thakur77/tapflow`** filed it as SDK feedback: *"nothing in the Event
  Contracts section says whether the same OperatorPermissionsRegistry grants cover binary
  pools. We had to grep the ABI to find out."*

### What this means for Echonome

The mirror engine's design — an operator EOA calling `placeBinaryOrderFor` on a follower's
behalf — cannot work on Event Contracts today, for anyone, at any address. This is a real
protocol gap, not a configuration mistake, and it is the single most valuable thing we can
put in the event's SDK-feedback deliverable.

The workaround the other teams converged on is the same one: invert the call. Instead of
an operator placing *for* the user on the pool, the user gets a small account contract
they own and fund, which calls the plain `placeBinaryOrder` *as itself*, and which admits
our engine as a restricted executor (one pool, one selector, an expiry). Circuit calls
theirs `CircuitSmartAccount`; DreamPulse ships a `DreamPulseSessionAccountV2`. Custody
still never reaches us, which is the property the whole pitch rests on — it just costs a
contract per follower instead of a signature.

## 2026-09-08 — `fill.fillPrice` is raw quote units AND always YES-terms — two bugs from one field

Both halves of this field's contract are documented in the SDK's `.d.ts` files, and the
fill watcher got both wrong:

1. **Scale.** `fillPrice` is "raw quote units per whole base (binary: YES-probability
   scale)" (`fills.d.ts`). It was written straight into `decision.implied_probability`
   unscaled, so 313 live rows held values like `960000` in a column the calibration engine
   reads as a probability. Fix: divide by `10 ** quoteDecimals` (6 on every market on this
   venue), plus a `CHECK (implied_probability BETWEEN 0 AND 1)` so the database refuses the
   mistake rather than storing it.

2. **Frame.** "A binary fill's `fillPrice` is always YES-terms, so the NO leg enters at the
   complement" (`derivedReads.d.ts`). It is P(up) for a NO buy exactly as much as for a YES
   buy. The calibration engine assumed it meant "confidence in the side taken" and flipped
   it to `1 - p` for every `down` decision — inverting the forecast on a third of all rows.
   A wallet buying NO while YES trades at 0.96 is reading the market as 96% *up*; it was
   being scored as if it had said 4%.

Cost: neither bug could surface while nothing settled (see the `winningOutcome` entry
above) — three defects stacked so that the first one hid the other two. Worth saying
plainly: the calibration engine's own comment described the correct rule while the line
directly beneath it did the opposite. A comment is not a test.

## 2026-09-08 — CRITICAL: the fill watcher resolved its target markets once, at startup

`watchFills` computed the set of target market ids in its prologue and then polled that
same frozen list every 10 seconds forever. Event Contracts markets are *cadence-bounded* —
the 1h BTC/ETH pair we track is replaced by a brand-new pair of market ids on every hour
boundary. So at the top of the hour the watcher started polling two dead markets and
recorded nothing at all, for an hour, while the seed traders kept trading normally. No
error, no warning: `getUserFills` on an expired market is a perfectly valid query that
returns an empty array.

The seed runner right next to it reloads markets every tick and was always correct; only
the watcher had the frozen set. Fixed by refreshing the target set every tick, with a
15-minute retention window on markets that have just left the live set so the last fills on
an expiring market — which can reach the indexer after expiry — aren't dropped in the
rollover gap.

## 2026-09-08 — CRITICAL: the seed maker refused to quote into an empty book

`ec-maker` opened with `if (book.bids.length === 0 || book.asks.length === 0) continue`.
Every Event Contracts market opens with an empty book at its cadence boundary, so from the
first hourly rollover onward the maker skipped every new market — and `ec-oracle-follow`,
which needs a mid to compute momentum against, sat out behind it. Two hours of a "live"
seed fleet placing nothing.

Bootstrapping an empty book is the entire purpose of a seed maker, and a binary market
with no information in it prices at 0.5 by definition, so an empty book is a mid of 0.5 —
not a reason to abstain. Fixed with `midFromBook`, which also anchors a one-sided book to
the side that exists. This bug and the frozen-market-set bug above were mutually masking:
each one on its own would have produced *some* missing data, and together they produced a
clean, quiet, total stop.

**The pattern across all four of these, worth stating once:** every failure mode in this
session degraded to *doing nothing* rather than to an error. A stale market list, an
unmatched string comparison, and an empty-book guard all look identical from the outside —
a process that is up, logging nothing, and writing no rows. Uptime is not liveness. The
monitoring in Phase 8 should alert on *absence* (no new decisions in N minutes, no
settlements in N hours), not only on thrown errors.

---

_Add to this file as things come up — don't wait until submission to remember what was hard._
