import { describe, it, expect } from "vitest";
import { isTargetMarket, isTradeableTargetMarket, EC_VENUE_ID } from "./client.js";

const NOW = 1_788_910_000;
const live = {
  venueId: EC_VENUE_ID,
  interval: "1h",
  asset: "BTC",
  status: "Trading",
  expiry: String(NOW + 1800),
};

/**
 * REGRESSION, bug found live 2026-09-09: identity was the only filter the seed strategies
 * applied, so a market that had expired two hours earlier still looked like a valid target.
 * The maker quoted into it 314 times in a row (`OrderAlreadyExpired` every time) while the
 * live windows sat at zero trades. See FEEDBACK.md.
 */
describe("isTargetMarket — identity only, by design", () => {
  it("matches the right venue, cadence and asset", () => {
    expect(isTargetMarket(live)).toBe(true);
    expect(isTargetMarket({ ...live, interval: "5m" })).toBe(false);
    expect(isTargetMarket({ ...live, asset: "DOGE" })).toBe(false);
    expect(isTargetMarket({ ...live, venueId: "0xdeadbeef" })).toBe(false);
  });

  it("still matches a long-dead market — that is the trap the liveness check exists for", () => {
    expect(isTargetMarket({ ...live, status: "Finalized", expiry: String(NOW - 7200) })).toBe(true);
  });
});

describe("isTradeableTargetMarket", () => {
  it("accepts a market that is trading and has time left", () => {
    expect(isTradeableTargetMarket(live, NOW)).toBe(true);
  });

  it("refuses a market whose window has already closed", () => {
    expect(isTradeableTargetMarket({ ...live, expiry: String(NOW - 1) }, NOW)).toBe(false);
    expect(isTradeableTargetMarket({ ...live, expiry: String(NOW) }, NOW)).toBe(false);
  });

  it("refuses on status alone, even while the clock still says there is time", () => {
    // The two signals disagree for a few seconds around the boundary. Refusing on either
    // is correct for a bot; picking one and trusting it is how you get OrderAlreadyExpired.
    for (const status of ["Locked", "Finalized", "Resolved", null, undefined]) {
      expect(isTradeableTargetMarket({ ...live, status }, NOW)).toBe(false);
    }
  });

  it("refuses a market with no usable expiry rather than assuming it is open", () => {
    expect(isTradeableTargetMarket({ ...live, expiry: null }, NOW)).toBe(false);
    expect(isTradeableTargetMarket({ ...live, expiry: "not-a-number" }, NOW)).toBe(false);
  });

  it("still applies the identity filter", () => {
    expect(isTradeableTargetMarket({ ...live, interval: "4h" }, NOW)).toBe(false);
  });
});
