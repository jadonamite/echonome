# Echonome — Product Requirements

**Event:** Event Contracts Hackathon (Somnia × DreamDEX) · **Deadline:** Fri Sep 11, 2026, 18:00
**Status:** In build

This document covers the hackathon-scoped product (Phase 0). For the complete product —
everything Echonome becomes after the hackathon — see `ROADMAP.md`.

## What this is

Every trade is a sound. Every copy is its echo.

Echonome is copy-trading for DreamDEX's Event Contracts (Up/Down prediction markets on Somnia). A leaderboard ranks traders by **calibration** — how well their confidence matches reality — instead of raw P&L. Follow a trader, and Echonome mirrors their next trades into your own wallet, at your chosen size. Your funds never leave your own vault at any point.

## The problem

eToro proved the demand in 2010: most people would rather copy a good trader than become one. It's never been rebuilt right, because eToro's version bundles two trust problems that shouldn't travel together — trusting a leaderboard's honesty, and trusting a broker with your money.

Shareholder proxy voting solved the second problem over a century ago: you can grant someone the right to act on your behalf without ever handing them what's yours. DreamDEX's on-chain operator registry is that same mechanism, wired into a trading venue. Echonome grants itself exactly that right and nothing more — every order it places for a follower settles straight into that follower's own vault. It can never withdraw, never approve, never touch principal.

And because every trade and settlement lives on a public ledger, a trader's calibration score is computed from a record nobody — including Echonome — can quietly curate after a bad week.

## Who it's for

- Users who want exposure to DreamDEX Event Contracts without learning to trade them
- Traders who want their track record measured honestly, not just by whoever got lucky last week

## Core loop (P1 — the MVP)

1. User opens Echonome, sees a leaderboard ranked by calibration score.
2. The leaderboard is seeded on launch with DreamDEX's own official bot-kit trading strategies, running live and clearly labeled as seed traders.
3. User connects a wallet, deposits into their own DreamDEX vault, and grants Echonome a scoped operator permission — one on-chain transaction, place/cancel orders only, no withdrawal rights, ever.
4. User taps "Copy" on a trader and sets a size fraction.
5. The next time that trader opens a position in a live 1-hour Event Contracts market, Echonome detects it on-chain and mirrors it into the follower's own vault — the echo.
6. When the market settles, the follower sees their own result (win/loss, size, market) in plain language, and the trader's calibration score updates.
7. The follower can revoke at any time; the next echo simply doesn't happen.

## Scope

**In scope (P1):** the loop above, on the 1-hour Event Contracts cadence for BTC and ETH, on Shannon testnet.
**In scope (P2, if time allows):** reliability breakdown per trader, per-follower exposure caps across multiple copies.
**In scope (P3, stretch):** organic (non-seed) traders joining the leaderboard once they clear a sample threshold; on-chain publishing of calibration scores.
**Out of scope:** other cadences (5m/15m/4h/24h), copying more than one trader at once, mobile app, any points/token/fee economy, mainnet deployment.

## What "done" looks like for P1

- A user can go from wallet connect to a settled, visible mirrored trade with no manual chain interaction beyond the two signed transactions (grant, and — automatically after that — nothing further required of them).
- Attempting to withdraw or approve funds as the operator fails on-chain, provably.
- A trader never shows a calibration rank on fewer than 20 resolved decisions — shown as "warming up" instead.
- Everything shown in the demo is real: real testnet transactions, real settlements, no mocked data.

Full detail lives in the technical architecture doc and the task list.
