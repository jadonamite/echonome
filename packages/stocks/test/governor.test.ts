import { describe, expect, it } from "vitest";
import { decide, DEFAULT_PARAMS, impactBps, impactCap, type DepthPoint } from "../src/governor.js";

const deep: DepthPoint[] = [
  { usd: 10, price: 100, pool: "a" },
  { usd: 1_000, price: 100.01, pool: "a" },
  { usd: 10_000, price: 100.1, pool: "a" },
  { usd: 50_000, price: 100.5, pool: "a" },
];
const thin: DepthPoint[] = [
  { usd: 10, price: 100, pool: "b" },
  { usd: 1_000, price: 100.5, pool: "b" },
  { usd: 10_000, price: 106, pool: "b" },
];
// A step where the probe gain is exactly 1.
const cruise = 3 * DEFAULT_PARAMS.probeStepMs;

describe("governor", () => {
  it("measures impact against the smallest-size price", () => {
    expect(impactBps(deep, 10_000)).toBeCloseTo(10, 5);
    expect(impactCap(thin, 30)).toBeGreaterThan(500);
    expect(impactCap(thin, 30)).toBeLessThan(1_000);
  });

  it("passes a small request untouched in a deep, busy market", () => {
    const d = decide({ requestUsd: 500, spent24hUsd: 0, depth: deep, flow: { usd1h: 100_000, usd4h: 300_000 }, now: cruise });
    expect(d.allowedUsd).toBe(500);
    expect(d.limiter).toBe("request");
  });

  it("paces to a share of traded volume when the market is quiet", () => {
    const d = decide({ requestUsd: 2_000, spent24hUsd: 0, depth: deep, flow: { usd1h: 3_000, usd4h: 8_000 }, now: cruise });
    expect(d.limiter).toBe("pace");
    expect(d.allowedUsd).toBe(300);
  });

  it("caps at the impact budget when pools are thin", () => {
    const d = decide({ requestUsd: 5_000, spent24hUsd: 0, depth: thin, flow: { usd1h: 500_000, usd4h: 1_000_000 }, now: cruise });
    expect(d.limiter).toBe("impact");
    expect(d.impactAtAllowedBps!).toBeLessThanOrEqual(30.01);
  });

  it("holds the floor whatever the model says", () => {
    const d = decide({ requestUsd: 9_000, spent24hUsd: 18_000, depth: deep, flow: { usd1h: 10_000_000, usd4h: 0 }, now: cruise });
    expect(d.limiter).toBe("floor:daily");
    expect(d.allowedUsd).toBe(2_000);
    const bad = decide({ requestUsd: 100, spent24hUsd: 0, depth: [], flow: { usd1h: NaN, usd4h: NaN }, now: cruise });
    expect(bad.allowedUsd).toBe(0);
  });
});
