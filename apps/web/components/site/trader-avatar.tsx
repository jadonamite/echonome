/**
 * A trader's mark, generated from their wallet address.
 *
 * These are strategies wearing names, not people, so there is no photograph to show and
 * inventing one would attach a real face to an algorithm — the single most misleading thing
 * this page could carry. The mark is derived instead from the one genuine identifier a trader
 * has: the address their fills are signed from. Same address, same mark, every time and on
 * every screen, which makes it a visual fingerprint of a real on-chain identity rather than
 * decoration.
 *
 * Two shapes over a tinted ground, rotated by the hash, with the initials on top. The initials
 * are what carry it at 32px, where the pattern is too small to distinguish; the pattern is what
 * carries it at 64px, where two traders sharing initials would otherwise look identical.
 *
 * Pure and deterministic, so it renders on the server with the rest of the page — no client
 * JavaScript, no layout shift, and it survives having no database, because it needs only the
 * address string.
 */

/**
 * FNV-1a. Chosen because it is short enough to read and stable across runtimes — the mark must
 * not change between a server render and a client one, which rules out anything seeded from
 * Math.random or from object key order.
 */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Grounds picked to sit legibly on all four tile tones, and to stay distinguishable from each
 * other for the colour-blind — the pattern and the initials do the identifying work, so colour
 * is never the only channel.
 */
const GROUNDS = [
  { bg: "#4b3df5", ink: "#ffffff" }, // indigo
  { bg: "#0f8f7f", ink: "#ffffff" }, // teal
  { bg: "#c4452f", ink: "#ffffff" }, // vermillion
  { bg: "#c9f24d", ink: "#0a0a0a" }, // chartreuse
  { bg: "#2b3ea8", ink: "#ffffff" }, // deep blue
  { bg: "#e0a244", ink: "#0a0a0a" }, // amber
];

/** "Tokunbo Adeyemi" -> "TA". A single-word handle keeps its first two letters. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

import Image from "next/image";

const AVATARS: Record<string, string> = {
  "tokunbo adeyemi": "/avatars/Adeyemi.jpeg",
  "adeyemi": "/avatars/Adeyemi.jpeg",
  "ec-maker": "/avatars/Adeyemi.jpeg",

  "emeka okafor": "/avatars/Emeka.jpeg",
  "emeka": "/avatars/Emeka.jpeg",
  "ec-oracle-follow": "/avatars/Emeka.jpeg",

  "alex mensah": "/avatars/Alex.jpeg",
  "alex": "/avatars/Alex.jpeg",
  "ec-coinflip": "/avatars/Alex.jpeg",

  "arnold whitfield": "/avatars/Arnold.jpeg",
  "arnold": "/avatars/Arnold.jpeg",
  "ec-longshot": "/avatars/Arnold.jpeg",

  "ifeoma balogun": "/avatars/Ifeoma.jpeg",
  "ifeoma": "/avatars/Ifeoma.jpeg",
  "ec-favourite": "/avatars/Ifeoma.jpeg",
};

function getAvatarImage(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (AVATARS[lower]) return AVATARS[lower];
  for (const [key, url] of Object.entries(AVATARS)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

export function TraderAvatar({
  address,
  name,
  size = 36,
  className = "",
}: {
  /** The wallet address. What makes the mark a fingerprint rather than a random pattern. */
  address: string;
  /** Display name, for the initials and the accessible label. */
  name: string;
  size?: number;
  className?: string;
}) {
  const customImg = getAvatarImage(name);
  if (customImg) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden rounded-full border border-rule ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={customImg}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  const h = hash(address.toLowerCase());
  const ground = GROUNDS[h % GROUNDS.length];
  const rotA = (h >> 3) % 360;
  const rotB = (h >> 11) % 360;
  const offA = ((h >> 17) % 30) - 15;
  const initials = initialsOf(name);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${name}, identified by wallet ${address.slice(0, 6)}…${address.slice(-4)}`}
      className={`shrink-0 ${className}`}
    >
      <defs>
        {/* Clipped to the disc so the rotated shapes cannot escape it. */}
        <clipPath id={`av-${h}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>

      <g clipPath={`url(#av-${h})`}>
        <circle cx="50" cy="50" r="50" fill={ground.bg} />
        {/* Two washes of the ground's own ink at low opacity, rather than new hues: it keeps
            every mark to one colour family so a row of them reads as a set. */}
        <rect
          x="-20"
          y={30 + offA}
          width="140"
          height="34"
          fill={ground.ink}
          opacity="0.16"
          transform={`rotate(${rotA} 50 50)`}
        />
        <circle cx={50 + offA} cy="18" r="30" fill={ground.ink} opacity="0.12" transform={`rotate(${rotB} 50 50)`} />
      </g>

      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill={ground.ink}
        fontSize="38"
        fontWeight="700"
        // The page's own stack, so the initials are set in the same face as the name beside them.
        fontFamily="inherit"
        letterSpacing="-1"
      >
        {initials}
      </text>
    </svg>
  );
}
