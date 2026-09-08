import { Pool } from "pg";

// Lazy pool init, deliberately. Found the hard way while writing tests (2026-09-08):
// throwing here at import time meant no file that imports this module — including one
// that only needed an unrelated pure function — could even be loaded without a live
// DATABASE_URL, unit tests included. The connection is now only required at first actual
// query, not at import. (An earlier version of this fix used a Proxy over `pool` for
// backward compatibility, but that breaks `this`-binding on pg's own instance methods —
// removed in favor of these explicit functions instead.)
let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.example");
  }
  _pool = new Pool({ connectionString });
  return _pool;
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function end(): Promise<void> {
  if (_pool) await _pool.end();
}
