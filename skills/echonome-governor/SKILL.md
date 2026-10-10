---
name: echonome-governor
description: |
  Sizes and vets bStock purchases made with Binance Agentic Wallet. Before any `baw market-order swap`
  or `limit-order buy` into a tokenized US stock on BSC, ask Echonome's Governor how much the pools can
  take right now and cap the order to that amount. Also returns calibrated overnight forecasts for the
  next US open, scored nightly against what happened.
  Use when the user wants to buy a bStock, size a stock-token trade, check whether now is a thin market,
  copy an overnight stock call, or asks which stock agents are actually calibrated.
metadata:
  version: "0.1.0"
  requires:
    skills:
      - binance-agentic-wallet
---

# Echonome Governor

Echonome answers two questions an agent should ask before buying a tokenized stock on BNB Chain:

1. **How much can the market take right now?** Governor reads live PancakeSwap depth for the token and the notional its pools traded over the last hours, then returns the largest buy that stays within the limits below.
2. **Whose overnight call is worth following?** Every trading day, a set of agents forecast whether each stock will trade above the previous close at 10:00 New York time. Echonome scores every call by Brier score once it settles.

Base URL: `https://echonome-stocks.vercel.app` (override with `ECHONOME_URL` if set).

## Rule: cap every bStock buy

Before running `baw market-order swap` or `baw limit-order buy` where the token being bought is a bStock (symbol ends in `B`, provider `type=3` on the Binance RWA list), call:

```
GET {ECHONOME_URL}/api/governor?ticker=<UNDERLYING_TICKER>&usd=<ORDER_SIZE_USD>&spent24h=<USD_ALREADY_SPENT_ON_STOCKS_TODAY>
```

Response fields that matter:

| Field | Meaning |
|---|---|
| `allowedUsd` | Largest buy Governor allows now. Never send more than this. |
| `limiter` | What set the cap: `request`, `floor:per-trade`, `floor:daily`, `pace` (market is quiet), `impact` (pools are thin), `no-liquidity`. |
| `pool` | The PancakeSwap pool with the best price at that size. |
| `impactAtAllowedBps` | Extra cost over the best $10 price at the allowed size, basis points. |
| `reasons` | Plain sentences explaining the numbers. Show them to the user. |
| `token.address` | The bStock contract on BSC (chainId 56). Use it as `toToken`. |

Then:

- If `allowedUsd` is at least the requested size, proceed with the swap as the `binance-agentic-wallet` skill describes, including its own pre-check and confirmation.
- If `allowedUsd` is smaller, tell the user the cap, the `limiter`, and the reasons, and offer to buy `allowedUsd` now. Do not split the order into several smaller swaps to get around the cap; the pace limit already accounts for recent volume.
- If `allowedUsd` is 0 or the call fails, do not buy. Say why.

Governor never executes anything. The wallet skill and the user stay in control of signing.

## Overnight calls

```
GET {ECHONOME_URL}/api/calls
```

Returns, for the next US open: `day`, `lockAt` and `settleAt` (epoch ms), whether calls are `locked`, and per ticker the previous close (`refClose`), the live bStock per-share price (`live`), the gap between them (`tape`), and each agent's probability that the stock opens up.

```
GET {ECHONOME_URL}/api/board
```

Returns each agent's Brier score, direction hit rate and number of settled calls. Lower Brier is better; 0.25 is what "50% every time" scores. `coin-flip` and `no-view` are controls. If an agent does not beat `no-view`, say so before the user copies it.

When summarising a call for the user, give the probability, the agent's Brier score next to the baseline, and the lock time. These are forecasts, not advice.

## Limits Governor applies

- At most 10% of the busiest recent hour's traded notional, scaled by a probe cycle (0.75 to 1.25).
- At most 30 basis points above the best small-size price.
- $5,000 per trade and $20,000 per rolling day, whatever the market looks like.
