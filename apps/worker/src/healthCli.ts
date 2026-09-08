/**
 * One-shot health check for a human or a CI step:
 *
 *   npm run health
 *
 * Exits 0 when healthy, 1 on any warning, 2 on anything critical — so it can be wired
 * straight into an uptime probe or a deploy gate without a wrapper. Uses the same code path
 * as the worker's background loop, so what it reports and what the worker alerts on cannot
 * disagree.
 *
 * `--facts` prints the gathered evidence even when everything passes. Worth having: "healthy"
 * with no numbers behind it is indistinguishable from a monitor that has gone blind, and this
 * one already had to be corrected once for reporting healthy-looking nonsense.
 */
import { checkHealthOnce, overallSeverity } from "./health/monitor.js";
import { gatherFacts } from "./health/facts.js";
import { end } from "./db/client.js";

if (process.argv.includes("--facts")) {
  console.log(JSON.stringify(await gatherFacts(), null, 2));
}

const findings = await checkHealthOnce();
const severity = overallSeverity(findings);

if (findings.length === 0) {
  console.log("healthy — every liveness check passed");
} else {
  for (const f of findings) {
    console.log(`${f.severity === "critical" ? "CRITICAL" : "WARN    "}  ${f.check}: ${f.message}`);
  }
}

await end();
process.exit(severity === "critical" ? 2 : severity === "warn" ? 1 : 0);
