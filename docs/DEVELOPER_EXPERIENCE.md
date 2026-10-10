# Developer experience report: Binance Web3 APIs for tokenized stocks

Echonome team, for BNB Hack: Tokenized Stocks Edition. Written October 10 to 11, 2026, while building [Echonome](../README.md): nightly forecasts of the US open from the overnight bStock price, scored by Brier score, with trade sizes paced to live PancakeSwap liquidity.

Every finding below comes from a dated log we kept during the build. Where we could not check something, we say so.

## The short version

- Getting from nothing to live tokenized-stock data took minutes, because the stock endpoints are public and need no key. That is the best thing about this stack.
- The most accurate reference we found was not the docs site. It was the Markdown in `binance/binance-skills-hub` on GitHub, written for AI agents.
- Several fields describe the underlying company where a developer expects the token. The worst is an on-chain `marketCap` of $5.5 trillion for a token with 201,000 units outstanding.
- Two official skills in the same folder disagree on whether bStocks exist.
- The Agentic Wallet CLI signs in only by scanning a QR code with the phone app, which blocks any agent that runs unattended.
- The data itself is good enough to find something real: the overnight bStock price called the direction of the next open correctly on 74% of 858 stock-days.

## 1. Onboarding

**API key.** The Create API Key button in the developer portal did nothing on repeated clicks. No spinner, no error. A hard refresh (Cmd+Shift+R) and one more click produced the key. Our guess is a stale cached script bundle, but we did not capture the console. Apart from that, sign-up had no KYC wall and no confusing prompts, which is better than most exchange portals.

**First data.** The first call to the tokenized-stock endpoints returned HTTP 200 with no key at all, exactly as the skill file says. From Lagos the three provider lists took 2.5 to 3.3 seconds each:

| Provider (`type`) | Tokens, all chains | On BSC | Response size | Time |
|---|---|---|---|---|
| Ondo (1) | 1,366 | 458 | 254,961 bytes | 3.25 s |
| xStocks (2) | 269 | 130 | 52,908 bytes | 2.71 s |
| bStocks (3) | 91 | 91 | 19,911 bytes | 2.54 s |

We never needed the key for anything in this build, and the material we read does not say which endpoints require it. A one-line table of "public" versus "key required" would have saved real time.

## 2. Documentation

**Where the answers were.** The web docs at `web3.binance.com/en/dev-docs/` return HTTP 202 with an empty body to a scripted request, so an AI coding agent pointed at them gets nothing. The skills hub on GitHub returned full Markdown: endpoint paths, parameters, response fields, curl examples and caveats. We built the whole client from `binance-tokenized-securities-info/SKILL.md` and `query-token-info`. We did not manage to compare the two sources line by line, so we cannot say whether the web docs carry the same detail.

Recommendation: serve the docs as plain HTML or Markdown to non-browser clients, or publish an `llms.txt` that points at the skills hub.

**Two skills disagree.** `binance-tokenized-securities-info` (v1.1) says of the `type` filter: "`1` = Ondo Finance (currently the only supported tokenized stock provider)". `binance-agentic-wallet` (v1.12.0), in the same folder, lists `type=2` for xStocks and `type=3` for bStocks and warns that "older versions" of the other skill only know Ondo. The live API sides with the wallet skill: 91 bStocks on BSC. An agent that loads only the stock-data skill will never find bStocks, which this hackathon is about.

**What the skills get right.** The stock skill explains two traps clearly: a token is not one share (`referencePrice = tokenInfo.price / sharesMultiplier`, with multipliers up to 10 after splits), and `tokenInfo.volume24h` is US share volume, not on-chain volume. Both would have cost us a day if they were not written down.

**What is missing from them.**

- Ondo's BSC tokens do not trade in DEX pools. Their hourly K-lines move in price but show zero volume, every candle, for every ticker we pulled. Next to bStock K-lines with $50k to $700k an hour, that means "DEX price" means a traded price for one provider and an oracle series for another. We found this by plotting it.
- `statusInfo.openState` inside RWA Dynamic V2 is true with `reasonCode: "TRADING"` on a Saturday, while the market status endpoint says `MARKET_CLOSED`. One flag means "this token can be traded", the other "the US market is open". Our desk page first said "US market is open" on a Saturday because of it.
- The expired bStock campaign guide (August 17 to September 1) still ships inside the Agentic Wallet skill as of the latest commit on September 11, and the main skill still routes bStock buys to it. Every agent that loads the skill reads expired rules and has to get the date check right.
- `query-token-info/scripts/cli.mjs` sends K-line requests to `dquery.sintral.io`, a domain that is not Binance's, with no explanation.

