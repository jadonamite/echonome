/**
 * Structured logging (Phase 6 hardening). Plain console.log/error scattered through the
 * codebase don't survive a Railway restart and can't be filtered/aggregated once this runs
 * unattended — see ROADMAP.md. This is a minimal, dependency-free structured logger: JSON
 * lines with a level, a component tag, and a message, so a real log aggregator (or even
 * just `grep`/`jq` on a saved log) can filter by component or severity.
 *
 * NOT a replacement for real error tracking (Sentry or equivalent) — that needs an account
 * this worker doesn't have credentials for. This is the piece buildable without one.
 */

type Level = "info" | "warn" | "error";

function emit(level: Level, component: string, message: string, extra?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...extra,
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else console.log(out);
}

export function createLogger(component: string) {
  return {
    info: (message: string, extra?: Record<string, unknown>) => emit("info", component, message, extra),
    warn: (message: string, extra?: Record<string, unknown>) => emit("warn", component, message, extra),
    error: (message: string, extra?: Record<string, unknown>) => emit("error", component, message, extra),
  };
}
