export const pct = (x: number | null | undefined, digits = 1) =>
  x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(digits)}%`;
export const signedPct = (x: number | null | undefined, digits = 2) =>
  x == null || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
export const usd = (x: number | null | undefined, digits = 0) =>
  x == null || !Number.isFinite(x) ? "–" : `$${x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">{children}</p>;
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-10 space-y-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-display-sm font-semibold">{title}</h1>
      {children ? <div className="max-w-prose text-[17px] leading-relaxed text-ink-2">{children}</div> : null}
    </header>
  );
}

export function Stat({ label, value, note, live }: { label: string; value: React.ReactNode; note?: React.ReactNode; live?: boolean }) {
  return (
    <div className="rounded-xl border border-rule bg-surface px-5 py-4">
      <Eyebrow>{label}</Eyebrow>
      <p className={`mt-2 font-mono text-2xl ${live ? "text-accent" : "text-ink"}`}>{value}</p>
      {note ? <p className="mt-1 text-sm text-ink-3">{note}</p> : null}
    </div>
  );
}

/** Brier score bar against the 0.25 no-view baseline. Shorter is better. */
export function BrierBar({ brier }: { brier: number }) {
  const w = Math.min(1, brier / 0.5) * 100;
  const base = 50;
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-raised" aria-hidden>
      <div className={`h-2 rounded-full ${brier < 0.25 ? "bg-accent" : "bg-ink-3"}`} style={{ width: `${w}%` }} />
      <div className="absolute top-[-4px] h-4 w-px bg-ink-2" style={{ left: `${base}%` }} />
    </div>
  );
}
