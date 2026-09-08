import { watchFills } from "./chain/watcher.js";
import { watchSettlement } from "./chain/settlement.js";
import { mirrorDecision } from "./mirror/engine.js";
import { watchHealth } from "./health/monitor.js";
import { createLogger } from "./logger.js";

const log = createLogger("worker");

async function main() {
  log.info("starting", { loops: ["watcher", "settlement", "health"] });

  watchSettlement();
  // Watches for ABSENCE — the failure mode every defect in this project has actually had.
  // See src/health/checks.ts for why that framing rather than error-rate alerting.
  watchHealth();

  await watchFills(async (decisionId) => {
    await mirrorDecision(decisionId);
  });
}

main().catch((err) => {
  log.error("fatal", { err: String(err) });
  process.exit(1);
});
