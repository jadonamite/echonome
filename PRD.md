# Echonome — Product Requirements

**Status:** In build
*Reference: entered via the Event Contracts Hackathon (Somnia × DreamDEX), submission deadline Fri Sep 11, 2026, 18:00 — noted here once, not a scope boundary.*

This document covers the core product — what it is and the loop it runs on. For the full
build plan across every phase, see `TODO.md` (checklist) and `ROADMAP.md` (narrative).

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

## Core loop

1. User opens Echonome, sees a leaderboard ranked by calibration score.
2. The leaderboard is seeded on launch with DreamDEX's own official bot-kit trading strategies, running live and clearly labeled as seed traders, alongside organic traders as they qualify.
3. User connects a wallet, deposits into their own DreamDEX vault, and grants Echonome a scoped operator permission — one on-chain transaction, place/cancel orders only, no withdrawal rights, ever.
4. User taps "Copy" on a trader (or several, across the full trader ecosystem) and sets a size fraction.
5. The next time a followed trader opens a position, Echonome detects it on-chain and mirrors it into the follower's own vault — the echo.
6. When the market settles, the follower sees their own result (win/loss, size, market) in plain language, and the trader's calibration score updates.
7. The follower can revoke or pause at any time.

## Build phases

The full build — every phase from the initial mechanism through hardening, the complete
trader ecosystem, a real business model and compliance review, production infrastructure,
and growth — is tracked in `TODO.md` (the checklist) and `ROADMAP.md` (the narrative
explanation of each phase). Nothing here is a final cut; those two documents are current.

## What "done" looks like for the core loop

- A user can go from wallet connect to a settled, visible mirrored trade with no manual chain interaction beyond the two signed transactions (grant, and — automatically after that — nothing further required of them).
- Attempting to withdraw or approve funds as the operator fails on-chain, provably.
- A trader never shows a calibration rank on fewer than 20 resolved decisions — shown as "warming up" instead.
- Everything shown is real: real transactions, real settlements, no mocked data.

Full detail lives in `TECHNICAL_ARCHITECTURE.md` and `TODO.md`.
