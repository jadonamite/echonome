# Roadmap — Echonome, the Complete Product

The narrative companion to `TODO.md`'s checklist. Same scope, same phases, explained.

*Reference only, not a scope boundary: the Event Contracts Hackathon submission deadline is
Fri Sep 11, 2026, 18:00. It's a real date and it's noted here once. It does not determine
what's in this roadmap or which phase comes first — build logic does that.*

---

## Phase 1–2 — Setup & Foundational

The monorepo, the database, the chain client, the fill watcher. Done and verified: the
worker runs live against real Shannon testnet data and a local Postgres, tracking both live
1-hour BTC and ETH Event Contracts markets with zero crashes across sustained polling.

## Phase 3 — Core Trading Loop

The actual mechanism: a leaderboard ranked by calibration, a non-custodial proxy grant, a
copy-follow relationship, a mirrored trade, a settled and visible outcome. This is the
product's entire reason to exist — everything else either protects it, extends it, or helps
it reach people.

**Confirmed, not guessed, this session:** the exact on-chain calls for both halves of the
loop. The grant a follower signs is `Trader.setOperatorApprovalGlobal`, scoped to exactly two
selectors (`PLACE_ORDER_FOR_SELECTOR`, `CANCEL_ORDER_FOR_SELECTOR`) — a normal high-level SDK
call. The echo itself is a raw contract write, `BinaryPool.placeBinaryOrderFor`, found by
reading the SDK's actual runtime exports because no documentation shows a worked example of
it. Both are wired into working code, typechecked, and the worker has run against them live.

## Phase 4 — Trust & Transparency

A single Brier score is a claim. A reliability diagram — confidence buckets plotted against
what actually happened — is proof a skeptic can check themselves. This phase is what turns
"trust the ranking" into "verify the ranking," plus the exposure controls that keep a
follower's copying from silently compounding across multiple trades.

## Phase 5 — Full Trader Ecosystem

Everything the hackathon-scoped mechanism deliberately narrows for a first working version,
built out for real: every market cadence instead of just one hour, copying more than one
trader at a time, organic traders joining the leaderboard on their own merit (with real
consent and a real profile, not silent indexing), calibration scores published on-chain so
other apps and agents can trust Echonome's rankings without trusting Echonome's API, and
notifications so a follower doesn't have to keep the app open to know what's happening to
their money.

## Phase 6 — Reliability & Safety Hardening

The honest gap between "works in a demo" and "safe to run unattended for real people." The
mirror engine needs to be idempotent (a restart or a duplicate poll must never double-echo),
resilient to chain reorgs, and honest about failure (a reverted order needs a real status a
follower can see, not a silently swallowed exception). The operator key needs real secrets
management before it's trusted with anything beyond a testnet demo. None of this is optional
before real users are involved — it's the difference between a product and a prototype that
happened to work once on camera.

## Phase 7 — Business Model & Compliance

The part a hackathon demo gets to skip entirely and a real product cannot. Something has to
pay for running this, which means picking a revenue model — most likely a performance fee on
profitable echoes, matching how copy-trading platforms actually make money, though a
DreamDEX/Somnia partnership conversation is worth having too, since Echonome directly drives
their trading volume. And copy-trading is a regulated activity in real jurisdictions — eToro
operates under specific licenses because of this, not by choice — so this phase includes an
actual legal read before assuming either "we're fine because it's non-custodial" or "we're
not fine at all." Terms of service and risk disclosure aren't boilerplate here: Event
Contracts are a leveraged product, and copying inherits that risk whether or not the copier
understands it.

## Phase 8 — Production Infrastructure & Operations

Mainnet is a deliberate cutover, not a config flag — real funds change the security bar on
everything, starting with the operator key. This phase also covers the parts that only matter
at real scale: moving off polling onto the SDK's live WebSocket watches (a deliberate
simplicity trade-off early on, not a permanent architecture), horizontal scaling of the
worker, database scaling, monitoring and alerting so a stalled watcher gets caught in minutes
instead of when a follower notices their trade never happened, and CI/CD so deploys stop being
a manual dashboard click.

## Phase 9 — Growth & Platform Maturity

Mobile, because copy-trading products live on phones. Admin tooling, because "SSH in and check
the logs" doesn't scale past the first incident. A docs site, both for traders who want to
understand how ranking works and for third parties who want to consume the on-chain-published
scores. Expansion beyond BTC/ETH and beyond DreamDEX if Somnia's Event Contracts ecosystem
grows other venues worth including. And a real marketing site — "Every trade is a sound.
Every copy is its echo" is strong enough to build an identity around, not just pitch a judge
with.

## Phase 10 — Submission Packaging

The specific deliverables DoraHacks asks for — repo, README, demo video, the submission form
itself. A real task group like any other in this list, sized for whatever's actually built
when the deadline arrives, not the thing every other phase bends around.
