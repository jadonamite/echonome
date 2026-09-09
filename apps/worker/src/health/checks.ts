/**
 * Health evaluation, as pure functions over gathered facts.
 *
 * WHY THIS EXISTS, precisely: in two days this project produced six defects, and every
 * single one presented as a healthy process. A frozen market list, an unmatched string
 * comparison, a cached read that looked live, an empty-book guard, a maker quoting into an
 * expired market — none of them threw, none of them logged an error, and all of them left a
 * worker that was up, responsive, and writing nothing. Uptime checks would have passed
 * throughout. Error-rate alerts would have stayed silent.
 *
 * So these checks assert on ABSENCE: not "did something fail" but "should something have
 * happened by now, and did it". That is the only question that catches this failure class.
 *
 * Kept pure and separated from the gathering (`facts.ts`) so the thresholds can be tested
 * against constructed situations — including the six real ones above — without a chain or a
 * database.
 */

export type Severity = "ok" | "warn" | "critical";

export interface HealthFinding {
  check: string;
  severity: Severity;
  message: string;
}

/**
 * Everything the checks need to reach a verdict. Ages are in seconds and `null` means
 * "never happened", which is deliberately distinct from "happened a long time ago": a
 * worker that has never recorded a decision is in a different state from one that stopped.
 */
export interface HealthFacts {
  /** Target markets currently accepting orders. */
  liveTargetMarkets: number;
  /** Cumulative trades on those live markets since they opened, from the venue's own counter.
   *  Context for messages only — never compared against a recency. See the note on
   *  `venueLastTradeAgeSec`. */
  tradesOnLiveMarkets: number;
  /**
   * Seconds since the venue itself last recorded a trade on any live target market, or null
   * if none has ever traded.
   *
   * This replaced `tradesOnLiveMarkets` as the trigger for the decisions-flowing check, and
   * the reason is worth keeping: the first version compared a CUMULATIVE trade count against
   * a RECENCY. A market that saw 57 trades in its first five minutes and then went quiet
   * satisfied "trades > 0" forever, so the check fired critical for every quiet minute
   * afterwards — which it duly did, on live data, within minutes of being written. Two
   * recencies can be compared; a total and a recency cannot.
   */
  venueLastTradeAgeSec: number | null;
  /** How long the oldest currently-live target market has been open. */
  oldestLiveMarketAgeSec: number | null;
  lastDecisionAgeSec: number | null;
  lastSettlementAgeSec: number | null;
  /** Decisions on markets that have resolved but which we haven't scored yet. */
  unsettledResolvedDecisions: number;
  /** Echoes attempted in the recent window. */
  recentEchoes: number;
  /**
   * Failures that indicate something is BROKEN — a revert, a nonce collision, an unreachable
   * account. Deliberate refusals are counted separately and deliberately excluded.
   *
   * The first version counted every non-success. On live data that read 70% failure and paged
   * critical, when 50 of the 54 "failures" were the rate limiter and the market's minimum order
   * size doing exactly their jobs. An alert that fires when the system is working correctly is
   * an alert that gets muted, which is the specific way monitoring dies.
   */
  recentEchoFaults: number;
  /** Refusals by policy: rate limit, below the venue minimum, follower paused, and so on. */
  recentEchoRefusals: number;
  /** Component -> seconds since it last stamped a heartbeat. Missing key = never stamped. */
  heartbeatAgesSec: Record<string, number | null>;
}

/**
 * Thresholds. Each one is derived from a real interval in this system rather than picked as
 * a round number, so that a change to a poll interval makes the mismatch visible here.
 */
export const THRESHOLDS = {
  /** Watcher polls every 10s and seed traders tick every 15s. Three minutes of silence on a
   *  market that is demonstrably being traded is far outside normal jitter. */
  decisionSilenceSec: 180,
  /** Settlement polls every 15s. An hour of resolved-but-unscored decisions is the signature
   *  of the winningOutcome bug, which ran undetected for exactly this reason. */
  settlementSilenceSec: 3600,
  /** A market open this long with zero trades means our own seed fleet isn't trading it —
   *  the signature of both the empty-book guard and the expired-market bug. */
  untradedLiveMarketSec: 300,
  /** A heartbeat this stale means the loop is wedged even if the process is alive. */
  heartbeatStaleSec: 120,
  /** Below this many echoes, a failure ratio isn't meaningful. */
  echoSampleFloor: 5,
  echoFailureRateWarn: 0.25,
  echoFailureRateCritical: 0.5,
  /** Refusals are not faults, so this is a much higher bar and never worse than a warning. */
  echoRefusalRateWarn: 0.5,
} as const;

/**
 * Failure reasons that mean the system DECLINED on purpose. Everything else is a fault.
 *
 * Kept as an explicit list rather than a pattern, so adding a new refusal reason to the mirror
 * engine is a deliberate act that shows up in review — the failure mode to avoid is a future
 * reason quietly landing in whichever bucket a regex happens to put it in.
 */
export const DELIBERATE_REFUSALS = [
  "rate_limited",
  "below_market_minimum",
  "no_liquidity_to_cross",
  "follower_paused",
  "authorisation_expired",
  "budget_exhausted",
  "pool_not_allowlisted",
  "no_account_deployed",
  "leader_size_unknown",
] as const;

