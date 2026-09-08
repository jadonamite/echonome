# Technical Architecture

Companion to `PRD.md` and `TODO.md`. This is the how.

## Repo layout (npm workspaces)

```
echonome/
  apps/
    web/        # Next.js (TS, Tailwind, App Router) — frontend lane
    worker/     # Node/TS, always-on — backend lane
  packages/
    shared/     # TS types both apps import — the contract between the two lanes
```

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Contracts | One, ours: `EchoAccount` (+ factory) | Not the original plan — DreamDEX's operator path is closed to us on Event Contracts, so a follower-owned account contract is the only non-custodial way to place their orders. See "The on-chain flow" below. Everything else (`BinaryMarketsModule`, the pools, `BinarySettlement`) we consume as-is via the SDK |
| Chain | Somnia Shannon testnet, chain id `50312` | Event-mandated |
| SDK | `@somnia-chain/markets-sdk` (viem-based) | The only supported path to Event Contracts — there is no REST API for this market type. Call `loadMarkets(true)`: a bare `loadMarkets()` early-returns a cache, which cost us a silent hour of lost data |
| Frontend | Next.js + TypeScript + Tailwind | `apps/web` |
| Wallet | wagmi + viem | Direct testnet wallet connect, no embedded-wallet layer |
| Backend | Node/TS worker, long-running | `apps/worker` — chain watching doesn't fit a serverless function's timeout |
| Database | Postgres | Shared between worker (writes) and Next.js API routes (reads) |
| Solidity toolchain | npm `solc` + viem for deploy | No Foundry: the repo is already npm/TS, and contracts get verified against live Shannon the same way everything else here does |
| Hosting | Vercel (web) · Railway (worker) | Railway is the bot kit's own documented pattern for 24/7 bots on this SDK |

## The split

**Worker (backend lane) writes.** It runs seed traders, watches on-chain fills, mirrors trades, tracks settlements, and computes calibration scores. It is the only thing that ever touches the chain on Echonome's behalf — as the read-only fill-watcher, and as the *executor* triggering a follower's own `EchoAccount`. Never as a fund holder: the executor key cannot move a token out of any account it triggers.

**Next.js (frontend lane) reads, and handles user-signed writes.** API routes under `apps/web/app/api/*` read from the same Postgres the worker writes to. The on-chain actions a *user* must sign directly from their own wallet — deploying their `EchoAccount`, funding it, and setting its caps and expiry — happen in the browser via wagmi/viem, never proxied through our own backend. Everything after that (which trader they're copying, at what size) is a plain database write via our own API.

This split means: **the frontend never holds or forwards a private key**, and **the worker never asks a user to sign anything**.

## Data model (Postgres)

```sql
-- see apps/worker/src/db/schema.sql for the authoritative version

Trader (
  id, address, label, is_seed boolean, created_at
)

Decision (
  id, trader_id -> Trader, market_id, side, -- 'up' | 'down'
  implied_probability, settled_outcome, resolved_at, created_at
)
-- index (trader_id, created_at)

CalibrationScore (
  trader_id -> Trader (unique),
  brier_score, reliability jsonb, sample_count, computed_at
)

ProxyGrant (
  id, follower_address, operator_address, scope,
  account_address,  -- the follower's EchoAccount; NULL on rows predating it
  granted_at, revoked_at nullable
)
-- index (follower_address)
-- Kept under its original name: it still means "this follower has authorised our
-- executor, and here is how to reach the thing that authorises it". What changed is
-- WHERE the authorisation lives — their own account contract, not a DreamDEX registry.

CopyLink (
  id, proxy_grant_id -> ProxyGrant, trader_id -> Trader,
  size_fraction, active boolean, created_at
)
-- index (trader_id, active)

Echo (
  id, copy_link_id -> CopyLink, source_decision_id -> Decision,
  market_id, side, size, status, -- 'pending' | 'settled' | 'missed' | 'failed'
  failure_reason, settled_outcome, tx_hash, created_at
)
-- index (copy_link_id, created_at)
```

**A trader only appears ranked on the leaderboard once `sample_count >= 20`.** Below that, the API returns them with a `warmingUp: true` flag — show that state, don't hide the trader entirely.

## API surface (frontend-owned, in `apps/web/app/api/`)

All read from Postgres directly (no separate backend API server — the worker and Next.js share one database).

| Route | Method | Returns |
|---|---|---|
| `/api/leaderboard` | GET | Traders + calibration scores, ranked; `warmingUp` traders separated or flagged |
| `/api/traders/:id` | GET | One trader, their decision history, reliability breakdown |
| `/api/copy-links` | POST | Creates a `CopyLink` under an existing `ProxyGrant` — `{ proxyGrantId, traderId, sizeFraction }` |
| `/api/copy-links/:id` | DELETE | Sets `active = false` — the worker's mirror engine checks this before every echo, so revocation is effective on the next detected fill, not on a poll interval |
| `/api/me/echoes` | GET | The connected wallet's echo history with settled outcomes, in plain language — no raw tx data as the primary display |

## The on-chain flow — corrected 2026-09-09

**The flow this section used to describe cannot work, and that is proven, not suspected.**
It had a follower sign an operator grant (`setOperatorApprovalGlobal`) and then had our
operator wallet place orders for them via `BinaryPool.placeBinaryOrderFor`. Event Contract
pools do not consult DreamDEX's `OperatorPermissionsRegistry` at all: with both a global and
a per-pool grant recorded live for the correct selector, that call still reverts
`OnlyApprovedContracts`, and it reverts identically when the owner calls it for themselves.
Reproduce with `npm run verify:operator-gate`. Full account in `FEEDBACK.md`.

So the direction of the call has to invert. Instead of *Echonome placing an order for the
follower*, the follower gets **a small contract that places its own orders**, and Echonome is
allowed to pull its trigger under tightly scoped conditions.

### Why this is the only shape available

`placeBinaryOrder(...)` — the ordinary, unrestricted entry point — always places an order
owned by `msg.sender`. There is no third-party variant we are permitted to call. Therefore
whatever holds the follower's trading collateral must *itself* be the caller. An EOA (an
ordinary wallet) cannot be a caller on someone else's behalf without handing over its private
key, which is the one thing this product must never do. A contract can: it can be owned by
one party and triggered by another, with the split written into its code rather than into a
promise.

