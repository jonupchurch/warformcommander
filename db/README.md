# Database — Warform Commander

Neon Postgres via **Drizzle ORM on the `postgres-js` driver** (`db/index.ts`: lazy `getDb()`,
`prepare: false` for the Neon pooler, **no Proxy** so the Auth.js adapter's driver detection works).
The schema (`db/schema.ts`) is the single source of truth Features 8–12 build on.

## Environments

| Target | `DATABASE_URL` source | Used by |
|---|---|---|
| **Local dev / tests** | `.env.dev.local` (a local Postgres or a Neon **dev branch**) | `db:*:dev`, `npm test` |
| **Production** | Vercel/Neon env (`.env.local` locally mirrors it) | the deployed app |

`.env*.local` is gitignored. **Never run migrations against the production branch first** — cut a
Neon dev branch (or use local Postgres), validate there, then promote (SC-008).

## Migration workflow

```bash
# 1. Edit db/schema.ts, then generate a reviewed SQL migration (no DB connection needed):
npm run db:generate            # writes db/migrations/NNNN_*.sql  — REVIEW the SQL before applying

# 2. Apply to the dev target and run the suite:
npm run db:migrate:dev         # applies to .env.dev.local
npm test                       # 34 integration tests against the dev DB

# 3. Seed cold-start bot defenders (idempotent) so the ladder is never empty (P5):
npm run db:seed:dev
```

## Promote to production (SC-008)

Only after the migration is reviewed and green on the dev target:

```bash
# Ensure .env.local's DATABASE_URL points at the Neon PRODUCTION branch (from `vercel env pull`).
npm run db:migrate             # applies the SAME reviewed migration to prod
npm run db:seed                # (optional) seed prod cold-start defenders
```

Then verify: sign in with Google on the deployed app and confirm a `user` + `account` row appear.

## Scripts

| Script | Action |
|---|---|
| `db:generate` | generate a SQL migration from `db/schema.ts` (no DB) |
| `db:migrate:dev` / `db:migrate` | apply migrations to dev / prod |
| `db:push:dev` | push schema to dev without a migration file (prototyping only) |
| `db:studio:dev` | open Drizzle Studio against the dev DB |
| `db:seed:dev` / `db:seed` | seed cold-start bot defenders (idempotent) |

## Notes

- **Seeds** are stored as `numeric(20,0)` (lossless u64). **Game content** (squad configs, replays,
  presets) is stored as **Feature-1 typed `jsonb`** — never re-declared in SQL (P8). `jsonb` normalizes
  key order, so configs round-trip **value-identical**, not byte-identical.
- **Defense immutability + the ≤3 cap + pool exclusivity** are DB invariants (partial-unique indexes +
  copy-on-designate), not app-only checks — do not weaken them.
- Every squad write passes the shared engine `validate()` (`sim/validate.ts`) before insert.
