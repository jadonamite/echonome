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
  const pool = new Pool({ connectionString, max: 5 });
  globalForPool.echonomePool = pool;
  return pool;
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
