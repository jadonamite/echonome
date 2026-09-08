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
- [ ] `[P]` `[FE]` Leaderboard: ranked traders, sampleCount, "warming up" below 20 — `apps/web/app/page.tsx`, `apps/web/app/api/leaderboard/route.ts`
- [ ] `[P]` `[FE]` Trader profile: decision history — `apps/web/app/traders/[id]/page.tsx`, `apps/web/app/api/traders/[id]/route.ts`
- [ ] `[FE]` Wallet connect → vault deposit → proxy-grant flow. **Confirmed call:** `Trader.setOperatorApprovalGlobal({ operator, selectors: [PLACE_ORDER_FOR_SELECTOR, CANCEL_ORDER_FOR_SELECTOR] })` — `apps/web/app/connect/page.tsx`
- [ ] `[FE]` Copy-follow flow (size fraction, creates `CopyLink`) — `apps/web/app/traders/[id]/copy-button.tsx`, `apps/web/app/api/copy-links/route.ts`
- [ ] `[FE]` Revoke flow — `apps/web/app/me/page.tsx`, `apps/web/app/api/copy-links/[id]/route.ts`
- [ ] `[FE]` My Echoes: plain-language settled outcomes — `apps/web/app/me/page.tsx`, `apps/web/app/api/me/echoes/route.ts`

## Phase 4 — Trust & Transparency

- [ ] `[BE]` Reliability-bucket computation (confidence-vs-outcome breakdown, not just one Brier number) — `apps/worker/src/calibration/engine.ts`
- [ ] `[FE]` Reliability diagram + full decision log on trader profile — `apps/web/app/traders/[id]/page.tsx`
- [ ] `[BE]` Per-follower exposure cap enforcement (across all of a follower's active copies) — `apps/worker/src/mirror/engine.ts`
- [ ] `[FE]` Exposure cap setting in copy-follow flow — `apps/web/app/traders/[id]/copy-button.tsx`
- [ ] `[FE]` Pause-without-revoking a copy link (distinct from full revocation) — `apps/web/app/me/page.tsx`, `apps/web/app/api/copy-links/[id]/route.ts`

## Phase 5 — Full Trader Ecosystem

- [ ] `[BE]` Every cadence, not just 1h — 5m/15m/4h/24h, each with its own latency budget and sample-size threshold — `apps/worker/src/chain/client.ts`, `apps/worker/src/mirror/engine.ts`, `apps/worker/src/calibration/engine.ts`
- [ ] `[FE]` `[BE]` Copying more than one trader at once — a real multi-`CopyLink` portfolio per follower with per-trader and total exposure caps
- [ ] `[BE]` Organic-trader discovery: a non-seed wallet that clears the sample threshold gets indexed automatically — `apps/worker/src/seeds/organicDiscovery.ts`
- [ ] `[FE]` `[BE]` Trader opt-in/consent flow — a real trader chooses to be public and followable rather than being silently indexed; profile + bio
- [ ] `[BE]` On-chain publishing of calibration scores + tombstones, so other apps/agents can consume Echonome's rankings trustlessly — `apps/worker/src/calibration/publish.ts`
- [ ] `[FE]` `[BE]` Notifications — a follower learns when their copied trader opens a position, when an echo settles, when a trader goes inactive

## Phase 6 — Reliability & Safety Hardening

- [x] `[BE]` Idempotency — real unique indexes, not app-level races: `(trader_id, fill_id)` on `decision`, `(copy_link_id, source_decision_id)` on `echo`, both enforced with `ON CONFLICT ... DO NOTHING` at the query site — `apps/worker/src/db/schema.sql`, `chain/watcher.ts`, `mirror/engine.ts`
- [ ] `[BE]` Reorg handling — a confirmation-depth policy before treating a fill or a settled outcome as final
- [x] `[BE]` Partial-fill / failure-path handling — real `echo.status = 'failed'` + `failure_reason` column, populated on every caught error (order revert, rate limit) instead of just a log line — `apps/worker/src/mirror/engine.ts`
- [x] `[BE]` Rate limiting + a kill switch — 20 echoes/min sliding-window cap, `MIRROR_KILL_SWITCH` env var short-circuits all echoing — `apps/worker/src/mirror/engine.ts`
- [ ] `[BE]` Real operator-key management — a secrets manager at minimum (Railway secrets), a KMS/HSM-backed signer before this ever touches real value, and a rotation plan
- [x] `[BE]` Automated tests — 16 passing (`npm test` in `apps/worker`): calibration engine (known inputs → known Brier scores), the exact side-mapping bug that crashed the watcher live, tick-price rounding. **Live, real-testnet SC-001/SC-005 proof** (`npm run verify:custody`) is half-done: no-grant-blocks is PROVEN on-chain; the grant step itself is blocked on a missing registry address — see FEEDBACK.md 🚧
- [x] `[BE]` Structured logging — JSON lines with level/component via `apps/worker/src/logger.ts`, wired into `watcher.ts` and `mirror/engine.ts` (the two money-adjacent paths); `seeds/*.ts` and `settlement.ts` still on plain console output. Real error tracking (Sentry or equivalent) needs an account this worker doesn't have — flagged, not built

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
