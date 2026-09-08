import { watchFills } from "./chain/watcher.js";
import { watchSettlement } from "./chain/settlement.js";
import { mirrorDecision } from "./mirror/engine.js";

async function main() {
  console.log("[worker] starting — Echonome fill watcher + settlement poller");

  watchSettlement();

  await watchFills(async (decisionId) => {
    await mirrorDecision(decisionId);
  });
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
