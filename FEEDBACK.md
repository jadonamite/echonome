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

## 2026-09-08 — `winningOutcome` string values undocumented

No resolved market existed yet during initial testnet exploration, so the settlement
poller's YES/NO → up/down mapping is a reasoned inference (index 0 = YES, every observed
question phrased as the affirmative/upward condition), not an observed fact. **Needs
day-1 verification against a real resolved market** — flag it here if it turns out wrong,
don't just silently patch it.

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

## 2026-09-08 — 🚧 OPEN: the operator-registry address for setOperatorApprovalGlobal/ForPool isn't in the SDK's baked-in address book

Half-proven the full proxy-grant lifecycle live against testnet (`npm run verify:custody`,
`apps/worker/src/testnetVerifyCustody.ts`) and hit a real wall on the grant step itself:

**What's proven, for real, on-chain:** an operator with NO grant calling
`placeBinaryOrderFor(someOwner, ...)` reverts. Confirmed live. This is half of SC-001.

**What's blocked:** `Trader.setOperatorApprovalGlobal` / `setOperatorApprovalForPool` both
require `config.addresses.operatorPermissionsRegistry`, which does **not** exist as a field
in `SOMNIA_TESTNET_ADDRESSES` (confirmed — printed every key, it isn't there). Tried, in
order:
- `SOMNIA_TESTNET_ADDRESSES.marketsCore` as the registry address — the call now reaches the
  contract (no more "not configured" error) but reverts with an **undecoded** reason (no
  error name, `data: '0x'`) — meaning either `marketsCore` isn't actually the right contract
  for this specific call, or a precondition we haven't identified is failing.
- Checked the bot kit's own `scripts/operator-setup.ts` for a worked example — it uses a
  higher-level wrapper (`grantOperator(fund, pool, operator)`) from their own
  `@dreamdex-bot-kit/core` package, whose internals aren't visible in that script, so it
  doesn't reveal the real registry address either.
- Checked for an on-chain getter (`getOperatorPermissionsRegistry()`) on the pool contract
  itself — exists in `spotPoolOperatorRegistryReadAbi` but reverts when called on our binary
  pool (that ABI is spot-specific, doesn't apply to binary pools).

**Working theory, unconfirmed:** DreamDEX's `operatorId` concept (seen throughout market
metadata, e.g. `market.info.operatorId: 4`) may be a *different* system — venue/market-creator
registration (`OracleHubAdmin`'s sibling `OperatorAdmin` interface: `registerOperator`,
`createVenue`, etc.) — from the lightweight "let this bot trade for me" session-key grant our
product needs. If so, the grant call needs a precondition (operator registration) we haven't
found documented anywhere.

**Next step, not more guessing:** ask directly in the event's Telegram dev community
(link in `Hackathons/event-contracts.md`) for the correct `operatorPermissionsRegistry`
address on Shannon testnet, or the exact worked example DreamDEX uses internally. This is
exactly the kind of gap the event's own optional "SDK/docs feedback report" deliverable
exists for — worth including verbatim in the submission.

**Not blocking:** the mirror engine's actual echo-placement code (`mirror/engine.ts`) doesn't
need this to be *resolved* to be correct — it already assumes a valid grant exists and acts
accordingly. This only blocks *proving* the grant step live, and blocks T021 (the frontend's
grant flow) from being wired to a real working call until it's found.

---

_Add to this file as things come up — don't wait until submission to remember what was hard._
