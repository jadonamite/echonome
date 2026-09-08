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

## 2026-09-08 — Exact operator-order call shape not directly confirmed

`OperatorPermissionsRegistry`'s `placeOrderFor`/`cancelOrderFor` pattern is documented in the
bot kit's `docs/session-keys.md`, and the SDK's order-param types carry optional `owner`/
`operatorId` fields consistent with it — but the precise call wired into `mirror/engine.ts`
is a best-evidenced placeholder, not yet checked against the bot kit's own `packages/core`
source. First thing to confirm once seed-trader wiring starts.

---

_Add to this file as things come up — don't wait until submission to remember what was hard._
