import { describe, it, expect } from "vitest";
import { mapWinningOutcome } from "./settlement.js";

/**
 * REGRESSION, the bug that quietly disabled the entire product (2026-09-08): this mapper
 * compared `winningOutcome` against the strings "YES"/"NO", but the indexer returns a
 * NUMERIC OUTCOME INDEX. Every comparison failed, so every resolved market looked
 * unresolved, so no decision was ever settled and no calibration score was ever computed
 * — with a fill watcher that had been recording real trades for an hour and a half. See
 * FEEDBACK.md.
 */
describe("mapWinningOutcome", () => {
  it("maps the numeric outcome index the indexer actually returns", () => {
    expect(mapWinningOutcome(0)).toBe("up"); // YES
    expect(mapWinningOutcome(1)).toBe("down"); // NO
  });

  it("accepts the index as a string too — GraphQL numerics arrive either way", () => {
    expect(mapWinningOutcome("0")).toBe("up");
    expect(mapWinningOutcome("1")).toBe("down");
  });

  it("still maps the YES/NO labels, so a shape change degrades to correct not silent", () => {
    expect(mapWinningOutcome("YES")).toBe("up");
    expect(mapWinningOutcome("NO")).toBe("down");
  });

  it("treats an unresolved market as unresolved — and never lets null coerce to index 0", () => {
    // The trap: Number(null) === 0, which would have silently settled every open market
    // as 'up'. Guarding null/undefined before any numeric coercion is the whole point.
    expect(mapWinningOutcome(null)).toBeNull();
    expect(mapWinningOutcome(undefined)).toBeNull();
    expect(mapWinningOutcome("")).toBeNull();
  });

  it("refuses an out-of-range index rather than guessing", () => {
    expect(mapWinningOutcome(2)).toBeNull();
    expect(mapWinningOutcome("MAYBE")).toBeNull();
  });
});
