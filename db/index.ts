import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Lazy database accessor.
 *
 * Neon's `neon()` throws when `DATABASE_URL` is unset — and because Next.js
 * evaluates top-level module code at build time, a top-level `neon(...)` call
 * would crash `next build` before the connection string is provisioned.
 * Initialising inside `getDb()` keeps build/deploy safe until then.
 *
 * Intentionally a plain lazy `let` — do NOT wrap the client in a `Proxy`
 * (it breaks libraries that introspect the DB object, e.g. auth adapters).
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Connect a Neon database to the Vercel project ' +
        '(Storage → Neon) and run `vercel env pull .env.local`, or set DATABASE_URL ' +
        'in .env.local for local development.',
    );
  }
  return drizzle(neon(url), { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

/** Returns the shared Drizzle client, creating it on first use. */
export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
