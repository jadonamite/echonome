import { Pool } from "pg";

/**
 * Read-side Postgres access for the web app. Same database the worker writes to —
 * see TECHNICAL_ARCHITECTURE.md "The split". The worker owns every write that touches
 * the chain; this app writes only plain rows (proxy grants, copy links) that a user
 * has already authorised with their own signature.
 *
 * Lazily initialised, and cached on globalThis: Next's dev server re-evaluates modules
 * on every hot reload, and a module-level `new Pool()` would leak a fresh connection
 * pool per reload until Postgres refused new connections.
 */
const globalForPool = globalThis as unknown as { echonomePool?: Pool };

function getPool(): Pool {
  if (globalForPool.echonomePool) return globalForPool.echonomePool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set — see apps/web/.env.example");
  // A short connect timeout matters in a serverless deploy: without one, a DATABASE_URL
  // pointing somewhere unreachable holds the request open until the platform kills the
  // function, which reads to a visitor as a hung page rather than as a missing database.
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000 });
  globalForPool.echonomePool = pool;
  return pool;
}

/**
 * A read that reports "no database" instead of throwing.
 *
 * The marketing surface has to render without one. A deploy pointed at no database, or at a
 * database that is briefly unreachable, should still serve the page with its live figures
 * absent and said to be absent — not a 500, and emphatically not zeros. Zeros would be the
 * page stating that no trader has ever made a decision, which is a different claim from
 * "these numbers could not be read", and this is a site whose whole argument is that it
 * reports the record accurately.
 *
 * Returns null when the data is unavailable, which callers must distinguish from an empty
 * result. Writes never go through here: a write that silently does nothing is far worse than
 * a write that fails loudly.
 */
export async function queryOrNull<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[] | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await query<T>(sql, params);
  } catch (error) {
    console.error("[db] read failed, rendering without it:", error);
    return null;
  }
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
