# Echonome

Know which stock agents are right before you copy them.

bStocks are tokenized US shares on BNB Chain. They trade all night and all weekend while the stocks they track trade six and a half hours a day. Every trading day, Echonome's agents say how likely each stock is to open above the previous close. Echonome scores every call against what happened, and Governor sizes any trade you copy to the liquidity actually in the pools.

Built for BNB Hack: Tokenized Stocks Edition.

## What it shows

On 90 days of hourly data for 15 stocks, the bStock price at 09:00 New York time called the direction of the next open correctly on 74% of 858 stock-days. As a probability forecast it scores a Brier of 0.187. Saying 50% every time scores 0.25, and a coin flip at 65% scores 0.265. The board shows every agent, the controls included, with reliability diagrams and per-stock breakdowns.

## How it works

**The call.** For each stock and each US trading day: will it trade above the previous close at 10:00 New York time? The previous close is the Ondo per-share price at 16:00 on the prior trading day. Ondo's BSC tokens follow the share price through an oracle and do not trade in pools, so they are the reference. Calls lock at 09:00. Every token price is divided by its share multiplier first.

**The score.** Brier score: the mean of (probability minus outcome) squared. Lower is better. The replay walks nights in lock order and gives each agent only nights that settled before its own lock; a test fails if that ever breaks.

**The agents.** Night Tape turns the overnight gap into a probability, refitting its one parameter each night on settled history. Depth Aware trusts quiet nights less. Yesterday Again follows the previous day's direction. Fade the Night bets against the tape. Coin Flip and No View are controls.

**Governor.** Sizing borrows from BBR congestion control, which paces a sender at the measured bottleneck bandwidth instead of sending until packets drop. Governor takes the busiest recent hour of on-chain trading for the token (the bandwidth) and lets a trade use 10% of it, scaled by a probe cycle. It quotes every PancakeSwap pool at sizes from $10 to $50,000 and caps the trade where its price climbs more than 30 basis points above the best $10 price. Hard limits of $5,000 per trade and $20,000 a day hold whatever the model says. The desk shows which limit set the size.

**The trade.** The desk builds a PancakeSwap v3 swap in the browser, simulates it, and asks your wallet to sign. Approval is for the exact amount. Echonome never holds funds or keys.

## Data sources

| What | Where |
|---|---|
| Stock token lists, market status, token and share prices, multipliers | Binance Web3 RWA endpoints (public) |
| Hourly price and volume history | Binance Web3 token K-line endpoint |
| On-chain buy and sell volume over 5m, 1h, 4h, 24h | Binance Web3 token dynamic endpoint |
| Pool depth | PancakeSwap v3 quoter and v2 router on BSC |

## For agents: Agentic Wallet skill

`skills/echonome-governor/SKILL.md` is a skill for agents that trade with Binance Agentic Wallet (`baw`). Before any bStock buy, the agent asks Governor for the allowed size and caps the order to it. The same skill reads tonight's calls and the board.

JSON endpoints:

- `GET /api/governor?ticker=NVDA&usd=500&spent24h=0`: allowed size, limiting factor, pool, cost at that size, and the reasons in plain sentences.
- `GET /api/calls`: every agent's call for the next open, with the live tape.
- `GET /api/board`: agents ranked by Brier score.

## Run it

Node 22 or later.

```bash
npm install
npm run dev -w @echonome/web        # http://localhost:3000
npm test -w @echonome/stocks        # sessions, Governor and replay tests
```

Refresh the stored history (90 days, default tickers):

```bash
npx tsx packages/stocks/src/snapshot.ts apps/web/data/history.json 90
```

The web app appends the latest 300 hours from the API to the stored history on every revalidation, so new nights settle without a rebuild.

## Configuration

| Variable | Used by | Default |
|---|---|---|
| `BSC_RPC_URL` | Server-side pool quotes | `https://bsc-rpc.publicnode.com` |
| `NEXT_PUBLIC_BSC_RPC_URL` | Wallet reads and simulation in the browser | `https://bsc-rpc.publicnode.com` |

Binance blocks some regions, including the United States. Server routes that call it are pinned to Frankfurt (`preferredRegion = "fra1"`).

## Layout

```
packages/stocks/   Binance client, sessions, nightly calls and agents, Governor, pool depth probe, tests
apps/web/          Next.js app: board, tonight, desk, method, JSON API
apps/web/data/     Stored hourly history snapshot
skills/            Agentic Wallet companion skill
docs/              Developer experience report
apps/worker/       The earlier Somnia Event Contracts worker this project grew from
```

## Developer experience report

[docs/DEVELOPER_EXPERIENCE.md](docs/DEVELOPER_EXPERIENCE.md)
