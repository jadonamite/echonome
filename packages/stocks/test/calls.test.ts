import { describe, expect, it } from "vitest";
import { AGENTS, buildNights, runAgents, scoreAgent } from "../src/calls.js";
import type { PairHistory } from "../src/history.js";
import { nyToMs } from "../src/sessions.js";

/** Builds a history where the overnight bStock move always matches the next open. */
function synthetic(): PairHistory {
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
  const t: number[] = [], ondo: (number | null)[] = [], b: (number | null)[] = [], bVol: (number | null)[] = [];
  let close = 100;
  days.forEach((d, i) => {
    const dir = i % 3 === 0 ? -1 : 1;
    const open = close * (1 + dir * 0.01);
    t.push(nyToMs(d, 9)); ondo.push(close); b.push(open); bVol.push(1000);
    t.push(nyToMs(d, 10)); ondo.push(open); b.push(open); bVol.push(1000);
    t.push(nyToMs(d, 16)); ondo.push(open); b.push(open); bVol.push(1000);
    close = open;
  });
  return { ticker: "TEST", bstock: { symbol: "TESTB", address: "0x1", multiplier: 1 }, ondoToken: { symbol: "TESTon", address: "0x2", multiplier: 1 }, t, ondo, b, bVol };
}

describe("nightly calls", () => {
  const nights = buildNights(synthetic());

  it("settles each trading day against the previous close", () => {
    expect(nights.length).toBe(9);
    expect(nights.every((n) => n.outcome !== null)).toBe(true);
    expect(nights[0]).toMatchObject({ day: "2026-09-29", prevDay: "2026-09-28" });
    expect(nights.find((n) => n.day === "2026-10-05")?.prevDay).toBe("2026-10-02");
  });

  it("scores an informative agent above the baseline and the controls at or below it", () => {
    const calls = runAgents(nights);
    const s = Object.fromEntries(AGENTS.map((a) => [a.id, scoreAgent(a.id, calls)]));
    expect(s["no-view"].brier).toBeCloseTo(0.25, 10);
    expect(s["night-tape"].brier).toBeLessThan(0.25);
    expect(s["fade"].brier).toBeGreaterThan(0.25);
    expect(s["night-tape"].hitRate).toBe(1);
  });

  it("never lets an agent see a night that settles after its own lock", () => {
    const seen: number[] = [];
    const spy = { ...AGENTS[0], id: "spy", call: (n: any, ctx: any) => { seen.push(Math.max(0, ...ctx.settledBefore.map((x: any) => x.settleAt)) - n.lockAt); return 0.5; } };
    runAgents(nights, [spy]);
    expect(seen.every((d) => d <= 0)).toBe(true);
  });
});
