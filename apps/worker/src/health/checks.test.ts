import { describe, it, expect } from "vitest";
import { evaluateHealth, overallSeverity, THRESHOLDS, type HealthFacts } from "./checks.js";

/**
 * These tests replay the six real defects this project shipped and then found the hard way.
 * Each `it` is a situation that actually occurred on live testnet, and the assertion is that
 * the monitor would have caught it. That is the only meaningful test of an alerting rule —
 * "does it fire on the incident it was written for" — and it is why the cases are named after
 * the bugs rather than after the code paths.
 */

/** A system doing exactly what it should: markets live, trades flowing, everything current. */
const healthy: HealthFacts = {
  liveTargetMarkets: 2,
  tradesOnLiveMarkets: 40,
  venueLastTradeAgeSec: 6,
  oldestLiveMarketAgeSec: 600,
  lastDecisionAgeSec: 8,
  lastSettlementAgeSec: 120,
  unsettledResolvedDecisions: 0,
  recentEchoes: 20,
  recentEchoFailures: 0,
  heartbeatAgesSec: { watcher: 9, settlement: 15 },
};

const facts = (over: Partial<HealthFacts>): HealthFacts => ({ ...healthy, ...over });
const checks = (f: HealthFacts) => evaluateHealth(f).map((x) => x.check);

describe("evaluateHealth — the healthy baseline", () => {
  it("says nothing at all when the system is working", () => {
    expect(evaluateHealth(healthy)).toEqual([]);
    expect(overallSeverity([])).toBe("ok");
  });
});

describe("the frozen market set (08 Sep) and the cached loadMarkets (09 Sep)", () => {
  // Both bugs had the identical signature: the venue is being traded, we record nothing.
  it("fires critical when live markets are trading and no decision has landed", () => {
    const f = facts({ lastDecisionAgeSec: THRESHOLDS.decisionSilenceSec + 1 });
    expect(checks(f)).toContain("decisions-flowing");
    expect(overallSeverity(evaluateHealth(f))).toBe("critical");
  });

  it("fires when the watcher has never seen this venue at all", () => {
    expect(checks(facts({ lastDecisionAgeSec: null }))).toContain("decisions-flowing");
  });

  it("stays silent on a genuinely quiet market — an alert that cries wolf gets muted", () => {
    // Live market, nobody trading it, and we've recorded nothing. Correct, not a fault.
    const f = facts({ venueLastTradeAgeSec: null, lastDecisionAgeSec: 9999, oldestLiveMarketAgeSec: 60 });
    expect(checks(f)).not.toContain("decisions-flowing");
  });

  // REGRESSION, and this one fired on live data within minutes of the check being written:
  // the first version triggered on `tradesOnLiveMarkets > 0`, a CUMULATIVE count. A market
  // that traded 57 times in its opening minutes and then went quiet kept satisfying that
  // forever, so every quiet minute afterwards was reported as a critical watcher failure.
  it("does not fire on a market that traded earlier and has since gone quiet", () => {
    const f = facts({
      tradesOnLiveMarkets: 57,      // plenty, cumulatively
      venueLastTradeAgeSec: 1500,   // but the last one was 25 minutes ago
      lastDecisionAgeSec: 1500,     // and we recorded it at the time
    });
    expect(checks(f)).not.toContain("decisions-flowing");
  });

  it("still fires when the venue is trading right now and we are behind", () => {
    const f = facts({ tradesOnLiveMarkets: 57, venueLastTradeAgeSec: 5, lastDecisionAgeSec: 1500 });
    expect(checks(f)).toContain("decisions-flowing");
  });

  it("stays silent between windows, when no target market is open", () => {
    const f = facts({ liveTargetMarkets: 0, tradesOnLiveMarkets: 0, venueLastTradeAgeSec: null, lastDecisionAgeSec: 9999, oldestLiveMarketAgeSec: null });
    expect(checks(f)).not.toContain("decisions-flowing");
    expect(checks(f)).not.toContain("seed-fleet-trading");
  });
});

