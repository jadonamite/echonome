import http from "node:http";
import { watchFills } from "./chain/watcher.js";
import { watchSettlement } from "./chain/settlement.js";
import { mirrorDecision } from "./mirror/engine.js";
import { watchHealth } from "./health/monitor.js";
import { createLogger } from "./logger.js";
import { startSeedTraders } from "./seeds/runSeedTraders.js";

const log = createLogger("worker");

async function main() {
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", ts: new Date().toISOString() }));
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

