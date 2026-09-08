# Roadmap — Echonome as a Complete Product

`TODO.md` covers only Phase 0 below — what ships for the Event Contracts Hackathon deadline
(Fri Sep 11, 18:00). That deadline is real and external; it doesn't move. But it's the
starting line, not the plan. This document is the whole thing: everything between a working
hackathon demo and a real, running, trustworthy product.

---

## Phase 0 — Hackathon submission (Fri Sep 11, 2026)

Scope: `TODO.md`. One cadence (1h), one asset pair set (BTC/ETH), two seed traders, single
active copy per follower, testnet only. This phase exists to prove the mechanism works and
win the hackathon — not to be the product.

---

## Phase A — Harden what shipped

Everything in Phase 0 is built to demo correctly once, on camera, under controlled
conditions. None of it is built to run unattended for real users. Before anyone but us
trusts it with actual funds (even testnet), it needs:

- **Idempotency on the mirror engine.** A watcher restart, a duplicate poll, or a retried
  transaction must not double-echo the same source decision. Right now there's no dedup key
  beyond "we haven't seen this fill's timestamp" — needs a real unique constraint
  (`source_decision_id`, `copy_link_id`) on `echo` and a proper upsert.
- **Reorg handling.** The watcher and settlement poller both trust whatever the indexer
  currently reports. A short reorg could flip a fill's existence or a market's settled
  outcome after we've already acted on it. Needs a confirmation-depth policy before treating
  anything as final.
- **Partial-fill and failure-path handling.** What happens when `placeBinaryOrderFor` reverts
  (insufficient collateral in the follower's vault, expired window, IOC finds no liquidity)?
  Right now it's a caught exception and a log line. Needs a real `Echo.status = 'failed'`
  state, a reason code, and something the follower actually sees instead of silence.
- **Rate limiting and circuit breakers.** Nothing currently stops a runaway loop (a bug, a
  compromised seed strategy, a bad price feed) from placing far more orders than intended.
  Needs a hard cap on echoes-per-minute per operator and a kill switch.
- **Operator key management.** A `.env` private key is fine for a hackathon demo, not for
  anything real. Needs a proper secrets manager (Railway secrets at minimum; a KMS/HSM-backed
  signer for anything handling real value) and a rotation plan.
- **Test coverage.** Zero automated tests exist right now. Needs: unit tests for the
  calibration engine (known inputs → known Brier scores), integration tests for the mirror
  engine against a local anvil fork, and a test that specifically tries to move a follower's
  funds as the operator and asserts it fails — SC-001 as code, not just a demo moment.
- **Structured logging + error tracking.** Console logs don't survive a Railway restart.
  Needs real structured logs and something like Sentry wired in before this runs unattended
  for more than a demo session.

## Phase B — Full feature completeness

Everything currently marked P2/P3/out-of-scope in `specs/echonome/spec.md`, actually built:

- **Every cadence, not just 1h** — 5m/15m/4h/24h Event Contracts, each with its own
  latency/sample-size tuning (a 5m market needs a much tighter mirror-latency budget than 1h;
  a 24h market needs a much longer accumulation window before a calibration score means
  anything).
- **Copying more than one trader at once** — a real portfolio of copies per follower, with
  per-trader and total exposure caps, not the single-`CopyLink` limitation Phase 0 ships with.
- **Reliability diagrams and full decision transparency** (P2 in the hackathon scope — build
  it properly here: bucketed confidence-vs-outcome charts, not just a single Brier number).
- **Organic trader discovery at real scale** — not just "a non-seed wallet passively clears
  the sample threshold." Real traders need profiles, opt-in consent to be followed (a trader
  should choose to be public, not be silently indexed), bios, and a way to see who's copying
  them.
- **On-chain calibration publishing** — the P3 stretch, done for real: periodic on-chain
  attestation of every ranked trader's score and sample count, so another app or agent can
  consume Echonome's rankings trustlessly without hitting our API.
