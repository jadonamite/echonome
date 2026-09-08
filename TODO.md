# TODO — The Complete Build

See `PRD.md` for what/why, `TECHNICAL_ARCHITECTURE.md` for how, `ROADMAP.md` for the
narrative version of this same scope. This is the full product — every phase below is real
work on the plan, not a "someday" list.

*Reference only, not a scope boundary: the Event Contracts Hackathon (Somnia × DreamDEX)
submission deadline is Fri Sep 11, 2026, 18:00. Noted here because it's a real external
date; it does not determine what's in this list or how it's ordered.*

`[BE]` = Jadon (worker/DB/chain) · `[FE]` = Sam-Rytech (Next.js/wallet/UI) · `[P]` = safe to do in parallel with its neighbors

---

## Phase 1 — Setup

- [x] `[BE]` Init npm workspaces monorepo — `package.json`, `apps/web/`, `apps/worker/`, `packages/shared/`
- [x] `[P]` `[FE]` Init Next.js app (TS, Tailwind, App Router) — `apps/web/`
- [x] `[P]` `[BE]` Init worker TS project — `apps/worker/`
- [x] `[P]` `[BE]` Shared domain types — `packages/shared/src/types.ts`
- [x] `[BE]` Provision Postgres, set `DATABASE_URL` — local Postgres 16, migrated, 6 tables live
- [x] `[BE]` Generate + fund operator and seed-trader wallets — 3 wallets, 50 STT each, verified on-chain

## Phase 2 — Foundational

- [x] `[BE]` DB schema — `apps/worker/src/db/schema.sql`
- [x] `[BE]` DB client — `apps/worker/src/db/client.ts`
- [x] `[BE]` SDK client wired to Shannon testnet + the Event Contracts venue — `apps/worker/src/chain/client.ts`
- [x] `[BE]` Fill watcher (`getUserFills` polling, not the flaky REST endpoint) — `apps/worker/src/chain/watcher.ts`
- [x] `[P]` `[FE]` wagmi/viem config — `apps/web/lib/wagmi.ts`
- [x] `[P]` `[FE]` Base layout + Tailwind theme scaffold — `apps/web/app/layout.tsx`
- [x] `[BE]` Confirmed integration: worker runs live against real testnet + DB with zero crashes across multiple poll cycles

## Phase 3 — Core Trading Loop

**Backend:**
- [x] `[BE]` Seed-trader runner (`ec-maker` + `ec-oracle-follow`, using the funded seed wallets) — `apps/worker/src/seeds/runSeedTraders.ts`, `ecMaker.ts`, `ecOracleFollow.ts`. **Live and running** — both strategies placing real orders on real 1h BTC/ETH testnet markets, accumulating calibration history right now.
- [x] `[BE]` Decision recorder on every seed-trader fill — `apps/worker/src/chain/watcher.ts`. **Verified end-to-end against real fills** — found and fixed a crash-on-first-fill bug (wrong side-value mapping), now stable across multiple real decisions with both `up` and `down` sides recorded correctly. See FEEDBACK.md.
- [x] `[BE]` Settlement poller — `apps/worker/src/chain/settlement.ts`
- [x] `[BE]` Calibration engine, retargeted from `delta-agent` (Brier score) — `apps/worker/src/calibration/engine.ts`
- [x] `[BE]` Mirror engine — confirmed call shape (`BinaryPool.placeBinaryOrderFor` via viem), 5-min expiry cutoff, fan-out to active `CopyLink`s — `apps/worker/src/mirror/engine.ts`
- [x] `[BE]` Echo settlement — `apps/worker/src/chain/settlement.ts`

