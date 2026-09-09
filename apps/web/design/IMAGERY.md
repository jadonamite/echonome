# Imagery — candidates for the anechoic direction

Two routes running side by side, per the decision on 2026-09-09. Pick one per slot.

## Route A — free stock, downloaded and reviewed

All files in `candidates/stock/`. Every one is from Pexels under the Pexels licence: free for
commercial use, no attribution required, modification permitted. The licence does forbid
selling unaltered copies and using identifiable people to imply endorsement, neither of which
applies here.

### Reviewed in full

**`pexels-8425988.jpg`** — pyramid acoustic foam, macro, receding into black. Photographer
David Underland. Strongest hero candidate by some distance. Deep geometric grid, real
material texture, tonal range that runs from near-white highlight to true black, and enough
dead shadow in the upper half to carry white display type without a scrim. Portrait at
1600x2133, so a full-bleed landscape hero needs the original resolution and a crop band
taken across the middle third.

**`pexels-38398497.jpg`** — egg-crate foam, warm brown-grey, shallow focus, diagonal ridges.
Beautiful as a texture but too soft and too flat in depth to hold a headline. Use it as the
ground for the controls section or as a low-opacity overlay, not as the hero.

**`pexels-6473549.jpg`** — a complete anechoic chamber interior, wedge walls floor to
ceiling, two green office chairs in the middle, shot on film with real grain. This is the
most interesting photograph in the set and the most dangerous one. It has genuine character
and looks nothing like stock, which is exactly what we want. It also looks slightly derelict
and institutional, which is the wrong note under a headline about trusting us with money.
Worth using somewhere it can be atmospheric rather than reassuring, perhaps behind the risk
section.

### Downloaded, not yet reviewed in detail

`pexels-8425989.jpg`, `pexels-8425992.jpg` (same photographer and series as 8425988),
`pexels-3861968.jpg`, `pexels-3862611.jpg` (engineers working inside chambers, people in
frame, better suited to a how-it-works section than the hero).

### Chosen and shipped

**`pexels-8425988.jpg` is the hero.** Shipped as `public/images/hero-anechoic.jpg`, a
2560x1440 crop taken from the top band of the 3024x4032 original rather than from its centre.
The centre crop was tried first and thrown away: it magnified the foreground wedges until the
frame was uniformly mid-tone and busy, which destroyed both the recession into darkness that
makes the photograph work and the tonal room a headline needs. The top band keeps the grid
running away from the viewer.

Photographer David Underland, Pexels licence, free for commercial use, no attribution
required, modification permitted. The untouched original is kept at
`candidates/stock/pexels-8425988-original.jpg` so the crop can be redone without a round trip.

Still to place, from the same set:

- Controls section ground: `38398497`, at low opacity behind the cards.
- Risk section: `6473549`.

## Route B — generated renders

Prompts written to be run in whichever generator you prefer. They target one consistent look
across all slots: dark, physically lit, real materials, no illustration style, no icons, no
text in the image.

**Shared style suffix, append to every prompt below:**

> shot on a 50mm lens at f/2.8, single hard key light raking from the upper left, deep
> shadow falloff, near-black background around 0A0A0B, fine film grain, muted desaturated
> palette with one cool green highlight, photographic realism, no text, no logos, no people,
> no illustration, no vector art, 16:9

**1. Hero.** An anechoic chamber wall of dark charcoal foam pyramids, shot at a shallow
oblique angle so the grid recedes into total darkness on the right two thirds of the frame,
the left third catching a single grazing light that picks out the edges of the wedges.

**2. Custody, the two-key mechanism.** A machined brass and steel escutcheon plate set into
dark metal, two keyways side by side, one holding a key turned to the vertical, the other
keyway empty and visibly blocked by a solid pin behind it. Macro, extremely shallow depth of
field, industrial rather than decorative.

**3. Calibration.** A single oscilloscope trace glowing pale green on a black phosphor
screen, the curve steady and clean, the bezel of the instrument dark and worn with age,
photographed slightly off axis.

**4. Signal against noise.** Concentric ripples spreading across black water in a dark room,
one clean ring at the centre and interference breaking up the rings toward the edges of the
frame, lit from a single point above.

**5. The echo.** Two identical dark forms, one sharply in focus in the foreground and one a
soft duplicate behind it, separated by depth rather than distance, on a seamless dark ground.

### The blocker on Route B

No image generation tool is wired into this session. Nothing I have can produce these. See
the chat message accompanying this file for the three ways to unblock it.

## What ships

Whichever route wins, the final files go to `apps/web/public/images/` as AVIF plus WebP
fallback, sized for the slots they fill, with the source and licence recorded in this file.
Nothing ships that is not recorded here.