export function evaluateHealth(facts: HealthFacts): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const t = THRESHOLDS;

  // 1. The big one. A live market that is visibly being traded, and we have recorded
  //    nothing. Gated on `tradesOnLiveMarkets > 0` on purpose: a genuinely quiet market is
  //    not a fault, and an alert that cries wolf on quiet hours gets muted, at which point
  //    it protects nothing.
  const venueIsTradingNow =
    facts.venueLastTradeAgeSec !== null && facts.venueLastTradeAgeSec <= t.decisionSilenceSec;

  if (facts.liveTargetMarkets > 0 && venueIsTradingNow) {
    const age = facts.lastDecisionAgeSec;
    if (age === null) {
      findings.push({
        check: "decisions-flowing",
        severity: "critical",
        message: `the venue traded ${facts.venueLastTradeAgeSec}s ago on ${facts.liveTargetMarkets} live target market(s) and not one decision has ever been recorded — the watcher is not seeing this venue at all`,
      });
    } else if (age > t.decisionSilenceSec) {
      findings.push({
        check: "decisions-flowing",
        severity: "critical",
        message: `the venue traded ${facts.venueLastTradeAgeSec}s ago but our last decision is ${age}s old — the watcher is polling a market set that isn't the live one, or isn't polling`,
      });
    }
  }

  // 2. Our own seed fleet is meant to be making these markets. A live market sitting at zero
  //    trades means the fleet is quoting somewhere else — into an expired window, or not at
  //    all. Warn rather than critical: an external market could legitimately be untraded,
  //    and it is the seeds' job we're inferring, not observing directly.
  // Also a recency, for the same reason. A market that traded once an hour ago and has been
  // silent since is a fleet that has stopped working, not one that is working.
  const venueQuiet =
    facts.venueLastTradeAgeSec === null || facts.venueLastTradeAgeSec > t.untradedLiveMarketSec;

  if (
    facts.liveTargetMarkets > 0 &&
    venueQuiet &&
    facts.oldestLiveMarketAgeSec !== null &&
    facts.oldestLiveMarketAgeSec > t.untradedLiveMarketSec
  ) {
    findings.push({
      check: "seed-fleet-trading",
      severity: "warn",
      message:
        facts.venueLastTradeAgeSec === null
          ? `a target market has been open ${facts.oldestLiveMarketAgeSec}s and has never traded — the seed fleet should have made this book by now and hasn't`
          : `no trade on any live target market for ${facts.venueLastTradeAgeSec}s — the seed fleet is quoting into a book nothing is crossing, or has stopped`,
    });
  }

  // 3. Resolved markets we never scored. Nothing downstream of calibration works without
  //    this, and it fails completely silently — there is no error when a filter simply
  //    never matches.
  if (facts.unsettledResolvedDecisions > 0) {
    const age = facts.lastSettlementAgeSec;
    if (age === null || age > t.settlementSilenceSec) {
      findings.push({
        check: "settlement-progressing",
        severity: "critical",
        message: `${facts.unsettledResolvedDecisions} decision(s) sit on resolved markets and ${age === null ? "nothing has ever settled" : `nothing has settled for ${age}s`} — calibration is computing on stale data or not at all`,
      });
    }
  }

  // 4. Echo failure rate. Individual failures are recorded per-echo and are expected; a
  //    sustained ratio means something systemic (a bad price rule, an exhausted account, a
  //    revoked authorisation we haven't noticed).
  if (facts.recentEchoes >= t.echoSampleFloor) {
    const rate = facts.recentEchoFaults / facts.recentEchoes;
    const context =
      facts.recentEchoRefusals > 0
        ? ` (a further ${facts.recentEchoRefusals} were refused by policy, which is not a fault)`
        : "";
    if (rate >= t.echoFailureRateCritical) {
      findings.push({
        check: "echo-success-rate",
        severity: "critical",
        message: `${facts.recentEchoFaults}/${facts.recentEchoes} recent echoes failed for a reason that indicates a fault (${Math.round(rate * 100)}%) — followers are being told their trades didn't happen${context}`,
      });
    } else if (rate >= t.echoFailureRateWarn) {
      findings.push({
        check: "echo-success-rate",
        severity: "warn",
        message: `${facts.recentEchoFaults}/${facts.recentEchoes} recent echoes hit a fault (${Math.round(rate * 100)}%)${context}`,
      });
    }
  }

  // A separate, quieter signal. A follower whose every echo is refused is not experiencing an
  // outage — their settings do not fit this leader's trade sizes, or their limits have run out.
  // That is worth surfacing and is emphatically not worth paging anyone about.
  if (
    facts.recentEchoes >= t.echoSampleFloor &&
    facts.recentEchoRefusals / facts.recentEchoes >= t.echoRefusalRateWarn
  ) {
    findings.push({
      check: "echo-refusal-rate",
      severity: "warn",
      message: `${facts.recentEchoRefusals}/${facts.recentEchoes} recent echoes were refused by policy — a follower's size, limits or the venue's minimum are turning most of their copies away`,
    });
  }

  // 5. Heartbeats. Catches a loop wedged on a hung network call — the process is alive, the
  //    checks above may look fine because a market is quiet, but nothing is running.
  for (const [component, age] of Object.entries(facts.heartbeatAgesSec)) {
    if (age === null) {
      findings.push({
        check: `heartbeat:${component}`,
        severity: "warn",
        message: `${component} has never stamped a heartbeat — it may not have started`,
      });
    } else if (age > t.heartbeatStaleSec) {
      findings.push({
        check: `heartbeat:${component}`,
        severity: "critical",
        message: `${component} last ran ${age}s ago — its loop is wedged, not merely idle`,
      });
    }
  }

  return findings;
}

/** The single worst severity across findings — what an uptime probe should report. */
export function overallSeverity(findings: HealthFinding[]): Severity {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "ok";
}
