import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Lazy database accessor.
 *
 * Uses postgres-js so one client works against a **local Postgres** in
 * development and **Neon** in production (Neon's HTTP-only driver can't reach a
 * local Postgres). `prepare: false` keeps it compatible with Neon's pooled
 * (PgBouncer) endpoint and is harmless against a local server.
 *
 * Lazy init keeps `next build` safe when DATABASE_URL is absent, and avoids a
 * Proxy wrapper (which breaks libraries that introspect the client object).
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Set it in .env.local (a local Postgres URL or a ' +
        'Neon connection string); in production it comes from the Vercel/Neon env.',
    );
  }
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** Returns the shared Drizzle client, creating it on first use. */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
