import { gatherFacts } from "./facts.js";
import { evaluateHealth, overallSeverity, type HealthFinding } from "./checks.js";
import { createLogger } from "../logger.js";

const log = createLogger("health");

/** Slower than every other loop on purpose: it reads the venue and the whole database, and
 *  nothing it watches for resolves faster than its own thresholds. */
const POLL_INTERVAL_MS = 60_000;

/**
 * One health pass. Returns the findings so a CLI or an HTTP probe can use the same code path
 * the background loop does — there is no second implementation to drift.
 */
export async function checkHealthOnce(): Promise<HealthFinding[]> {
  const facts = await gatherFacts();
  const findings = evaluateHealth(facts);

  if (findings.length === 0) {
    log.info("healthy", {
      liveMarkets: facts.liveTargetMarkets,
      tradesOnLiveMarkets: facts.tradesOnLiveMarkets,
      lastDecisionAgeSec: facts.lastDecisionAgeSec,
    });
    return findings;
  }

  for (const finding of findings) {
    // Findings go out at their own severity so a log filter on level=error catches exactly
    // the things that need waking someone, and no more.
    const emit = finding.severity === "critical" ? log.error : log.warn;
    emit(finding.message, { check: finding.check, severity: finding.severity, facts });
  }
  return findings;
}

/** The result of the most recent background pass, for the HTTP probe to serve. */
export interface HealthSnapshot {
  /** Date.now() when the pass completed. */
  at: number;
  findings: HealthFinding[];
  /** Set when the pass itself threw — the database was unreachable, say. */
  error: string | null;
}

let lastSnapshot: HealthSnapshot | null = null;

/**
 * The latest pass, or null before the first one has run.
 *
 * Exposed so the HTTP probe reports what the checks actually found, rather than that the
 * HTTP server is up. Serving the cached pass rather than running one per request is
 * deliberate: a pass reads the venue and the whole database, and this endpoint is polled by
 * both Render's healthcheck and an uptime monitor. The staleness of the snapshot is itself a
 * signal — if this stops being refreshed, the health loop is wedged.
 */
export function getLastHealth(): HealthSnapshot | null {
  return lastSnapshot;
}

/** How long a snapshot stays trustworthy. Three missed passes, not one, so a single slow
 *  read of the venue doesn't flip the probe red. */
export const SNAPSHOT_STALE_MS = POLL_INTERVAL_MS * 3;

export function watchHealth() {
  const tick = () =>
    checkHealthOnce()
      .then((findings) => {
        lastSnapshot = { at: Date.now(), findings, error: null };
      })
      .catch((err) => {
        log.error("health pass failed", { err: String(err) });
        lastSnapshot = { at: Date.now(), findings: [], error: String(err) };
      });
  // Deliberately not run immediately: at process start the watcher hasn't ticked yet and no
  // heartbeat exists, so an instant first pass would report a false critical on every boot.
  setTimeout(tick, POLL_INTERVAL_MS);
  setInterval(tick, POLL_INTERVAL_MS);
}

export { overallSeverity };