### `EchoAccount` — one per follower

```
     follower's wallet                 EchoAccount (they own it)              BinaryPool
     ─────────────────                 ──────────────────────────             ──────────
     deposit collateral   ──────────▶  holds tUSDC + outcome tokens
     set caps / expiry    ──────────▶  allowedPool, maxOrderCollateral,
                                       totalCollateralCap, executorExpiry
     withdraw             ◀──────────  onlyOwner — always, unconditionally

     Echonome's engine    ──────────▶  placeOrder()  ── onlyExecutor ──────▶  placeBinaryOrder
                                       reverts unless: not paused,
                                       within expiry, pool allowlisted,
                                       inside both collateral caps
```

**What the executor (our engine wallet) can do:** call `placeOrder` and `cancelOrder`, and
only while every one of the owner's conditions holds.

**What the executor provably cannot do:** move a single token out. `withdraw` is
`onlyOwner`, full stop — not by policy, by the absence of any code path that would let
anyone else reach it. It cannot raise its own caps, extend its own expiry, add a pool, or
unpause itself. The custody guarantee is now *stronger* than the operator-grant design it
replaces, because it is enforced by a contract we publish and the follower can read, rather
than by a registry whose semantics we discovered by experiment.

**The owner's kill switches, in increasing severity:** `pause()` stops new orders
immediately; letting `executorExpiry` lapse does the same on a timer with no action needed;
`revokeExecutor()` is permanent. All three are `onlyOwner` and none of them need our
cooperation or our uptime.

### Scoping decisions, and the one uncomfortable caveat

- **Per-order and cumulative collateral caps.** A per-order cap bounds a single mistake; a
  cumulative cap bounds a compromised executor key making many correct-looking small ones.
  Both are needed; either alone has an obvious hole.
- **An expiry, not a perpetual grant.** A permission the follower has forgotten about is a
  permission they have not consented to. It lapses and they renew it deliberately.
- **A pool allowlist — with a caveat worth stating plainly.** Event Contract pool addresses
  are a *time-varying* binding: the same pool address is re-bound to a new market when the
  cadence window rolls, which we observed directly (`0x0229bdd2…` served more than one
  window). So allowlisting a pool address does not scope the grant to one *market* — it
  scopes it to that pool's future windows too. This is why the caps and the expiry carry the
  real security weight and the allowlist is a coarse filter, not the guarantee. Documented
  here rather than glossed, because a follower reading a promise of "one market only" would
  be reading something untrue.

### What the follower signs, and when

1. **Deploy** their `EchoAccount` (one transaction, via a factory so the address is knowable
   in advance). They own it from the constructor.
2. **Fund** it with tUSDC, and approve the pool to pull from it.
3. **Configure** caps, expiry, and allowed pools — one transaction, and the only place their
   risk appetite is expressed.

After that, copying a trader is still a plain database row and revoking is still instant.
Nothing about the follower-facing product changes; the trust story gets better and the setup
costs one contract deployment.

### What this costs us, honestly

A contract per follower is real friction — a deployment, gas, and an unfamiliar mental model
compared to "sign this approval". The alternative is asking DreamDEX to allowlist our engine
as a protocol system contract, which is a conversation with a counterparty rather than
something we can build, and which would make us a privileged actor on their venue — a worse
trust story even if they said yes. Two other teams building agents on this venue converged
on the same account-contract shape independently.

**The rule that does not move:** no flow where our backend holds, requests, or transmits a
user's private key or seed phrase. The whole pitch depends on that being physically
impossible rather than promised, and this design keeps it that way.

## Design constraints

Per this project's design mandate: no soft/generic gradients, no pure-white backgrounds, no "3 cards in a row" / bento-grid defaults, no Lucide/sparkle icon clichés, no skeleton loaders as a crutch for empty states — build real empty/loading/error states instead (a "warming up" leaderboard row is a first-class state, not a placeholder to hide). Real product demos only — the seed traders are real, on-chain, and their data should look and feel real from the first screen.

## Environment variables (`apps/worker/.env`, not committed)

```
DATABASE_URL=
SHANNON_RPC_URL=https://api.infra.testnet.somnia.network
SHANNON_INDEXER_URL=https://dev.smk.somnia.host/v1/graphql
EC_VENUE_ID=0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c
OPERATOR_PRIVATE_KEY=   # dedicated fresh testnet wallet — never reused, never a real-value key
SEED_TRADER_PRIVATE_KEYS=   # comma-separated, one per seed strategy
```

`apps/web` needs only public values (chain id, RPC URL, contract addresses) — no private keys ever ship to the frontend.
