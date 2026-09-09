import http from "node:http";
import { watchFills } from "./chain/watcher.js";
import { watchSettlement } from "./chain/settlement.js";
import { mirrorDecision } from "./mirror/engine.js";
import {
  watchHealth,
  getLastHealth,
  overallSeverity,
  SNAPSHOT_STALE_MS,
} from "./health/monitor.js";
import { createLogger } from "./logger.js";
import { startSeedTraders } from "./seeds/runSeedTraders.js";

const log = createLogger("worker");

/**
 * What the health endpoint answers, derived from the real checks rather than from the fact
 * that this server is accepting connections.
 *
 * The previous version always returned `{"status":"healthy"}`. It would have said that
 * throughout a three-hour outage in which nothing was written to the database — which is the
 * exact failure mode this project keeps hitting, and the reason `health/checks.ts` alerts on
 * absence rather than on errors. An endpoint that cannot fail is worse than no endpoint:
 * Render's healthcheck and the uptime monitor both stay green while the system is dead.
 *
 * Status codes are chosen for what consumes them:
 * - `critical` -> 503, so Render restarts a wedged worker instead of pinging a corpse.
 * - `warn`     -> 200. A warning is information, not a reason to bounce the process.
 * - starting   -> 200. The first pass is deliberately delayed by one interval, and failing
 *                 during that window would make the service unbootable.
 */
function healthResponse(): { httpStatus: number; payload: Record<string, unknown> } {
  const snapshot = getLastHealth();
  const ts = new Date().toISOString();

  if (!snapshot) {
    return { httpStatus: 200, payload: { status: "starting", detail: "no health pass yet", ts } };
  }

  const ageMs = Date.now() - snapshot.at;
  if (ageMs > SNAPSHOT_STALE_MS) {
    // The loop that refreshes this has stopped. That is a wedged process, not a healthy one.
    return {
      httpStatus: 503,
      payload: { status: "stale", detail: "health loop is not running", ageSec: Math.round(ageMs / 1000), ts },
    };
  }

  if (snapshot.error) {
    return { httpStatus: 503, payload: { status: "critical", detail: snapshot.error, ts } };
  }

  const severity = overallSeverity(snapshot.findings);
  return {
    httpStatus: severity === "critical" ? 503 : 200,
    payload: {
      status: severity === "ok" ? "healthy" : severity,
      ageSec: Math.round(ageMs / 1000),
      findings: snapshot.findings.map((f) => ({
        check: f.check,
        severity: f.severity,
        message: f.message,
      })),
      ts,
    },
  };
}

async function main() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/" || req.url === "/health") {
      const body = healthResponse();
      res.writeHead(body.httpStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body.payload));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    log.info("health server listening", { port });
  });

  log.info("starting", { loops: ["watcher", "settlement", "health"] });

  watchSettlement();
  // Watches for ABSENCE — the failure mode every defect in this project has actually had.
  // See src/health/checks.ts for why that framing rather than error-rate alerting.
  watchHealth();

  if (process.env.RUN_SEEDS !== "false" && process.env.SEED_TRADER_PRIVATE_KEYS) {
    log.info("starting seed trader fleet in-process");
    startSeedTraders().catch((err) => {
      log.error("seed trader fleet error", { err: String(err) });
    });
  }

  await watchFills(async (decisionId) => {
    await mirrorDecision(decisionId);
  });
}

main().catch((err) => {
  log.error("fatal", { err: String(err) });
  process.exit(1);
});