**Frontend:**
- [x] `[P]` `[FE]` Leaderboard: ranked traders, sampleCount, "warming up" below 20 — `apps/web/app/page.tsx`, `apps/web/app/api/leaderboard/route.ts`. **Live against real data** — both seed traders ranked with real Brier scores, warming-up traders shown rather than hidden, each row carrying a trace of its recent calls.
- [x] `[P]` `[FE]` Trader profile: decision history — `apps/web/app/traders/[id]/page.tsx`, `apps/web/app/api/traders/[id]/route.ts`. Score, hit rate, full call log with the market price at entry and the settled result.
- [~] `[FE]` Wallet connect → vault deposit → proxy-grant flow — `apps/web/app/connect/page.tsx`. Connect and collateral steps work. **The grant step is blocked by the protocol, not by us** 🚧🚧 — the missing registry address turned out to be findable (`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`, read off a live spot pool, confirmed against DreamDEX's docs), and finding it proved the approach itself doesn't work: **Event Contract pools do not consult the OperatorPermissionsRegistry at all.** With both a global and a per-pool grant recorded live for the correct `placeBinaryOrderFor` selector (`0x5d97c566`), the call still reverts `OnlyApprovedContracts` — as it does when the owner calls it for themselves. Reproduce with `npm run verify:operator-gate`. The page states this plainly rather than recording an authorisation that grants nothing. See FEEDBACK.md.
- [x] `[FE]` Copy-follow flow (size fraction, creates `CopyLink`) — `apps/web/app/traders/[id]/copy-button.tsx`, `apps/web/app/api/copy-links/route.ts`. Verified end-to-end: creates, updates rather than duplicating a second link to the same trader, rejects an out-of-range size, and refuses to attach to a revoked grant.
- [x] `[FE]` Revoke flow — `apps/web/app/me/page.tsx`, `apps/web/app/api/copy-links/[id]/route.ts`, `apps/web/app/api/proxy-grants/route.ts`. Two distinct switches, on purpose: stop one copy, or revoke the whole grant (which deactivates every copy under it). Verified: after revoking, a new copy under that grant is refused.
- [x] `[FE]` My Echoes: plain-language settled outcomes — `apps/web/app/me/page.tsx`, `apps/web/app/api/me/echoes/route.ts`. Every status reads as a sentence, including `failed` with its reason — "nothing happened" is the one outcome a copy-trading product must never leave unexplained.

## Phase 4 — Trust & Transparency

- [x] `[BE]` Reliability-bucket computation — `apps/worker/src/calibration/engine.ts`, plus `npm run recompute` to rescore everyone when the maths changes. **Immediately paid for itself on real data:** ec-maker's single Brier of 0.30 hides that it is *inverted at the top end* — right 63% of the time when it claims 30%, and right 0% of the time when it claims 70%. That is actionable; "0.30" is not. The `calibration_score.reliability` jsonb column had been storing `'[]'` since day one. Both seed traders currently sit within a whisker of 0.25, which a single number renders as "coin flip" and tells a follower nothing — buckets are what distinguish "genuinely uninformative" from "confidently wrong at the extremes and fine in the middle" 
- [x] `[FE]` Reliability diagram + full decision log on trader profile — `apps/web/app/traders/[id]/page.tsx`, `apps/web/components/reliability-diagram.tsx`. Marks sized by sample count so a two-call band doesn't look as authoritative as a two-hundred-call one; the same numbers in a table beneath, so the chart is never the only way to read them; and a plain-language verdict per band that refuses to judge a thin sample at all
- [ ] `[BE]` Per-follower exposure cap enforcement (across all of a follower's active copies) — `apps/worker/src/mirror/engine.ts`
- [ ] `[FE]` Exposure cap setting in copy-follow flow — `apps/web/app/traders/[id]/copy-button.tsx`
- [x] `[FE]` Pause-without-revoking a copy link (distinct from full revocation) — `apps/web/app/me/page.tsx`, `apps/web/app/api/copy-links/[id]/route.ts`. `PATCH { active }` alongside the `DELETE`; landed with the Phase 3 revoke flow because they are the same control.

## Phase 5 — Full Trader Ecosystem

- [ ] `[BE]` Every cadence, not just 1h — 5m/15m/4h/24h, each with its own latency budget and sample-size threshold — `apps/worker/src/chain/client.ts`, `apps/worker/src/mirror/engine.ts`, `apps/worker/src/calibration/engine.ts`
- [ ] `[FE]` `[BE]` Copying more than one trader at once — a real multi-`CopyLink` portfolio per follower with per-trader and total exposure caps
### Follower account contract — the unlock

Everything else in the product is downstream of this: until it exists the mirror engine
cannot place a single real echo. Design and rationale in `TECHNICAL_ARCHITECTURE.md`
("The on-chain flow — corrected 2026-09-09").

- [ ] `[BE]` Solidity toolchain in-repo — npm `solc` + a viem deploy script, no Foundry (the repo is already npm/TS) — `packages/contracts/`
- [ ] `[BE]` `EchoAccount.sol` — owner/executor split. Executor: `placeOrder`, `cancelOrder`. Owner only: `withdraw`, `setCaps`, `setAllowedPool`, `setExecutorExpiry`, `pause`/`unpause`, `revokeExecutor`. Guards on every executor call: not paused, inside expiry, pool allowlisted, per-order cap, cumulative cap
- [ ] `[BE]` `EchoAccountFactory.sol` — CREATE2 so the frontend can show a follower their account address before they pay to deploy it, and so a redeploy can never silently produce a second account
- [ ] `[BE]` Outcome-token and collateral plumbing — the account must approve the pool to pull tUSDC, hold ERC-6909 outcome tokens, and be able to `redeem` a settled position so proceeds land back where only the owner can withdraw them
- [ ] `[BE]` Contract tests against live Shannon — the adversarial ones are the point: executor cannot withdraw, cannot raise its own caps, cannot extend its own expiry, cannot add a pool, cannot act after `pause()`, cannot act after expiry, cannot act after `revokeExecutor()`. Owner can withdraw in every one of those states
- [ ] `[BE]` Deploy the factory to Shannon, record the address, and make it a public constant so a follower can verify what they are deploying
- [ ] `[BE]` Rework `mirror/engine.ts` from `pool.placeBinaryOrderFor(owner, …)` to `account.placeOrder(…)`, keeping the idempotency, rate limit, kill switch and `failed`-state handling already built
- [ ] `[BE]` DB: `proxy_grant.account_address`, plus reading caps/expiry so the engine can skip an account that would revert instead of burning gas discovering it
- [ ] `[FE]` `/connect` rebuilt around deploy → fund → configure, replacing the grant step that cannot work. The caps and expiry screen is where a follower states their risk appetite, so it is the most important screen in the product and gets written like it
- [ ] `[FE]` `/me`: show the account address, its balance, its caps, its expiry and a countdown, with pause and revoke as first-class buttons
- [ ] `[BE]` **First real echo, end to end, on chain** — a seed trader fills, and a follower's account places the mirrored order. This is the milestone the whole build has been pointing at
- [ ] `[BE]` Re-point `verify:custody` at the new design: prove on chain that the executor cannot move a follower's funds. Same claim as before, now provable — this is the demo-video moment

- [ ] `[BE]` Organic-trader discovery: a non-seed wallet that clears the sample threshold gets indexed automatically — `apps/worker/src/seeds/organicDiscovery.ts`
- [ ] `[FE]` `[BE]` Trader opt-in/consent flow — a real trader chooses to be public and followable rather than being silently indexed; profile + bio
- [ ] `[BE]` On-chain publishing of calibration scores + tombstones, so other apps/agents can consume Echonome's rankings trustlessly — `apps/worker/src/calibration/publish.ts`
- [ ] `[FE]` `[BE]` Notifications — a follower learns when their copied trader opens a position, when an echo settles, when a trader goes inactive

## Phase 6 — Reliability & Safety Hardening

- [x] `[BE]` Idempotency — real unique indexes, not app-level races: `(trader_id, fill_id)` on `decision`, `(copy_link_id, source_decision_id)` on `echo`, both enforced with `ON CONFLICT ... DO NOTHING` at the query site — `apps/worker/src/db/schema.sql`, `chain/watcher.ts`, `mirror/engine.ts`
- [x] `[BE]` **Liveness alerting — alert on absence, not on errors.** Built: `apps/worker/src/health/` + `npm run health` (exit 0/1/2, wireable straight into an uptime probe). A `worker_heartbeat` table each loop stamps *after* its work, so a wedged loop reads as stale rather than healthy. Checks are pure functions tested against all six real incidents this project has had. **It earned itself immediately** — within minutes of existing it caught a regression I had just introduced (a `loadMarkets(true)` with nothing catching it aborted the whole watcher tick on a transient indexer blip: 68 failed ticks, 20 minutes of lost decisions), and running it against live data exposed a flaw in one of its own checks. Original entry follows for the record: **Liveness alerting** Every defect found so far (four on 08 Sep, two more on 09 Sep) presented as a healthy process writing nothing. A heartbeat table the worker stamps each tick, plus checks that fire when: no new decision in N minutes while a target market is live and has volume; no settlement in N hours while resolved markets exist; the watcher's last-seen fill timestamp falls behind chain head; echo failure rate over a threshold — `apps/worker/src/health/`
- [ ] `[BE]` Reorg handling — a confirmation-depth policy before treating a fill or a settled outcome as final
- [x] `[BE]` Partial-fill / failure-path handling — real `echo.status = 'failed'` + `failure_reason` column, populated on every caught error (order revert, rate limit) instead of just a log line — `apps/worker/src/mirror/engine.ts`
- [x] `[BE]` Rate limiting + a kill switch — 20 echoes/min sliding-window cap, `MIRROR_KILL_SWITCH` env var short-circuits all echoing — `apps/worker/src/mirror/engine.ts`
- [x] `[BE]` Live proof of the custody model — `npm run verify:operator-gate` (`apps/worker/src/testnetVerifyOperatorGate.ts`), read-only, reproduces on real testnet that an unauthorised operator cannot place an order for someone else. SC-001's "no grant blocks it" half is proven; the "a grant unblocks it" half is proven **impossible on this venue today**, which is a stronger and more useful result than the one we set out to get
- [ ] `[BE]` Real operator-key management — a secrets manager at minimum (Railway secrets), a KMS/HSM-backed signer before this ever touches real value, and a rotation plan
- [x] `[BE]` Automated tests — 16 passing (`npm test` in `apps/worker`): calibration engine (known inputs → known Brier scores), the exact side-mapping bug that crashed the watcher live, tick-price rounding. **Live, real-testnet SC-001/SC-005 proof** (`npm run verify:custody`) is half-done: no-grant-blocks is PROVEN on-chain; the grant step itself is blocked on a missing registry address — see FEEDBACK.md 🚧
- [~] `[BE]` Structured logging — JSON lines with level/component via `apps/worker/src/logger.ts`, wired into `watcher.ts` and `mirror/engine.ts` (the two money-adjacent paths). **`seeds/*.ts` and `settlement.ts` are still on plain `console.log`, and that directly cost us: the seed maker's 314 consecutive `OrderAlreadyExpired` reverts were invisible as a pattern because they were unstructured, untagged stack dumps in a 2 MB log.** Finish the wiring, and give every strategy tick a machine-countable outcome. Real error tracking (Sentry or equivalent) needs an account this worker doesn't have — flagged, not built

## Phase 7 — Business Model & Compliance

- [ ] Decide the revenue model — performance fee on profitable echoes (the standard copy-trading pattern), flat subscription, or a protocol-level arrangement with DreamDEX/Somnia given the trading volume this generates for them
- [ ] Regulatory review — copy-trading is a regulated activity in a meaningful number of jurisdictions; determine what "automatically placing trades on someone's behalf, non-custodially" actually triggers before this handles real value
- [ ] Terms of Service, Privacy Policy, and unavoidable risk disclosure before a follower's first copy (Event Contracts are a leveraged/binary product; copying inherits that risk)
- [ ] Trader-side terms — what a followed trader is agreeing to: visibility of their trading, no claim on their funds, and any revenue-share terms if one exists

## Phase 8 — Production Infrastructure & Operations

- [ ] `[BE]` Mainnet migration (chain id `5031`) — a deliberate cutover with its own security review and incident-response plan, not a flag flip
- [ ] `[BE]` Monitoring + alerting — uptime checks, watcher-falling-behind-chain-head alerts, echo-failure-rate alerts
- [ ] `[BE]` Move from polling onto the SDK's live WebSocket watches (`watchMarket`/`watchUser`) once correctness is proven — polling was a deliberate simplicity choice, not a permanent one
- [ ] `[BE]` Horizontal scaling of the worker — sharded by market/trader once volume demands it
- [ ] `[BE]` Database scaling — connection pooling, read replicas, backup + point-in-time-recovery policy
- [ ] `[FE]` `[BE]` API authentication + rate limiting on the internal API — currently open, fine for a single team, not for a public product
- [ ] CI/CD — automated typecheck/test/deploy on every push

## Phase 9 — Growth & Platform Maturity

- [ ] Mobile app — a copy-trading product's natural home once the web version is proven
- [ ] Admin tooling — manage seed traders, investigate a disputed echo, handle a compromised account, see system health at a glance
- [ ] Docs site — how ranking works, and how to consume the on-chain-published calibration scores (Phase 5)
- [ ] Multi-asset / multi-venue expansion — beyond BTC/ETH, and beyond DreamDEX if Somnia's Event Contracts ecosystem grows other venues
- [ ] Marketing site + brand build-out around "Every trade is a sound. Every copy is its echo."

## Phase 10 — Submission Packaging

Deliverables for the DoraHacks submission specifically — a real task group, not the finish line for the whole build.

- [ ] Deploy worker to Railway, verify it stays up
- [ ] Deploy web to Vercel, verify
- [ ] `README.md`: what it is, why it needs a chain, how to run it
- [ ] Demo video (2–3 min) — the core loop, no dead air, includes trying (and failing) to move a follower's funds as the operator, on camera
- [ ] DoraHacks submission form
- [ ] No AI watermark anywhere · commit identity is `jadonamite <jadonamite@gmail.com>`

---

## Dependencies

Setup → Foundational → Core Trading Loop (BE and FE lanes run in parallel once Foundational
lands) → Trust & Transparency → Full Trader Ecosystem, Hardening, and Business/Compliance can
proceed in parallel once the Core Loop is real → Production Infrastructure once there's real
usage to scale for → Growth once the platform is stable. Submission Packaging can happen
whenever the DoraHacks deadline requires a snapshot of whatever's built at that point — it
does not gate anything else in this list.

## Traceability

| Spec item (`specs/echonome/spec.md`) | Tasks |
|---|---|
| FR-001 | Calibration engine, Leaderboard |
| FR-002 | Chain client (cadence targeting), Seed-trader runner |
| FR-003 | Wallet connect → proxy-grant flow |
| FR-004 | Copy-follow flow |
| FR-005 | Mirror engine |
| FR-006 | Revoke flow |
| FR-007 | Wallet connect → proxy-grant flow (design); Hardening's SC-001-as-code test |
| FR-008 | My Echoes page |
| FR-009 | Seed-trader runner |
| FR-010 | Calibration engine, Leaderboard |
