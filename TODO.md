# TODO — Hackathon Submission (Phase 0)

See `PRD.md` for what/why, `TECHNICAL_ARCHITECTURE.md` for how, **`ROADMAP.md` for
everything past this file** — this is only the slice that ships for the Fri Sep 11 deadline,
not the whole product. Deadline: **Fri Sep 11, 2026, 18:00**.

`[BE]` = Jadon (worker/DB/chain) · `[FE]` = Sam-Rytech (Next.js/wallet/UI) · `[P]` = safe to do in parallel with its neighbors

## Phase 1 — Setup

- [x] `[BE]` Init npm workspaces monorepo — `package.json`, `apps/web/`, `apps/worker/`, `packages/shared/`
- [x] `[P]` `[FE]` Init Next.js app (TS, Tailwind, App Router) — `apps/web/` *(scaffold only — builds clean, no product UI yet, that's Sam's build)*
- [x] `[P]` `[BE]` Init worker TS project — `apps/worker/` *(typechecks clean)*
- [x] `[P]` `[BE]` Shared domain types — `packages/shared/src/types.ts`
- [x] `[BE]` Provision Postgres, set `DATABASE_URL` — local Postgres 16 via Homebrew, migrated, all 6 tables live
- [x] `[BE]` Fund seed-trader wallets from the event testnet faucet — operator + 2 seed wallets generated and funded (50 STT each, verified on-chain)

## Phase 2 — Foundational (blocks everything below)

- [x] `[BE]` DB schema — `apps/worker/src/db/schema.sql` *(written, not yet applied — needs T005 first)*
- [x] `[BE]` DB client — `apps/worker/src/db/client.ts`
- [x] `[BE]` SDK client wired to Shannon testnet + the Event Contracts venue — `apps/worker/src/chain/client.ts` *(venue/cadence confirmed live against real testnet data)*
- [x] `[BE]` Fill watcher (polling `getUserFills`, not the flaky REST endpoint) — `apps/worker/src/chain/watcher.ts`
- [x] `[P]` `[FE]` wagmi/viem config — `apps/web/lib/wagmi.ts`
- [x] `[P]` `[FE]` Base layout + Tailwind theme scaffold — `apps/web/app/layout.tsx` *(structure only — the real design pass is Sam's, per the design mandate)*

Both T005 and T006 are now unblocked — DB is live, wallets are funded. Phase 1/2 fully code-complete and typechecked; the worker can be started for real.

**Checkpoint:** ✅ hit. Worker starts clean against real testnet + local Postgres, watcher confirms it's tracking both live 1h markets (BTC, ETH), survives multiple poll cycles with no crash. Nothing product-shaped yet — that's expected, correct.

## Phase 3 — P1 (the demo)

**Backend:**
- [ ] Seed-trader runner (`ec-maker` + `ec-oracle-follow`) — `apps/worker/src/seeds/runSeedTraders.ts` *(not started — needs the bot kit's exact operator-order call shape confirmed first, see mirror/engine.ts TODO)*
- [x] Decision recorder on every seed-trader fill — `apps/worker/src/chain/watcher.ts` *(written; unverified against a live DB/real fills — Phase 1 blockers above)*
- [x] Settlement poller — `apps/worker/src/chain/settlement.ts` *(written; the exact `winningOutcome` YES/NO mapping is a day-1 TODO — no resolved market was observed during the testnet probe to confirm it against)*
- [x] Calibration engine (retargeted from `delta-agent`) — `apps/worker/src/calibration/engine.ts` *(Brier score done; reliability buckets are P2/T025)*
- [x] Mirror engine (5-min expiry cutoff, fan out to active `CopyLink`s) — `apps/worker/src/mirror/engine.ts` *(operator-order call CONFIRMED against the SDK's real exports and wired via viem — `BinaryPool.placeBinaryOrderFor`, see FEEDBACK.md. Untested against an actual fill since no seed trader is placing orders yet — that's T013)*
- [x] Echo settlement — `apps/worker/src/chain/settlement.ts`

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
