import { defineConfig } from 'drizzle-kit';

// drizzle-kit does NOT auto-load .env.local — the `db:*` scripts in package.json
// inject it via dotenv-cli. In production, DATABASE_URL comes from the Vercel env.
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
