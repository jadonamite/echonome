/**
 * The logo mark: a struck point and the rings leaving it.
 *
 * The reference carries a circular mark at the far left of its nav, so this fills the same
 * slot. Drawn rather than fetched, because it is four circles and a fill, and because the one
 * thing this product should never do is reach for a stock glyph.
 *
 * Rings thin and fade as they travel outward, which is what a real echo does to a signal and
 * is also, conveniently, what a calibration score measures the decay of.
 */
export function EchoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Echonome"
      className={className}
    >
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <circle cx="16" cy="16" r="2.6" fill="var(--mark-ink, #fff)" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="var(--mark-ink, #fff)" strokeWidth="1.7" opacity="0.8" />
      <circle cx="16" cy="16" r="9.6" fill="none" stroke="var(--mark-ink, #fff)" strokeWidth="1.25" opacity="0.5" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="var(--mark-ink, #fff)" strokeWidth="0.9" opacity="0.26" />
    </svg>
  );
}
