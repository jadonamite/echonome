import Image from "next/image";

/**
 * The supplied mark, in the two arrangements the site needs: icon alone, and icon with the
 * name beside it.
 *
 * Both source files arrived as 1350px squares with the artwork sitting off-centre inside them,
 * 47px of empty space above and 146px below. Left alone, that padding travels into every
 * placement and the mark reads as too small and hung too high in its own box. The files in
 * `public/brand/` are trimmed to the true alpha bounds, 1100x1157, so a height set here is the
 * height of the artwork rather than the height of its canvas.
 *
 * `variant` selects ink, not theme: `black` for the light act, `white` for the dark one. It is
 * an explicit prop rather than a CSS filter because the artwork is a raster and inverting it
 * with `filter` would soften the edges of a mark whose whole character is hard geometry.
 */

const RATIO = 1100 / 1157;

const SRC = {
  black: "/brand/echonome-black.png",
  white: "/brand/echonome-white.png",
} as const;

export type LogoVariant = keyof typeof SRC;

export function LogoIcon({
  variant = "black",
  height = 30,
  priority = false,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={SRC[variant]}
      alt="Echonome"
      width={Math.round(height * RATIO)}
      height={height}
      priority={priority}
      className={className}
    />
  );
}

export function LogoLockup({
  variant = "white",
  height = 26,
  className = "",
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src={SRC[variant]}
        alt=""
        aria-hidden
        width={Math.round(height * RATIO)}
        height={height}
      />
      {/* The name is live text rather than part of the image: it stays selectable, it scales
          with the reader's own type settings, and it is what a screen reader announces. */}
      <span
        className="font-semibold tracking-[-0.02em]"
        style={{ fontSize: `${Math.round(height * 0.72)}px` }}
      >
        Echonome
      </span>
    </span>
  );
}
