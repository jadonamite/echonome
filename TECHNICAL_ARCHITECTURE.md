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
| Contracts | None new | We consume DreamDEX's existing `OperatorPermissionsRegistry` + `BinaryMarketsModule` + pool contracts directly via the SDK |
| Chain | Somnia Shannon testnet, chain id `50312` | Event-mandated |
| SDK | `@somnia-chain/markets-sdk` (viem-based) | The only supported path to Event Contracts — there is no REST API for this market type |
| Frontend | Next.js + TypeScript + Tailwind | `apps/web` |
| Wallet | wagmi + viem | Direct testnet wallet connect, no embedded-wallet layer |
| Backend | Node/TS worker, long-running | `apps/worker` — chain watching doesn't fit a serverless function's timeout |
| Database | Postgres | Shared between worker (writes) and Next.js API routes (reads) |
| Hosting | Vercel (web) · Railway (worker) | Railway is the bot kit's own documented pattern for 24/7 bots on this SDK |

## The split

**Worker (backend lane) writes.** It runs seed traders, watches on-chain fills, mirrors trades, tracks settlements, and computes calibration scores. It is the only thing that ever touches the chain on Echonome's behalf (as the read-only fill-watcher, and as the operator placing echoes — never as a fund holder).

**Next.js (frontend lane) reads, and handles user-signed writes.** API routes under `apps/web/app/api/*` read from the same Postgres the worker writes to. The two on-chain actions a *user* must sign directly from their own wallet — granting operator permission, and depositing into their vault — happen in the browser via wagmi/viem calling the DreamDEX SDK, never proxied through our own backend. Everything after that (which trader they're copying, at what size) is a plain database write via our own API.

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
  granted_at, revoked_at nullable
)
-- index (follower_address)

CopyLink (
  id, proxy_grant_id -> ProxyGrant, trader_id -> Trader,
  size_fraction, active boolean, created_at
)
-- index (trader_id, active)

Echo (
  id, copy_link_id -> CopyLink, source_decision_id -> Decision,
  market_id, side, size, status, -- 'pending' | 'settled' | 'missed'
  settled_outcome, tx_hash, created_at
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

## The on-chain flow the frontend drives directly

1. **Connect wallet** (wagmi) on Shannon testnet.
2. **Deposit into the user's own DreamDEX vault** — an SDK call, signed by the user's wallet. This is *not* a transfer to Echonome; it's the user funding their own vault on DreamDEX's contracts.
3. **Grant operator permission** — the user signs `Trader.setOperatorApprovalGlobal` (or the tighter `setOperatorApprovalForPool`, scoped to one market) from `@somnia-chain/markets-sdk`, naming Echonome's operator address and exactly two selectors: `PLACE_ORDER_FOR_SELECTOR` and `CANCEL_ORDER_FOR_SELECTOR` (both exported constants from the SDK — pass only these two, nothing else, so the operator can never call anything but place/cancel). Record the resulting on-chain grant as a `ProxyGrant` row via our API once the transaction confirms.

   **Confirmed, not guessed** (checked against the SDK's own runtime exports 2026-09-08): this grant call is a normal high-level `Trader` method — no raw ABI needed on the frontend. The *echo itself*, on the worker side, is lower-level: `BinaryPool.placeBinaryOrderFor(owner, kind, price, quantity, ...)`, a raw contract write the SDK's high-level `Trader.placeOrder` does not expose. See `apps/worker/src/mirror/engine.ts` for the exact call.
4. Everything after this is a database write (`CopyLink` create/delete) — no further signing required from the user until they want to revoke, which is also just a contract call against the same registry (instant, user-initiated).

**Do not build any flow where our backend holds, requests, or transmits a user's private key or seed phrase.** The entire pitch depends on this being physically impossible, not just a policy.

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
