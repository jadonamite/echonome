# TODO

See `PRD.md` for what/why, `TECHNICAL_ARCHITECTURE.md` for how. Deadline: **Fri Sep 11, 2026, 18:00**.

`[BE]` = Jadon (worker/DB/chain) · `[FE]` = Sam-Rytech (Next.js/wallet/UI) · `[P]` = safe to do in parallel with its neighbors

## Phase 1 — Setup

- [ ] `[BE]` Init npm workspaces monorepo — `package.json`, `apps/web/`, `apps/worker/`, `packages/shared/`
- [ ] `[P]` `[FE]` Init Next.js app (TS, Tailwind, App Router) — `apps/web/`
- [ ] `[P]` `[BE]` Init worker TS project — `apps/worker/`
- [ ] `[P]` `[BE]` Shared domain types — `packages/shared/src/types.ts`
- [ ] `[BE]` Provision Postgres, set `DATABASE_URL`
- [ ] `[BE]` Fund seed-trader wallets from the event testnet faucet

## Phase 2 — Foundational (blocks everything below)

- [ ] `[BE]` DB schema — `apps/worker/src/db/schema.sql`
- [ ] `[BE]` DB client — `apps/worker/src/db/client.ts`
- [ ] `[BE]` SDK client wired to Shannon testnet + the Event Contracts venue — `apps/worker/src/chain/client.ts`
- [ ] `[BE]` `OrderFilled` watcher, 1h BTC/ETH markets — `apps/worker/src/chain/watcher.ts`
- [ ] `[P]` `[FE]` wagmi/viem config — `apps/web/lib/wagmi.ts`
- [ ] `[P]` `[FE]` Base layout + Tailwind theme — `apps/web/app/layout.tsx`

**Checkpoint:** DB live, watcher sees real fills, wallet connects. Nothing product-shaped yet.

## Phase 3 — P1 (the demo)

**Backend:**
- [ ] Seed-trader runner (`ec-maker` + `ec-oracle-follow`) — `apps/worker/src/seeds/runSeedTraders.ts`
- [ ] Decision recorder on every seed-trader fill — `apps/worker/src/chain/watcher.ts`
- [ ] Settlement poller — `apps/worker/src/chain/settlement.ts`
- [ ] Calibration engine (retargeted from `delta-agent`) — `apps/worker/src/calibration/engine.ts`
- [ ] Mirror engine (5-min expiry cutoff, fan out to active `CopyLink`s) — `apps/worker/src/mirror/engine.ts`
- [ ] Echo settlement — `apps/worker/src/chain/settlement.ts`

**Frontend:**
- [ ] `[P]` Leaderboard page + API route — `apps/web/app/page.tsx`, `apps/web/app/api/leaderboard/route.ts`
- [ ] `[P]` Trader profile page + API route — `apps/web/app/traders/[id]/page.tsx`, `apps/web/app/api/traders/[id]/route.ts`
- [ ] Wallet connect → vault deposit → proxy-grant flow — `apps/web/app/connect/page.tsx`
- [ ] Copy-follow flow (size fraction, creates `CopyLink`) — `apps/web/app/traders/[id]/copy-button.tsx`
- [ ] Revoke flow — `apps/web/app/me/page.tsx`
- [ ] My Echoes page (plain-language outcomes) — `apps/web/app/me/page.tsx`, `apps/web/app/api/me/echoes/route.ts`

**Checkpoint: P1 demonstrable end to end — record the demo here, don't wait for P2/P3.**

## Phase 4 — P2 (if time allows)

- [ ] `[BE]` Reliability-bucket computation
- [ ] `[FE]` Reliability diagram + decision log on trader profile
- [ ] `[BE]` Per-follower exposure cap
- [ ] `[FE]` Exposure cap setting in copy-follow flow

## Phase 5 — P3 (stretch, cut first if the calendar slips)

- [ ] `[BE]` Organic-trader auto-registration past the sample threshold
- [ ] `[BE]` On-chain publishing of calibration scores

## Phase 6 — Submission (not optional, not compressible)

- [ ] Deploy worker to Railway, verify it stays up
- [ ] Deploy web to Vercel, verify
- [ ] `README.md`: what it is, why it needs a chain, how to run it
- [ ] Demo video (2–3 min) — the P1 path, no dead air, includes trying (and failing) to move a follower's funds as the operator, on camera
- [ ] DoraHacks submission form
- [ ] No AI watermark anywhere · commit identity is `jadonamite <jadonamite@gmail.com>`

---

**If Phase 2 isn't done by end of day Sep 8, cut Phase 5 first** — it's already scoped as stretch. Don't touch Phase 3/4 scope before that.
