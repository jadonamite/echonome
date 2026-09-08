import { describe, it, expect } from "vitest";
import { mapBinarySideToOutcome } from "./watcher.js";

// This is the exact mapping whose absence crashed the entire watcher on the first real
// fill (2026-09-08, see FEEDBACK.md) — a check-constraint violation propagated all the way
// up and killed the process. This test exists so that regression is structurally impossible.
describe("mapBinarySideToOutcome", () => {
  it("maps BUY_YES to up", () => {
    expect(mapBinarySideToOutcome("BUY_YES")).toBe("up");
  });
  it("maps BUY_NO to down", () => {
    expect(mapBinarySideToOutcome("BUY_NO")).toBe("down");
  });
  it("maps SELL_NO to up (equivalent exposure)", () => {
    expect(mapBinarySideToOutcome("SELL_NO")).toBe("up");
  });
  it("maps SELL_YES to down (equivalent exposure)", () => {
    expect(mapBinarySideToOutcome("SELL_YES")).toBe("down");
  });
  it("returns null for anything unrecognized instead of guessing", () => {
    expect(mapBinarySideToOutcome("SOMETHING_NEW")).toBeNull();
    expect(mapBinarySideToOutcome("")).toBeNull();
  });
});