## 3. API behaviour

**Field meanings.** The v4 token dynamic endpoint for NVDAB returns `marketCap: 5536424160000` and `volume24h: 17054711459`, which are NVIDIA's. The same response has `totalSupply: 201295` and on-chain `volume24hBuy` plus `volume24hSell` of about $1.05M. The windowed buy and sell volumes (`volume5mBuy` through `volume24hSell`) are excellent and are exactly what our trade pacing uses. The headline fields next to them describe a different asset.

Recommendation: put company data under a `stock` object everywhere, as RWA Dynamic V2 already does with `stockInfo`, and keep `marketCap` for the token.

**Two hosts.** The stock skill calls `www.binance.com/bapi/defi/...` and the token skill calls `web3.binance.com/bapi/defi/...` for the same family of paths. Both worked. It is not clear which is canonical.

**K-line history.** Paging backwards with `endTime` works, with no errors and no rate limiting across roughly 250 requests at 0.3 seconds apart. Each page is capped at 300 candles and took 2.5 to 3 seconds, so 90 days of hourly data for 30 tokens took about 25 minutes. A larger `limit` for hourly and daily intervals, or a bulk export, would make backtests practical.

**Errors.** Every response we got used the same envelope (`code`, `message`, `success`, `data`) with `code "000000"` on success, which made one generic client possible. We did not see a non-success response during the build, so we cannot comment on error quality.

## 4. Agentic Wallet

The `baw` CLI installed cleanly from npm (`@binance/agentic-wallet`, CLI 1.10.0), with a warning that the `@github/keytar` install script was skipped. Its command set covers what an agent needs for this market: quotes, market and limit orders, a daily spend limit, approvals, and x402 payments.

Sign-in is the problem. `baw auth signin` "displays a QR code. Scan with Wallet App to authenticate." There is no other method. An agent running on a server, which is the natural shape for something that trades overnight, cannot start without a person holding the phone app. For this build, that moved execution to the browser wallet and PancakeSwap, and our Agentic Wallet integration became a skill (`skills/echonome-governor/SKILL.md`) that tells a `baw`-driven agent to ask Governor for a size cap before any bStock buy.

Recommendation: add a delegated or session-key sign-in with scoped limits, so a person approves an agent once, with a spending cap, and the agent runs from there.

## 5. Tokenized stock behaviour on BSC

Measured from 90 days of hourly Binance Web3 K-lines for 15 bStocks and their Ondo twins. Scripts and data are in the repository.

- **The overnight price carries information.** The bStock price at 09:00 New York time, against the previous 16:00 Ondo reference, called the direction of the 10:00 reference correctly on 74% of 858 stock-days. Turned into a probability, it scored a Brier of 0.187, against 0.25 for "50% every time" and 0.265 for a random side at 65%.
- **Volume does not stop when Wall Street does.** bStock pools traded similar hourly notional in regular, premarket, overnight and weekend hours. xStocks on BSC traded tens of dollars an hour. Ondo on BSC: nothing.
- **Pool choice dominates cost.** On Saturday, October 10, a $50,000 USDT buy of NVDAB quoted 0.02% above the $10 price in the PancakeSwap v3 0.25% pool, and about 62% above it in the 0.05% pool. Routing to the wrong pool is a bigger risk than trading at night.
- **Token contracts did not gate holders.** A read-only simulation of a 100 USDT to NVDAB swap from an ordinary wallet through the PancakeSwap v3 router succeeded. Whatever eligibility rules apply are enforced somewhere other than the token contract.

## 6. What we would change first

1. Fix the stock-data skill so it knows about bStocks and xStocks.
2. Rename or move the company-level fields in the token dynamic response.
3. Add a non-interactive, scoped sign-in to the Agentic Wallet.
4. Make the docs readable by scripts and agents.
5. Raise the K-line page size for hourly data.
6. Remove expired campaign files from skills when they expire.
