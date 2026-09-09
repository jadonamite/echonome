# Echonome

> *Every trade is a sound. Every copy is its echo.*

Non-custodial copy-trading for DreamDEX's Event Contracts (Up/Down binary prediction markets on Somnia Shannon testnet). 

Echonome replaces raw, easily-faked P&L leaderboards with **empirical calibration scoring** (Brier score & reliability diagrams) and protects follower capital through smart-contract accounts (`EchoAccount.sol`) where funds never leave the user's custody.

---

## Live Deployments & Network Details

| Component | Host / Network | URL / Address |
| --- | --- | --- |
| **Web Frontend** | Vercel (Next.js 15) | [https://echonome-mu.vercel.app](https://echonome-mu.vercel.app) |
| **Cloud Worker & Fleet** | Render (Docker / Node 22) | [https://echonome-worker.onrender.com](https://echonome-worker.onrender.com) (`/healthz`) |
| **Database** | Neon Serverless PostgreSQL | AWS us-east-2 (Connection Pooling Enabled) |
| **24/7 Keep-Alive** | UptimeRobot | Pinging `/healthz` every 10 min |
| **Network** | Somnia Shannon Testnet | Chain ID `50312` |
| **EchoAccountFactory** | Shannon Testnet Contract | [`0xcee09039dc8020e01a12387eaa37b6a257b793d7`](https://shannon-explorer.somnia.network/address/0xcee09039dc8020e01a12387eaa37b6a257b793d7) |

---

## Key Innovations

### 1. Calibration Over Raw P&L
Most copy-trading platforms rank traders by recent P&L, which rewards reckless high-leverage gambles during bull runs. Echonome measures **statistical calibration**:
- **Brier Score Engine**: Scores how well a trader's subjective probabilities match true market outcomes (0.00 = perfect calibration, 0.25 = random guessing).
- **Reliability Diagrams**: Groups decisions into decile confidence buckets (e.g., when a trader quotes 70% probability, are they right 70% of the time?).
- **Sample Thresholds**: Traders with fewer than 20 resolved decisions are marked "Warming Up" and excluded from formal rankings until statistical significance is achieved.

### 2. Truly Non-Custodial Architecture (`EchoAccount.sol`)
Rather than holding user funds or asking for blanket private key delegation:
- Each follower deploys their own smart account via CREATE2 deterministic address calculation.
- **Strict Role Separation**:
  - **Owner (Follower)**: Holds exclusive rights to deposit, withdraw collateral (tUSDC), adjust spending caps, set expiration dates, and pause/revoke executor permissions.
  - **Executor (Echonome Worker)**: Only authorized to invoke `placeOrder` and `cancelOrder` within the user-defined per-order cap, cumulative budget, and expiration timestamp.
- **Adversarial Custody Proof**: Formally verified on-chain via 24 adversarial tests (`npm run verify:custody`) proving that the operator key cannot withdraw collateral, cannot raise caps, and cannot trade after revocation.

### 3. Active Seed Trader Fleet
Echonome is pre-seeded with 5 distinct automated algorithmic trading strategies continuously quoting Somnia testnet hourly BTC and ETH binary prediction markets:
1. `ec-maker`: Two-sided inventory-neutral market maker providing resting liquidity.
2. `ec-oracle-follow`: Directional taker following external price momentum feeds.
3. `ec-coinflip`: Uniform random baseline generator.
4. `ec-longshot`: High-payout tail-risk accumulator.
5. `ec-favourite`: Probability-heavy favorite consolidator.

---

## Technical Architecture

```
                                  +---------------------------------------+
                                  |         Somnia Shannon Testnet        |
                                  |            (Chain ID 50312)           |
                                  +-------------------+-------------------+
                                                      |
                         fills & settlements          | orders & cancellations
                                                      v
+-----------------------------+          +-----------------------------+
|    Next.js 15 Web App       |          |  Unified Worker & Seeds     |
|   (Vercel Edge / Node)      |          |     (Render Cloud Host)     |
|                             |          |                             |
| • Live Leaderboard          |          | • Fill Watcher (10s poll)   |
| • Reliability Diagrams      |          | • Settlement Poller (15s)   |
| • On-chain Account Manager  |          | • Health Monitor (60s)      |
| • Mirror Configuration      |          | • 5x Seed Algorithmic Fleet |
| • Plain-English Echo Log    |          | • HTTP Health Server (:1000)|
+--------------+--------------+          +--------------+--------------+
               |                                        |
               | read queries                           | heartbeats, decisions,
               | (pooler URL)                           | echoes (direct URL)
               v                                        v
       +-------------------------------------------------------+
       |               Neon Serverless Postgres                |
       |       Tables: traders, decisions, copy_links,         |
       |               echoes, calibration_scores,             |
       |               worker_heartbeats, proxy_grants         |
       +-------------------------------------------------------+
```

---

## Verification & Health Commands

All system components can be inspected and verified using in-repo CLI tools:

### 1. Verify Custody & On-Chain Security
Executes 24 on-chain adversarial transactions against Somnia Shannon testnet verifying that the operator cannot steal funds:
```bash
npm run verify:custody -w @echonome/contracts
```

### 2. Verify Cloud Worker & Database Liveness
Checks heartbeat age, active decision flow, and target market liquidity across database records:
```bash
npm run health --prefix apps/worker -- --facts
```

### 3. Run Test Suite
Runs unit and integration tests across calibration formulas, Brier scoring, and domain rules:
```bash
npm test --prefix apps/worker
```

---

## Project Monorepo Structure

- `apps/web/`: Next.js 15 App Router frontend with Tailwind CSS, wagmi/viem integration, and SVG reliability charts.
- `apps/worker/`: Long-running TypeScript worker process executing fill watcher, settlement poller, health monitor, HTTP health server, and seed bot fleet.
- `packages/contracts/`: Solidity source contracts (`EchoAccount.sol`, `EchoAccountFactory.sol`), compilation artifacts, and adversarial security test suites.
- `packages/shared/`: Shared domain models, TypeScript interfaces, and protocol constants.

---

## Local Development Setup

### Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- Access to Postgres instance (or Neon connection string)

### Steps
1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/jadonamite/echonome.git
   cd echonome
   npm install
   ```

2. **Configure Environment Variables**:
   - In `apps/worker/.env`:
     ```env
     DATABASE_URL="postgres://..."
     SHANNON_INDEXER_URL="https://shannon-indexer.somnia.network"
     SHANNON_WS_URL="wss://shannon-indexer.somnia.network/ws"
     EC_VENUE_ID="1"
     ECHO_ACCOUNT_FACTORY="0xcee09039dc8020e01a12387eaa37b6a257b793d7"
     OPERATOR_PRIVATE_KEY="0x..."
     SEED_TRADER_PRIVATE_KEYS="0x...,0x..."
     RUN_SEEDS="true"
     ```
   - In `apps/web/.env.local`:
     ```env
     DATABASE_URL="postgres://...?sslmode=require"
     NEXT_PUBLIC_FACTORY_ADDRESS="0xcee09039dc8020e01a12387eaa37b6a257b793d7"
     ```

3. **Run Schema Migrations**:
   ```bash
   npm run migrate --prefix apps/worker
   ```

4. **Start Development Servers**:
   - Web App: `npm run dev --prefix apps/web` (available at `http://localhost:3000`)
   - Worker: `npm run dev --prefix apps/worker`
