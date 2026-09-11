# Demo video script

Target length 2:50. Narration is ~470 words, which lands at a calm 150 words a minute and
leaves the custody run at section 5 room to play out in silence.

Record in this order, edit to this order. The story has one turn in it: we tried to build
this the documented way, the chain refused, and the refusal made the product better.

Before you record: fund the four stalled seed wallets with STT, and point a copy link at a
trader that is actually trading. Four of five rows currently read "last call 1d ago" and that
is the first thing a judge will see.

---

## 1. The problem (0:00 to 0:25)

**Screen:** a DreamDEX hourly BTC market, live. Cursor over the Up price.

> DreamDEX runs hourly markets on Somnia. Will Bitcoin close above where it opened this hour?
> Buy Up at thirty cents and you have said "thirty percent" out loud, with money behind it.
> An hour later, reality settles it.
>
> Most people would rather copy a good trader than become one. eToro proved that in 2010.
> But copy-trading asks you to trust two things at once, and they should not travel together.
> That the leaderboard is honest. And that the broker will not take your money.

**Screen:** cut to the Echonome landing page as you say the next line.

> Echonome pulls those apart.

## 2. The solution (0:25 to 0:50)

**Screen:** Echo Rank, scrolling slowly. Let the reliability sparklines show.

> Rankings are computed off the public ledger, so nobody can quietly delete the trader who
> blew up last week.
>
> And we rank on edge. Not profit, and deliberately not accuracy. Edge is the average of
> outcome minus the price you paid, which in a binary market is exactly your expected profit
> per dollar staked. Rank on accuracy instead and you rank against the people most worth
> copying: buy Up at thirty cents, watch it happen, and you just made seventy cents while an
> accuracy score marks you down for saying thirty percent about a thing that occurred.

## 3. The turn (0:50 to 1:20)

**Screen:** split the frame. DreamDEX's Operators page on the left, your terminal on the
right running `npm run verify:operator-gate -w @echonome/worker`. Let the revert print.

> Your money is the harder half. DreamDEX documents an operator registry, the way to let
> something act on your behalf. We wired it up. Both grants recorded on chain, correct
> selector, everything the docs ask for. The pool reverted anyway.
>
> Then we found why. It reverts even when the owner calls it for themselves. Event Contract
> pools do not consult the operator registry at all. That command is in the repo, it is read
> only, and it needs no keys.

**Screen:** the diagram from the README, the three-column one.

> So we inverted the call. You do not grant us permission to trade for you. You deploy a
> contract that trades for itself, and we hold a key that can pull its trigger inside limits
> you set. The constraint made the guarantee stronger than the design it replaced.

## 4. The product (1:20 to 2:00)

**Screen:** Echo Rank. Hover Alex Mensah, then Arnold Whitfield.

> Everyone on this board is a bot right now, labelled as one, and that is the point. We are
> proving the measurement works before we ask anyone to be measured by it.
>
> Alex picks a side at random. Expected edge, exactly zero. That is the control. If random
> ever tops this board, the board is broken.
>
> Arnold always buys the cheap side, and is up nineteen cents per dollar across 1,249 settled
> calls. That is not skill. It is long-shot bias, it is real, and it is sitting on
> DreamDEX right now for anyone to take.

**Screen:** the connect flow. Deploy, fund, set limits, authorise. Then follow a trader at
25 percent.

> I deploy my own account, fund it, set my caps, and authorise. Two signatures, and nothing
> is ever asked of me again.

**Screen:** split frame. The leader's fill in the feed, then your echo arriving. Cut to the
explorer on the tx hash.

> Arnold fills. Ten seconds later, so do I. Same market, same side, a quarter of the size, in
> my own account, with my own money. Here is the transaction.
>
> 13,767 calls recorded. 2,495 echoes settled on chain.

## 5. The proof (2:00 to 2:30)

This is the shot. Everything before it is a claim and this is the only part a skeptic cannot
argue with, so it gets the most screen time per word of narration in the whole video.

**Screen:** hold on the explorer for one more beat, then cut to a full-frame terminal.
Scrollback cleared, font large enough to read on a phone. Run:

```
npm run verify:custody -w @echonome/contracts
```

**Say this over the setup, then stop talking.**

> So I am the operator. I place the orders. Watch me try to take the money.

Let four or five seconds of silence run while the first assertions print. The pauses are
doing the work here. What the frame fills with, verbatim from `report()` in
`packages/contracts/scripts/lib.ts`:

```
  PASS  executor cannot withdraw ERC-20  — NotOwner
  PASS  executor cannot withdraw native  — NotOwner
  PASS  executor cannot make an arbitrary call  — NotOwner
  PASS  executor cannot raise its own caps  — NotOwner
  PASS  executor cannot extend its own expiry  — NotOwner
  PASS  executor cannot unpause itself  — NotOwner
  PASS  executor cannot trade a series the owner did not approve  — SeriesNotAllowed
  PASS  pause stops the executor immediately  — AccountPaused
  PASS  revocation is permanent  — NotExecutor
  PASS  owner can still withdraw after revocation
```

**Screen:** as the list scrolls, resume.

> Twenty-four attempts. Every one refused, and refused by name. That matters more than it
> sounds: "it reverted" is a sentence a typo can satisfy. `NotOwner` is not.
>
> I cannot raise my own limits. I cannot extend my own expiry. I cannot unpause myself after
> they pause me. There is no code path from my key to any of it.

**Screen:** the final `24/24 passed` line, held still. Do not cut away on the last word.

> And look at the bottom of that list. They can withdraw while I am paused, after their
> authorisation lapses, and after they have revoked me for good. Their money was never mine
> to move.

## 6. The vision (2:30 to 2:50)

**Screen:** back to Echo Rank, live, with the feed moving beside it.

> Next: every cadence, not just the hour. Real traders opting in to be ranked. And
> calibration scores published on chain, so another app can trust these rankings without
> having to trust us.
>
> Every trade is a sound. Every copy is its echo.

---

## Shot list

| Shot | What you need ready |
| --- | --- |
| DreamDEX hourly market | A live BTC 1h market, Up price visible |
| Echo Rank | Seeds refilled so no row says "1d ago" |
| `verify:operator-gate` | Terminal, large font, scrollback cleared |
| README diagram | The three-column custody diagram, full frame |
| Connect flow | A wallet with STT and tUSDC already in it, so no faucet detour |
| Leader fill to echo | A copy link on the trader that is actually trading |
| Explorer | The echo's tx hash open in shannon-explorer |
| `verify:custody` | Funded key, terminal, and patience. This is the money shot |

## Notes

Do not narrate over the two terminal runs at the pace of the rest of the video. Slow down.
The refusals printing one after another is the most persuasive thing you have, and every
other team in this hackathon is going to say the word "non-custodial" without showing a
chain refusing them.

If you only have time to get one thing right, get the custody run right.
