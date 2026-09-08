import { queryOne } from "../db/client.js";

/**
 * A component stamping "I completed a full tick just now".
 *
 * Deliberately recorded at the END of a tick, not the start: a loop that begins a tick and
 * then hangs on a network call is exactly the failure this is meant to catch, and stamping on
 * entry would report it as healthy forever.
 *
 * Failures here are swallowed. A monitoring write must never be able to take down the thing
 * it monitors — losing one heartbeat makes the component look briefly stale, which is a far
 * better outcome than a health-table hiccup killing the watcher.
 */
export async function beat(component: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO worker_heartbeat (component, last_beat_at, detail)
       VALUES ($1, now(), $2)
       ON CONFLICT (component) DO UPDATE SET last_beat_at = now(), detail = EXCLUDED.detail`,
      [component, JSON.stringify(detail)]
    );
  } catch {
    // Intentionally silent — see above.
  }
}