- **Notifications** — a follower should know when their copied trader opens a position, when
  an echo settles, when a trader they follow gets unranked (drops below the sample floor
  again isn't possible by construction, but a trader going inactive should surface). Push
  and/or email, not just "check the app."
- **Unfollow/pause without full revocation** — right now revoking a `CopyLink` is the only
  lever; a real product needs "pause copying" without tearing down the on-chain proxy grant
  each time.

## Phase C — Business model & compliance

This is the part a hackathon demo can skip and a real product cannot.

- **Revenue model.** Something has to pay for running this — a performance fee on profitable
  echoes (the standard copy-trading model), a flat subscription, or a protocol-level
  arrangement with DreamDEX/Somnia (they benefit directly from the trading volume this
  generates — that's a real conversation to have with them, not just a technical add-on).
- **Regulatory review.** Copy-trading is a regulated activity in a meaningful number of
  jurisdictions — eToro itself operates under specific financial-services licenses because of
  this, not by choice. Before this handles real value for real users: what jurisdictions can
  it legally operate in, does automatically placing trades on someone's behalf (even
  non-custodially) trigger investment-adviser-style obligations, and what does the ToS need
  to say. This needs an actual legal read, not an assumption either way.
- **Terms of Service, Privacy Policy, and risk disclosures** — DreamDEX's Event Contracts are
  a leveraged/binary product; copying a trader doesn't remove that risk, it inherits it. Needs
  explicit, unavoidable risk disclosure before a follower's first copy, not buried in a footer.
- **Trader-side terms** — what a seed/organic trader is agreeing to by being followed
  (visibility of their trading, no claim on their funds, how they're compensated if a revenue
  share exists).

## Phase D — Production infrastructure & operations

- **Mainnet migration** — a deliberate, separate cutover (chain id `5031`), not a flag flip:
  real funds, real operator-key security requirements, a real incident-response plan before
  it happens.
- **Monitoring & alerting** — uptime checks on the worker, alerting when the watcher falls
  behind chain head, when the settlement poller stalls, when echo failure rate spikes.
- **Horizontal scaling** — the current worker is a single process polling everything. At real
  scale (many traders, many followers, every cadence), this needs sharding — by market, by
  trader — and likely a move from polling to the SDK's live WebSocket watches
  (`watchMarket`/`watchUser`), which the Phase 0 build deliberately skipped for
  implementation simplicity under time pressure.
- **Database scaling** — connection pooling tuned for real concurrency, read replicas once
  the leaderboard/profile read traffic matters, backup and point-in-time-recovery policy.
- **API rate limiting & abuse prevention** — the internal API is currently unauthenticated
  and unrated; a public product needs both.
- **CI/CD** — automated typecheck/test/deploy on every push, not manual `npm run build` and
  a Vercel/Railway dashboard click.

## Phase E — Growth & platform maturity

- **Mobile app** — explicitly out of scope for the hackathon; a copy-trading product's
  natural home is mobile-first once the web version is proven.
- **Admin tooling** — a real internal dashboard to manage seed traders, investigate a
  disputed echo, handle a compromised trader account, and see system health at a glance.
- **Docs site** — for organic traders who want to understand how ranking works, and for any
  third party who wants to consume the on-chain-published calibration scores (Phase B).
- **Multi-asset / multi-venue expansion** — beyond BTC/ETH, and potentially beyond DreamDEX
  if Somnia's Event Contracts ecosystem grows other venues worth including.
- **Marketing site & brand** — "Every trade is a sound. Every copy is its echo" is a strong
  enough line to build a real landing page and identity around, not just a hackathon pitch.

---

## How to read this

Phase 0 is what gets submitted Friday. Phases A–E are the actual product, in the order I'd
tackle them: harden before you extend, extend before you monetize, monetize before you scale
infrastructure for load that doesn't exist yet, scale before you diversify into new platforms.
That ordering is a recommendation, not a constraint — tell me if you want to reprioritize
(e.g., pull Phase C's revenue model earlier if a sponsor conversation with DreamDEX/Somnia
makes sense right after the hackathon, regardless of what "should" come first technically).
