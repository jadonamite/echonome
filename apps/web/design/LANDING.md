# Landing page

Built to `references/web3-wgmi.jpeg`. That file is the brief, not a mood board.

The first version of this page was not. It took an idea of its own, an anechoic chamber, put it
to a vote against the references, and built that. The references had been supplied as the
brief and were treated as decoration. This rebuild reads the WGMI reference as a specification
and follows it.

House rules that apply throughout: no emojis anywhere, real imagery rather than icon grids,
legal pages ship with the build, and all copy passes
`~/.claude/skills/content-writer/scripts/scan.sh`.

## The reference, read as a specification

**Act one, light.** Off-white ground near `#F2F2F2` carrying a dotted grid at roughly 20px
spacing. The nav sits flat on that ground with no container: no pill, no border, no backdrop,
no scroll state. Circular mark at the far left, inline links at about 13px with the current one
in indigo, a black fully-rounded button hard right.

The hero is centre-aligned. Two lines of very large bold black type with tight leading, then
three short lines of small grey sub-copy in a narrow column, then a black pill button.

Framing it, five squircle tiles scattered asymmetrically, roughly 8, 13, 15, 10 and 20 percent
of the canvas width. Two left, two right, the largest low on the right. Generous corner radius,
a saturated ground each, a soft drop shadow under each. They never touch the type.

**Act two, dark.** A hard cut to near-black, same dotted grid inverted. A section title with a
small white pill dropdown immediately beside it. Then three equal cards: dark body, thin light
border, about 18px radius, each holding a saturated art panel roughly square, then a centred
name, then a small centred metric line with a glyph.

**Footer.** One large rounded container on the dark ground. Three columns of small uppercase
letterspaced type: copyright and legal links, a mailing list with an arrow button inside the
input, and the cookie policy with `Accept` and `Find out more` as pills.

## What was translated, and how

| Reference | Here |
| --- | --- |
| Nav links, Connect Wallet pill | Leaderboard, How it works, Custody, Risk, and a Connect wallet pill |
| "Web Generated Modular Interfaces" | "Copy the traders who are right when they say they are" |
| Five scattered NFT tiles | Five live trader tiles, real wallets with their real recent calls |
| "WGMI Top Gainers" and a Day dropdown | "Top calibrated" and a time-range dropdown |
| Three NFT cards, art panel and ETH price | Three trader cards, calibration curve and edge in cents per dollar |
| Footer cookie policy with two pills | The same, and it is where consent actually happens |

## The one departure

The reference's tiles and card panels hold 3D character art. Here they hold live data: a tile
is a real trader with a strip of their recent calls, and a card panel is that trader's
calibration curve drawn large with its axes stripped.

This was flagged before it was built rather than decided quietly. The reasoning is that in the
reference the art *is* the product, and here the product is the record, so borrowed art would
be the weaker choice. It also means the hero needs no images at all, which matters while image
generation is still unavailable.

If that judgment is wrong, the swap is contained: `trader-tiles.tsx` and the panel in
`top-traders.tsx` are the only two places to change.

## Where things live

```
app/page.tsx                      both acts, and the dark-act sections
components/site/landing-nav.tsx   flat nav, no container
components/site/trader-tiles.tsx  the five scattered squircles
components/site/top-traders.tsx   card row, dropdown, calibration curve
components/site/footer.tsx        rounded container, three columns
components/site/consent.ts        one consent state, shared by footer and bar
components/site/footer-consent.tsx    the cookie column
components/site/cookie-banner.tsx     first-visit bar, for anyone who never scrolls
components/site/mailing-list.tsx      the input pill
components/site/echo-mark.tsx         the logo, drawn not fetched
fonts/                            General Sans, self-hosted, see LICENSE.md
```

Tokens are in `app/globals.css`: `.act-light` for the light band, `.dotgrid` with its two
variants, and the `--tile-*` palette. The tile colours are art and never state, which is why
they sit under their own names and leave the reserved status four untouched.

## Decisions worth keeping

**Light act, dark app.** Following the reference accurately makes the landing hero light, which
departs from the dark-by-commitment rule at the top of `globals.css`. The two do not conflict.
That rule is about trading surfaces, and this is the front door. Every app page behind it stays
dark.

**No section rules.** The first build gave each section a `border-t`, producing a stack of ruled
bands that appears nowhere in the reference. Spacing and the dotted ground do that work now.

**Every figure is queried.** Nothing on this page is a number typed into copy. That is what
caught three errors during the first build, including a section that asserted a trader was badly
calibrated while the live data showed the opposite.

## Still open

- The time-range dropdown in `top-traders.tsx` does not re-slice the ranking. Per-window scores
  do not exist in the worker yet. The control is present because the reference has it; a comment
  in the file says plainly that it does not filter.
- No Open Graph image. The old one was the anechoic photograph and went with it.
- `references/treepod-hero.png` and the stock candidates under `candidates/` are no longer used
  by this page. Kept as a record of what was tried.
