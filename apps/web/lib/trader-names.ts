/**
 * Display names for the seed strategies.
 *
 * The database stores what the bot IS — `ec-maker`, `ec-coinflip` — because that is what the
 * worker logs, what `runSeedTraders.ts` registers, and what anyone debugging a fill needs to
 * see. This maps those handles onto people for the interface, so a leaderboard of traders reads
 * as a leaderboard of traders rather than a list of processes.
 *
 * Mapping here rather than renaming the rows, deliberately: the label in the database is
 * backend identity and changing it would rename them in the worker's logs and in every
 * operational query for the sake of a display decision. This is the frontend's business.
 *
 * The strategy handle is NOT thrown away. It rides along as `strategy` and is shown wherever
 * there is room for it, because `ec-coinflip` picks a side at random and exists as the control
 * that proves the ranking has teeth. A random baseline presented as a person, with nothing
 * saying so, would be the one dishonest thing on the page — and PRD.md requires seed traders be
 * clearly labelled as seed traders.
 */

export interface TraderIdentity {
  /** The person shown to a reader. */
  name: string;
  /** The strategy handle from the database, kept visible wherever there is room. */
  strategy: string;
  /** One line on what the strategy actually does. */
  role: string;
}

const NAMES: Record<string, { name: string; role: string }> = {
  "ec-maker": {
    name: "Tokunbo Adeyemi",
    role: "Quotes both sides around the mid, providing the liquidity the others trade against",
  },
  "ec-oracle-follow": {
    name: "Emeka Okafor",
    role: "Directional taker following price momentum",
  },
  "ec-coinflip": {
    name: "Alex Mensah",
    role: "Picks a side at random — the control, whose expected edge is exactly zero",
  },
  "ec-longshot": {
    name: "Arnold Whitfield",
    role: "Always buys the cheap side, probing long-shot bias",
  },
  "ec-favourite": {
    name: "Ifeoma Balogun",
    role: "Always buys the expensive side, the mirror of the long-shot probe",
  },
};

/** Strips the "(seed)" the worker appends, so lookups match the bare handle. */
function handleOf(label: string): string {
  return label.replace(/\s*\(seed\)\s*$/i, "").trim();
}

/**
 * A trader's display identity. Anything not in the table — an organic wallet, or a strategy
 * added after this file — falls through to its own label rather than to a placeholder person,
 * so a new trader is never silently given someone else's name.
 */
export function traderIdentity(label: string): TraderIdentity {
  const strategy = handleOf(label);
  const known = NAMES[strategy];
  if (!known) return { name: strategy, strategy, role: "" };
  return { name: known.name, strategy, role: known.role };
}

/** Just the name, for the places too small to carry anything else. */
export function traderName(label: string): string {
  return traderIdentity(label).name;
}