describe("the empty-book guard (08 Sep) and the expired-market maker (09 Sep)", () => {
  // Both left a live market at zero trades while the seed fleet looked busy in the logs.
  it("warns when the fleet stops crossing a book it is still quoting into", () => {
    // The live condition on 09 Sep: maker quoting cleanly, zero failures, and nothing
    // trading — which a purely cumulative view of the market reported as healthy.
    const f = facts({
      tradesOnLiveMarkets: 57,
      venueLastTradeAgeSec: THRESHOLDS.untradedLiveMarketSec + 600,
      oldestLiveMarketAgeSec: 1900,
      lastDecisionAgeSec: 1500,
    });
    expect(checks(f)).toContain("seed-fleet-trading");
  });

  it("warns when a market has been open a while and our fleet hasn't made the book", () => {
    const f = facts({
      tradesOnLiveMarkets: 0,
      venueLastTradeAgeSec: null,
      oldestLiveMarketAgeSec: THRESHOLDS.untradedLiveMarketSec + 60,
      lastDecisionAgeSec: 9999,
    });
    expect(checks(f)).toContain("seed-fleet-trading");
    expect(overallSeverity(evaluateHealth(f))).toBe("warn");
  });

  it("gives a freshly opened market time before complaining", () => {
    const f = facts({ tradesOnLiveMarkets: 0, venueLastTradeAgeSec: null, oldestLiveMarketAgeSec: 30, lastDecisionAgeSec: 9999 });
    expect(checks(f)).not.toContain("seed-fleet-trading");
  });
});

describe("the winningOutcome type mismatch (08 Sep)", () => {
  // 313 decisions on resolved markets, none scored, no error anywhere. The bug that
  // silently disabled the product's entire ranking signal.
  it("fires critical when resolved decisions pile up unscored", () => {
    const f = facts({ unsettledResolvedDecisions: 313, lastSettlementAgeSec: null });
    expect(checks(f)).toContain("settlement-progressing");
    expect(overallSeverity(evaluateHealth(f))).toBe("critical");
  });

  it("fires when settlement has stalled even though it once worked", () => {
    const f = facts({ unsettledResolvedDecisions: 12, lastSettlementAgeSec: THRESHOLDS.settlementSilenceSec + 1 });
    expect(checks(f)).toContain("settlement-progressing");
  });

  it("stays silent when there is simply nothing to settle yet", () => {
    const f = facts({ unsettledResolvedDecisions: 0, lastSettlementAgeSec: null });
    expect(checks(f)).not.toContain("settlement-progressing");
  });

  it("stays silent while a backlog is being worked through promptly", () => {
    expect(checks(facts({ unsettledResolvedDecisions: 5, lastSettlementAgeSec: 30 }))).not.toContain(
      "settlement-progressing"
    );
  });
});

describe("echo failure rate", () => {
  it("escalates warn then critical as the ratio climbs", () => {
    expect(evaluateHealth(facts({ recentEchoes: 20, recentEchoFailures: 6 }))[0].severity).toBe("warn");
    expect(evaluateHealth(facts({ recentEchoes: 20, recentEchoFailures: 15 }))[0].severity).toBe("critical");
  });

  it("refuses to judge a ratio on too few samples", () => {
    // 1 of 2 failing is 50%, but it is also just two echoes.
    const f = facts({ recentEchoes: 2, recentEchoFailures: 1 });
    expect(checks(f)).not.toContain("echo-success-rate");
  });

  it("says nothing when no echoes have been attempted", () => {
    expect(checks(facts({ recentEchoes: 0, recentEchoFailures: 0 }))).not.toContain("echo-success-rate");
  });
});

describe("wedged loops", () => {
  it("distinguishes a loop that stopped from one that never started", () => {
    const stalled = evaluateHealth(facts({ heartbeatAgesSec: { watcher: 600, settlement: 15 } }));
    expect(stalled.find((f) => f.check === "heartbeat:watcher")?.severity).toBe("critical");

    const missing = evaluateHealth(facts({ heartbeatAgesSec: { watcher: null, settlement: 15 } }));
    expect(missing.find((f) => f.check === "heartbeat:watcher")?.severity).toBe("warn");
  });

  it("catches a wedged loop even while every other signal looks fine", () => {
    // This is the case uptime monitoring and error rates both miss entirely: the process is
    // resident, nothing has thrown, the market happens to be quiet, and nothing is running.
    const f = facts({
      tradesOnLiveMarkets: 0,
      venueLastTradeAgeSec: null,
      oldestLiveMarketAgeSec: 60,
      heartbeatAgesSec: { watcher: THRESHOLDS.heartbeatStaleSec + 1, settlement: 15 },
    });
    expect(overallSeverity(evaluateHealth(f))).toBe("critical");
  });
});

describe("overallSeverity", () => {
  it("reports the worst finding, not the first", () => {
    const f = facts({
      tradesOnLiveMarkets: 0,
      venueLastTradeAgeSec: null,
      oldestLiveMarketAgeSec: 9999,
      heartbeatAgesSec: { watcher: 9999, settlement: 15 },
    });
    const found = evaluateHealth(f);
    expect(found.map((x) => x.severity)).toContain("warn");
    expect(overallSeverity(found)).toBe("critical");
  });
});
