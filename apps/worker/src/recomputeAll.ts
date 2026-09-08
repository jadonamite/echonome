/**
 * Recomputes calibration for every trader.
 *
 *   npm run recompute
 *
 * Needed whenever the scoring itself changes — the settlement poller only recomputes traders
 * whose decisions it just settled, so a change to the maths would otherwise take effect for a
 * trader only the next time one of their markets resolved, leaving the leaderboard showing a
 * mix of old and new scoring with no indication of which was which.
 */
import { query, end } from "./db/client.js";
import { recomputeCalibration } from "./calibration/engine.js";

const traders = await query<{ id: string; label: string }>(`SELECT id, label FROM trader ORDER BY label`);
for (const t of traders) {
  await recomputeCalibration(t.id);
}
console.log(`recomputed ${traders.length} trader(s)`);
await end();
process.exit(0);
