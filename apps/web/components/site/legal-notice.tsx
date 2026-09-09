/**
 * The banner that appears at the top of every legal page.
 *
 * It exists because shipping a policy page and having a lawyer approve one are different
 * things, and a reader has no way to tell them apart. Saying which of the two this is costs
 * us nothing and is the same argument the rest of the product makes: state the limit rather
 * than let someone assume it away. It comes off the day these are reviewed, not before.
 */
export function LegalNotice() {
  return (
    <div className="mt-8 rounded-xl border border-warning/30 bg-warning/5 px-5 py-4">
      <p className="!mt-0 !text-sm !leading-relaxed !text-ink-2">
        This document has not been reviewed by a lawyer. Echonome is running on a testnet and
        handles no real value. Treat this as a plain statement of how the product behaves, and
        not as a reviewed legal instrument. It will be replaced before anything here touches
        real money.
      </p>
    </div>
  );
}

export function LastUpdated({ date }: { date: string }) {
  return (
    <p className="!mt-4 font-mono !text-sm uppercase tracking-widest !text-ink-3">
      Last updated {date}
    </p>
  );
}
